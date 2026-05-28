# Economia giochi & ruota a 13 spicchi — design

**Data:** 2026-05-28
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** ridisegno della ruota (13 spicchi, set nuovo, due rari) + economia slot indipendente + split nav giochi.
**Si appoggia a:** `2026-05-27-economia-giri-ruota-premi-design.md` (questo doc lo estende — economia parallela per la slot + 13 spicchi al posto degli 8 originali).
**Stato:** approvato (brainstorming chiuso 2026-05-28 con 4 mockup interattivi), pronto per piano di implementazione.

---

## 1. Scopo

Tre cambiamenti coordinati:

1. **Ruota: 13 spicchi al posto di 7.** 11 normali (30°) + 2 rari (15°). Nuovi spicchi: 🧣 bendare, 🪄 doppio (flag ×2), 📸 polaroid (foto osè 24h), 💎 jackpot (uno a testa). Rimossi: 🎲 dadi, 🎁 buono generico, 🎰 slot (la slot non è più agganciata alla ruota).
2. **Economia slot indipendente.** La slot diventa rationata (5 tiri/sett, cap 10, costo 1/tiro) ma resta scollegata dalla ruota — non c'è più un bonus +3 tiri da spicchio. Vive come gioco a tempo a sé.
3. **Nav giochi in due gruppi.** "A tempo" (Ruota + Slot) e "Liberi" (Yahtzutra + Strip), come due dock separati con etichetta.

Il filo conduttore: marcare scarsità (premio prezioso) vs disponibilità libera. La ruota guadagna profondità con due rari che cambiano la meccanica (flag ×2 e doppio premio), mantenendo l'ergonomia di un singolo spin.

---

## 2. Decisioni chiuse in brainstorming (2026-05-28)

**Sul set spicchi:**
- 13 spicchi, ordine sulla ruota dal puntatore in senso orario:
  `💋 segreto · 🔥 piccante · 💌 desiderio · 🧣 bendare · 🃏 wild · 💆 massaggio · 🪄 doppio · 📸 polaroid · 🎟️ lampo · 👅 orale · 🔁 ancora · ⭐ jolly · 💎 jackpot`
- Pesi: 11 normali `1` (30°), 2 rari `0.5` (15°). `sumW = 12`, `degPerUnit = 30`.
- Emoji 🪄 al posto di ✖️: la X Unicode rende come X blu su Windows, fuori palette. 🪄 è on-brand con oro/wine.
- Testi fissi: 🧣 "Lasciati bendare — l'altro/a decide quando finisce" (no minuti), 💆 "10 minuti", 🃏 "L'altro/a decide cosa farti per 24h", 👅 "Quando vuole chi ha vinto".

**Sulla semantica:**
- **🪄 doppio**: flag persistente sulla coppia (`couples.ruota_flag_doppio`). Setta `true` al reveal; al prossimo spin "vero" raddoppia l'effetto e si consuma. NON si consuma se l'esito è `ancora` (è solo +1 giro, non un premio).
- **💎 jackpot**: doppio spin automatico nello stesso flow. Reveal "Jackpot uno a testa" → sub-spin chi tira (Tomas) → reveal premio 1 → sub-spin partner (morosa) → reveal premio 2. 💎 esclusa nei sub-spin (peso 0). Se flag ×2 era attivo prima del jackpot, si applica a ENTRAMBI i premi e si consuma dopo il secondo reveal.
- **📸 polaroid**: crea record `buoni` con `scadenza_iso = now() + 24h`, testo fisso "Inviane una al partner entro 24 ore". Riusa schema `buoni` (no nuova tabella, no dipendenza dal sistema polaroid in design separato).

**Sull'economia slot:**
- 5 tiri/settimana gratis, cap 10, costo 1 tiro. Tabella `slot_movimenti` simmetrica a `giri_movimenti`. Motivi: `'settimanale'`, `'tiro'` (NO più `'ruota'` o `'bonus'`).
- All'ingresso modulo slot, accredito i 5 settimanali se `slotEleggibile(...).ok`.
- `Tira` disabilitato se saldo == 0 (mostra countdown invece del testo).

