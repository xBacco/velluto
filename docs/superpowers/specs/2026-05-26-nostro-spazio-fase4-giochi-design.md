# Il nostro spazio (Velluto) — Fase 4 "Giochi" / Design Spec

**Data:** 2026-05-26
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** design della Fase 4 (Giochi) della web app di coppia "Velluto"
**Si appoggia a:** `2026-05-26-nostro-spazio-v2-design.md` (architettura, modello dati, §4.5 Dadi/Ruota, §4.6 Truth or Dare).
**Stato baseline:** Fasi 1–3 complete (commit `4ce50c7`, `node --test` = 46 pass / 0 fail). Fase 4 non ancora implementata.

---

## 1. Scopo

Aggiungere il modulo **Giochi** con quattro giochi, tutti mobile-first, da usare in due
sullo stesso telefono, in tema "Velluto notturno":

1. **🎲 Dadi** — tiro libero, client-only (già specificato in v2 §4.5).
2. **🎡 Ruota** — un giro a settimana a testa, con cooldown (v2 §4.5).
3. **🃏 Truth or Dare** — mazzo di carte aggiunte dai due, con carta fisica animata.
4. **♠️ Strip Poker** — showdown di poker (due modalità), avatar che si spogliano, storico.

**Vincolo di design trasversale (deciso in brainstorming):** le meccaniche dei giochi
**non si ripetono**. In particolare la "scelta del capo da togliere" nello Strip Poker
**non** usa dadi/ruota/carte → si usa l'**avatar** (si tocca il capo sull'avatar).

---

## 2. Decisioni chiave Fase 4

- **Una sola tab "Giochi"** con un selettore interno tra i quattro giochi (no quattro tab
  separate nella navigazione principale: resta mobile-first a colonna singola).
- **Dadi**: nessuna persistenza (in memoria).
- **Ruota**: persistenza dei giri per il cooldown settimanale (tabella `ruota_giri`, già nel modello v2).
- **Truth or Dare**: mazzo persistente (tabella `carte`, già nel modello v2). La novità Fase 4 è
  l'**esperienza visiva della carta** (fronte, dorso, mescolata, reveal), non lo schema dati.
- **Strip Poker**:
  - Due modalità: **Draw poker** (5 carte + 1 scambio) e **Texas Hold'em** (2 carte coperte + 5 comuni), **senza puntate**.
  - In entrambe: **la mano più bassa perde** e chi perde si toglie **un** capo.
  - **Avatar** Lui (sinistra) / Lei (destra); chi perde tocca un capo sul proprio avatar per toglierlo.
  - **Guardaroba scelto a inizio partita** via checklist (lista §3.4.4).
  - **Stato partita in memoria**; si salva solo lo **storico** delle partite (tabella nuova `strip_partite`).
  - **All'apertura del gioco** si mostra il **testa-a-testa** tra i due (vittorie/sconfitte).

---

## 3. I quattro giochi

### 3.1 🎲 Dadi (invariato rispetto a v2 §4.5)
- Due dadi: **azione** + **zona del corpo**. Tiro libero, animazione client, **nessun salvataggio**.
- Contenuti hardcoded (liste in `logic.js`/modulo). Pulsante "Tira".

### 3.2 🎡 Ruota settimanale (invariato rispetto a v2 §4.5)
- 8 proposte piccanti. **Un giro a settimana per persona** (cooldown indipendente).
- Si registra `ruota_giri(couple_id, user_id, esito, creato)`. Disponibilità = `now − ultimo_giro ≥ 7 giorni`.
- In cooldown: conto alla rovescia al prossimo sblocco. Eleggibilità = **funzione pura testabile** (`now` iniettabile).

### 3.3 🃏 Truth or Dare — CHIUSO (esperienza carta)

Lo schema dati resta v2 §4.6: `carte(couple_id, autore_id, tipo['verita'|'sfida'], testo, intensita 1–3, creato)`.
Gestione mazzo (aggiungi/modifica/elimina) e pesca filtrabile per tipo/intensità invariate.
La Fase 4 definisce **l'aspetto e l'animazione** della carta:

- **Fronte — stile "Editoriale"**: etichetta-tab in alto (VERITÀ / SFIDA), **grande virgoletta oro**,
  testo **allineato a sinistra**, **fiamme di intensità** in basso a destra. Carta **larga** e
  testo **centrato verticalmente** così le frasi non vanno a capo parola-per-parola.
- **Dorso — "filetto oro"**: pelle **bordeaux**, **cuore debossato/pressato** al centro,
  **sottile linea oro continua** a cornice, **niente cuciture**.
- **Mescolata — "Cascata"**: riffle a due metà + arco a ponte. Avviabile sia col pulsante
  **"Mescola"** sia **toccando il mazzo**.
- **Ventaglio**: mostra tutte le carte, **tutte visibili e cliccabili**.
- **Reveal**: al giro della carta, il **deck va in z-index sopra lo scrim 3D** così la carta
  non resta velata (bug noto risolto nei mockup).
