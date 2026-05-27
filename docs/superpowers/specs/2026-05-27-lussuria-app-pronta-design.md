# Lussuria — fase "app pronta all'uso" — design

**Data:** 2026-05-27
**Progetto:** ex *Velluto*, ora **Lussuria** (sito di coppia, mobile-first, frontend statico + Supabase).
**Obiettivo della fase:** rendere l'app davvero usabile da telefono ogni giorno. Cinque interventi: rename, PWA installabile, stop all'overscroll, swipe nav stile iPhone, pagina Impostazioni vera.

Tutte le decisioni qui sotto sono già state approvate in brainstorming (con mockup interattivi per le parti visive: `mockups/impostazioni-app.html`, `mockups/swipe-pager-demo.html`, `mockups/lussuria-icona.html`).

---

## 1. Rename → "Lussuria"

- Sostituire la stringa **"Velluto"** dove compare come nome dell'app: `index.html` `<title>`, `.brand` (topbar), `.login-title`. Il kicker `il nostro spazio` resta.
- Nome anche nel `manifest.json` (`name`/`short_name`) e nei testi delle Impostazioni ("Esci da Lussuria", footer).
- **Il path GitHub Pages resta `/velluto/`** (non si rinomina il repo). Niente di hardcodato sul path cambia.
- Il mood visivo "Velluto notturno" (palette bordeaux/oro/crema) **non cambia**: cambia solo il nome.

## 2. PWA installabile

Obiettivo: "Aggiungi a Home" su iOS dà icona + fullscreen; su Android compare l'installazione.

- **`manifest.json`** (nuovo, in root): `name:"Lussuria"`, `short_name:"Lussuria"`, `start_url:"./"`, `scope:"./"`, `display:"standalone"`, `background_color:"#160409"`, `theme_color:"#160409"`, `orientation:"portrait"`, array `icons`.
- **Icona = concept #2 "Fiamma"** (fiamma oro→rosa su fondo bordeaux, da `mockups/lussuria-icona.html`). Serve in PNG (iOS/Android non usano SVG per l'icona installata):
  - `icons/icon-180.png` (apple-touch-icon), `icon-192.png`, `icon-512.png`, più `icon-512-maskable.png` (`purpose:"maskable"` con padding di sicurezza ~20%).
  - Generate dal sorgente SVG della fiamma (build step una-tantum; vedi piano).
- **`index.html` `<head>`**: `<link rel="manifest">`, `<link rel="apple-touch-icon" href="icons/icon-180.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, `<meta name="apple-mobile-web-app-title" content="Lussuria">`. `theme-color #160409` c'è già.
- **Service worker** minimale (`sw.js` in root) registrato da `js/app.js`: precache dello shell statico (html/css/js locali) con strategia *network-first* per i file dell'app e *cache-first* per Leaflet/CDN già caricati; necessario per l'installabilità Android e per un avvio offline dello shell. **NON** deve cachare le risposte Supabase. Versione cache bumpabile a mano.

## 3. Stop all'overscroll / pagina "che si muove"

Causa attuale: lo scroll è quello del documento (`.wrap` con `padding-bottom`), quindi su iOS rimbalza anche quando il contenuto ci sta.