**Sullo stile visivo (ruota):**
- **Mockup G-onbrand confermato come finale**: palette ufficiale `styles.css` (wine `#5c1026/#7a1533`, gold `#d4a86c/#e9c98f`, cream `#f3d9b0`, rose `#c2557a`).
- Anello esterno dorato 7px + outer shadow + inner shadow.
- Dividers oro `rgba(233,201,143,.7)` larghi 0.6° su 13 boundary (12 cumulative + 1 wraparound 359.7→360 per chiudere tra 💎 e 💋).
- Hub centrale: **solo emoji 💋 grande**, niente cerchio dorato dietro. `display:grid; place-items:center; line-height:1; text-shadow` per leggibilità sulla ruota wine. Centratura millimetrica via grid (no flex baseline drift).
- Spotlight conico (`.winhi`) variabile: 30° per normali, 15° per rari, calcolato a runtime da `peso × degPerUnit`.

**Sull'indicatore ✖️ flag attivo:**
- **Variante A scelta**: badge dorato pulsante "PROSSIMO ×2" attaccato sopra il bottone GIRA, animazione `pulse 1.4s ease-in-out infinite`. Vicino al CTA, impossibile da mancare.

**Sul reveal ×2 applicato:**
- `.prize.boosted`: border `rgba(233,201,143,.7)` + glow esterno oro + banner "DOPPIO! ×2" inclinato -3° attaccato in cima alla card + chip ×2 dorato accanto all'emoji.
- Per premi con quantità (10→20 min massaggio, 1→2 buoni lampo, 1→2 buoni polaroid, 24h→48h wild): il numero stesso cambia.
- Per premi fluidi (orale, bendare): il testo si modifica esplicitando "due volte" / il doppio.

**Sul nav giochi:**
- Variante A (due dock separati con label `GIOCHI A TEMPO` / `GIOCHI LIBERI`).
- Ordine: "A tempo" = 🎡 Ruota → 🎰 Slot. "Liberi" = 🎲 Yahtzutra → ♠️ Strip.

---

## 3. Architettura

### 3.1 Nav giochi (Variante A)

```
┌─────────────────────────────────────────┐
│  GIOCHI A TEMPO                         │
│  [ 🎡 Ruota ]  [ 🎰 Slot ]              │  ← .gioco-selettore[data-gruppo=tempo]
│                                         │
│  GIOCHI LIBERI                          │
│  [ 🎲 Yahtzutra ]  [ ♠️ Strip ]         │  ← .gioco-selettore[data-gruppo=liberi]
└─────────────────────────────────────────┘
```

Due `.gioco-selettore` consecutivi, ciascuno preceduto da `<p class="gruppo-lab">…</p>`. Stessa logica di tab attivo di oggi, scoped al gruppo. Tab "liberi" aprono `game-modal`; tab "a tempo" si montano inline come oggi.

### 3.2 Ruota — geometria 13 spicchi

```
slice_i = pesi[i] * 30°       // 30° normale, 15° raro
gradient starts at: from -15deg  // centra slice 0 sotto il puntatore
```

Boundaries cumulative (in coordinate `from -15deg`, espliciti per evitare `calc()` — memory `feedback-css-calc-conic-gradient`):

```
30, 60, 90, 120, 150, 180, 195, 225, 255, 285, 315, 345, [chiusura 360]
```

