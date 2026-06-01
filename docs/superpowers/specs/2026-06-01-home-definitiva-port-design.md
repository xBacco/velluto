# Port HOME DEFINITIVA nell'app — design

**Data:** 2026-06-01
**App:** brace. (nostro-spazio) — app di coppia, 2 persone (🐻 Tomas + 🧁 lei)
**Sorgente visiva approvata:** `mockups/new-h17-home-DEFINITIVA.html`
**Modello di navigazione scelto:** A (hub + swipe) — vedi `mockups/nav-modello-confronto.html`

## Contesto e problema

L'app ha una home "vecchia" dentro `index.html` (saluto + chip fluttuanti + FAB radiale).
La home **definitiva** disegnata e approvata è un mockup a porte (`new-h17-home-DEFINITIVA.html`):
due stati con transizione "porta-zoom" e un hub a 7 porte. Quel mockup non è mai stato
portato nell'app. La sessione "calore" precedente ha agganciato una gauge calore alla home
vecchia (commit `732bb3c`, attualmente in deploy) — è una soluzione provvisoria da sostituire.

Questo design copre il **port della DEFINITIVA** nell'app vera, con dati reali.

## Cosa si riusa (già esistente, non da rifare)

- **Calore di coppia reale:** `js/lib/logic.js` → `calcolaCalore`, `eventiCalore`, `CALORE`, `PESI_CALORE` (con test, 211 verdi). Il pop-up "la vostra brace" (`renderHeatPop`) è già in `js/modules/home.js`.
- **Pager sezioni:** `js/app.js` → `enablePager`/`go`/`layout`/`renderNear`/`renderTab`, swipe orizzontale + barra `#nav`, 6 sezioni (`TABS`). `enterSection(k)` nasconde la home e mostra il pager.
- **Accesso dati:** `js/store.js` → `listGiri, listSlotMov, listBuoni, listDesideri, listEsperienze, listLuoghi, listFotoGalleria`. `js/lib/logic.js` → `saldoGiri, saldoSlot, buoniRicevuti`.

## Decisioni prese (brainstorming)

