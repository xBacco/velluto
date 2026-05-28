# Strip Poker — Apertura Cabaret / Design Spec

**Data:** 2026-05-28
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** redesign della **schermata di apertura** del gioco Strip Poker (Fase 4c)
**Si appoggia a:** `2026-05-26-nostro-spazio-fase4-giochi-design.md` (§3.4 Strip Poker), `2026-05-26-nostro-spazio-v2-design.md` (architettura, palette).
**Cambia:** solo la **schermata di apertura** del gioco e i 3 overlay accessori (STORIA, REGOLE, OPZIONI). Il **tavolo**, la **logica delle mani**, lo **spogliarello avatar** e la **persistenza storico** restano invariati.

---

## 1. Scopo

L'apertura attuale (`drawApertura()` in `js/modules/strip.js` linee 249–270) è funzionale ma "neutra": titolo `♠️ Strip Poker`, sottotitolo, score `🐻 Tu 3 — 1 Lei 🧁`, 2 card-modalità testuali. Niente personalità.

Il redesign trasforma l'apertura in una **mini insegna di cabaret** (mondo "Moulin Rouge / Velluto Bordeaux") coerente col resto dell'app e con un'**anima propria** per il gioco. Mockup di riferimento in `.superpowers/brainstorm/43982-1779972908/content/`:

- `15d-bottom-v2-3.html` (variante B3 = scelta finale)
- `opzioni-bacheca-v3.html` (overlay OPZIONI = scelta finale)
- `regole-r3-anim-3.html` (overlay REGOLE + anim. fisarmonica = scelta finale)
- `storia-3.html` (overlay STORIA = scelta finale)

---

## 2. Decisioni chiave

| Sezione | Variante | Sintesi |
|---|---|---|
| Top | **15D · Marquee Neon** | Insegna stile Broadway, cornice oro, 12 bulbi (6 sopra+6 sotto) blink sfasati, titolo "STRIP POKER" in Bebas neon rosa-rosso con flicker 4s, sub-titoli `★ TONIGHT ★` e `— LIVE ON STAGE —` in oro 7px lettering 0.5em. |
| Score | **A2** | Label `— TICKETS SOLD —` tra due trattini lineari sfumati oro→trasparente, valore `🐻 003 · 001 🧁` in Bebas ambra 28px, padding ariosi (26px sopra, 24px sotto). **Niente moltiplicatori ×4.** |
| Modalità | **A · Biglietti strappabili** | 2 biglietti orizzontali (avorio sfumato) con stub colorato (rosa→bordeaux) a sinistra: "ADMIT / I / ONE" e "ADMIT / II / ONE", perforazione dashed avorio, titolo Bebas + sub-title Cormorant corsivo color vino, freccia ▶ a destra con bordo dotted. |
| Backstage | **B3 · Trio** | Sotto i biglietti, label `— BACKSTAGE —` tra trattini, 3 pill quadrate con bordo dotted oro: `📖 STORIA` · `🃏 REGOLE` · `⚙ OPZIONI`. |

**Vincolo prodotto trasversale (memoria `due-persone`):** l'app è solo per Tomas (🐻) e morosa (🧁). Niente flussi multi-partner, niente "Cambia partner". Le 4 voci OPZIONI sono solo: Suoni, Vibrazione, Privacy blur, Reset storico.

---

## 3. Schermata di apertura

### 3.1 Struttura DOM

`drawApertura()` produce, dentro `host` (il pannello del gioco), questa gerarchia:

```
.strip-root.cabaret
├── .marquee
│   ├── .bulb-row.top  (6 .bulb)
│   ├── .bulb-row.bot  (6 .bulb, delay sfasati)
│   ├── .micro "★ TONIGHT ★"
│   ├── .neon-h "STRIP"           (con .flicker)
│   ├── .neon-h "POKER"
│   └── .micro "— LIVE ON STAGE —"
├── .score
│   ├── .score-label  (.ln-l + .lb "TICKETS SOLD" + .ln-r)
│   └── .score-val  "🐻 003 · 001 🧁"
├── .tickets
│   ├── .ticket[role=button data-mode=holdem]
│   │   ├── .ticket-stub "ADMIT / I / ONE"
│   │   ├── .ticket-body (.t "HOLD'EM" + .s "LA DANZA LUNGA")
│   │   └── .ticket-arrow "▶"
│   └── .ticket[role=button data-mode=draw]   ("II", "DRAW", "IL CAN-CAN")
└── .backstage
    ├── .bs-label  (.ln + "— BACKSTAGE —" + .ln)
    └── .bs-pills
        ├── .bs-pill[data-pill=storia]   📖 STORIA
        ├── .bs-pill[data-pill=regole]   🃏 REGOLE
        └── .bs-pill[data-pill=opzioni]  ⚙ OPZIONI
```