Dividers oro a queste posizioni + wraparound a 359.7→360 per il confine tra 💎 e 💋 (l'inizio del gradient).

| # | emoji | key | label | peso | gradi | tipo | differito | risoluzione |
|---|-------|-----|-------|------|-------|------|-----------|-------------|
| 0 | 💋 | `segreto`   | Apri un segreto    | 1   | 30° | norm  | no | apri busta segreto attiva |
| 1 | 🔥 | `piccante`  | Proposta piccante  | 1   | 30° | norm  | no | pesca da `ruota_contenuti` cat=`piccante` |
| 2 | 💌 | `desiderio` | Pesca una fantasia | 1   | 30° | norm  | sì | pesca dalla bacheca fantasie |
| 3 | 🧣 | `bendare`   | Bendare            | 1   | 30° | norm  | no | testo fisso |
| 4 | 🃏 | `wild`      | Carta wild         | 1   | 30° | norm  | no | testo fisso |
| 5 | 💆 | `massaggio` | Massaggio          | 1   | 30° | norm  | no | testo fisso |
| 6 | 🪄 | `doppio`    | Prossimo ×2        | 0.5 | 15° | **rare**  | no | setta `couples.ruota_flag_doppio = true` |
| 7 | 📸 | `polaroid`  | Foto osè 24h       | 1   | 30° | norm  | sì | crea `buoni` con `scadenza_iso=+24h`, testo fisso |
| 8 | 🎟️ | `lampo`     | Buono lampo        | 1   | 30° | norm  | sì | crea `buoni` con `scadenza_iso=+24h`, testo da `ruota_contenuti` cat=`buono` |
| 9 | 👅 | `orale`     | Servizio orale     | 1   | 30° | norm  | no | testo fisso |
| 10 | 🔁 | `ancora`   | Gira ancora        | 1   | 30° | norm  | no | accredita +1 giro ruota (motivo `'ancora'`) |
| 11 | ⭐ | `jolly`    | Jolly: scegli tu   | 1   | 30° | norm  | no | apre selettore spicchi |
| 12 | 💎 | `jackpot`  | Jackpot            | 0.5 | 15° | **ultra** | no | innesca doppio sub-spin nello stesso flow |

**Spicchi condizionali** (peso 0 quando manca la condizione, come `fetteRuota` esistente):
- 💋 `segreto` → almeno una busta `tipo='segreto'` attiva ricevuta
- 🔥 `piccante` → almeno un contenuto in `ruota_contenuti` cat=`piccante`
- 💌 `desiderio` → almeno una fantasia attiva nella bacheca
- 🎟️ `lampo` → almeno un contenuto in `ruota_contenuti` cat=`buono`

### 3.3 Semantica spicchi rari

#### 🪄 doppio — flag persistente "prossimo ×2"

**Flusso:**
1. Estrai 🪄 → reveal "Prossimo premio ×2" → `setFlagDoppio(client, coupleId, true)`.
2. Spin successivo: leggo flag prima dell'animazione; se `true`, applico `applicaDoppio()` nel `risolvi()` e a fine reveal `setFlagDoppio(client, coupleId, false)`.
3. Eccezione `ancora`: se l'esito è `ancora`, NON consumo il flag (ancora è solo +1 giro).

**Regola `applicaDoppio(esito)`** — raddoppia ciò che è raddoppiabile:

| spicchio | normale | con ×2 |
|---|---|---|
| 💋 segreto    | apre 1 busta              | apre 2 buste consecutive (se ne hai 1, scala a 1) |
| 🔥 piccante   | pesca 1 proposta          | pesca 2 proposte distinte |
| 💌 desiderio  | pesca 1 fantasia          | pesca 2 fantasie distinte |
| 🧣 bendare    | "decide quando finisce"   | "il doppio del tempo che decide" (cosmetico) |
| 🃏 wild       | "24h"                     | "48h" |
| 💆 massaggio  | "10 minuti"               | "20 minuti" |
| 🎟️ lampo      | crea 1 buono              | crea 2 buoni distinti, ciascuno +24h |
| 📸 polaroid   | crea 1 buono polaroid     | crea 2 buoni polaroid, ciascuno +24h |
| 👅 orale      | "quando vuole"            | "due volte, una ora e una quando vuole" |
| 🔁 ancora     | +1 giro                   | **flag non consumato** |
| ⭐ jolly      | apri selettore            | il flag passa allo spicchio scelto |
| 🪄 doppio     | setta flag                | **idempotente** — il flag resta a `true` (no accumulo ×4) |
| 💎 jackpot    | doppio sub-spin           | flag applicato a ENTRAMBI i premi, poi consumato |

**Indicator UI (variante A):**
Quando `couples.ruota_flag_doppio = true`, sopra il bottone `.ruota-spin` appare una pillola dorata pulsante "PROSSIMO ×2" (animazione `pulse 1.4s ease-in-out infinite`, `box-shadow` morbido).

**Reveal ×2 applicato (`.prize.boosted`):**
- Border `rgba(233,201,143,.7)`, glow esterno oro
- Banner "DOPPIO! ×2" inclinato -3° in cima alla card
- Chip ×2 dorato accanto all'emoji
- Testo/numero modificato secondo la tabella sopra

**Schema persistenza:**
```sql
ALTER TABLE couples
  ADD COLUMN ruota_flag_doppio boolean NOT NULL DEFAULT false;
```
Una sola colonna. RLS già coperto dalle policy esistenti su `couples`.

#### 💎 jackpot — doppio spin automatico

**Flusso:**
1. Estrai 💎 → reveal "Jackpot: uno spicchio a testa" con CTA "Vediamo i premi" (border rose, glow ultra). Strip narrativa "Premio di Tomas" sopra la card.
2. Tap CTA → ruota gira di nuovo (peso 💎=0) → reveal premio 1 con strip avatar 🐻 "Premio di Tomas" → CTA "Avanti".
3. Tap "Avanti" → secondo sub-spin (peso 💎=0) → reveal premio 2 con strip avatar 🧁 "Premio di morosa" → CTA "Avanti".
4. Tap "Avanti" → summary card con i 2 premi affiancati (avatar 🐻 + premio Tomas, avatar 🧁 + premio morosa).

**Esclusioni nei sub-spin:**
- 💎 stessa: peso 0 (no nested jackpot).
- 🪄 doppio: peso normale 0.5. Se esce nel sub-spin 1, setta il flag che si applica al sub-spin 2 (regola: "il tuo doppio passa al regalo dell'altro/a").

**Interazione con flag ×2 pre-jackpot:**
Se `ruota_flag_doppio = true` quando esce 💎, il flag si applica a entrambi i sub-spin e si consuma dopo il secondo reveal.

**Identificazione "chi tira":**
- Primo sub-spin = `auth.uid()` (chi sta usando la ruota in quel momento).
- Secondo sub-spin = l'altro membro della coppia.
- Solo testo nel reveal (no autenticazione del secondo membro — onor system come tutto il resto dell'app).

**Persistenza:** entrambi i premi differiti vengono creati a nome di chi gli spetta (il `user_id` del record `buoni` rispecchia il destinatario).

### 3.4 Slot — flusso (invariato dallo spec originale, scollegato dalla ruota)

```
[topbar saldo]   🎰 5 tiri  ·  gratis tra 4 giorni
[picker rulli]   [Azione] [Corpo] [Luogo]
[cabinet]        ╔═══╦═══╦═══╗
                 ║ 🔥 ║ 💋 ║ 🏠 ║
                 ╚═══╩═══╩═══╝
[tasto Tira]     [ Tira ]                       ← disabilitato se saldo=0
```

- Topbar: saldo corrente + countdown "gratis tra Xg" (usa `slotEleggibile` con `ECONOMIA_SLOT`).
- `Tira` disabilitato se saldo == 0. Quando disabilitato mostra il countdown invece del testo "Tira".
- Ogni `roll()` chiama `spendiSlot(...)` prima di animare i rulli. Se la chiamata fallisce, nessuna animazione.
- All'ingresso del modulo, se `slotEleggibile(...).ok` accredito i 5 settimanali (motivo `'settimanale'`).

### 3.5 Schema DB

```sql
-- supabase/ruota.sql
ALTER TABLE couples
  ADD COLUMN ruota_flag_doppio boolean NOT NULL DEFAULT false;

-- supabase/slot.sql
CREATE TABLE slot_movimenti (
  id        bigserial PRIMARY KEY,
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delta     int  NOT NULL,
  motivo    text NOT NULL CHECK (motivo IN ('settimanale','tiro')),
  creato    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slot_movimenti_couple_user_creato
  ON slot_movimenti(couple_id, user_id, creato DESC);

ALTER TABLE slot_movimenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY slot_mov_select ON slot_movimenti FOR SELECT
  USING (couple_id IN (SELECT id FROM couples WHERE membro_a = auth.uid() OR membro_b = auth.uid()));
CREATE POLICY slot_mov_insert ON slot_movimenti FOR INSERT
  WITH CHECK (couple_id IN (SELECT id FROM couples WHERE membro_a = auth.uid() OR membro_b = auth.uid()));

-- Scadenza buoni (lampo + polaroid)
ALTER TABLE buoni ADD COLUMN scadenza_iso timestamptz;
```

### 3.6 Costanti (in `js/lib/logic.js`)

```js
export const ECONOMIA_SLOT = {
  COSTO_TIRO: 1,
  GRATIS_OGNI_GIORNI: 7,
  TIRI_SETTIMANALI: 5,
  CAP_SALDO: 10,
};

export const LAMPO_TTL_MS    = 24 * 60 * 60 * 1000;
export const POLAROID_TTL_MS = 24 * 60 * 60 * 1000;

export const FETTE = [
  { key:'segreto',   emoji:'💋', label:'Apri un segreto',    peso:1,   differito:false },
  { key:'piccante',  emoji:'🔥', label:'Proposta piccante',  peso:1,   differito:false },
  { key:'desiderio', emoji:'💌', label:'Pesca una fantasia', peso:1,   differito:true  },
  { key:'bendare',   emoji:'🧣', label:'Bendare',            peso:1,   differito:false },
  { key:'wild',      emoji:'🃏', label:'Carta wild',         peso:1,   differito:false },
  { key:'massaggio', emoji:'💆', label:'Massaggio',          peso:1,   differito:false },
  { key:'doppio',    emoji:'🪄', label:'Prossimo ×2',        peso:0.5, differito:false, rare:'rare'  },
  { key:'polaroid',  emoji:'📸', label:'Foto osè 24h',       peso:1,   differito:true  },
  { key:'lampo',     emoji:'🎟️', label:'Buono lampo',        peso:1,   differito:true  },
  { key:'orale',     emoji:'👅', label:'Servizio orale',     peso:1,   differito:false },
  { key:'ancora',    emoji:'🔁', label:'Gira ancora',        peso:1,   differito:false },
  { key:'jolly',     emoji:'⭐', label:'Jolly: scegli tu',   peso:1,   differito:false },
  { key:'jackpot',   emoji:'💎', label:'Jackpot',            peso:0.5, differito:false, rare:'ultra' },
];
```

---

## 4. File modificati / creati

### Creati
- `supabase/ruota.sql` — colonna `ruota_flag_doppio` su `couples`
- `supabase/slot.sql` — tabella `slot_movimenti` + RLS + `scadenza_iso` su `buoni`

### Modificati
- `js/lib/logic.js`
  - Aggiungi `ECONOMIA_SLOT`, `LAMPO_TTL_MS`, `POLAROID_TTL_MS`
  - Rimpiazza `FETTE` (13 entries, due con `peso:0.5` + `rare`)
  - Aggiorna `fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni })` per condizionali
  - Aggiungi `saldoSlot(movimenti, userId)`
  - Aggiungi `slotEleggibile(movimenti, userId, now)` (analogo a `giriEleggibile`)
  - Aggiungi `accreditoConCap(saldo, delta, cap)` (helper puro)
  - Aggiungi `applicaDoppio(esito)` — restituisce esito modificato secondo regola ×2

- `js/store.js`
  - `listSlotMov(client, coupleId)`
  - `accreditaSlot(client, { couple_id, user_id, motivo, delta })` (motivo `'settimanale'`)
  - `spendiSlot(client, { couple_id, user_id })` (delta=-1, motivo=`'tiro'`)
  - `addBuono(client, payload)` — accetta `scadenza_iso` opzionale
  - `setFlagDoppio(client, coupleId, value)` — `UPDATE couples`
  - `getFlagDoppio(client, coupleId)` — `SELECT`

- `js/modules/ruota.js`
  - Rimpiazza `SLICE = 360/7` con calcolo per-spicchio `peso × degPerUnit` (degPerUnit=30)
  - `costruisciRuota()`: 13 spicchi con angoli variabili, dividers a 13 boundary (12 cumulative + wraparound 359.7→360)
  - Spotlight `.winhi` variabile (width = sliceWidth dello spicchio scelto)
  - Indicator badge "PROSSIMO ×2" sopra `.ruota-spin` quando flag attivo
  - Reveal: `.prize.boosted` (banner DOPPIO!, ×2 chip) se flag era attivo
  - Logica spin: leggi flag prima, applica `applicaDoppio()`, consuma flag (eccetto `ancora`)
  - Caso `doppio`: `setFlagDoppio(true)`, reveal "Prossimo ×2"
  - Caso `jackpot`: doppio sub-spin sequenziale (peso 💎=0); reveal con strip "Premio di Tomas/morosa"; summary card finale; persiste entrambi
  - Caso `polaroid`: `addBuono` con `scadenza_iso = now() + POLAROID_TTL_MS`
  - Caso `lampo`: `addBuono` con `scadenza_iso = now() + LAMPO_TTL_MS` (testo da `ruota_contenuti` cat=`buono`)

- `js/modules/giochi.js`
  - `buildSelettore()` ritorna due dock con `.gruppo-lab` (variante A)
  - Slot: accredita 5 settimanali se eligible, topbar saldo + countdown, `spendiSlot` prima di animare

- `styles.css`
  - `.wheel` background uniforme + dividers oro a 13 boundary
  - `.hub` senza cerchio: `display:grid; place-items:center; font-size:38px (overview); line-height:1; text-shadow` per leggibilità su wine
  - Spotlight `.winhi` con `--slice-w` custom property settata via JS
  - `.gruppo-lab` (label sopra dock nav)
  - `.ruota-x2-badge` (pillola dorata sopra bottone GIRA, animazione `pulse 1.4s ease-in-out infinite`)
  - `.prize.boosted` (border oro acceso, glow, banner DOPPIO!, chip ×2)
  - `.prize.jackpot` (border rose, glow ultra, strip avatar partner)
  - `.prize .turn-strip` per strip narrativa partner nei sub-spin

- `sw.js` — bump cache version (v17 → v18)

### Test (Node test)
- `test/ruota.test.js`
  - `FETTE.length === 13`
  - Check chiavi nuove: `doppio`, `bendare`, `polaroid`, `jackpot`
  - `applicaDoppio` per ciascuno spicchio (massaggio 10→20, lampo 1→2 buoni, wild 24h→48h, ecc.)
  - `fetteRuota` condizionali con e senza `haSegreti`/`haProposte`/`haFantasie`/`haBuoni`
- `test/slot.test.js`
  - `saldoSlot`, `slotEleggibile`
  - `accreditoConCap` (cap rispettato, eccedenza scartata)
- `test/buoni.test.js`
  - `addBuono` con `scadenza_iso = +24h` per `lampo` e `polaroid`

### Mockup di riferimento (già in `mockups/`)
- `ruota-G-onbrand.html` — stile finale (palette ufficiale, 13 spicchi)
- `ruota-overview.html` — pagina manuale interattiva con legenda probabilità e "come funziona"
- `ruota-doppio-indicatore.html` — 4 varianti indicatore flag attivo (scelta variante A)
- `ruota-doppio-reveal.html` — popup `.prize.boosted` su 3 spicchi (massaggio, lampo, orale)
- `ruota-jackpot-flow.html` — sequenza interattiva 4 step con summary finale

---

## 5. Cosa NON cambia

- **Yahtzutra e Strip Poker:** nessuna modifica logica, UI o di stato. Cambia solo la posizione nel nav (gruppo "Liberi").
- **Economia giri ruota:** invariata (1 giro/sett gratis, 1 giro/spin, accreditata da `concediGiro` da Strip Poker).
- **Editor contenuti** (`Impostazioni → Contenuti giochi`): la lista buoni (cat=`buono`) resta unica e continua a essere usata dal 🎟️ lampo. Niente nuove sezioni nell'editor.
- **Schema `buoni`:** la nuova colonna `scadenza_iso` è nullable, i buoni esistenti restano "senza scadenza".

---

## 6. Open questions (non bloccanti)

- **Filtro buoni scaduti nella vista Buoni:** lo spec non lo specifica. Decisione di default: **sì, nasconderli automaticamente** dalla lista attiva (sono di fatto morti). Da confermare in fase plan.
- **Notifica scadenza imminente:** un buono lampo/polaroid che scade fra <2h potrebbe mostrare un badge/avviso. Non incluso in questo spec — vive in un eventuale lavoro futuro sui "buoni con TTL".
- **Tarature `peso`:** tutti gli spicchi normali sono peso `1`, i rari `0.5`. Si tarano dopo aver provato la ruota dal vivo (come stabilito nello spec ruota originale).
- **Idempotenza setFlagDoppio durante sub-spin:** se nel sub-spin 1 del jackpot esce 🪄, il flag si setta. Conferma in fase plan: il flag si consuma sul sub-spin 2 dello stesso jackpot oppure sul prossimo spin "fuori jackpot"? Default proposto: consumo sul sub-spin 2 (il "prossimo premio" è quello).
