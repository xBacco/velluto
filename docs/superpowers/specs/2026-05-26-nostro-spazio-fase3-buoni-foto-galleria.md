# Fase 3 — Buoni + Foto riutilizzabili + Galleria — Design / Spec

**Data:** 2026-05-26
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Progetto:** Il nostro spazio (Velluto) — web app privata di coppia
**Basata su:** `2026-05-26-nostro-spazio-v2-design.md` (spec generale v2), Fase 1 (Desideri) e
Fase 2 (Esperienze + foto private) già completate e in `master`.

---

## 1. Scopo della fase

Costruire tre cose, di cui la prima abilita le altre due:

1. **Primitiva foto riutilizzabile** — un'unica capacità "foto privata" che qualsiasi
   modulo può agganciare (oggi Buoni ed Esperienze; domani messaggi, premi ruota,
   obblighi ToD). Niente sistemi foto duplicati per modulo.
2. **Modulo Buoni** — il modulo pianificato in spec v2 §4.4 (regalo / bundle /
   richiesta → accetta / rifiuta / riscatta), con **foto allegabili** ai buoni.
3. **Galleria** — una nuova sezione che raccoglie tutte le foto, raggruppate per
   *dove sono state usate* (contesto) più una vista "Tutte".

Movente esplicito dell'utente: poter mandare/allegare foto intime (anche osé/nudo)
"con spazio all'immaginazione" — allegate ai buoni, come ricordo di un giorno, e in
futuro come messaggio / reazione / premio / obbligo — **con la garanzia che non
vadano da nessuna parte strana**.

---

## 2. Decisioni chiave (dal brainstorming)

- **Forma foto = primitiva trasversale**, non un singolo modulo: una foto è un
  "mattoncino" attaccabile ovunque tramite `contesto` + `ref_id`.
- **Sicurezza = stesso modello della Fase 2** (bucket privato + RLS + signed URL a
  scadenza). Niente cifratura E2E: il progetto Supabase è dell'utente, quindi
  "l'admin potrebbe accedere" ≈ "tu accedi ai tuoi file"; in cambio si evita il
  rischio di lockout da passphrase persa. Modello già collaudato e robusto contro
  estranei e leak accidentali.
- **Architettura = tabella `foto` unica** (polimorfica) + componente UI riusabile.
  Le foto delle Esperienze (Fase 2) vengono **migrate** su questa tabella: un solo
  sistema.
- **Galleria** raggruppata per contesto + vista "Tutte"; tap → vista grande con
  "vai all'origine".
- **Scope Fase 3** = primitiva + Buoni + Galleria + refactor esperienze. Gli altri
  usi immaginati (messaggio, reazione a eventi, premio ruota, obbligo ToD) **riusano
  la stessa primitiva in Fase 4**, quando quei moduli esistono.

---

## 3. Architettura

Coerente con la spec v2: HTML/CSS/JS vanilla, niente build, Supabase via CDN, RLS su
tutto, Storage privato + signed URL. Mobile-first.

### 3.1 Primitiva foto

**Tabella `foto`** (sostituisce `esperienza_foto`):

```
foto ( id uuid pk,
       couple_id uuid not null -> couples,
       autore_id uuid not null -> auth.users,
       contesto  text not null check (contesto in ('esperienza','buono')),  -- estendibile in Fase 4
       ref_id    uuid not null,        -- id della riga genitore (esperienza o buono)
       storage_path text not null,
       didascalia   text,              -- opzionale (utile per "ricordo del giorno")
       creato timestamptz not null default now() )
```

- `contesto` ha un `check` esteso man mano (Fase 4 aggiunge `messaggio`, `premio`,
  `obbligo`, … via `alter`). Nessun vincolo FK su `ref_id` perché punta a tabelle
  diverse: l'integrità è garantita a livello applicativo (la foto si crea sempre
  insieme/dopo il genitore) e la cancellazione del genitore pulisce le foto via codice.
- **RLS**: una policy `for all` basata su `is_member(couple_id)`, identica al pattern
  delle altre tabelle di coppia.

**Storage**: bucket privato `foto` (già esistente). Nuovo schema path:
`<couple_id>/<contesto>/<ref_id>/<filename>`. Le policy RLS attuali su
`storage.objects` legano l'accesso alla **prima cartella = couple_id**, quindi
restano valide senza modifiche.

