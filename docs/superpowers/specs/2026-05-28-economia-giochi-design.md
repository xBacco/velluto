# Economia giochi & ridisegno ruota — design

**Data:** 2026-05-28
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** ridisegno trasversale del hub Giochi — economia slot, nuovo set di spicchi della ruota, split del nav in due gruppi.
**Si appoggia a:** `2026-05-27-economia-giri-ruota-premi-design.md` (questo doc lo estende: economia parallela per la slot + 10 spicchi al posto degli 8), `2026-05-26-nostro-spazio-fase4-giochi-design.md` (hub giochi).
**Stato:** approvato (brainstorming chiuso 2026-05-28), pronto per il piano di implementazione.

---

## 1. Scopo e idea

Tre cambiamenti coordinati:

1. **La slot non è più infinita.** Diventa un gioco "a tempo" come la ruota — 5 tiri/settimana gratis, cap 10, ricarica settimanale; un nuovo spicchio della ruota ne può accreditare 3 extra.
2. **La ruota cambia spicchi.** Si passa da 7 a 10 spicchi: lo spicchio simbolico 🎲 "tiro di dadi" diventa concreto (🎰 +3 tiri slot), si aggiungono 4 premi nuovi (🃏 wild, 💆 massaggio, 👅 orale, 🎟️ buono lampo), si toglie 🎁 buono (sostituito dal lampo a 24h).
3. **Il nav giochi si divide in due gruppi.** "A tempo" (Ruota + Slot) e "Liberi" (Yahtzutra + Strip), come due dock separati con etichetta — perché le meccaniche sono diverse: i primi due rationano i tiri, i secondi si entrano liberamente.

Il filo conduttore è marcare la differenza tra ciò che è scarso (e quindi prezioso) e ciò che è sempre disponibile. Oggi la slot è gratis e infinita: ogni tiro vale poco, e la coppia tende a non giocarla mai dopo i primi giorni. Rationarla la trasforma in un piccolo rituale settimanale.

---

## 2. Decisioni chiuse in brainstorming (tutte approvate 2026-05-28)

- **Economia slot:** valuta separata da quella della ruota. Tabella `slot_movimenti` simmetrica a `giri_movimenti`. Saldo per persona, intero ≥ 0.
- **Ricarica slot:** 5 tiri / 7 giorni (stesso meccanismo di `giriEleggibile`). Motivo `'settimanale'`, delta `+5`.
- **Costo per tiro slot:** 1 tiro (delta `-1`, motivo `'tiro'`).
- **Cap accumulo slot:** 10 tiri max. Vincite oltre il cap vengono scartate (delta accreditato = `min(delta, cap - saldo)`).
- **Bonus slot via ruota:** spicchio 🎰 dà +3 tiri (delta `+3`, motivo `'ruota'`).
- **10 spicchi sulla ruota** (al posto dei 7 attuali). Numero pari, geometria pulita 36°/spicchio.
- **Set finale spicchi** (ordine sulla ruota):
  💋 segreto · 🔥 piccante · 💌 desiderio · 🃏 wild · 💆 massaggio · 🎰 slot · 🎟️ lampo · 👅 orale · 🔁 ancora · ⭐ jolly
- **Spicchi nuovi rispetto al set vecchio:** 🃏 wild (testo fisso: "L'altra/o decide cosa farti fare nelle prossime 24h"), 💆 massaggio (testo fisso: "10 minuti di massaggio, dove preferisce chi ha vinto"), 👅 orale (testo fisso: "Servizio orale, quando vuole chi ha vinto"), 🎰 slot (+3 tiri), 🎟️ lampo (vedi sotto).
- **Spicchi tolti:** 🎲 "tiro di dadi" (sostituito da 🎰 slot, finalmente concreto), 🎁 "buono a sorpresa" (sostituito da 🎟️ "lampo" — buono con TTL).
- **🎟️ Buono lampo:** pesca dalla stessa `ruota_contenuti` categoria=`'buono'` (riusa lista esistente), ma crea il record `buoni` con `scadenza_iso = now() + 24h`. Niente nuova lista da configurare.
- **Nav giochi: Variante A** (due dock separati con etichetta sopra). Più verticale di oggi ma rende esplicita la separazione tra le due categorie.
- **Ordine all'interno dei gruppi:** "A tempo" = 🎡 Ruota → 🎰 Slot (ruota come anchor del gruppo). "Liberi" = 🎲 Yahtzutra → ♠️ Strip (yahtzutra come apertura serata).

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

Due `.gioco-selettore` consecutivi, ciascuno preceduto da `<p class="gruppo-lab">…</p>`. Il tab "attivo" si espande dentro il proprio dock (stesso comportamento di oggi, scoped al gruppo). Tab "liberi" aprono `game-modal` come oggi; tab "a tempo" montano il gioco inline come oggi.

### 3.2 Slot — nuovo flusso

