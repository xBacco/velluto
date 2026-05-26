# Il nostro spazio (Velluto) — Design / Spec v2

**Data:** 2026-05-26
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** web app privata di coppia, a tema erotico/intimo
**Sostituisce:** `2026-05-26-nostro-spazio-design.md` (v1, architettura statica cifrata su repo pubblico — abbandonata a favore di un backend privato).

---

## 1. Scopo

Web app privata per due partner (Tomas e Giulia) dove:
- raccogliere **desideri & fantasie** da provare;
- tenere un **calendario / diario delle esperienze** con voto e foto;
- scambiarsi **buoni** (regalo, bundle, richieste da accettare/rifiutare);
- giocare con **dadi**, **ruota della fortuna settimanale** e **Truth or Dare**.

Estetica sensuale ed elegante ("Velluto notturno"). **Mobile-first**: l'uso quasi
esclusivo sarà da telefono; il desktop è un di più. Tutto privato dietro login.

Progetto didattico, pattern "io scrivo, tu segui". Stack volutamente semplice,
**niente build step**.

> Nota grafica: questa spec definisce funzioni, dati e architettura. La grafica
> partirà dal mood "Velluto notturno" del prototipo (`prototipo/index.html`) e
> verrà rifinita in corso d'opera — è esplicitamente attesa come iterativa.

---

## 2. Decisioni chiave (dal brainstorming)

- **Backend privato** = Supabase (non più repo pubblico cifrato). Le foto intime
  non finiscono mai in un repo pubblico.
- **Login separati**: Tomas e Giulia hanno ciascuno il proprio account.
- **Buoni** = mix: regalo singolo, **bundle**, e **richiesta** che l'altro accetta o rifiuta.
- **Ruota** = **1 giro a settimana a testa** (cooldown indipendente per persona).
- **Mobile-first** obbligatorio.

---

## 3. Architettura

### 3.1 Frontend
- Sito statico **HTML/CSS/JS vanilla**, niente build, niente framework.
- Client Supabase via CDN (`@supabase/supabase-js`).
- Ospitato su **GitHub Pages** (repo sotto `xBacco`, nome discreto da concordare,
  default `velluto`). Il repo **può essere pubblico**: contiene solo l'interfaccia,
  nessun dato e nessun segreto (la *anon key* di Supabase è pubblica per design e
  innocua grazie alle policy RLS).
- `<meta name="robots" content="noindex,nofollow">` + `robots.txt` `Disallow: /`
  per discrezione.

### 3.2 Backend = Supabase (free tier)
- **Auth**: email + password. **Registrazione pubblica disattivata**; i due account
  vengono creati a mano dalla dashboard. Niente terze persone.
- **Database** Postgres con **Row Level Security (RLS)** su tutte le tabelle.
- **Storage** privato per le foto (bucket NON pubblico), accesso solo via
  **signed URL** a scadenza breve.

### 3.3 Modello "coppia"
Essendo esattamente due persone, si usa un singolo record `couple` con i due
`user_id` membri. Ogni riga dati porta `couple_id`. Le policy RLS consentono
lettura/scrittura solo a chi è membro della coppia. Con la registrazione pubblica
disattivata e solo due account esistenti, il confine è netto.

### 3.4 Moduli frontend (file JS separati, ognuno con uno scopo)
- `supabase.js` — init client (URL + anon key), wrapper sessione.
- `auth.js` — login/logout, stato sessione, redirect al gate se non loggato.
- `store.js` — funzioni CRUD per ogni entità (desideri, esperienze, buoni, carte,
  giri ruota); upload/lista foto su Storage; tutte ricevono il client (iniettabile
  per test).
- `ui.js` — helper DOM **senza `innerHTML`** (creazione nodi sicura), modali, toast.
- `app.js` — routing tra le 6 sezioni, orchestrazione, stato in memoria.
- `index.html` + `styles.css` — markup e stile "Velluto notturno", mobile-first.
- Sezioni come moduli render dedicati: `mod_desideri.js`, `mod_calendario.js`,
  `mod_buoni.js`, `mod_giochi.js` (dadi+ruota), `mod_tod.js`.

---

## 4. Funzionalità (6 moduli)

### 4.1 👤 Profili & sessione
- Login con account personale. Profilo = `display_name` + avatar (emoji o colore).
- Header mostra chi è loggato; logout disponibile.
- L'autore di ogni voce = utente loggato (niente scelta manuale lui/lei).

