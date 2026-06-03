# Onboarding multi-coppia — design

Data: 2026-06-03
Stato: approvato (brainstorming), in attesa di piano implementativo.

## Contesto e obiettivo

`brace.` oggi è mono-coppia: non esiste registrazione né creazione di coppia dal
prodotto. L'unica coppia esistente è stata inserita a mano nel SQL Editor
(`couples` + `profiles`, vedi `test/smoke.md:17-21`). `js/auth.js` espone solo
`login`/`logout`/`currentProfile`; `couples.membro_a` e `couples.membro_b` sono
entrambi `NOT NULL` (`supabase/schema.sql:6-7`); `couples` non ha policy di
INSERT/UPDATE scrivibili dal client (`supabase/schema.sql:150`, solo `couples_sel`).

Obiettivo: permettere a coppie sconosciute di registrarsi e usare l'app in
autonomia, con isolamento dei dati invariato, tramite **codice invito**.

Decisioni di prodotto già prese:
- **Pairing tramite codice invito** (no email-invite, no link magico).
- **Il creatore usa l'app da subito da solo**; quando il partner si unisce vede
  lo storico. → `couples.membro_b` diventa nullable.
- **Conferma email obbligatoria** alla registrazione (abilita reset password,
  riduce spam). Nota operativa: l'SMTP di default Supabase è rate-limited;
  per volumi reali servirà SMTP custom (Resend/Postmark) — fuori da questo spec.
- **Backend di pairing tramite RPC `security definer`** (no Edge Function, no
  allargamento RLS lato client).

## Vincolo architetturale

`couples` non deve essere scrivibile dal client. Creazione coppia e join passano
da funzioni Postgres `security definer` che bypassano l'RLS in modo controllato e
applicano gli invarianti in transazione. Nessuna service-role key viene esposta.

## §1 — Schema (migrazione)

File nuovo: `supabase/onboarding.sql`.

```sql
-- couples: il secondo membro arriva dopo
alter table couples alter column membro_b drop not null;

-- codici invito (un codice attivo per coppia, consumato all'uso)
create table if not exists codici_invito (
  codice     text primary key,            -- 6 caratteri, charset senza 0/O/1/I
  couple_id  uuid not null references couples(id) on delete cascade,
  creato     timestamptz not null default now(),
  scadenza   timestamptz,                 -- null = non scade; default app: +7 giorni
  usato_da   uuid references auth.users(id),
  usato_il   timestamptz
);
-- max 1 codice attivo (non ancora usato) per coppia
create unique index if not exists codici_invito_couple_attivo
  on codici_invito (couple_id) where usato_da is null;

alter table codici_invito enable row level security;
-- solo i membri della coppia leggono il proprio codice; scrittura SOLO via RPC
create policy codici_sel on codici_invito for select using (is_member(couple_id));
```

`is_member` (`supabase/schema.sql:13-19`) gestisce già `membro_b` null senza
modifiche (`membro_b = auth.uid()` è falso quando null).

Retrocompatibilità: la coppia reale esistente ha già entrambi i membri e i
profili → nullable non la rompe e non vedrà mai l'onboarding (il profilo esiste).

## §2 — Funzioni RPC (`security definer`)

Nello stesso `supabase/onboarding.sql`. Tutte con
`set search_path = public, pg_temp` (hardening anti-search-path-hijack) e
controlli interni che sollevano eccezioni con messaggi leggibili.

- `crea_coppia(p_nome text, p_avatar text) returns text`
  - Richiede `auth.uid()` non null.
  - Errore `già in una coppia` se l'utente è già `membro_a`/`membro_b` di una
    coppia o ha già un profilo.
  - Inserisce `couples(membro_a = auth.uid())`, poi `profiles(id = auth.uid(),
    couple_id, display_name = p_nome, avatar = p_avatar)`.
  - Genera un codice univoco (retry su collisione), lo inserisce in
    `codici_invito`, lo restituisce.

- `unisci_coppia(p_codice text, p_nome text, p_avatar text) returns uuid`
  - Richiede `auth.uid()` non null e utente non già in coppia.
  - Valida il codice: esiste, `usato_da is null`, non scaduto
    (`scadenza is null or scadenza > now()`).
  - Verifica `couples.membro_b is null` e `membro_a <> auth.uid()`.
  - Imposta `membro_b = auth.uid()`, crea il `profiles` del partner, marca il
    codice (`usato_da`, `usato_il`). Ritorna `couple_id`.
  - Errori distinti: `codice non valido o scaduto`, `coppia già completa`,
    `già in una coppia`, `non puoi unirti alla tua stessa coppia`.