```
[topbar saldo]   🎰 5 tiri  ·  gratis tra 4 giorni
[picker rulli]   [Azione] [Corpo] [Luogo]
[cabinet]        ╔═══╦═══╦═══╗
                 ║ 🔥 ║ 💋 ║ 🏠 ║
                 ╚═══╩═══╩═══╝
[tasto Tira]     [ Tira ]                       ← disabilitato se saldo=0
```

- Topbar: saldo corrente + countdown "gratis tra Xg" (riusa `giriEleggibile` con costanti slot).
- `Tira` è disabilitato se saldo == 0. Quando disabilitato mostra il countdown invece del testo "Tira".
- Ogni `roll()` chiama `spendiSlot(...)` prima di animare i rulli. Se la chiamata fallisce, nessuna animazione.
- All'ingresso del modulo, se `slotEleggibile(...).ok` accredito i 5 settimanali (stesso pattern di `renderRuota`).

### 3.3 Ruota — 10 spicchi

```
SLICE = 360 / 10 = 36°
```

Geometria CSS aggiornata: 10 dividers a multipli di 36°, spotlight largo 36° centrato sul puntatore. Valori decimali espliciti (no `calc()` — memory `feedback-css-calc-conic-gradient`).

| # | emoji | key | label | risoluzione | differito |
|---|-------|-----|-------|-------------|-----------|
| 0 | 💋 | `segreto` | Apri un segreto | come oggi (apri busta) | no |
| 1 | 🔥 | `piccante` | Proposta piccante | pesca da `proposte` | no |
| 2 | 💌 | `desiderio` | Pesca un desiderio | pesca dalla lista desideri | sì |
| 3 | 🃏 | `wild` | Carta wild | testo fisso | no |
| 4 | 💆 | `massaggio` | Massaggio | testo fisso | no |
| 5 | 🎰 | `slot` | 3 tiri slot | `accreditaSlot(+3, 'ruota')`, rispetta cap | no (immediato) |
| 6 | 🎟️ | `lampo` | Buono lampo | pesca da `buoni`, crea record con `scadenza_iso=+24h` | sì |
| 7 | 👅 | `orale` | Orale | testo fisso | no |
| 8 | 🔁 | `ancora` | Gira ancora | accredita 1 giro ruota | no |
| 9 | ⭐ | `jolly` | Jolly: scegli tu | come oggi | no |

Spicchi condizionali (peso 0 quando manca la condizione, come oggi):
- 💋 `segreto` → richiede almeno una busta `tipo='segreto'` attiva ricevuta
- 🔥 `piccante` → richiede almeno una proposta in `ruota_contenuti` cat=`'piccante'`
- 🎟️ `lampo` → richiede almeno un buono in `ruota_contenuti` cat=`'buono'` (stessa lista del vecchio 🎁)

### 3.4 Schema DB

```sql
-- Migration: 2026-05-28-economia-slot.sql

-- nuovo: economia slot, simmetrico a giri_movimenti
CREATE TABLE slot_movimenti (
  id          bigserial PRIMARY KEY,
  couple_id   uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delta       int  NOT NULL,
  motivo      text NOT NULL CHECK (motivo IN ('settimanale','ruota','tiro','bonus')),
  creato      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slot_movimenti_couple_user_creato
  ON slot_movimenti(couple_id, user_id, creato DESC);

-- RLS uguale a giri_movimenti
ALTER TABLE slot_movimenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY slot_mov_select ON slot_movimenti FOR SELECT
  USING (couple_id IN (SELECT id FROM couples WHERE membro_a = auth.uid() OR membro_b = auth.uid()));
CREATE POLICY slot_mov_insert ON slot_movimenti FOR INSERT
  WITH CHECK (couple_id IN (SELECT id FROM couples WHERE membro_a = auth.uid() OR membro_b = auth.uid()));

-- nuova colonna su buoni per i lampo (nullable: i buoni esistenti non hanno scadenza)
ALTER TABLE buoni ADD COLUMN scadenza_iso timestamptz;
```

### 3.5 Costanti (in `js/lib/logic.js`)