### 3.2 Comportamento

- **Marquee**: puramente decorativo. Tap → niente.
- **Biglietti**: tap (click + touchend con `preventDefault`) → `chooseMode('holdem' | 'draw')` esattamente come oggi.
- **Score**: numeri da `testaATesta(partite, ctx.me.id, partnerId())` formattati con `padStart(3, '0')` (es. `003`).
- **Pill backstage**:
  - `📖 STORIA` → `openStoria()` — overlay "Cronaca della Notte" (§4).
  - `🃏 REGOLE` → `openRegole()` — overlay "Depliant a 3 ante" con animazione fisarmonica (§5).
  - `⚙ OPZIONI` → `openOpzioni()` — overlay "Bacheca Velluto" (§6).
- Gli overlay sono nodi `.dadi-scrim.strip-ov` appesi a `document.body` (stesso pattern di `openOv()/closeOv()` esistente, lock scroll già in `ui.js`).

### 3.3 Sottotitoli biglietti

Hold'em → `LA DANZA LUNGA` (lunga = preflop, flop, turn, river).
Draw → `IL CAN-CAN` (uno scambio veloce, mano corta).

---

## 4. Overlay STORIA — "Cronaca della Notte"

Stile riferimento: `storia-3.html`.

- Header: `📖 CRONACA DELLA NOTTE` Bebas oro + sottotitolo Cormorant corsivo `tutte le serate, tutti gli atti`.
- Lista di **serate** (raggruppamento delle `strip_partite` per giorno):
  - Header serata: `— SERATA N° VII —` (numero romano, dal conteggio incrementale per couple).
  - Sotto, una **frase corsiva poetica** per ogni partita di quella serata, generata da template:
    - Vittoria Lui: `🐻 Lui ha tenuto l'ultimo velo, vincitore del {mode}.`
    - Vittoria Lei: `🧁 Lei è rimasta vestita di sola luce; ha vinto al {mode}.`
    - Mode label: `HOLD'EM` → `holdem` , `DRAW` → `draw` (mantieni il valore DB).
  - Frase preceduta da `· ` (separatore puntato), tipografia Cormorant 13px italic color avorio.
- Se nessuna partita: messaggio centrale corsivo `"La prima serata non è ancora cominciata."`
- Bottone bottom `← Torna al palco` chiude l'overlay.

**Dati**: usa `partite` (già in memoria, caricate da `renderStrip`). Group by `created_at` → `toLocaleDateString('it-IT')`. Serata N° = indice ordinato per data crescente.

---

## 5. Overlay REGOLE — "Libretto del Croupier · R3 Depliant"

Stile riferimento: `regole-r3-anim-3.html` (anim **A · Fisarmonica**).

### 5.1 Depliant

3 **ante** orizzontali (full-width nel pannello), gradiente progressivo chiaro→scuro:
- Anta I: avorio chiaro (`#fbe9cf` → `#e8cfa4`)
- Anta II: bordeaux opaco (`#7a1c30` → `#5a1224`)
- Anta III: bordeaux scuro (`#3a0c1c` → `#1a0508`)

Ciascuna anta contiene:
- Numero romano gigante in filigrana (`I`, `II`, `III`) Bebas 120px opacità .12, color contrasto.
- `✦·✦` separatore decorativo oro tra titolo e descrizione.
- Titolo Bebas 18px center.
- Descrizione Cormorant 12px italic center, max-width 220px.
- Pieghe orizzontali tra ante: ombre lineari `0 1px 0 rgba(0,0,0,.4)` + `0 -1px 0 rgba(255,217,170,.15)`.

Contenuti:
- **I · COME SI GIOCA**: "Hold'em: due carte coperte a testa, cinque sul tavolo. Draw: cinque a testa, un solo scambio."
- **II · CHI PERDE LA MANO**: "Mano più bassa, perde un capo. Parità: nessuno si spoglia, le carte restano in vista."
- **III · CHI VINCE LA NOTTE**: "Chi resta senza più nulla da togliere ha perso la notte. L'altro si gode il trofeo. ♥"

Sotto la terza anta, firma in piccolo Cormorant italic: `— Il Croupier, 1899 —`.

### 5.2 Animazione (variante A · Fisarmonica)

All'apertura dell'overlay:
- Le 3 ante partono **chiuse** (`transform: scaleY(0)`, `transform-origin: top`).
- Si aprono in sequenza dall'alto verso il basso (anta I, poi II, poi III) con **stagger ~0.7s** e durata `.7s` cubic-bezier `(.4, 1.4, .5, 1)`.
- Pieghe ombreggiate visibili durante l'animazione (le ombre tra ante si materializzano col contenuto).
- Durata totale ~2.4s; quando finita, libera lo scroll dell'overlay.
- `prefers-reduced-motion: reduce` → ante visibili immediatamente, niente animazione.