- `rigenera_codice() returns text`
  - Il creatore in attesa **elimina** la riga del codice attivo della coppia
    (quella con `usato_da is null`, così il vincolo unico parziale resta
    soddisfatto) e ne inserisce una nuova, restituendo il nuovo codice. I codici
    già usati (storici) non vengono toccati.
  - Errore se l'utente non è in una coppia o la coppia è già completa.

Generazione codice: 6 caratteri da un alfabeto senza simboli ambigui
(`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), unica via retry.

## §3 — Auth (`js/auth.js`)

- `signUp(email, password)` → `client.auth.signUp(...)`. Con conferma email ON,
  ritorna uno stato "controlla la mail" (nessuna sessione attiva finché non
  conferma).
- `resetPasswordForEmail(email)` → invio email di reset.
- Fix bug P4: `currentProfile()` (oggi lancia se il profilo manca,
  `js/auth.js:18`) ritorna `null` quando il profilo non esiste, così l'app
  instrada all'onboarding. Gli errori di rete restano un throw.

## §4 — Flusso app (`js/modules/onboarding.js` nuovo)

Routing al boot (oggi `js/app.js:34-44`):

1. Sessione assente → schermata **login** con due link nuovi: "Registrati" e
   "Password dimenticata?".
2. Sessione presente → `currentProfile()`:
   - profilo presente → `enterApp()` come oggi;
   - profilo assente → **onboarding**, due strade:
     - "Create la vostra coppia" → `crea_coppia(nome, avatar)` → mostra il codice
       grande + "Condividi" (Web Share API) / "Copia" → entra nell'app (uso solo).
     - "Ho un codice" → input codice + nome/avatar → `unisci_coppia(...)` → entra.
3. **Stato attesa partner** (creatore con `membro_b` null): app pienamente
   usabile; avviso discreto in Home/Impostazioni col codice da condividere +
   "rigenera". Quando il partner si unisce, la presenza lo mostra al refresh.

Registrazione raccoglie nome + avatar (riusa il picker emoji di
`js/modules/impostazioni.js:13`) così il profilo nasce completo.

## §5 — Isolamento e invarianti

- `profiles_upd` blindata. Oltre a `with check (id = auth.uid())`, si impedisce il
  cambio di `couple_id` con grant a livello di colonna:
  ```sql
  revoke update on profiles from authenticated;
  grant update (display_name, avatar, last_seen) on profiles to authenticated;
  ```
  `couple_id` diventa immutabile dal client → chiude lo spoofing del profilo
  (punto 🟡 dell'audit, `supabase/schema.sql:155`).
- Una coppia per utente: garantita dai controlli nelle RPC (un utente già membro
  o con profilo non può crearne/unirsi a un'altra).

## §6 — Gestione errori / edge case

- Codice inesistente/scaduto/già usato → toast chiaro, nessuno stato sporco.
- Email già registrata in `signUp` → messaggio amichevole.
- Unirsi alla propria coppia o a una piena → bloccato dalla RPC.
- Collisione codice → retry interno.
- Utente che conferma email ma non ha ancora coppia → atterra sull'onboarding,
  non sul login.

## §7 — Test

- Logica pura in `js/lib/logic.js` (con `node:test`): `generaCodiceInvito()`
  (formato e charset non ambiguo), `codiceScaduto(scadenza, now)`.
- Wrapper store (`createCouple`/`joinCouple`/`regenInvite` che chiamano
  `client.rpc`): test col `fakeClient` che verificano gli argomenti passati.
- RPC e RLS NON sono coperte dai mock: vanno in una suite d'integrazione a due
  account reali (Track F1 della roadmap) + smoke manuale a due dispositivi.
  Dichiarato esplicitamente: niente falsa copertura.

## Fuori scope (in questo spec)

- Abbandono/scioglimento coppia e cancellazione account (Track E, requisito
  legale separato).
- SMTP custom per le email (operativo, non di prodotto).
- Compressione foto, gate 18+, privacy policy, brand unico (altre tracce della
  roadmap di pubblicabilità).