### 4.2 🔥 Desideri & fantasie
- Campi: `testo`, `autore`, `categoria` (libera, opzionale), `stato`
  (`da_provare` | `realizzato`), `data_realizzato`.
- Azioni: aggiungi, modifica, elimina, **segna realizzato** (registra la data).
- Filtri: tutti / da provare / realizzati / scritti da me; ordinamento per più recente.

### 4.3 📅 Calendario & esperienze
- Vista **calendario mensile** (mobile-friendly) con i giorni che hanno esperienze
  evidenziati; tap sul giorno → dettaglio/aggiunta. Più una **timeline** recente.
- Campi esperienza: `titolo`, `testo`, `data`, `autore`, `voto` (0–5 fiamme),
  **foto** (0..n).
- Foto: caricate in **Storage privato**; mostrate via signed URL; eliminabili.
- Azioni: aggiungi, modifica, elimina.

### 4.4 🎟️ Buoni
Tre viste: **Ricevuti** (da riscattare), **Inviati**, **Richieste** (in attesa).
- Entità buono: `emoji`, `titolo`, `descrizione`, `da_id` (emittente), `a_id`
  (destinatario/titolare), `tipo` (`regalo` | `richiesta`), `stato`
  (`in_attesa` | `attivo` | `rifiutato` | `riscattato`), `bundle_id` (opzionale),
  `creato`, `riscattato_il`.
- **Regalo**: io creo → `tipo=regalo, stato=attivo`, `a_id=partner`. Il partner lo
  vede tra i Ricevuti e lo **riscatta** (`stato=riscattato`).
- **Bundle**: più buoni creati insieme condividono `bundle_id` (regalati in blocco).
- **Richiesta**: io chiedo un buono al partner → `tipo=richiesta, stato=in_attesa`,
  `a_id=io` (futuro titolare), `da_id=partner` (deve concedere). Il partner
  **accetta** (→ `tipo=regalo, stato=attivo`) o **rifiuta** (→ `stato=rifiutato`).
- Transizioni di stato implementate come **funzioni pure testabili**.

### 4.5 🎲 Dadi & 🎡 Ruota
- **Dadi**: due dadi (azione + zona del corpo), tiro libero, senza salvataggio
  (logica e animazione lato client). Contenuto iniziale = proposte del file giochi.
- **Ruota**: 8 proposte piccanti (riuso dei contenuti del file giochi). **Un giro a
  settimana per persona**: si registra `ruota_giri (user_id, esito, creato)`; la
  disponibilità si calcola da `now - ultimo_giro >= 7 giorni`. Se in cooldown,
  mostra conto alla rovescia al prossimo sblocco. Calcolo eleggibilità = funzione
  pura testabile.

### 4.6 🃏 Truth or Dare
- **Mazzo parte vuoto.** I due aggiungono carte: `tipo` (`verita` | `sfida`),
  `testo`, `intensita` (1–3), `autore`.
- Azione: **pesca a caso**, filtrabile per tipo e intensità.
- Gestione mazzo: aggiungi, modifica, elimina.

---

## 5. Modello dati (Postgres)

```
couples        ( id, membro_a uuid, membro_b uuid, creato )
profiles       ( id uuid = auth.uid, couple_id, display_name, avatar, creato )
desideri       ( id, couple_id, autore_id, testo, categoria, stato,
                 data_realizzato, creato )
esperienze     ( id, couple_id, autore_id, titolo, testo, data, voto, creato )
esperienza_foto( id, esperienza_id, couple_id, storage_path, creato )
buoni          ( id, couple_id, da_id, a_id, emoji, titolo, descrizione,
                 tipo, stato, bundle_id, creato, riscattato_il )
carte          ( id, couple_id, autore_id, tipo, testo, intensita, creato )
ruota_giri     ( id, couple_id, user_id, esito, creato )
```

- **RLS**: ogni tabella consente operazioni solo se `couple_id` appartiene a una
  coppia di cui `auth.uid()` è membro (`membro_a` o `membro_b`). `profiles`
  leggibile dai membri della stessa coppia.
- **Storage**: bucket `foto` privato; path tipo `couple_<id>/<esperienza>/<file>`;
  policy che lega l'accesso ai membri della coppia; lettura via signed URL.

---

