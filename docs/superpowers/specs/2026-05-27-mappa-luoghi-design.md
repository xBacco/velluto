# Mappa Luoghi — design (DEFINITO)

> Brainstorming chiuso il 2026-05-27. Tutte le scelte UI sono prese.
> Mockup di riferimento (combo finale): `.superpowers/brainstorm/30920-1779892123/content/mappa-decisione.html`.

## Cos'è
Nuovo **6° tab "🗺️ Mappa"** nell'app Velluto (`siti-app/nostro-spazio`).
Una mappa dei posti vissuti dalla coppia; i posti "intimi" sono un **sottoinsieme**.

## Decisioni prese (tutte confermate)
- **Una sola collezione di luoghi.** "Dove l'abbiamo fatto" = sottoinsieme con flag `intimo`.
  Sulla mappa **NON si distinguono** (un solo tipo di pin oro): se l'abbiamo fatto lì, ovviamente ci siamo stati.
- **Mappa geografica vera**: Leaflet + OpenStreetMap, tile **scure CARTO dark** ("Atlante notturno"). Gratis, senza API key. CDN.
- **Layout pagina**: mappa **a tutto schermo**; in basso una **maniglia/drawer** (variante D) che apre il popup statistiche.
- **Elemento statistiche in basso = "D · Maniglia"** ✅: maniglia discreta sul bordo basso con etichetta
  "📊 Statistiche · N luoghi · M volte 🔥"; tap → il pannello statistiche **sale dal basso** (bottom sheet).
- **Stile grafico nel popup = "Barre + numeri"** ✅: una barra per mese col numero sopra; tap su un mese → posti di quel mese.
- **Popup statistiche**: UN SOLO riquadro con switch **"📍 Siamo stati / 🔥 Fatto qui"**; barre+numeri per mese;
  **tap su un mese → vista mese** (dentro lo stesso riquadro, con ←) coi posti: sezione 📍 siamo stati + sezione 🔥 fatto qui.
- **Pin** → apre la scheda del luogo.
- **Scheda luogo = POLAROID vera**: foto quadrata, bordo bianco, fascia bassa con **didascalia scritta a mano** (nome) + data.
  Si **gira** (flip 3D) sul **retro** (cartoncino crema):
  - "**Aggiunta il GG mese AAAA**" (data esatta di inserimento)
  - **descrizione editabile**
  - **voto a cuori** (solo intimi)
  - francobollo "**FATTO QUI**" (solo intimi)
  - foto extra + **＋ aggiungi foto**
- **Animazione apertura polaroid: "Scatto"** (flash bianco, poi la polaroid compare). ✅
- **Aggiunta luogo (FAB ＋)**: tap sulla mappa per posizionare il pin (lat/lng) **+** campo ricerca indirizzo
  (Nominatim/OSM, gratis) per centrare la mappa; poi form con nome, data evento, flag intimo, voto (se intimo),
  descrizione, foto. *(Dettaglio UX del form da rifinire in fase di plan; nessun blocco di design.)*
- **Collegamento facoltativo** di un luogo intimo a un **momento del calendario** (`esperienze`): previsto (campo `esperienza_id`).

## Dati — tabella Supabase `luoghi`
`id uuid pk, couple_id uuid, autore_id uuid, nome text, citta text null, lat float8, lng float8,
intimo bool default false, voto int default 0 (0-5), descrizione text null, data_evento date,
esperienza_id uuid null (FK esperienze), creato timestamptz default now()`.
- Foto del luogo: riuso del pattern foto esistente (`esperienza_foto` / storage). Tabella `luogo_foto`
  (`id, luogo_id, url/path, ordine, creato`) o riuso storage con prefisso. **RLS**: `is_member(couple_id)` su tutte.

## Architettura (coerente con l'app esistente)
- `js/modules/mappa.js` — nuovo modulo tab (come gli altri).
- `js/lib/logic.js` — logica pura: aggregazioni per mese (vis/fat), sottoinsieme intimi, totali. + test in `test/`.
- `js/store.js` — CRUD luoghi + foto.
- `supabase/luoghi.sql` — migrazione tabelle + RLS.
- `js/app.js` — aggancio tab nell'array `TABS`.
- `index.html` — Leaflet CSS/JS via CDN.

## Logica pura da testare (TDD)
- `aggregaPerMese(luoghi)` → `{vis:[12], fat:[12]}`.
- `totali(luoghi)` → `{luoghi, volte, mesiAttivi}`.
- `luoghiDelMese(luoghi, mese)` → `{visited, fatto}`.
- `soloIntimi(luoghi)` → filtro.

## Out of scope (per ora)
- Condivisione/export mappa, clustering pin, percorsi/itinerari.
- Modifica massiva. Edit singolo luogo sì (descrizione, voto, foto).