```js
export const ECONOMIA_SLOT = {
  COSTO_TIRO: 1,
  GRATIS_OGNI_GIORNI: 7,
  TIRI_SETTIMANALI: 5,
  CAP_SALDO: 10,
  BONUS_RUOTA: 3,    // quanti tiri dà uno spicchio 🎰
};

export const LAMPO_TTL_MS = 24 * 60 * 60 * 1000;  // buono lampo dura 24h

// FETTE — nuovo set 10
export const FETTE = [
  { key: 'segreto',   emoji: '💋', label: 'Apri un segreto',     peso: 1, differito: false },
  { key: 'piccante',  emoji: '🔥', label: 'Proposta piccante',   peso: 1, differito: false },
  { key: 'desiderio', emoji: '💌', label: 'Pesca un desiderio',  peso: 1, differito: true  },
  { key: 'wild',      emoji: '🃏', label: 'Carta wild',          peso: 1, differito: false },
  { key: 'massaggio', emoji: '💆', label: 'Massaggio',           peso: 1, differito: false },
  { key: 'slot',      emoji: '🎰', label: '3 tiri slot',         peso: 1, differito: false },
  { key: 'lampo',     emoji: '🎟️', label: 'Buono lampo',         peso: 1, differito: true  },
  { key: 'orale',     emoji: '👅', label: 'Servizio orale',      peso: 1, differito: false },
  { key: 'ancora',    emoji: '🔁', label: 'Gira ancora',         peso: 1, differito: false },
  { key: 'jolly',     emoji: '⭐', label: 'Jolly: scegli tu',    peso: 1, differito: false },
];
```

---

## 4. File modificati / creati

### Creati
- `supabase/slot.sql` — migration economia slot (CREATE TABLE + ALTER buoni)

### Modificati
- `js/lib/logic.js`
  - Aggiungi `ECONOMIA_SLOT`, `LAMPO_TTL_MS`
  - Rimpiazza `FETTE` (10 entries nuove)
  - Aggiungi `saldoSlot(movimenti, userId)`
  - Aggiungi `slotEleggibile(movimenti, userId, now)` (analogo a `giriEleggibile` ma usa `ECONOMIA_SLOT`)
  - Aggiungi `accreditoConCap(saldo, delta, cap)` (helper puro)
  - Aggiorna `fetteRuota({ haSegreti, haProposte, haBuoni })` → ora condiziona `segreto`, `piccante`, `lampo` (con `haBuoni`)
- `js/store.js`
  - `listSlotMov(client, coupleId)`
  - `accreditaSlot(client, { couple_id, user_id, motivo, delta })`
  - `spendiSlot(client, { couple_id, user_id })` (delta=-1, motivo='tiro')
  - `addBuono(client, payload)` — accetta opzionalmente `scadenza_iso`
- `js/modules/giochi.js`
  - `buildSelettore()` ritorna ora due dock invece di uno, ciascuno con `.gruppo-lab`
  - All'ingresso slot: `accreditaSlot` settimanale se eligible (pattern di `renderRuota`)
  - `draw()` slot mostra topbar saldo + countdown
  - `roll()` chiama `spendiSlot` prima di animare; se 0 tiri, bottone disabilitato
- `js/modules/ruota.js`
  - Rimpiazza `SLICE = 360/7` con `SLICE = 360/10`
  - Aggiungi case nel `risolvi()` per: `slot` (accredita +3 con cap), `wild`, `massaggio`, `orale`, `lampo` (pesca da buoni, crea con scadenza)
- `styles.css`
  - `.wheel` background uniforme (già fatto), dividers a 10 stop espliciti (36°), spotlight 36°
  - Nuovo `.gruppo-lab` (label sopra ai dock)
  - `.gioco-selettore` invariato (riusato 2 volte)
- `sw.js` — bump cache version (v17 → v18)

### Test (Node test)
- `test/ruota.test.js`
  - Aggiorna `FETTE.length === 10` + check chiavi nuove
  - Test `saldoSlot`, `slotEleggibile`, `accreditoConCap` (cap rispettato, eccedenza scartata)
  - Test `addBuono` con `scadenza_iso` settato a +24h per i lampo

---

## 5. Cosa NON cambia

- **Yahtzutra e Strip Poker:** nessuna modifica logica, UI o di stato. Cambia solo la posizione nel nav (gruppo "Liberi").
- **Economia giri ruota:** invariata (1 giro/sett gratis, 1 giro/spin, accreditata da `concediGiro` da Strip Poker).
- **Editor contenuti** (`Impostazioni → Contenuti giochi`): la lista buoni (cat=`'buono'`) resta unica e continua a essere usata sia dal vecchio flusso (per i buoni "differiti" — ora rimosso) sia dal nuovo 🎟️ lampo. Niente nuove sezioni nell'editor.
- **Schema `buoni`:** la nuova colonna `scadenza_iso` è nullable, i buoni esistenti restano "senza scadenza".

---

## 6. Open questions (non bloccanti)

- **Filtro buoni scaduti nella vista Buoni:** lo spec non specifica se filtrare i buoni con `scadenza_iso < now()`. Decisione di default: **sì, nasconderli automaticamente** dalla lista attiva (sono di fatto morti). Da confermare in fase plan.
- **Notifica scadenza imminente:** un buono lampo che scade fra <2h potrebbe mostrare un badge/avviso. Non incluso in questo spec — vive in un eventuale lavoro futuro sui "buoni con TTL".
- **Tarature `peso`:** tutti gli spicchi sono peso 1 (uniforme) al lancio. Si tarano dopo aver provato la ruota dal vivo (come stabilito nello spec ruota originale).