## 6. Sicurezza & privacy

- Account con password (gestite da Supabase Auth, hashate). Registrazione pubblica
  **off**.
- RLS su tutte le tabelle → un eventuale terzo account non vedrebbe nulla.
- Foto in **Storage privato**, mai pubbliche, servite con signed URL a scadenza.
- Frontend senza segreti; `noindex` + `robots.txt` per discrezione; nome repo neutro.
- Sessione Supabase nel browser (token gestito dalla libreria). Logout esplicito.
- **Nota onesta sui limiti:** la sicurezza dipende da password robuste e dal non
  condividere le credenziali. È nettamente più solido della v1 (niente dati in repo
  pubblico).

---

## 7. UX / Mobile-first

- Layout a colonna singola, larghezza max ~540px, ottimizzato per il pollice:
  navigazione raggiungibile, target tap ≥ 44px, FAB ＋ per "aggiungi".
- Niente hover-dipendenze; gesture semplici (tap). Calendario compatto a griglia 7.
- Foto: input file nativo del telefono (fotocamera/galleria).
- Performance: poche dipendenze, una sola libreria esterna (supabase-js).
- Stile "Velluto notturno": bordeaux `#5c1026`, fondi `#160409`/`#2a0813`, oro
  `#d4a86c`, crema `#f3d9b0`, serif elegante, lume di candela. Coerente con la
  regola UI (design distintivo, niente look "AI generico").

---

## 8. Gestione errori (no fallimenti silenziosi)

- Login fallito → messaggio chiaro, nessun accesso.
- Errore rete / Supabase → toast d'errore esplicito + possibilità di riprovare;
  mai "fallire in silenzio" (lezione dal progetto palestra).
- Upload foto fallito → errore visibile, la voce resta salvabile senza foto.
- Conflitti rari (entrambi scrivono): l'ultimo salvataggio vince a livello di riga;
  le liste si ricaricano all'apertura/refresh della sezione.

---

## 9. Testing

- **Unit test Node** (`node --test`) sulle funzioni pure:
  - transizioni di stato dei **buoni** (regalo/richiesta → attivo/rifiutato/riscattato);
  - **eleggibilità ruota** (cooldown 7 giorni);
  - **filtri/ordinamento** desideri e carte; raggruppamento **bundle**.
  - `store.js` testato con client Supabase **finto iniettato**.
- **Smoke test in browser vero (Playwright) OBBLIGATORIO** prima di dire "fatto":
  login di entrambi gli account, aggiunta voce in ogni modulo, **upload foto +
  visualizzazione via signed URL**, ciclo buoni completo (regalo, bundle, richiesta
  → accetta/rifiuta → riscatta), **blocco ruota settimanale**, persistenza dopo
  reload, layout corretto a viewport mobile.

---

## 10. Deploy & setup

1. Creare progetto **Supabase** (free). Salvare URL + anon key nel frontend.
2. Creare schema (tabelle + RLS + bucket) via SQL fornito (guida passo-passo, "io
   scrivo, tu esegui").
3. Creare a mano i **due account** in Auth; disattivare la registrazione pubblica;
   creare il record `couple` con i due id e i due `profiles`.
4. Repo GitHub (nome discreto) + **GitHub Pages** su branch principale.
5. Verifica finale: pagina live HTTP 200, login da due dispositivi, ciclo completo
   in ogni modulo, foto private visibili solo loggati.

---

## 11. Ordine di costruzione (fasi)

1. **Fondamenta**: Supabase + schema/RLS + login + profili + scheletro UI mobile +
   modulo **Desideri** completo end-to-end (prova il flusso dati per intero).
2. **Esperienze + calendario + foto** (incl. Storage privato e signed URL).
3. **Buoni** (regalo / bundle / richiesta-accetta-rifiuta-riscatta).
4. **Giochi**: dadi, **ruota settimanale**, **Truth or Dare**.

Ogni fase è testabile e usabile da sola.

---

## 12. Fuori scope (YAGNI per ora)

- Notifiche push reali (al loro posto: badge "novità" all'apertura, fase successiva).
- App nativa / PWA installabile (eventuale fase successiva).
- Contenuti di ruota/dadi modificabili dall'app (v2; per ora hardcoded).
- Più di due utenti / multi-coppia.
- Chat in tempo reale, realtime sync (refresh manuale basta per due persone).