### 5.3 Chiusura

Tap su backdrop o `← Torna al palco`.

---

## 6. Overlay OPZIONI — "Camerino Cabaret · Bacheca Velluto v3"

Stile riferimento: `opzioni-bacheca-v3.html`.

### 6.1 Sfondo

**Drappo di velluto bordeaux** con pieghe verticali (15-stop `linear-gradient(90deg, …)` da `#1a0508` ai picchi `#7a2138`) + pelo fine (`repeating-linear-gradient(180deg, transparent 1.5px, rgba(255,200,180,.02) 2px)`) + bagliore luce di scena in alto (`radial-gradient(ellipse 60% 30% at 50% 8%, rgba(255,180,150,.18), transparent 70%)`). Bordo top oro `#c9a35f` 2px, radius 6px 6px 0 0.

### 6.2 Header

Etichetta avorio `✦ CAMERINO · CABARET ✦` rotata `-1.5deg`, due washi tape rosa ai lati (`-22deg` sx, `20deg` dx, texture a strisce sottili).

### 6.3 Griglia 2×2 di polaroid

4 polaroid **quadrate uniformi**, ognuna ruotata di 1–2° in direzione diversa:

| Pos | Voce | Default | Tipo | Stato visivo |
|---|---|---|---|---|
| (1,1) | 🔊 SUONI | ON | toggle | spillino rosa-bordeaux + bottom `ON` color `#7a1c30` |
| (1,2) | 📳 VIBRAZIONE | ON | toggle | spillino rosa-bordeaux + bottom `ON` |
| (2,1) | 🌫️ PRIVACY | OFF | toggle | spillino grigio-nero + bottom `OFF` color `#5a5a5a` |
| (2,2) | 🗑️ RESET | — | action danger | spillino oro luminoso + bottom `DEL` su badge bordeaux pieno |

Polaroid struttura:
- Sfondo `linear-gradient(180deg, #fbf2e2, #f0e2c8)`, padding `5 5 16` (bottom esteso = carta polaroid).
- Spillino in alto centrato: `circle 11×11` con shadow + inset (radial gradient stato-dipendente).
- Area "foto": bordeaux radiale (`#5a1528 → #2a0a14`, danger: `#7a1c30 → #1a0508`), flex:1, emoji 34px, graffio diagonale rgba(255,217,170,.18).
- Label Bebas 11px color `#3a1a0a` letter-spacing .22em.
- Stato Arial 6px bottom centrato.

### 6.4 Decorazioni velluto

- 1 **swatch oro** (`linear-gradient(45deg, #c9a35f, #ffd97a)`) a destra, ruotato `18deg`, con pattern a griglia sottile e spillino chiaro in alto.
- 1 **filo dorato curvo SVG** sotto le polaroid, opacità .55.
- Monogramma `M.` Cormorant italic 20px color `rgba(255,217,170,.22)` ruotato `-8deg` in basso a sinistra.

### 6.5 Persistenza

`localStorage` con namespace `strip-poker`:
- `strip-poker:suoni` → `'on' | 'off'` (default `on`)
- `strip-poker:vibra` → `'on' | 'off'` (default `on`)
- `strip-poker:privacy-blur` → `'on' | 'off'` (default `off`)

Reset: chiede conferma in-line (cambia il testo della polaroid in `SICURO?` con due mini-bottoni "sì/no"), poi `await deleteAllStripPartiteForCouple(client, couple_id)` (nuova funzione store), poi ricarica le `partite` e ridisegna l'apertura. Mostra `toast('Cronaca azzerata.', 'ok')`.

**Privacy blur** & **Vibrazione** & **Suoni**: le flag sono salvate ma il **comportamento applicato** (es. CSS filter sul body al `visibilitychange`, `navigator.vibrate()` su strip events, mute audio) è **out of scope per questo spec** — verrà cablato in una iterazione successiva. La spec serve a stabilire il contratto delle flag.

### 6.6 Chiusura

Tap sul backdrop o `← Torna al palco`.

---

## 7. Palette & tipografia (riferimento)

Aggiunte specifiche cabaret (oltre alle CSS vars esistenti `--cream`, `--gold-soft`, `--wine` ecc.):

```css
.strip-root.cabaret {
  --bordeaux-deep: #0a0205;
  --bordeaux: #1a0509;
  --bordeaux-warm: #2a0a18;
  --neon-pink: #ff5577;
  --neon-pink-dim: #b83c5a;
  --gold-mute: #c9a35f;
  --gold-bright: #ffd97a;
  --cream-paper: #fbe9cf;
}
```