1. **Navigazione = Modello A.** HUD-porta → camera-hub (7 porte) → sezione reale (pager esistente). Dentro la sezione restano swipe + barra in basso; `⌂` torna all'hub. Riusa il pager: meno lavoro, tiene il cuore del mockup (porta-zoom + dock).
2. **7ª porta "traguardi" 🏅 = placeholder "presto".** Visibile nel dock, apre una stanzetta "in arrivo". Non è una feature reale nel v1: diventerà progetto a parte. Nel **pager swipe** restano solo le **6 sezioni reali** (traguardi vive solo nell'hub).
3. **Dati = tutto reale, inclusa presenza online del partner.** Presenza via **heartbeat** (no realtime nel v1).

## Architettura — macchina a 3 stati

```
#home (HUD-porta)  ──tap porta──▶  #camera (hub 7 porte)  ──tap hero/CTA──▶  sezione (#app, pager)
       ▲                                   │   ▲                                    │
       └────────────── ↩ home ─────────────┘   └─────────────── ⌂ stanza ───────────┘
```

- **`home.js`** possiede gli stati `#home` e `#camera` e le transizioni dolly fra loro.
- **`app.js`** possiede `#app`/pager. `enterSection(k)` (già esistente) nasconde home+camera e mostra il pager. Nuovo: evento **`gohub`** che riapre `#camera` e nasconde `#app` (ritorno dalla sezione all'hub).
- Lo stato attivo è uno solo alla volta (uno visibile, gli altri `display:none`/`hidden`).

## Componenti

### index.html
Sostituire il blocco `#home` attuale con la struttura DEFINITIVA:
- **`#home` (HUD):** topbar (brand `brace.` + chip coppia + `?`), log notifiche stile terminale, `.door-wrap` (porta disegnata: jamb/door/knob/threshold/peeknote/enter-CTA), gauge calore cliccabile, promptbar `+fantasia`.
- **`#camera` (hub):** `.amb/.embers/.floor`, `.cam-top` (back ↩ + titolo + chip coppia), `.statusbar` (presenza + calore mini), `.stage` (hero porta in evidenza + meta + CTA "entra nel varco"), `.dock` (rail con 7 `.slot`).
- **`#homeHeatPop`** (pop-up calore): allineare alla `.heat-pop` della DEFINITIVA (kicker "la vostra brace", `hp-big`, `hp-body` terminale).
- Il pager (`#app`, `#viewport`, `#track`, `#nav`) resta **intatto**.

### styles.css
- Portare gli stili DEFINITIVA: `.home/.camera/.dock/.slot/.hero/.statusbar/.heat-pop/...`.
- **Rimuovere** gli stili della home vecchia ora obsoleti: `.home-bg, .home-duo, .home-greet, .home-h, .home-kick, .home-wlab, .home-pins, .home-pin-*, .home-radial, .home-ritem, .home-coach*, .home-scrim, .home-vig, .home-deepen, .home-lit` e simili introdotti dal commit `732bb3c`.
- Niente `calc()` dentro gli angoli dei `conic-gradient` (vincolo WebView Android noto). Il mockup usa già gradi espliciti.

### js/modules/home.js (riscrittura di renderHome)
- Monta i 2 stati e le transizioni (`enterRoom`/`exitRoom` dolly, come nel mockup).
- Popola dati reali (sotto).
- Cabla la navigazione (sotto).
- Mantiene `renderHeatPop` e il calcolo calore esistenti.

### js/lib/presence.js (nuovo)
Helper **puri** (testabili) + un avvio heartbeat:
- `isOnline(lastSeenISO, now, sogliaSec = 60)` → bool.
- `tempoRelativo(lastSeenISO, now)` → stringa `"ora" | "2′ fa" | "1h fa" | "ieri" | ...`.
- `avviaHeartbeat({client, me, intervalloSec = 30})` → aggiorna `profiles.last_seen = now` per `me.id` a intervalli mentre l'app è in foreground; ritorna una funzione `stop()`. Si ferma su `visibilitychange→hidden`, riparte su `visible`.

### js/lib/logic.js (aggiunta)
- `riepilogoSezioni(liste, me, now)` → per ciascuna delle 6 sezioni reali: `{ key, count, novita: 'hot'|'warn'|'none', teaser }`.
  - `count` = elementi rilevanti (es. fantasie nuove dalla partner, buoni attivi, giri/slot disponibili, esperienze in arrivo, luoghi, foto).
  - `novita` = severità (es. `hot` se c'è qualcosa di nuovo per te, `warn` se in scadenza, `none` altrimenti).
  - `teaser` = riga narrativa breve (statica per-sezione nel v1, scelta in base allo stato).
  - Funzione **pura**: riceve le liste già fetchate, nessuna chiamata di rete. Testabile.

### Migrazione DB
- `alter table profiles add column last_seen timestamptz;`
- Lettura presenza partner: profilo con stesso `couple_id` e `id != me.id` (verificare in `store.js` la funzione esistente per leggere i profili della coppia; se assente, aggiungerne una `listProfiliCoppia(client, couple_id)`).

## Data flow

`renderHome({client, me})`:
1. Fetch in parallelo delle liste (store.js) + profili coppia.
2. `riepilogoSezioni(...)` → alimenta: slot del dock (`count` + LED `novita`), hero-meta della porta in evidenza, log notifiche dell'HUD.
3. `calcolaCalore(eventiCalore(...))` → gauge HUD + statusbar camera + pop-up (già implementato).
4. Presenza: legge `last_seen` del partner → `isOnline` + `tempoRelativo` → LED chip coppia (HUD e camera) + `.statusbar` ("online · 2′ fa"). Avvia `avviaHeartbeat` una volta.
5. **Best-effort:** se una fonte fallisce, log in console e quella parte si degrada (es. presenza nascosta), ma la stanza resta viva. Il calore e la presenza sono "di più", non devono bloccare la home.

## Navigazione (dettaglio Modello A)

- **HUD:** tap porta / "entra nella stanza" → apre la porta + dolly → mostra `#camera`. Hero iniziale = prima porta (fantasie).
- **Camera-hub:** tap su uno `.slot` del dock → cambia la porta "in evidenza" (hero) con effetto swap+braci; tap sull'hero o sulla CTA "entra nel varco" → `dispatch('goto', sezione)` → `enterSection` (pager). ↩ "home" → torna all'HUD.
- **Sezione (pager):** swipe + barra `#nav` per muoversi fra le 6 sezioni reali (comportamento attuale). `⌂` → `dispatch('gohub')` → riapre `#camera`, nasconde `#app`.
- **7ª porta "traguardi":** slot nel dock; al tap apre una stanzetta/sheet "in arrivo" (nessun pager). Non entra nel `goto`/pager.

## Sequenza di build (incrementale, ogni step verificabile)

1. **presence.js** (helper puri) + **migrazione** `profiles.last_seen` + test (`isOnline`, `tempoRelativo`).
2. **riepilogoSezioni** in logic.js + test (count/novita/teaser dalle liste).
3. **Port HTML/CSS** dei 2 stati (statico, senza dati) — parità visiva con la DEFINITIVA; rimozione stili home vecchia.
4. **Cablaggio dati** in renderHome (calore, conteggi, novità, notifiche, presenza + heartbeat).
5. **Cablaggio navigazione** (dock→hero→`goto`/enterSection; `⌂`/`gohub`; ↩; HUD→camera).
6. **7ª porta "presto"** (stanzetta/sheet placeholder).
7. **Bump SW** (`brace-v26`→`v27`) + pulizia finale home vecchia (markup/CSS/`assets/camera.jpg` se non più usato).
8. **Verifica su device** (auth Supabase richiesta).

## Testing

- **Logica pura** con `node --test`: `presence` (isOnline, tempoRelativo), `riepilogoSezioni`, calore (già coperto). Mantenere la suite verde (oggi 211).
- **UI/transizioni/presenza dal vivo:** verifica manuale sul device (richiede login Supabase, l'agente non può).
- Le scelte di gesto/feel (già decise sul mockup) non si re-esplorano.

## Fuori scope (v1)

- Traguardi reali (solo placeholder).
- Presenza realtime (solo heartbeat).
- Promptbar `+fantasia` e log notifiche **cliccabili oltre il routing base**: il log porta alla sezione, ma niente quick-add inline nel v1 (la promptbar è decorativa/placeholder finché non si decide il quick-add).
- Ridisegno delle sezioni interne: restano com'è.

## Rischi / note

- **Reconcile pager:** `enterSection` oggi è chiamato anche dall'evento `goto` della Galleria — mantenere compatibilità. Aggiungere `gohub` senza rompere `goto`.
- **last_seen schema:** confermare in implementazione la presenza/lettura dei profili coppia in `store.js`.
- **Heartbeat e batteria:** intervallo ~30s solo in foreground; stop in background. Trascurabile.
- **Cache SW:** è network-first; il bump versione serve solo a forzare la pulizia delle vecchie cache.