**Soluzione (si combina con il pager del §4):** l'app diventa una colonna a altezza fissa.
- `html, body { height: 100%; overflow: hidden; overscroll-behavior: none; }` e `body { position: fixed; inset: 0; }`.
- `.wrap`/`#app` = flex column a `height:100%`: **topbar** (fissa, flex 0), **viewport pager** (flex 1, l'unico che scrolla, internamente per pagina), **dock** (fissa, flex 0).
- Lo scroll vive **dentro ogni pagina** del pager (`overflow-y:auto; overscroll-behavior:contain`), non sul documento → niente rimbalzo della pagina intera.
- Il gate **login** resta `position:fixed; inset:0` com'è. I modali continuano con `body.locked`.
- La dock non è più `position:fixed` ma un figlio flex in fondo (stessa resa visiva).

## 4. Swipe nav stile iPhone (pager vero)

Approvato in `mockups/swipe-pager-demo.html`. Comportamento:
- Le 6 sezioni vivono in un **track orizzontale** dentro il `.viewport`. Ordine invariato: 🔥 Desideri · 🎲 Giochi · 📅 Esperienze · 🗺️ Mappa · 🎟️ Buoni · 🖼️ Galleria.
- Trascinamento **orizzontale** → il track **segue il dito** (translateX); al rilascio **scatta** alla sezione adiacente se supera la soglia (~22% larghezza), altrimenti torna indietro. Transizione di snap `.34s cubic-bezier(.17,.67,.18,1)`.
- **Niente wrap-around**: ai bordi (prima/ultima) c'è resistenza elastica (*rubber-band*).
- **Direzione bloccata**: si decide all'inizio del gesto se è orizzontale (pager) o verticale (scroll della pagina). `touch-action: pan-y` sulle pagine; `setPointerCapture` sul viewport. Le righe a scorrimento orizzontale (es. tally-row, chips) scrollano per conto loro perché lo scroll nativo parte prima della soglia orizzontale del pager.
- **Mappa = isola**: dentro l'area Leaflet il trascinamento muove la cartina (pan/zoom intatti). Il pager **non** parte se il gesto inizia dentro la mappa (check `closest('.mappa-area')`/`[data-isola]`). Per uscire dalla Mappa: tocco sulla dock o swipe sulla topbar/dock.
- La **dock** resta cliccabile e riflette la pagina corrente (tab attiva allargata come ora); cambiare tab dalla dock = stessa animazione di snap.
- **Render lazy**: si renderizza la pagina corrente e (alla prima visita) le adiacenti vengono renderizzate quando ci si avvicina/atterra, per non costruire 6 sezioni all'avvio. La mappa Leaflet va inizializzata solo quando la sua pagina diventa visibile (come oggi) e fare `invalidateSize()` all'atterraggio.
- `js/app.js`: l'attuale `enableSwipe` (gesto secco + wrap) viene **sostituito** dal motore pager; `go(k)` ora porta all'indice e fa snap; i `.panel` non usano più `display:none`/`.on` ma sono celle del track.

## 5. Pagina Impostazioni vera

Approvata in `mockups/impostazioni-app.html`. **Schermo intero** (sheet che entra dal basso), aperta toccando il **chip del profilo** in topbar (oggi il chip fa logout diretto e c'è l'ingranaggio ⚙️ per i tag: entrambi confluiscono qui, l'ingranaggio sparisce). Nuovo modulo `js/modules/impostazioni.js`.

Sezioni:

### Profilo
- **Icona**: emoji picker → salva su `profiles.avatar` (Supabase). Nuova `updateProfile(client, id, {avatar, display_name})` in `store.js`.
- **Nome**: campo testo → `profiles.display_name`.
- Dopo il salvataggio, il chip in topbar si aggiorna.

### Privacy & blocco — **per-dispositivo** (localStorage, non sincronizzato)
- **Blocco con codice (PIN)**: interruttore "richiedi all'apertura". Il PIN (4–6 cifre) è salvato **hashato** in `localStorage` (SHA-256 via `crypto.subtle`, mai in chiaro, mai sul server). Quando attivo, all'avvio dell'app compare un **gate PIN** a tutto schermo (mood Lussuria) prima di mostrare il contenuto — dopo il login Supabase, perché il gate è locale al dispositivo. Voce "**Cambia codice**".
- **Sblocco biometrico (Face ID / impronta)** — *subito*, via **WebAuthn**: all'attivazione `navigator.credentials.create()` con `authenticatorAttachment:"platform"`, si salva il `credentialId` in localStorage; allo sblocco `navigator.credentials.get()` richiede la biometria del dispositivo. **Onesto:** è un *presence check* locale (nessuna verifica lato server) — sblocca il gate se la biometria del telefono va a buon fine. L'interruttore è **nascosto** se `PublicKeyCredential` / platform authenticator non è disponibile. Il PIN resta sempre il fallback.
- **Modalità pudica**: interruttore per-dispositivo (localStorage). Quando attiva, aggiunge `body.pudica` → tutte le miniature foto e i contenuti "spinti" restano **sfocati** finché non li si tocca (oggi le foto sono già blur-on-tap: la pudica forza il blur di default e lo estende a testi/anteprime marcati `data-spicy`).

### Personalizza
- **Tag del calendario**: stessa gestione di `openTipiSettings` (oggi sull'ingranaggio), spostata qui come sotto-sezione (chips add/del → `addTipo`/`deleteTipo`/`updateTipo`).
- **Contenuti dei giochi**: riga → apre l'editor di `ruota_contenuti` (proposte piccanti / buoni a sorpresa) già esistente nel modulo Giochi; da qui ci si arriva da un punto solo.

### Dati — "Svuota dati" (raggruppato)
- Una sola voce "**Svuota dati**" → **sotto-schermata** (slide-in) con **checklist** delle 6 sezioni: Desideri · Esperienze · Buoni · Giochi · Luoghi · Tag. Si spuntano quelle volute → bottone "Svuota le sezioni selezionate" → **conferma forte** (testo che elenca cosa) → cancellazione.
- Cancellazione = nuove funzioni bulk in `store.js`, ognuna scoped a `couple_id` e che ripulisce anche **foto + storage** dove serve (riuso di `deleteFotoDi`):
  - Desideri → `wipeDesideri(coupleId)`
  - Esperienze → `wipeEsperienze(coupleId)` (esperienze + foto contesto `esperienza` + momenti)
  - Buoni → `wipeBuoni(coupleId)` (buoni + foto contesto `buono`)
  - Giochi → `wipeGiochi(coupleId)` (azzera `giri_movimenti` e `strip_partite`; **tiene** i contenuti editabili dadi/ruota)
  - Luoghi → `wipeLuoghi(coupleId)` (luoghi + foto contesto `luogo`)
  - Tag → `wipeTipi(coupleId)` poi `seedTipi` ai default
- L'operazione vale per **tutta la coppia** (dati condivisi). Il testo di conferma lo dice.

### Account
- **Cambia password**: form (nuova + conferma) → `client.auth.updateUser({ password })`.
- **Esci**: logout (spostato qui dal chip).

### Footer
- "LUSSURIA · il vostro spazio · v1.0" + scorciatoia "**Installa sulla Home**" (mostra istruzioni iOS o invoca il prompt `beforeinstallprompt` su Android se disponibile).

---

## Componenti & confini

- `js/modules/impostazioni.js` (nuovo): rende lo sheet, le sezioni, la sotto-schermata Svuota, il gate PIN/biometrico. Dipende da `store.js`, `auth.js`, `ui.js`, e da un piccolo `js/lib/lock.js`.
- `js/lib/lock.js` (nuovo, **logica pura testabile**): hashing PIN (`crypto.subtle`), set/verify PIN, stato lock in localStorage, helper WebAuthn (create/get). Funzioni pure dove possibile (es. validazione PIN, shape dello stato) testate in `test/lock.test.js`.
- `js/app.js`: motore pager (sostituisce `enableSwipe`), registrazione service worker, apertura Impostazioni dal chip, gate PIN all'avvio.
- `store.js`: `updateProfile` + le 6 `wipe*`.
- `styles.css`: blocco `.set-*` (sheet impostazioni), `.lockgate`, `.pudica`, e refactor layout per il pager (colonna fissa, viewport, track).
- `index.html`: head PWA, manifest, `#p-*` diventano celle del track, gate PIN container.
- File nuovi in root: `manifest.json`, `sw.js`, `icons/*.png`.

## Testing

- **Unit** (`node --test`): `lib/lock.js` (hash/verify PIN, validazione, transizioni stato lock); `store.js` `wipe*` con client finto (verifica che chiamino le delete giuste + `deleteFotoDi`); `updateProfile`. Mantenere verde la suite esistente.
- **Smoke nel browser (loggato, da telefono/desktop)** — checklist in `test/smoke.md`, sezione nuova "App pronta": installazione PWA (icona+standalone), nessun overscroll, swipe pager (segue il dito, snap, bordi, mappa-isola, scroll verticale, tally orizzontale), Impostazioni (cambio nome/icona si riflette, PIN set→lock→unlock, biometrico se disponibile, pudica, tag, svuota una sezione di prova, cambia password, logout).

## Fuori scope (YAGNI, eventuale dopo)

- Sincronizzazione cross-device di PIN/pudica (scelto per-dispositivo).
- Push notification.
- Temi alternativi / cambio palette.
- Rinominare il repo o il path GitHub Pages.

## Note / rischi

- **Biometrico WebAuthn**: senza backend è un presence-check locale, non una vera autenticazione crittografica. Accettato per un gate personale; il PIN è la base di sicurezza.
- **PWA su iOS**: l'installazione resta manuale ("Condividi → Aggiungi a Home"); il `beforeinstallprompt` è solo Android/Chrome.
- **Service worker + GitHub Pages subpath `/velluto/`**: `scope`/`start_url` relativi (`./`) per funzionare sotto il subpath. Attenzione alla cache vecchia: versionare e gestire l'aggiornamento.
- **Migrazioni Supabase pendenti** di fasi precedenti (es. `giri.sql`) restano un prerequisito a parte; questa fase non aggiunge tabelle (PIN/pudica sono locali).