- **Mockup di riferimento** (effimeri, gitignored): fronte in `tod-cards-options.html` (opzione "Editoriale"),
  dorso in `tod-backs-v7.html` (opzione 20 "filetto oro"), mescolata+reveal in `tod-shuffle-v3.html`.
  In fase di build i tre pezzi vanno **uniti** (il mockup mescolata usa ancora il fronte serif vecchio).

### 3.4 ♠️ Strip Poker — DEFINITO

#### 3.4.1 Flusso partita
1. **Apertura gioco** → schermata con il **testa-a-testa** ("Tu N — M Lei") letto da `strip_partite`,
   scelta **modalità** (Draw / Texas Hold'em) e pulsante "Nuova partita".
2. **Setup guardaroba**: checklist (§3.4.4) per impostare cosa indossano Lui e Lei in questa partita.
3. **Mano** secondo la modalità scelta (§3.4.2 / §3.4.3) → showdown → **la mano più bassa perde**.
4. Il **perdente** tocca un capo sul **proprio avatar** per toglierlo.
5. Ripeti finché uno resta **nudo** → **pop-up vincitore/perdente** + "Nuova partita".
   La partita conclusa viene **salvata** in `strip_partite` e il testa-a-testa si aggiorna.

#### 3.4.2 Modalità Draw poker
- Mazzo francese 52 carte. **5 carte a testa**, viste in privato col **passa-il-telefono**
  (schermata "Copri" → "Mostra" → "Passa").
- Ogni giocatore può **scartare e ripescare fino a 3 carte** una volta.
- **Showdown**: ranking poker standard; **mano più bassa perde** un capo.

#### 3.4.3 Modalità Texas Hold'em
- **2 carte coperte (hole)** a testa, viste in privato col passa-il-telefono.
- **5 carte comuni** scoperte (flop 3 / turn 1 / river 1), rivelate progressivamente o in blocco.
- **Niente puntate.** Showdown: migliore mano da 5 su 7 (2 hole + 5 comuni);
  **mano più bassa perde** un capo.

#### 3.4.4 Guardaroba (lista canonica finale)
Uguale per Lui e Lei, **cambia solo l'ultimo strato**. Ordine dal più esterno al più intimo:

`cappello, occhiali, sciarpa, giacca, felpa, pantaloni, shorts,
scarpe (×2 — una alla volta), calzini (×2 — uno alla volta), mutande,
canottiera (Lui) / reggiseno (Lei)`

- **Scarpe e calzini** = **due capi separati per persona**, da togliere **una/uno alla volta**.
- **Tolti** rispetto al mockup: gonna, autoreggenti.
- ⚠️ Il mockup `strip-wardrobe-setup.html` contiene ancora la lista vecchia: la lista **canonica è questa**.

#### 3.4.5 Avatar
- **Lui a sinistra**, **Lei a destra** (Lei con seno e capelli lunghi; reggiseno come capo).
- Ogni capo indossato è un layer toccabile; toccarlo lo rimuove (solo al perdente, dopo lo showdown).
- Proporzioni/resa avatar (ora abbozzati nei mockup) **da rifinire in fase di build**.
- **Mockup di riferimento**: `strip-game-v3.html` (gara a due, avatar M/F, pop-up sconfitta).

---

## 4. Modello dati (delta Fase 4)

Riusa il modello v2. **Unica tabella nuova:**

```
strip_partite ( id, couple_id, vincitore_id, perdente_id, modalita['draw'|'holdem'], creato )
```

- **RLS** come le altre tabelle: operazioni consentite solo se `couple_id` appartiene a una
  coppia di cui `auth.uid()` è membro.
- **Dadi**: nessuna tabella. **Ruota**: `ruota_giri` (già v2). **ToD**: `carte` (già v2).
- Stato della partita Strip Poker (mano corrente, guardaroba residuo): **solo in memoria**, non persistito.

---

## 5. Logica pura (`js/lib/logic.js`) — funzioni nuove, testabili

Tutte pure (dati in → dati out), `now`/seed iniettabili dove serve:

- `ruotaEleggibile(giri, userId, now)` → `{ ok, prossimoSblocco }` (cooldown 7 giorni).
- `pescaCarta(carte, { tipo, intensita }, rnd)` → carta filtrata a caso (rnd iniettabile).
- **Poker** (cuore dello Strip Poker, molto testabile):
  - `mazzo52()` → array carte `{r, s}`.
  - `mescola(deck, rnd)` → deck mescolato (rnd iniettabile per test deterministici).
  - `valutaMano(carte5)` → `{ categoria, tieBreakers }` (coppia, doppia coppia, tris, scala, colore, full, poker, scala reale…).
  - `miglioreManoDa7(carte7)` → migliore `valutaMano` su tutte le combinazioni (per Hold'em).
  - `confronta(manoA, manoB)` → `>0 | 0 | <0` (per decidere chi ha la **mano più bassa**).
- **Strip state machine** (pura):
  - `capiIniziali(sesso)` → lista capi ordinata (§3.4.4).
  - `togliCapo(stato, persona, capoId)` → nuovo stato.
  - `eNudo(stato, persona)` → bool (tutti i capi tolti).
  - `risultatoPartita(stato)` → `{ vincitore, perdente } | null`.
- `testaATesta(partite, me, partner)` → `{ mie, sue }` (conteggio per la schermata d'apertura).

---

## 6. `js/store.js` — funzioni nuove (client iniettato, `check({data,error})`)

- `listRuotaGiri(client, coupleId)` / `addRuotaGiro(client, {couple_id, user_id, esito})`.
- ToD: `listCarte`, `addCarta`, `updateCarta`, `deleteCarta` (se non già presenti dalla v2).
- Strip: `listStripPartite(client, coupleId)` / `addStripPartita(client, {couple_id, vincitore_id, perdente_id, modalita})`.

Nessun fallimento silenzioso: errori → eccezione → toast nel modulo.

---

## 7. Moduli render (`js/modules/`)

Stessa firma degli altri moduli: `export async function renderX({ client, me, panel })`,
wiring `fab:<tab>` una sola volta, disegno via `mk/add/clear` (no `innerHTML`), errori via `toast`.

- `giochi.js` — contenitore della tab "Giochi": selettore tra i 4 giochi + monta Dadi e Ruota
  (semplici) inline; delega ToD e Strip ai sotto-moduli.
- `tod.js` — Truth or Dare: gestione mazzo + esperienza carta (fronte/dorso/mescolata/reveal/ventaglio).
- `strip.js` — Strip Poker: apertura+testa-a-testa, setup guardaroba, mano (draw/holdem), avatar, pop-up.

**Wiring in `app.js`**: aggiungere `import { renderGiochi }`, il ramo in `render()`
(`else if (cur === 'giochi') renderGiochi({ client, me, panel: $('p-giochi') })…`), il pannello
`#p-giochi` e la voce di navigazione. Il FAB resta gestito da `fab:giochi` (es. "aggiungi carta" in ToD).

---

## 8. UI / estetica

- Coerente "Velluto notturno": bordeaux `#5c1026`, fondi `#160409`/`#2a0813`, oro `#d4a86c`,
  crema `#f3d9b0`, serif elegante. Mobile-first, target tap ≥ 44px, niente hover-dipendenze.
- Carta ToD: animazioni CSS/transform 3D (riffle/ponte/flip), `prefers-reduced-motion` rispettato.
- Avatar Strip Poker: SVG/CSS leggeri, layer per capo, niente immagini esterne.

---

## 9. Testing

- **Unit (`node --test`)** sulle funzioni pure §5: in particolare **valutazione e confronto mani di poker**
  (casi: scala vs colore, full vs poker, parità con tie-break, mano più bassa), **eleggibilità ruota**
  (cooldown), **strip state machine** (togli capo → nudo → risultato), **testa-a-testa**.
  `store.js` con client Supabase **finto iniettato**.
- **Smoke Playwright** prima di "fatto": tab Giochi visibile e navigabile; Dadi tira;
  Ruota gira e **si blocca** se in cooldown; ToD aggiungi carta → mescola → pesca → reveal leggibile;
  Strip una partita completa in **entrambe** le modalità fino al pop-up, storico che **si aggiorna**;
  layout corretto a viewport mobile; persistenza dopo reload (carte, giri ruota, storico strip).

---

## 10. Ordine di build (sotto-fasi)

1. **4a — Dadi + Ruota**: modulo `giochi.js`, selettore, Dadi (in memoria), Ruota con cooldown
   (`ruota_giri` + RLS + `ruotaEleggibile`). Wiring tab in `app.js`.
2. **4b — Truth or Dare**: `tod.js`, gestione mazzo, esperienza carta (fronte Editoriale + dorso
   filetto-oro + Cascata + ventaglio + reveal), unendo i tre mockup.
3. **4c — Strip Poker**: logica poker pura (con test forti), `strip.js`, avatar + guardaroba,
   due modalità, `strip_partite` + storico testa-a-testa, pop-up vincitore.

Ogni sotto-fase è testabile e usabile da sola.

---

## 11. Domande risolte in questa spec

- **Showdown Strip Poker** → **due modalità**: Draw (5 carte + 1 scambio) e Texas Hold'em
  (2 hole + 5 comuni), niente puntate, mano più bassa perde; carte private via passa-il-telefono.
- **Persistenza Strip Poker** → salva **solo lo storico** (`strip_partite`); stato partita in memoria;
  **testa-a-testa mostrato all'apertura**.
- **Scelta del capo** → via **avatar** (no dadi/ruota/carte), coerente col vincolo "meccaniche non ripetute".

## 12. Fuori scope (YAGNI)

- Puntate/fiches nello Strip Poker.
- Ripresa di una partita interrotta (stato non persistito).
- Contenuti di Dadi/Ruota modificabili dall'app (restano hardcoded, come v2).
- Più di due giocatori / multi-dispositivo sincronizzato in tempo reale.