**Funzioni `store.js`** (riceve il client, iniettabile per i test):
- `uploadFoto(client, { coupleId, autoreId, contesto, refId, file, didascalia })`
  → upload nel bucket + insert riga `foto`.
- `listFoto(client, { contesto, refId })` → righe foto di un genitore.
- `listFotoGalleria(client, { contesto? })` → tutte le foto della coppia, opz. filtrate per contesto.
- `signedUrl(client, storagePath, expiresIn=3600)` → invariata dalla Fase 2.
- `deleteFoto(client, { id, storagePath })` → remove da Storage + delete riga.
- `deleteFotoDi(client, { contesto, refId })` → cancella tutte le foto di un genitore
  (usata quando si elimina un buono/esperienza, per non lasciare foto orfane).

**Funzioni pure `lib/logic.js`**:
- `fotoPath(coupleId, contesto, refId, filename, now)` → path deterministico, sanifica
  il filename (generalizza la `fotoPath` attuale).
- `groupFotoByContesto(rows)` → mappa `{ contesto: foto[] }` per la galleria.

### 3.2 Componente UI riutilizzabile — `js/modules/foto.js`

Un modulo di rendering che ogni sezione richiama. Espone:
- `renderFotoEditor(container, { contesto, refId, coupleId, autoreId })` — blocco
  "aggiungi foto (input file nativo) → anteprima miniature via signed URL → didascalia
  opzionale → elimina". Usato dentro la form di un buono e di un'esperienza.
- `renderFotoThumbs(container, fotoRows)` — sola lettura, per la timeline/dettaglio.

Regole UI ereditate dal progetto: niente `innerHTML` (nodi sicuri via `ui.js`),
gestione errori esplicita (upload fallito → toast, la voce resta salvabile senza foto),
target tap ≥ 44px, input file nativo (fotocamera/galleria).

### 3.3 Modulo Buoni — `js/modules/buoni.js`

Tre viste (tab): **Ricevuti** (da riscattare), **Inviati**, **Richieste** (in attesa).

- Entità `buoni` già definita in `schema.sql` §5 — nessuna modifica alla tabella.
- Creazione **regalo**: `tipo=regalo, stato=attivo, da_id=io, a_id=partner`. Allegabili
  foto via `renderFotoEditor(contesto='buono')`.
- Creazione **richiesta**: `tipo=richiesta, stato=in_attesa, a_id=io, da_id=partner`.
- **Bundle**: più buoni creati nella stessa azione condividono `bundle_id`.
- Azioni stato: **riscatta** (regalo attivo → riscattato, set `riscattato_il`),
  **accetta** (richiesta → regalo attivo), **rifiuta** (richiesta → rifiutato).
- Eliminazione buono → `deleteFotoDi('buono', id)` prima del delete riga.
- Entrambi i membri della coppia vedono le foto di qualsiasi buono.

**Transizioni di stato = funzioni pure testabili** in `lib/logic.js`:
- `applicaTransizioneBuono(buono, azione)` → nuovo stato/tipo o errore se illegale.
- `gruppoBundle(buoni)` → raggruppa per `bundle_id`.
- Filtri viste: `buoniRicevuti(buoni, me)`, `buoniInviati(buoni, me)`,
  `richiesteInAttesa(buoni, me)`.

### 3.4 Galleria — `js/modules/galleria.js`

- Griglia di miniature (signed URL), mobile-first, colonna singola/2 colonne.
- **Tab/filtro per contesto**: `Tutte` · `Esperienze` · `Buoni` (i contesti futuri
  compaiono automaticamente da `groupFotoByContesto`).
- Tap su miniatura → **vista grande** (modale `ui.js`) con didascalia e pulsante
  **"vai all'origine"** che apre il buono/esperienza di provenienza (routing app.js).
- Filtro autore (mie / sue / tutte) — **opzionale**, incluso se a costo basso.

### 3.5 App shell / routing — `js/app.js`, `index.html`

- Aggiungere le sezioni **Buoni** e **Galleria** alla navigazione (la spec v2 prevede
  6 moduli; Galleria è una vista trasversale in più). Icone: 🎟️ Buoni, 🖼️ Galleria.
- "Vai all'origine" dalla galleria = navigazione alla sezione del contesto con focus
  sull'elemento `ref_id`.

---

## 4. Migrazione (refactor Fase 2)

Script SQL `supabase/migrate_foto.sql`, idempotente, da eseguire nel SQL Editor:

1. `create table foto (…)` + RLS `foto_all` (`is_member`).
2. Copia dati: `insert into foto (… , contesto, ref_id, …) select …, 'esperienza',
   esperienza_id, … from esperienza_foto`.
3. Verifica conteggi (`select count(*)` su entrambe).
4. `drop table esperienza_foto;` **solo dopo** che il codice nuovo è attivo e i conteggi
   tornano (passo manuale, guidato).

Lato codice: il modulo Esperienze passa da `esperienza_foto`/`uploadFoto` vecchio alle
nuove funzioni `foto` con `contesto='esperienza'`. I test della Fase 2 sulle foto
vengono aggiornati al nuovo store.

---

## 5. Sicurezza & privacy

Invariata rispetto alla spec v2 §6 e alla Fase 2, ora estesa a tutte le foto:
- Bucket `foto` **privato**, mai pubblico.
- RLS: lettura/scrittura solo ai membri della coppia; path legato al `couple_id`.
- Accesso solo via **signed URL a scadenza breve** (1h), generato solo se loggati.
- Frontend senza segreti; `noindex` + `robots.txt`; nome repo neutro.
- **Limite onesto:** l'admin del progetto Supabase (= l'utente stesso) può
  tecnicamente accedere ai file; nessuna cifratura E2E per scelta (evita il rischio
  di perdere la passphrase). Robusto contro estranei, hacker e leak accidentali del DB.

---

## 6. Gestione errori (no fallimenti silenziosi)

- Upload foto fallito → toast d'errore esplicito; la voce (buono/esperienza) resta
  salvabile **senza** foto.
- Eliminazione: se il delete da Storage fallisce ma la riga DB no (o viceversa) →
  toast che segnala possibili foto orfane (lezione della review Fase 2).
- Signed URL scaduto/fallito → placeholder + possibilità di ricaricare.
- Transizione buono illegale → bloccata dalla funzione pura con messaggio chiaro.
- Errore rete/Supabase → toast + retry; mai fallire in silenzio.

---

## 7. Testing

**Unit `node --test`** (funzioni pure + store con client finto):
- `applicaTransizioneBuono` per tutte le transizioni legali e illegali.
- `gruppoBundle`, filtri viste buoni.
- `fotoPath` (nuova firma), `groupFotoByContesto`.
- `store.js`: `uploadFoto`/`listFoto`/`listFotoGalleria`/`deleteFoto`/`deleteFotoDi`
  con client Supabase finto iniettato.

**Smoke test Playwright (OBBLIGATORIO prima di "fatto")**:
- Login.
- Ciclo buoni completo: crea regalo, crea bundle, crea richiesta → il partner accetta
  e rifiuta, riscatta un regalo.
- Allega ≥1 foto a un buono → visibile nel dettaglio via signed URL.
- Esperienza con foto ancora funzionante dopo il refactor.
- Galleria: mostra le foto raggruppate per contesto; "Tutte" le mostra insieme;
  "vai all'origine" apre l'elemento giusto.
- Privacy: senza login il fetch della foto fallisce.
- Layout corretto a viewport mobile.

---

## 8. Fuori scope (questa fase)

- Usi foto di Fase 4: **messaggio**, **reazione a eventi**, **premio ruota**,
  **obbligo ToD** — riusano la primitiva, ma si implementano con i rispettivi moduli.
- Editing avanzato foto (crop, filtri), riordino manuale, album personalizzati.
- Cifratura E2E (decisione esplicita: non in questo progetto).
- Notifiche/badge "novità" sulle nuove foto (eventuale fase successiva).

---

## 9. Ordine di costruzione (per il piano)

1. **Primitiva foto**: tabella `foto` + RLS + migrazione SQL; funzioni `store.js` e
   `lib/logic.js`; componente `modules/foto.js`. Refactor Esperienze sul nuovo store.
2. **Modulo Buoni**: funzioni pure transizioni/filtri + test; `modules/buoni.js`
   (tre viste, crea regalo/bundle/richiesta, azioni stato) con foto allegate.
3. **Galleria**: `modules/galleria.js` (griglia, filtro per contesto, vista grande,
   vai-all'origine) + aggancio routing in `app.js`/`index.html`.
4. **Verifica**: unit test verdi + smoke test Playwright completo.

Ogni passo è testabile; la fase è usabile da sola.