Font (già caricati a livello app):
- `'Bebas Neue', Impact` → titoli marquee, label biglietti, label polaroid.
- `'Cormorant Garamond', Georgia` → corsivi (sub biglietti, frasi cronaca, firma libretto).
- `Arial, sans-serif` → micro-label letter-spacing .35em+.

---

## 8. Tavolo, mani, spogliarello, storico

**Invariati.** `drawTavolo()`, `dealHold()`, `dealDraw()`, `doStrip()`, `gameOver()`, salvataggio `strip_partite` — tutto come oggi. Il bottone "Cambia modalità" del tavolo continua a tornare a `drawApertura()`, che ora apre la versione cabaret.

---

## 9. Cleanup correlato (in questo stesso commit)

Diagnostica temporanea Fase 4c (commenti `// Diagnostica temporanea Bug 1: …` o equivalenti):

1. `js/modules/strip.js` — rimuovere:
   - funzione `diagStep()` (linee 273–287) e commento sopra.
   - tutte le chiamate `diagStep(...)` (linee 223, 228, 259, 269, 290, 293, 295, 296, 343, 345, 347, 362, 381–382).
   - `try/catch` attorno a `drawSetup()` dentro `chooseMode` (linee 289–298) → semplificare in `chooseMode(m) { mode = m; drawSetup(); }`.
   - blocco "ripulisco overlay residui" (linee 225–230): **mantenere** la pulizia overlay residui ma senza diagStep.
2. `js/app.js` — rimuovere l'IIFE `installErrorReporter` (linee 209–232) e il commento sopra.
3. `js/modules/galleria.js` — rimuovere:
   - `console.log('[galleria] foto trovate:', …)` linea 20 e commento linea 19.
   - commento "empty state informativo per il debug smoke" linee 49–50.
   - blocco breakdown per contesto (linee 60–67) e relativo commento.
   - **mantenere** il messaggio empty state user-friendly e il bottone "Ricarica galleria", semplificati al wording finale (non più diagnostico).

---

## 10. File toccati

- `js/modules/strip.js` — riscrittura `drawApertura()`, +3 funzioni `openStoria/openRegole/openOpzioni`, +helper `partiteRaggruppate()`, cleanup diagnostica, `chooseMode` semplificato.
- `js/store.js` — nuova `deleteAllStripPartiteForCouple(client, couple_id)`.
- `styles.css` — nuova sezione `STRIP POKER · APERTURA CABARET (v2)` con classi `.strip-root.cabaret .marquee/.bulb/.neon-h/.score/.ticket/.backstage/.bs-pill` e relative classi overlay `.strip-ov.storia`, `.strip-ov.regole`, `.strip-ov.opzioni`. Classi del tavolo invariate.
- `js/app.js` — rimozione `installErrorReporter`.
- `js/modules/galleria.js` — cleanup diagnostica.

Nessuna modifica al modello dati né a `lib/logic.js`.

---

## 11. Verifica

- Apertura mostra marquee con bulbi che blink (non in `prefers-reduced-motion`).
- Tap su biglietto Hold'em → entra in `drawSetup` → guardaroba → tavolo Hold'em.
- Tap su biglietto Draw → idem ma Draw.
- Tap su 📖 → overlay STORIA con cronaca raggruppata per serate.
- Tap su 🃏 → overlay REGOLE con 3 ante che si aprono a fisarmonica in sequenza ~2.4s totali.
- Tap su ⚙ → overlay OPZIONI bacheca velluto, toggle persistono in localStorage tra reload, RESET azzera `strip_partite` per il `couple_id` e riapre apertura con score `🐻 000 · 000 🧁`.
- Score `🐻 003 · 001 🧁` formattato con padStart(3,'0').
- Nessun banner verde diagnostico (`#strip-diag`) né bordeaux errbox in pagina.
- Galleria: empty state mostra solo il messaggio finale + bottone Ricarica, niente `console.log`.

---

## 12. Origine delle scelte (brainstorm 2026-05-28)

Iterazioni in `.superpowers/brainstorm/43982-1779972908/content/`:

- Apertura: `15d-*`, scelta `15d-bottom-v2-3.html` variante B3 (Backstage Trio).
- STORIA: `storia-*`, scelta `storia-3.html` "Cronaca della Notte".
- REGOLE: `regole-libretto-v*`, `regole-r3-anim-3.html`, scelta R3 Depliant + animazione A (Fisarmonica).
- OPZIONI: 6 direzioni in `opzioni-3.html` + `opzioni-3-v2.html`; convergenza su Bacheca; poi 2 refinements in `opzioni-bacheca-v2.html` (sughero) e `opzioni-bacheca-v3.html` (velluto, 4 voci, no partner). Scelta finale: **v3**.
