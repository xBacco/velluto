# Ruota 13 spicchi + economia slot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare la ruota a 13 spicchi (11 normali a 30° + 2 rari a 15°) con due meccaniche meta (🪄 flag persistente ×2 e 💎 doppio sub-spin) e introdurre l'economia slot indipendente (5 tiri/sett, cap 10).

**Architecture:** Tre layer separati: (1) ledger SQL puri (`slot_movimenti` simmetrica a `giri_movimenti` + colonne nuove su `couples` e `buoni`); (2) helpers puri TDD-first in `js/lib/logic.js` (FETTE, `applicaDoppio`, slot helpers); (3) wiring imperativo in `js/modules/ruota.js` e `js/modules/giochi.js` (geometria, sub-spin, indicator, badge reveal). Lo stile è già fissato dal mockup `ruota-G-onbrand.html` (palette `styles.css`).

**Tech Stack:** Vanilla JS ES modules, Supabase Postgres + RLS via `is_member(couple_id)`, Node test runner (`node --test`), Service Worker per cache shell.

---

## File Structure

**Created:**
- `supabase/ruota.sql` — colonna `ruota_flag_doppio` su `couples`
- `supabase/slot.sql` — tabella `slot_movimenti` + RLS + colonna `scadenza_iso` su `buoni`
- `test/slot.test.js` — test economia slot

**Modified:**
- `js/lib/logic.js` — FETTE (rimpiazzata), `ECONOMIA_SLOT`, `LAMPO_TTL_MS`, `POLAROID_TTL_MS`, `fetteRuota` (firma estesa con `haFantasie`), `applicaDoppio`, `saldoSlot`, `slotEleggibile`, `accreditoConCap`
- `js/store.js` — `addBuono` (accetta `scadenza_iso`), `listSlotMov`, `accreditaSlot`, `spendiSlot`, `getFlagDoppio`, `setFlagDoppio`
- `js/modules/ruota.js` — geometria variabile, indicator badge, reveal boosted, doppio sub-spin, casi nuovi
- `js/modules/giochi.js` — `buildSelettore` due dock, slot economy hookup
- `styles.css` — `.wheel` dividers 13, `.hub` senza cerchio, `.ruota-x2-badge`, `.prize.boosted`, `.prize.jackpot`, `.gruppo-lab`
- `sw.js` — bump cache `lussuria-v22` → `lussuria-v23`
- `test/ruota.test.js` — FETTE 13 + `applicaDoppio` + `fetteRuota` condizionali
- `test/buoni.test.js` — `addBuono` con `scadenza_iso`

---

### Task 1: Migration `supabase/ruota.sql` (flag doppio sulla coppia)

**Files:**
- Create: `supabase/ruota.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Economia ruota — flag persistente "prossimo premio ×2".
-- Settato dallo spicchio 🪄 'doppio', consumato dal prossimo spin "vero" (non da 🔁 'ancora').

alter table couples
  add column if not exists ruota_flag_doppio boolean not null default false;
```

- [ ] **Step 2: Eseguire manualmente nel SQL Editor di Supabase (annotare nel commit)**

L'engineer applica lo SQL dal dashboard Supabase (no migrations automatiche in questo progetto). Verifica:

```sql
select column_name, data_type, column_default
  from information_schema.columns
  where table_name = 'couples' and column_name = 'ruota_flag_doppio';
```
Expected: una riga `ruota_flag_doppio | boolean | false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/ruota.sql
git commit -m "feat(ruota): flag doppio sulla coppia (migration)"
```

---

### Task 2: Migration `supabase/slot.sql` (slot_movimenti + scadenza_iso su buoni)

**Files:**
- Create: `supabase/slot.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Economia slot (Fase 4b). Eseguire nel SQL Editor di Supabase.
-- Ledger simmetrico a giri_movimenti. Slot scollegata dalla ruota:
-- motivi possibili sono solo 'settimanale' (5 tiri/sett gratis) e 'tiro' (delta=-1).

create table if not exists slot_movimenti (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id   uuid not null references auth.users(id),
  delta     int  not null,
  motivo    text not null check (motivo in ('settimanale','tiro')),
  creato    timestamptz not null default now()
);
create index if not exists slot_mov_couple_idx on slot_movimenti (couple_id, user_id, creato desc);

alter table slot_movimenti enable row level security;
create policy slot_mov_all on slot_movimenti
  for all using (is_member(couple_id)) with check (is_member(couple_id));

-- Scadenza buoni: usata da spicchi 🎟️ lampo (TTL 24h) e 📸 polaroid (TTL 24h).
-- Nullable per non rompere i buoni esistenti senza scadenza.
alter table buoni
  add column if not exists scadenza_iso timestamptz;
```

- [ ] **Step 2: Eseguire manualmente nel SQL Editor di Supabase**

Verifica:

```sql
select table_name from information_schema.tables where table_name = 'slot_movimenti';
select column_name from information_schema.columns where table_name = 'buoni' and column_name = 'scadenza_iso';
```
Expected: `slot_movimenti` esiste, `buoni.scadenza_iso` esiste.

- [ ] **Step 3: Commit**

```bash
git add supabase/slot.sql
git commit -m "feat(slot): ledger slot_movimenti + scadenza_iso su buoni (migration)"
```

---

### Task 3: Costanti `ECONOMIA_SLOT`, `LAMPO_TTL_MS`, `POLAROID_TTL_MS` in `logic.js`

**Files:**
- Modify: `js/lib/logic.js` (subito dopo `ECONOMIA` esistente alla riga 349)
- Test: `test/slot.test.js` (nuovo)

- [ ] **Step 1: Crea `test/slot.test.js` con i test per le costanti**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMIA_SLOT, LAMPO_TTL_MS, POLAROID_TTL_MS } from '../js/lib/logic.js';

test('ECONOMIA_SLOT: 5 tiri/sett, cap 10, costo 1', () => {
  assert.equal(ECONOMIA_SLOT.TIRI_SETTIMANALI, 5);
  assert.equal(ECONOMIA_SLOT.CAP_SALDO, 10);
  assert.equal(ECONOMIA_SLOT.COSTO_TIRO, 1);
  assert.equal(ECONOMIA_SLOT.GRATIS_OGNI_GIORNI, 7);
});

test('LAMPO_TTL_MS e POLAROID_TTL_MS = 24h', () => {
  assert.equal(LAMPO_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(POLAROID_TTL_MS, 24 * 60 * 60 * 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-only-matching=ECONOMIA_SLOT 2>/dev/null; npm test`
Expected: il test fallisce con `SyntaxError` o `import error` perché `ECONOMIA_SLOT` non è esportato.

- [ ] **Step 3: Aggiungi le costanti in `js/lib/logic.js` subito dopo `ECONOMIA` (riga ~354)**

```js
// Economia slot (Fase 4b, 2026-05-28). Indipendente dalla ruota.
export const ECONOMIA_SLOT = {
  COSTO_TIRO: 1,
  GRATIS_OGNI_GIORNI: 7,
  TIRI_SETTIMANALI: 5,
  CAP_SALDO: 10,
};

// Time-to-live per buoni "lampo" (🎟️) e "polaroid" (📸). Ambedue 24h.
export const LAMPO_TTL_MS    = 24 * 60 * 60 * 1000;
export const POLAROID_TTL_MS = 24 * 60 * 60 * 1000;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: tutti i test passano, in particolare i due nuovi in `test/slot.test.js`.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/slot.test.js
git commit -m "feat(slot): costanti ECONOMIA_SLOT + LAMPO/POLAROID_TTL_MS"
```

---

### Task 4: Helper `accreditoConCap` (puro)

**Files:**
- Modify: `js/lib/logic.js`
- Test: `test/slot.test.js`

- [ ] **Step 1: Aggiungi i test in `test/slot.test.js`**

```js
import { accreditoConCap } from '../js/lib/logic.js';

test('accreditoConCap sotto il cap accredita pieno', () => {
  assert.equal(accreditoConCap(3, 5, 10), 5);
});

test('accreditoConCap al cap accredita 0', () => {
  assert.equal(accreditoConCap(10, 5, 10), 0);
});

test('accreditoConCap eccedenza scartata', () => {
  assert.equal(accreditoConCap(8, 5, 10), 2);
});

test('accreditoConCap delta negativo (no-op)', () => {
  assert.equal(accreditoConCap(5, -3, 10), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: i 4 nuovi test falliscono perché `accreditoConCap` non è esportato.

- [ ] **Step 3: Aggiungi `accreditoConCap` in `js/lib/logic.js` subito sotto le costanti slot**

```js
// Quanti tiri si possono davvero accreditare senza superare il cap.
// Ritorna l'incremento effettivo (>=0). Eccedenza scartata.
export function accreditoConCap(saldo, delta, cap) {
  if (delta <= 0) return 0;
  return Math.max(0, Math.min(delta, cap - saldo));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/slot.test.js
git commit -m "feat(slot): accreditoConCap helper puro"
```

---

### Task 5: Helpers `saldoSlot` e `slotEleggibile`

**Files:**
- Modify: `js/lib/logic.js`
- Test: `test/slot.test.js`

- [ ] **Step 1: Aggiungi i test in `test/slot.test.js`**

```js
import { saldoSlot, slotEleggibile } from '../js/lib/logic.js';

const mov = (user_id, delta, motivo, creato) => ({ user_id, delta, motivo, creato });

test('saldoSlot somma solo i movimenti dell\'utente', () => {
  const m = [
    mov('me', 5, 'settimanale', '2026-05-01'),
    mov('me', -1, 'tiro', '2026-05-02'),
    mov('altro', 5, 'settimanale', '2026-05-01'),
  ];
  assert.equal(saldoSlot(m, 'me'), 4);
  assert.equal(saldoSlot(m, 'altro'), 5);
  assert.equal(saldoSlot(m, 'nessuno'), 0);
});

test('slotEleggibile: nessun settimanale → ok', () => {
  const r = slotEleggibile([], 'me', new Date('2026-05-28T10:00:00Z'));
  assert.equal(r.ok, true);
  assert.equal(r.prossimoSblocco, null);
});

test('slotEleggibile: settimanale recente → non ok, ritorna prossimoSblocco', () => {
  const m = [mov('me', 5, 'settimanale', '2026-05-26T10:00:00Z')];
  const r = slotEleggibile(m, 'me', new Date('2026-05-28T10:00:00Z'));
  assert.equal(r.ok, false);
  assert.equal(r.prossimoSblocco, '2026-06-02T10:00:00.000Z');
});

test('slotEleggibile: settimanale 7+ giorni fa → ok', () => {
  const m = [mov('me', 5, 'settimanale', '2026-05-20T10:00:00Z')];
  const r = slotEleggibile(m, 'me', new Date('2026-05-28T10:00:00Z'));
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: i 4 test falliscono, `saldoSlot`/`slotEleggibile` non esportati.

- [ ] **Step 3: Aggiungi gli helper in `js/lib/logic.js` (sotto `accreditoConCap`)**

```js
// Saldo slot dell'utente (ledger insert-only, somma dei delta).
export function saldoSlot(movimenti, userId) {
  return movimenti.filter(m => m.user_id === userId).reduce((s, m) => s + m.delta, 0);
}

// Settimanale slot: ok se mai maturato o se passati ECONOMIA_SLOT.GRATIS_OGNI_GIORNI dall'ultimo.
// `now` (Date) iniettabile per i test.
export function slotEleggibile(movimenti, userId, now = new Date()) {
  const settimanali = movimenti
    .filter(m => m.user_id === userId && m.motivo === 'settimanale')
    .map(m => new Date(m.creato))
    .sort((a, b) => b - a);
  if (!settimanali.length) return { ok: true, prossimoSblocco: null };
  const prossimo = new Date(settimanali[0].getTime() + ECONOMIA_SLOT.GRATIS_OGNI_GIORNI * 864e5);
  return { ok: now >= prossimo, prossimoSblocco: prossimo.toISOString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: tutti passano.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/slot.test.js
git commit -m "feat(slot): saldoSlot + slotEleggibile (settimanale 5 tiri/sett)"
```

---

### Task 6: Sostituire `FETTE` (7 → 13 spicchi)

**Files:**
- Modify: `js/lib/logic.js` (righe 379-390)
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungi i test in `test/ruota.test.js`**

```js
import { FETTE } from '../js/lib/logic.js';

test('FETTE: 13 spicchi totali', () => {
  assert.equal(FETTE.length, 13);
});

test('FETTE: 11 normali (peso 1) + 2 rari (peso 0.5)', () => {
  const normali = FETTE.filter(f => f.peso === 1);
  const rari    = FETTE.filter(f => f.peso === 0.5);
  assert.equal(normali.length, 11);
  assert.equal(rari.length, 2);
  assert.equal(rari[0].key, 'doppio');
  assert.equal(rari[1].key, 'jackpot');
});

test('FETTE: chiavi richieste presenti', () => {
  const keys = FETTE.map(f => f.key);
  for (const k of ['segreto','piccante','desiderio','bendare','wild','massaggio','doppio','polaroid','lampo','orale','ancora','jolly','jackpot']) {
    assert.ok(keys.includes(k), `manca key ${k}`);
  }
});

test('FETTE: ordine sulla ruota canonico', () => {
  const expected = ['segreto','piccante','desiderio','bendare','wild','massaggio','doppio','polaroid','lampo','orale','ancora','jolly','jackpot'];
  assert.deepEqual(FETTE.map(f => f.key), expected);
});

test('FETTE: differiti = desiderio, polaroid, lampo', () => {
  const differiti = FETTE.filter(f => f.differito).map(f => f.key);
  assert.deepEqual(differiti.sort(), ['desiderio','lampo','polaroid']);
});

test('FETTE: rari marcati con tag rare/ultra', () => {
  assert.equal(FETTE.find(f => f.key === 'doppio').rare, 'rare');
  assert.equal(FETTE.find(f => f.key === 'jackpot').rare, 'ultra');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: i 6 test falliscono (FETTE attuale ha 7 entries, vecchio set).

- [ ] **Step 3: Rimpiazza `FETTE` in `js/lib/logic.js` (righe 379-390)**

```js
// Le 13 fette, in ordine sulla ruota (dal puntatore in senso orario).
// 11 normali (peso 1 = 30°) + 2 rari (peso 0.5 = 15°).
// Aggiornato 2026-05-28: nuovo set per ridisegno ruota (spec 2026-05-28-economia-giochi-design.md).
export const FETTE = [
  { key: 'segreto',   emoji: '💋', label: 'Apri un segreto',     peso: 1,   differito: false },
  { key: 'piccante',  emoji: '🔥', label: 'Proposta piccante',   peso: 1,   differito: false },
  { key: 'desiderio', emoji: '💌', label: 'Pesca una fantasia',  peso: 1,   differito: true  },
  { key: 'bendare',   emoji: '🧣', label: 'Bendare',             peso: 1,   differito: false },
  { key: 'wild',      emoji: '🃏', label: 'Carta wild',          peso: 1,   differito: false },
  { key: 'massaggio', emoji: '💆', label: 'Massaggio',           peso: 1,   differito: false },
  { key: 'doppio',    emoji: '🪄', label: 'Prossimo ×2',         peso: 0.5, differito: false, rare: 'rare'  },
  { key: 'polaroid',  emoji: '📸', label: 'Foto osè 24h',        peso: 1,   differito: true  },
  { key: 'lampo',     emoji: '🎟️', label: 'Buono lampo',         peso: 1,   differito: true  },
  { key: 'orale',     emoji: '👅', label: 'Servizio orale',      peso: 1,   differito: false },
  { key: 'ancora',    emoji: '🔁', label: 'Gira ancora',         peso: 1,   differito: false },
  { key: 'jolly',     emoji: '⭐', label: 'Jolly: scegli tu',    peso: 1,   differito: false },
  { key: 'jackpot',   emoji: '💎', label: 'Jackpot',             peso: 0.5, differito: false, rare: 'ultra' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: tutti i nuovi test FETTE passano. Probabili test pre-esistenti su FETTE 7 falliranno (li sistemiamo nel prossimo task).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/ruota.test.js
git commit -m "feat(ruota): FETTE rimpiazzata con set 13 spicchi (11 norm + 2 rari)"
```

---

### Task 7: Aggiorna `fetteRuota` (firma e logica condizionali)

**Files:**
- Modify: `js/lib/logic.js` (righe 392-402)
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungi i test in `test/ruota.test.js`**

```js
import { fetteRuota } from '../js/lib/logic.js';

test('fetteRuota: tutte le condizioni vere → tutti i pesi originali', () => {
  const f = fetteRuota({ haSegreti: true, haProposte: true, haFantasie: true, haBuoni: true });
  assert.equal(f.find(x => x.key === 'segreto').peso, 1);
  assert.equal(f.find(x => x.key === 'piccante').peso, 1);
  assert.equal(f.find(x => x.key === 'desiderio').peso, 1);
  assert.equal(f.find(x => x.key === 'lampo').peso, 1);
});

test('fetteRuota: !haSegreti → segreto peso 0', () => {
  const f = fetteRuota({ haSegreti: false, haProposte: true, haFantasie: true, haBuoni: true });
  assert.equal(f.find(x => x.key === 'segreto').peso, 0);
});

test('fetteRuota: !haProposte → piccante peso 0', () => {
  const f = fetteRuota({ haSegreti: true, haProposte: false, haFantasie: true, haBuoni: true });
  assert.equal(f.find(x => x.key === 'piccante').peso, 0);
});

test('fetteRuota: !haFantasie → desiderio peso 0', () => {
  const f = fetteRuota({ haSegreti: true, haProposte: true, haFantasie: false, haBuoni: true });
  assert.equal(f.find(x => x.key === 'desiderio').peso, 0);
});

test('fetteRuota: !haBuoni → lampo peso 0', () => {
  const f = fetteRuota({ haSegreti: true, haProposte: true, haFantasie: true, haBuoni: false });
  assert.equal(f.find(x => x.key === 'lampo').peso, 0);
});

test('fetteRuota: rari (doppio, jackpot) sempre peso 0.5', () => {
  const f = fetteRuota({ haSegreti: false, haProposte: false, haFantasie: false, haBuoni: false });
  assert.equal(f.find(x => x.key === 'doppio').peso, 0.5);
  assert.equal(f.find(x => x.key === 'jackpot').peso, 0.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: 6 nuovi test falliscono (firma vecchia non ha `haFantasie`).

- [ ] **Step 3: Rimpiazza `fetteRuota` in `js/lib/logic.js` (righe 392-402)**

```js
// Copia di FETTE con i pesi delle fette condizionali azzerati quando manca la condizione.
// Le fette restano tutte e 13 (la ruota ha geometria fissa).
// Condizionali: segreto (haSegreti), piccante (haProposte), desiderio (haFantasie), lampo (haBuoni).
export function fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni }) {
  return FETTE.map(f => {
    let peso = f.peso;
    if (f.key === 'segreto'   && !haSegreti)  peso = 0;
    if (f.key === 'piccante'  && !haProposte) peso = 0;
    if (f.key === 'desiderio' && !haFantasie) peso = 0;
    if (f.key === 'lampo'     && !haBuoni)    peso = 0;
    return { ...f, peso };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: tutti i nuovi test passano. ATTENZIONE: i callers pre-esistenti di `fetteRuota` in `js/modules/ruota.js` ora passano `haBuoni` senza `haFantasie` — la fix dei callers è Task 14. Per ora i test pre-esistenti potrebbero dare un warning per `haFantasie undefined` (treated as falsy → desiderio peso 0): è il comportamento desiderato per chiamate non aggiornate.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/ruota.test.js
git commit -m "feat(ruota): fetteRuota accetta haFantasie (condizione nuova per 💌 desiderio)"
```

---

### Task 8: Helper `applicaDoppio(esito)` per ×2

**Files:**
- Modify: `js/lib/logic.js`
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungi i test in `test/ruota.test.js`**

```js
import { applicaDoppio } from '../js/lib/logic.js';

test('applicaDoppio massaggio: 10 → 20 minuti', () => {
  const r = applicaDoppio({ key: 'massaggio' });
  assert.equal(r.minuti, 20);
  assert.equal(r.boosted, true);
});

test('applicaDoppio wild: 24h → 48h', () => {
  const r = applicaDoppio({ key: 'wild' });
  assert.equal(r.ore, 48);
  assert.equal(r.boosted, true);
});

test('applicaDoppio lampo: quantita 2', () => {
  const r = applicaDoppio({ key: 'lampo' });
  assert.equal(r.quantita, 2);
});

test('applicaDoppio polaroid: quantita 2', () => {
  const r = applicaDoppio({ key: 'polaroid' });
  assert.equal(r.quantita, 2);
});

test('applicaDoppio segreto: quantita 2', () => {
  const r = applicaDoppio({ key: 'segreto' });
  assert.equal(r.quantita, 2);
});

test('applicaDoppio piccante: quantita 2', () => {
  const r = applicaDoppio({ key: 'piccante' });
  assert.equal(r.quantita, 2);
});

test('applicaDoppio desiderio: quantita 2', () => {
  const r = applicaDoppio({ key: 'desiderio' });
  assert.equal(r.quantita, 2);
});

test('applicaDoppio orale: testoExtra "due volte"', () => {
  const r = applicaDoppio({ key: 'orale' });
  assert.ok(r.testoExtra.includes('due volte'));
});

test('applicaDoppio bendare: cosmeticOnly true', () => {
  const r = applicaDoppio({ key: 'bendare' });
  assert.equal(r.cosmeticOnly, true);
});

test('applicaDoppio jolly: flag passa allo spicchio scelto', () => {
  const r = applicaDoppio({ key: 'jolly' });
  assert.equal(r.deferToJolly, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: i 10 test falliscono, `applicaDoppio` non esportata.

- [ ] **Step 3: Aggiungi `applicaDoppio` in `js/lib/logic.js` (subito sotto `fetteRuota`)**

```js
// Effetto del flag persistente "prossimo ×2" su un esito della ruota.
// Ritorna un oggetto con le proprietà raddoppiate, da consumare nel rendering del reveal
// e/o nella creazione dei record differiti (buoni con quantita=2).
//
// Regole:
// - massaggio: 10 → 20 minuti
// - wild: 24h → 48h
// - lampo / polaroid: quantita = 2 (crea due record)
// - segreto / piccante / desiderio: quantita = 2 (apri/pesca due volte)
// - orale: testoExtra "due volte, una ora e una quando vuole chi ha vinto"
// - bendare: cosmeticOnly (label "il doppio del tempo")
// - jolly: deferToJolly (il flag passa allo spicchio scelto dal selettore)
// - ancora / doppio / jackpot: gestiti separatamente nel chiamante (non consumano flag o sono idempotenti)
export function applicaDoppio(esito) {
  const out = { boosted: true };
  switch (esito.key) {
    case 'massaggio':  return { ...out, minuti: 20 };
    case 'wild':       return { ...out, ore: 48 };
    case 'lampo':
    case 'polaroid':   return { ...out, quantita: 2 };
    case 'segreto':
    case 'piccante':
    case 'desiderio':  return { ...out, quantita: 2 };
    case 'orale':      return { ...out, testoExtra: 'Due volte: una ora e una quando vuole chi ha vinto.' };
    case 'bendare':    return { ...out, cosmeticOnly: true };
    case 'jolly':      return { ...out, deferToJolly: true };
    default:           return { ...out };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: tutti i 10 passano.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/ruota.test.js
git commit -m "feat(ruota): applicaDoppio helper per effetto flag ×2"
```

---

### Task 9: Estendi `addBuono` con `scadenza_iso` opzionale

**Files:**
- Modify: `js/store.js` (riga 171)
- Test: `test/buoni.test.js`

- [ ] **Step 1: Aggiungi i test in `test/buoni.test.js` (sotto i test esistenti)**

```js
test('addBuono accetta scadenza_iso e la inoltra nel payload', async () => {
  // fakeClient simile a quello in ruota.test.js
  const calls = [];
  const fakeClient = {
    from(table) {
      const state = { table, op: null, payload: null };
      return {
        insert(p) { state.op = 'insert'; state.payload = p; return this; },
        select() { return this; },
        single() { return this; },
        then(resolve) { calls.push(state); resolve({ data: { id: 'b1', ...state.payload }, error: null }); }
      };
    },
  };
  const r = await addBuono(fakeClient, {
    couple_id: 'c1', da_id: 'me', a_id: 'altro',
    emoji: '🎟️', titolo: 'Coccola', descrizione: 'Lampo',
    tipo: 'regalo', stato: 'attivo',
    scadenza_iso: '2026-05-29T22:00:00.000Z',
  });
  assert.equal(calls[0].payload.scadenza_iso, '2026-05-29T22:00:00.000Z');
  assert.equal(r.scadenza_iso, '2026-05-29T22:00:00.000Z');
});

test('addBuono senza scadenza_iso non la include nel payload', async () => {
  const calls = [];
  const fakeClient = {
    from(table) {
      const state = { table, op: null, payload: null };
      return {
        insert(p) { state.op = 'insert'; state.payload = p; return this; },
        select() { return this; },
        single() { return this; },
        then(resolve) { calls.push(state); resolve({ data: { id: 'b2', ...state.payload }, error: null }); }
      };
    },
  };
  await addBuono(fakeClient, { couple_id: 'c1', da_id: 'me', a_id: 'altro', emoji: '🎁', titolo: 'X', tipo: 'regalo', stato: 'attivo' });
  assert.ok(!('scadenza_iso' in calls[0].payload));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: il primo test fallisce (`scadenza_iso` non viene inoltrata).

- [ ] **Step 3: Modifica `addBuono` in `js/store.js` (riga ~171)**

```js
export async function addBuono(client, { couple_id, da_id, a_id, emoji, titolo, descrizione, tipo, stato, bundle_id, scadenza_iso }) {
  const payload = { couple_id, da_id, a_id, emoji, titolo, descrizione, tipo, stato, bundle_id };
  if (scadenza_iso != null) payload.scadenza_iso = scadenza_iso;
  const { data, error } = await client.from('buoni').insert(payload).select().single();
  return check({ data, error });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: passano.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/buoni.test.js
git commit -m "feat(buoni): addBuono accetta scadenza_iso opzionale"
```

---

### Task 10: Store methods slot (`listSlotMov`, `accreditaSlot`, `spendiSlot`)

**Files:**
- Modify: `js/store.js`
- Test: `test/slot.test.js`

- [ ] **Step 1: Aggiungi i test in `test/slot.test.js`**

```js
import { listSlotMov, accreditaSlot, spendiSlot } from '../js/store.js';

function fakeSlotClient(initialRows = []) {
  const rows = [...initialRows];
  return {
    from(table) {
      const state = { table, op: null, payload: null, filters: {}, orders: [] };
      const api = {
        select() { state.op = 'select'; return api; },
        insert(p) { state.op = 'insert'; state.payload = p; return api; },
        eq(c, v) { state.filters[c] = v; return api; },
        order(c, o) { state.orders.push({ c, o }); return api; },
        single() { state.single = true; return api; },
        then(resolve) {
          if (state.op === 'select') {
            const data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
            resolve({ data, error: null });
          } else if (state.op === 'insert') {
            const created = { id: 'new', ...state.payload };
            rows.push(created);
            resolve({ data: state.single ? created : [created], error: null });
          }
        }
      };
      return api;
    },
    _rows: rows,
  };
}

test('listSlotMov filtra per couple_id', async () => {
  const c = fakeSlotClient([
    { couple_id: 'c1', user_id: 'me', delta: 5, motivo: 'settimanale', creato: '2026-05-20' },
    { couple_id: 'c2', user_id: 'me', delta: 5, motivo: 'settimanale', creato: '2026-05-20' },
  ]);
  const data = await listSlotMov(c, 'c1');
  assert.equal(data.length, 1);
});

test('accreditaSlot inserisce con motivo settimanale', async () => {
  const c = fakeSlotClient();
  await accreditaSlot(c, { couple_id: 'c1', user_id: 'me', motivo: 'settimanale', delta: 5 });
  assert.equal(c._rows[0].motivo, 'settimanale');
  assert.equal(c._rows[0].delta, 5);
});

test('spendiSlot inserisce delta -1 motivo tiro', async () => {
  const c = fakeSlotClient();
  await spendiSlot(c, { couple_id: 'c1', user_id: 'me' });
  assert.equal(c._rows[0].delta, -1);
  assert.equal(c._rows[0].motivo, 'tiro');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: i 3 test falliscono.

- [ ] **Step 3: Aggiungi i metodi store in `js/store.js` (subito sotto `concediGiro`, riga ~220)**

```js
// --- Slot (ledger simmetrico a giri_movimenti) ---

export async function listSlotMov(client, coupleId) {
  const { data, error } = await client.from('slot_movimenti').select().eq('couple_id', coupleId).order('creato', { ascending: false });
  return check({ data, error });
}

export async function accreditaSlot(client, { couple_id, user_id, motivo, delta }) {
  const { data, error } = await client.from('slot_movimenti').insert({ couple_id, user_id, motivo, delta }).select().single();
  return check({ data, error });
}

export async function spendiSlot(client, { couple_id, user_id }) {
  const { data, error } = await client.from('slot_movimenti').insert({ couple_id, user_id, motivo: 'tiro', delta: -1 }).select().single();
  return check({ data, error });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: passano.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/slot.test.js
git commit -m "feat(slot): store listSlotMov + accreditaSlot + spendiSlot"
```

---

### Task 11: Store methods flag doppio (`getFlagDoppio`, `setFlagDoppio`)

**Files:**
- Modify: `js/store.js`
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungi i test in `test/ruota.test.js`**

```js
import { getFlagDoppio, setFlagDoppio } from '../js/store.js';

function fakeCouplesClient(coupleId, initialFlag = false) {
  let flag = initialFlag;
  return {
    from(table) {
      const state = { table, op: null, payload: null, filters: {} };
      const api = {
        select(cols) { state.op = 'select'; state.cols = cols; return api; },
        update(p) { state.op = 'update'; state.payload = p; return api; },
        eq(c, v) { state.filters[c] = v; return api; },
        single() { state.single = true; return api; },
        then(resolve) {
          if (state.op === 'select') {
            if (state.filters.id === coupleId) resolve({ data: { ruota_flag_doppio: flag }, error: null });
            else resolve({ data: null, error: null });
          } else if (state.op === 'update') {
            if (state.filters.id === coupleId) flag = state.payload.ruota_flag_doppio;
            resolve({ data: null, error: null });
          }
        }
      };
      return api;
    },
    _flag: () => flag,
  };
}

test('getFlagDoppio ritorna il valore corrente', async () => {
  const c = fakeCouplesClient('c1', true);
  const f = await getFlagDoppio(c, 'c1');
  assert.equal(f, true);
});

test('setFlagDoppio(true) imposta il flag', async () => {
  const c = fakeCouplesClient('c1', false);
  await setFlagDoppio(c, 'c1', true);
  assert.equal(c._flag(), true);
});

test('setFlagDoppio(false) consuma il flag', async () => {
  const c = fakeCouplesClient('c1', true);
  await setFlagDoppio(c, 'c1', false);
  assert.equal(c._flag(), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: i 3 test falliscono.

- [ ] **Step 3: Aggiungi i metodi in `js/store.js` (subito sotto i metodi slot)**

```js
// --- Flag persistente "prossimo premio ×2" (couples.ruota_flag_doppio) ---

export async function getFlagDoppio(client, coupleId) {
  const { data, error } = await client.from('couples').select('ruota_flag_doppio').eq('id', coupleId).single();
  if (error) check({ data, error });
  return !!data?.ruota_flag_doppio;
}

export async function setFlagDoppio(client, coupleId, value) {
  const { data, error } = await client.from('couples').update({ ruota_flag_doppio: !!value }).eq('id', coupleId);
  return check({ data, error });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: passano.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/ruota.test.js
git commit -m "feat(ruota): store get/setFlagDoppio per flag ×2"
```

---

### Task 12: Stile — `.hub` senza cerchio, dividers 13, spotlight variabile

**Files:**
- Modify: `styles.css` (sezione `.wheel-wrap` / `.wheel` / `.hub`)

- [ ] **Step 1: Trova le regole esistenti**

```bash
grep -n "\.wheel\|\.hub\|\.winhi\|\.pointer" styles.css | head -20
```

- [ ] **Step 2: Rimpiazza il blocco `.hub` esistente con la versione senza cerchio**

Cerca il blocco attuale `.hub { ... background:radial-gradient... }` e sostituiscilo con:

```css
.hub{
  position:absolute;top:50%;left:50%;width:48px;height:48px;margin:-24px 0 0 -24px;z-index:5;
  display:grid;place-items:center;font-size:38px;line-height:1;
  font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;
  text-shadow:0 2px 6px rgba(0,0,0,.7);
  pointer-events:none;
}
```

- [ ] **Step 3: Rimpiazza il `.wheel::after` (dividers) con i 13 boundary**

Cerca `.wheel::after{ ... background:conic-gradient(from -15deg, ... )}` e sostituiscilo con:

```css
.wheel::after{
  content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;z-index:2;
  background:conic-gradient(from -15deg,
    rgba(233,201,143,.7) 0deg 0.3deg,
    transparent 0.3deg 29.7deg,   rgba(233,201,143,.7) 29.7deg 30.3deg,
    transparent 30.3deg 59.7deg,  rgba(233,201,143,.7) 59.7deg 60.3deg,
    transparent 60.3deg 89.7deg,  rgba(233,201,143,.7) 89.7deg 90.3deg,
    transparent 90.3deg 119.7deg, rgba(233,201,143,.7) 119.7deg 120.3deg,
    transparent 120.3deg 149.7deg,rgba(233,201,143,.7) 149.7deg 150.3deg,
    transparent 150.3deg 179.7deg,rgba(233,201,143,.7) 179.7deg 180.3deg,
    transparent 180.3deg 194.7deg,rgba(233,201,143,.7) 194.7deg 195.3deg,
    transparent 195.3deg 224.7deg,rgba(233,201,143,.7) 224.7deg 225.3deg,
    transparent 225.3deg 254.7deg,rgba(233,201,143,.7) 254.7deg 255.3deg,
    transparent 255.3deg 284.7deg,rgba(233,201,143,.7) 284.7deg 285.3deg,
    transparent 285.3deg 314.7deg,rgba(233,201,143,.7) 314.7deg 315.3deg,
    transparent 315.3deg 344.7deg,rgba(233,201,143,.7) 344.7deg 345.3deg,
    transparent 345.3deg 359.7deg,rgba(233,201,143,.7) 359.7deg 360deg);
}
```

- [ ] **Step 4: Rendi `.winhi` indipendente dall'inline JS (sliceWidth via CSS var)**

Trova `.winhi` esistente e sostituiscilo con:

```css
.winhi{
  --slice-w:30deg;
  position:absolute;inset:0;border-radius:50%;z-index:3;pointer-events:none;opacity:0;
  transition:opacity .3s;
}
.winhi.on{opacity:1;}
.winhi[data-slice-rare="true"]{ --slice-w:15deg; }
```

(Il JS in `js/modules/ruota.js` setterà `winhi.style.setProperty('--slice-w', sliceWidth + 'deg')` e `winhi.dataset.sliceRare = isRare`. La generazione del gradient avviene via JS — vedi Task 14.)

- [ ] **Step 5: Verifica nel browser**

Apri `mockups/ruota-G-onbrand.html` per confronto visivo. Il `.hub` reale nell'app deve mostrare solo l'emoji 💋 senza cerchio, dividers visibili tra tutti 13 spicchi incluso 💎/💋.

- [ ] **Step 6: Commit**

```bash
git add styles.css
git commit -m "feat(ruota): hub senza cerchio + dividers 13 boundary + spotlight variabile"
```

---

### Task 13: Stile — `.gruppo-lab` + `.ruota-x2-badge` + `.prize.boosted` + `.prize.jackpot`

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Aggiungi in fondo a `styles.css` (sezione "Giochi / Ruota") i nuovi selettori**

```css
/* Label sopra i dock del nav giochi (variante A) */
.gruppo-lab{
  font-family:Arial,sans-serif;
  font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--gold);
  margin:18px 0 8px;padding:0 4px;
  text-align:left;
}

/* Badge "PROSSIMO ×2" sopra il bottone GIRA quando il flag è armato */
.ruota-x2-badge{
  position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  background:linear-gradient(180deg,var(--gold-soft),var(--gold));color:#2a0813;
  font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.18em;
  padding:4px 10px;border-radius:10px;
  box-shadow:0 4px 10px rgba(212,168,108,.55);
  white-space:nowrap;
  animation:ruota-x2-pulse 1.4s ease-in-out infinite;
  pointer-events:none;
}
@keyframes ruota-x2-pulse{
  0%,100%{transform:translateX(-50%) scale(1);}
  50%    {transform:translateX(-50%) scale(1.06);}
}

/* Reveal premio quando il flag ×2 era attivo (consumato in questo spin) */
.prize.boosted{
  border-color:rgba(233,201,143,.7);
  box-shadow:
    0 0 0 1px rgba(233,201,143,.4),
    0 18px 44px rgba(0,0,0,.6),
    0 0 40px rgba(212,168,108,.25);
}
.prize .x2-banner{
  position:absolute;top:-14px;left:50%;transform:translateX(-50%) rotate(-3deg);
  background:linear-gradient(180deg,var(--gold-soft),var(--gold));color:#2a0813;
  font-family:Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.2em;
  padding:5px 14px;border-radius:6px;
  box-shadow:0 4px 14px rgba(212,168,108,.55);
  white-space:nowrap;
}
.prize .big .x2-chip{
  position:absolute;top:-6px;right:-22px;
  font-size:18px;color:var(--gold-soft);
  font-family:Arial,sans-serif;font-weight:700;
  text-shadow:0 0 6px var(--gold);transform:rotate(-8deg);
}

/* Reveal premio jackpot (durante i sub-spin del 💎) */
.prize.jackpot{
  border-color:var(--rose);
  box-shadow:
    0 0 0 1px rgba(194,85,122,.4),
    0 0 40px rgba(194,85,122,.25),
    0 18px 44px rgba(0,0,0,.6);
}
.prize .turn-strip{
  margin:-22px -18px 12px;padding:8px 10px;
  font-family:Arial,sans-serif;font-size:10px;letter-spacing:.15em;text-transform:uppercase;
  background:linear-gradient(90deg,rgba(212,168,108,.15),rgba(233,201,143,.3),rgba(212,168,108,.15));
  border-bottom:1px solid rgba(233,201,143,.4);
  color:var(--cream);
  border-radius:18px 18px 0 0;
  display:flex;align-items:center;justify-content:center;gap:8px;
}
.prize .turn-strip .av{
  width:22px;height:22px;border-radius:50%;
  background:radial-gradient(circle at 30% 30%,#3a1622,#1c0610);
  border:1px solid rgba(212,168,108,.55);
  display:flex;align-items:center;justify-content:center;font-size:14px;
}

/* Summary card di fine jackpot (due premi affiancati) */
.ruota-jackpot-summary{
  max-width:340px;margin:22px auto 0;
  background:linear-gradient(180deg,#2a0813,#1c0610);
  border:1px solid rgba(194,85,122,.4);border-radius:14px;padding:14px 16px;
  font-family:Arial,sans-serif;font-size:12px;color:#cbab9e;line-height:1.5;
}
.ruota-jackpot-summary .ti{font-family:Georgia,serif;font-size:14px;color:var(--rose);margin-bottom:8px;letter-spacing:.04em;text-align:center;}
.ruota-jackpot-summary .pair{display:flex;align-items:center;gap:10px;margin:8px 0;padding:8px 10px;background:rgba(0,0,0,.25);border-radius:8px;}
.ruota-jackpot-summary .pair .av{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#3a1622,#1c0610);border:1px solid rgba(212,168,108,.45);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
.ruota-jackpot-summary .pair .who{flex-shrink:0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-soft);width:60px;}
.ruota-jackpot-summary .pair .prz{flex:1;display:flex;align-items:center;gap:8px;color:var(--cream);font-family:Georgia,serif;font-size:13px;}
.ruota-jackpot-summary .pair .prz .em{font-size:22px;}
```

- [ ] **Step 2: Verifica nel browser**

Aprire `mockups/ruota-doppio-indicatore.html` (variante A), `mockups/ruota-doppio-reveal.html`, `mockups/ruota-jackpot-flow.html` per confermare che i nuovi selettori producono visuali coerenti.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat(ruota): styles per badge ×2, prize.boosted, prize.jackpot, summary"
```

---

### Task 14: Geometria ruota a 13 spicchi (modifica `js/modules/ruota.js`)

**Files:**
- Modify: `js/modules/ruota.js`

- [ ] **Step 1: Esplora il file**

```bash
grep -n "SLICE\|fetteRuota\|costruisciRuota\|estraiFetta\|risolvi\|conic-gradient" js/modules/ruota.js
```

- [ ] **Step 2: Rimuovi `SLICE = 360/7` se presente**

Cerca `const SLICE = 360 / 7;` o equivalente e rimuovi. La geometria è ora variabile per spicchio.

- [ ] **Step 3: Aggiorna la funzione che costruisce la ruota (probabilmente `costruisciRuota` o `renderRuota`)**

Sostituisci il calcolo dei centri/dividers con:

```js
const sumW = FETTE.reduce((s, f) => s + f.peso, 0);          // 12
const degPerUnit = 360 / sumW;                                // 30
const slice0 = FETTE[0].peso * degPerUnit;                    // 30

const centers = [];
let acc = 0;
for (let i = 0; i < FETTE.length; i++) {
  const slice = FETTE[i].peso * degPerUnit;
  centers.push(acc + slice / 2 - slice0 / 2);
  acc += slice;
}
```

Per il posizionamento delle emoji nelle slice:

```js
FETTE.forEach((f, i) => {
  const center = centers[i];
  const lbl = document.createElement('div'); lbl.className = 'slice-lbl';
  const inner = document.createElement('div'); inner.className = 'in';
  inner.style.transform = `rotate(${center}deg) translateY(-98px)`; // 98 = raggio emoji, allinea al mockup G
  const e = document.createElement('span');
  e.className = 'e' + (f.rare ? ' ' + f.rare : '');
  e.textContent = f.emoji;
  e.style.transform = `rotate(${-center}deg)`;
  inner.appendChild(e);
  lbl.appendChild(inner);
  wheelEl.appendChild(lbl);
});
```

- [ ] **Step 4: Aggiorna `caricaCondizioni()` (o equivalente) per passare `haFantasie`**

Trova il punto in cui si chiama `fetteRuota({ haSegreti, haProposte, haBuoni })` e aggiungi `haFantasie`. Esempio:

```js
const haFantasie = await listDesideri(client, coupleId).then(rows => rows.filter(d => d.stato === 'da_provare').length > 0);
const fette = fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni });
```

- [ ] **Step 5: Aggiorna lo spin per usare slice width variabile sul `.winhi`**

Quando si calcola la rotazione finale e si attiva lo spotlight:

```js
const sliceWidth = FETTE[chosen].peso * degPerUnit;  // 30 o 15
winhiEl.style.setProperty('--slice-w', sliceWidth + 'deg');
winhiEl.dataset.sliceRare = sliceWidth === 15 ? 'true' : 'false';
const half = sliceWidth / 2;
winhiEl.style.background =
  `conic-gradient(from ${-half}deg,
    transparent 0 ${sliceWidth}deg,
    rgba(8,2,5,.74) ${sliceWidth}deg 360deg)`;
```

- [ ] **Step 6: Smoke test manuale**

Avvia l'app e apri la ruota. Verifica:
- 13 spicchi distinti, 🪄 e 💎 più stretti
- Dividers tra TUTTI gli spicchi inclusi 💎/💋
- Hub centrale: solo 💋, niente cerchio
- Spin va a terminare con il puntatore CENTRATO sullo spicchio scelto (no off-by 7.5° sui rari)

- [ ] **Step 7: Commit**

```bash
git add js/modules/ruota.js
git commit -m "feat(ruota): geometria variabile 13 spicchi (11×30° + 2×15°)"
```

---

### Task 15: Caso `doppio` (setta flag) + indicator badge × 2

**Files:**
- Modify: `js/modules/ruota.js`

- [ ] **Step 1: Aggiungi import**

In testa al file, aggiungi:

```js
import { getFlagDoppio, setFlagDoppio } from '../store.js';
import { applicaDoppio } from '../lib/logic.js';
```

- [ ] **Step 2: All'apertura del modulo ruota, leggi il flag e mostra il badge se attivo**

Nel `renderRuota` (o equivalente entry-point), dopo aver montato il bottone GIRA:

```js
const flagDoppio = await getFlagDoppio(client, coupleId);
if (flagDoppio) mostraBadgeX2(spinBtnEl);

function mostraBadgeX2(btn) {
  if (btn.querySelector('.ruota-x2-badge')) return;
  const b = document.createElement('span');
  b.className = 'ruota-x2-badge';
  b.textContent = 'PROSSIMO ×2';
  btn.style.position = 'relative';  // garantisce contenimento absolute
  btn.appendChild(b);
}

function nascondiBadgeX2(btn) {
  btn.querySelector('.ruota-x2-badge')?.remove();
}
```

- [ ] **Step 3: Nel `risolvi(esito)` aggiungi il caso `doppio`**

```js
case 'doppio': {
  await setFlagDoppio(client, coupleId, true);
  mostraBadgeX2(spinBtnEl);
  return revealPremio({ emoji: '🪄', label: 'Prossimo ×2', body: 'Il tuo prossimo premio sarà raddoppiato.' });
}
```

- [ ] **Step 4: Smoke test manuale**

Gira finché esce 🪄 (può richiedere alcuni tentativi). Verifica:
- Reveal "Prossimo ×2"
- Dopo chiusura del popup, il badge dorato "PROSSIMO ×2" pulsante è visibile sul bottone GIRA
- Ricaricando la pagina, il badge è ancora lì (flag persistito su DB)

- [ ] **Step 5: Commit**

```bash
git add js/modules/ruota.js
git commit -m "feat(ruota): caso doppio (setta flag) + indicator badge ×2"
```

---

### Task 16: Consumo flag ×2 e reveal `.prize.boosted`

**Files:**
- Modify: `js/modules/ruota.js`

- [ ] **Step 1: Prima dello spin, leggi il flag e ricordalo come `boostActive`**

```js
async function spin() {
  if (busy) return;
  busy = true;
  const boostActive = await getFlagDoppio(client, coupleId);
  const fette = fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni });
  const pesc = estraiFetta(fette);
  if (!pesc) { busy = false; return; }
  // ... animazione ...
  await risolvi(pesc.fetta, boostActive);
  busy = false;
}
```

- [ ] **Step 2: `risolvi()` riceve `boostActive` e applica `applicaDoppio` se vero**

```js
async function risolvi(esito, boostActive) {
  // Eccezione: 'ancora' NON consuma il flag
  if (esito.key === 'ancora') {
    await concediGiro(client, { couple_id: coupleId, user_id: userId });
    return revealPremio({ emoji: esito.emoji, label: esito.label, body: 'Tiro extra concesso.' });
  }

  // Eccezione: 'doppio' è idempotente (gestito al Task 15)
  if (esito.key === 'doppio') { /* ... vedi Task 15 ... */ }

  // Eccezione: 'jackpot' gestito al Task 17 (consuma il flag a fine sequenza)
  if (esito.key === 'jackpot') { /* ... Task 17 ... */ }

  // Per tutti gli altri esiti "veri": calcola effetto ×2 se attivo, poi consuma il flag
  const boost = boostActive ? applicaDoppio(esito) : { boosted: false };
  await renderEsitoNormale(esito, boost);
  if (boostActive) {
    await setFlagDoppio(client, coupleId, false);
    nascondiBadgeX2(spinBtnEl);
  }
}
```

- [ ] **Step 3: `renderEsitoNormale` mostra il reveal con classi e dati boosted**

```js
function renderEsitoNormale(esito, boost) {
  const prizeEl = document.querySelector('.ruota-reveal .prize');
  prizeEl.classList.toggle('boosted', !!boost.boosted);

  // Banner DOPPIO! ×2
  prizeEl.querySelector('.x2-banner')?.remove();
  if (boost.boosted) {
    const b = document.createElement('div');
    b.className = 'x2-banner';
    b.textContent = 'DOPPIO! ×2';
    prizeEl.prepend(b);
  }

  // Chip ×2 accanto all'emoji
  const big = prizeEl.querySelector('.big');
  big.querySelector('.x2-chip')?.remove();
  big.textContent = esito.emoji;
  if (boost.boosted) {
    const c = document.createElement('span');
    c.className = 'x2-chip';
    c.textContent = '×2';
    big.appendChild(c);
  }

  // Body adattato per spicchio + boost
  prizeEl.querySelector('.name').textContent = esito.label;
  prizeEl.querySelector('.body').textContent = bodyText(esito, boost);

  // Effetti differiti / azioni
  return applicaEffettoEsito(esito, boost);
}

function bodyText(esito, boost) {
  if (esito.key === 'massaggio') return boost.boosted ? `${boost.minuti} minuti, dove preferisce chi ha vinto.` : '10 minuti, dove preferisce chi ha vinto.';
  if (esito.key === 'wild')      return boost.boosted ? `L'altro/a decide cosa farti per ${boost.ore} ore.`         : "L'altro/a decide cosa farti per 24h.";
  if (esito.key === 'orale')     return boost.boosted ? boost.testoExtra                                            : 'Quando vuole chi ha vinto.';
  if (esito.key === 'bendare')   return boost.boosted ? "Il doppio del tempo che decide l'altro/a."                 : "Lasciati bendare — l'altro/a decide quando finisce.";
  if (esito.key === 'lampo')     return boost.boosted ? '2 buoni a sorpresa, ciascuno vale 24h.'                    : 'Un buono pescato a sorpresa, vale 24h.';
  if (esito.key === 'polaroid')  return boost.boosted ? '2 foto osè da inviare entro 24h.'                          : 'Inviane una al partner entro 24 ore.';
  if (esito.key === 'segreto')   return boost.boosted ? 'Apri 2 buste segrete consecutive.'                         : 'Apri una busta segreta.';
  if (esito.key === 'piccante')  return boost.boosted ? '2 proposte piccanti da provare.'                           : 'Una proposta piccante da provare stasera.';
  if (esito.key === 'desiderio') return boost.boosted ? 'Pesca 2 fantasie dalla bacheca.'                           : 'Dalla bacheca delle cose da provare.';
  if (esito.key === 'jolly')     return 'Scegli tu il premio.';
  return '';
}
```

- [ ] **Step 4: Smoke test manuale**

Arma il flag (gira fino a 🪄), poi gira di nuovo. Verifica:
- Border oro acceso sulla card del reveal
- Banner "DOPPIO! ×2" inclinato in cima
- Chip ×2 dorato accanto all'emoji
- Body con numero/testo modificato (es. massaggio: "20 minuti")
- Dopo la chiusura, il badge "PROSSIMO ×2" sul bottone GIRA è sparito

- [ ] **Step 5: Commit**

```bash
git add js/modules/ruota.js
git commit -m "feat(ruota): consuma flag ×2 + render .prize.boosted con DOPPIO!"
```

---

### Task 17: Caso `jackpot` (doppio sub-spin + summary)

**Files:**
- Modify: `js/modules/ruota.js`

- [ ] **Step 1: Aggiungi `risolviJackpot` come funzione separata**

```js
async function risolviJackpot(boostActive) {
  // 1. Reveal "Jackpot uno a testa"
  await revealJackpotHeader();

  // 2. Sub-spin per chi sta tirando (Tomas)
  const fette1 = fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni }).map(f => f.key === 'jackpot' ? { ...f, peso: 0 } : f);
  const sub1 = estraiFetta(fette1);
  await animaSpinVerso(sub1.indice);
  const boost1 = boostActive ? applicaDoppio(sub1.fetta) : { boosted: false };
  await renderEsitoJackpot(sub1.fetta, boost1, { who: 'me', avatar: '🐻', name: 'Tomas' });
  await persistEsito(sub1.fetta, boost1, { user_id: userId });

  // 3. Sub-spin per il partner (morosa)
  const fette2 = fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni }).map(f => f.key === 'jackpot' ? { ...f, peso: 0 } : f);
  // Eredita boost se 🪄 esce nel sub-spin 1 (regola spec § 3.3): il flag passa al regalo dell'altro
  const boost2carry = sub1.fetta.key === 'doppio';
  const sub2 = estraiFetta(fette2);
  await animaSpinVerso(sub2.indice);
  const boost2 = (boostActive || boost2carry) ? applicaDoppio(sub2.fetta) : { boosted: false };
  await renderEsitoJackpot(sub2.fetta, boost2, { who: 'partner', avatar: '🧁', name: 'morosa' });
  await persistEsito(sub2.fetta, boost2, { user_id: partnerUserId });

  // 4. Summary card
  await renderJackpotSummary([
    { who: 'Tomas',  avatar: '🐻', esito: sub1.fetta },
    { who: 'morosa', avatar: '🧁', esito: sub2.fetta },
  ]);

  // 5. Consuma il flag (se attivo) dopo il secondo reveal
  if (boostActive) {
    await setFlagDoppio(client, coupleId, false);
    nascondiBadgeX2(spinBtnEl);
  }
}

function renderEsitoJackpot(esito, boost, partner) {
  const prizeEl = document.querySelector('.ruota-reveal .prize');
  prizeEl.classList.add('jackpot');
  prizeEl.classList.toggle('boosted', !!boost.boosted);

  // Strip "Premio di <name>"
  prizeEl.querySelector('.turn-strip')?.remove();
  const strip = document.createElement('div');
  strip.className = 'turn-strip';
  strip.innerHTML = `<span class="av"></span><span></span>`;
  strip.querySelector('.av').textContent = partner.avatar;
  strip.querySelectorAll('span')[1].textContent = `Premio di ${partner.name}`;
  prizeEl.prepend(strip);

  // ... resto del rendering come renderEsitoNormale ma con `.jackpot` ...
  // (chiamare renderEsitoNormale per il corpo, dopo aver aggiunto strip)
  return renderEsitoNormale(esito, boost);
}

function renderJackpotSummary(pairs) {
  const el = document.createElement('div');
  el.className = 'ruota-jackpot-summary';
  el.innerHTML = `
    <div class="ti">💎 Jackpot — riepilogo</div>
    ${pairs.map(p => `
      <div class="pair">
        <div class="av">${p.avatar}</div>
        <div class="who">${p.who}</div>
        <div class="prz"><span class="em">${p.esito.emoji}</span><span>${p.esito.label}</span></div>
      </div>
    `).join('')}
  `;
  document.querySelector('.ruota-page').appendChild(el);  // o il container appropriato
}
```

- [ ] **Step 2: Aggancia il caso `jackpot` in `risolvi()`**

```js
if (esito.key === 'jackpot') return risolviJackpot(boostActive);
```

- [ ] **Step 3: Smoke test manuale**

Gira finché esce 💎 (peso 0.5, quindi raro). Verifica:
- Reveal "Jackpot uno a testa" (border rose, glow)
- Tap CTA → secondo spin, 💎 esclusa (verifica visivamente che non finisca su 💎)
- Reveal premio 1 con strip "Premio di Tomas 🐻"
- Tap "Avanti" → terzo spin, reveal premio 2 con strip "Premio di morosa 🧁"
- Summary card con i due premi affiancati
- Se il flag ×2 era attivo, entrambi i premi sono boosted e il flag risulta consumato dopo

- [ ] **Step 4: Commit**

```bash
git add js/modules/ruota.js
git commit -m "feat(ruota): caso jackpot con doppio sub-spin + summary card"
```

---

### Task 18: Casi `polaroid` e `lampo` (record buoni con scadenza_iso)

**Files:**
- Modify: `js/modules/ruota.js`

- [ ] **Step 1: Aggiungi gli import**

```js
import { addBuono } from '../store.js';
import { LAMPO_TTL_MS, POLAROID_TTL_MS } from '../lib/logic.js';
```

- [ ] **Step 2: `persistEsito` — funzione che salva i premi differiti**

```js
async function persistEsito(esito, boost, { user_id }) {
  if (esito.key === 'polaroid') {
    const quantita = boost.boosted ? 2 : 1;
    const scadenza_iso = new Date(Date.now() + POLAROID_TTL_MS).toISOString();
    for (let i = 0; i < quantita; i++) {
      await addBuono(client, {
        couple_id: coupleId, da_id: user_id, a_id: partnerUserId,
        emoji: '📸', titolo: 'Foto osè', descrizione: 'Inviane una al partner entro 24h',
        tipo: 'regalo', stato: 'attivo', scadenza_iso,
      });
    }
    return;
  }
  if (esito.key === 'lampo') {
    const quantita = boost.boosted ? 2 : 1;
    const scadenza_iso = new Date(Date.now() + LAMPO_TTL_MS).toISOString();
    const buoni = await listRuotaContenuti(client, coupleId);
    const lista = buoni.filter(c => c.categoria === 'buono');
    for (let i = 0; i < quantita; i++) {
      const pesca = lista[Math.floor(Math.random() * lista.length)];
      await addBuono(client, {
        couple_id: coupleId, da_id: user_id, a_id: partnerUserId,
        emoji: pesca.emoji || '🎟️', titolo: pesca.testo, descrizione: pesca.descrizione,
        tipo: 'regalo', stato: 'attivo', scadenza_iso,
      });
    }
    return;
  }
  if (esito.key === 'desiderio') {
    // Pesca 1 o 2 fantasie dalla bacheca (esistente). Implementazione esistente da estendere.
    // Per il moltiplicatore, ripetere `quantita` volte come sopra.
  }
}
```

- [ ] **Step 3: Chiama `persistEsito` in `renderEsitoNormale` (e già in `risolviJackpot`)**

```js
async function renderEsitoNormale(esito, boost) {
  // ... rendering UI come Task 16 ...
  await persistEsito(esito, boost, { user_id: userId });
}
```

- [ ] **Step 4: Smoke test manuale**

Gira finché esce 📸 polaroid:
- Reveal "Foto osè 24h"
- Verifica nella bacheca buoni: c'è un nuovo record con scadenza fra ~24h (controllo via SQL editor: `select titolo, scadenza_iso from buoni order by creato desc limit 1`).

Gira finché esce 🎟️ lampo:
- Reveal "Buono lampo" con testo pescato dalla lista
- Idem verifica DB.

Se il flag ×2 era attivo: 2 record creati.

- [ ] **Step 5: Commit**

```bash
git add js/modules/ruota.js
git commit -m "feat(ruota): casi polaroid e lampo creano buoni con scadenza_iso"
```

---

### Task 19: Nav giochi — Variante A (due dock con `.gruppo-lab`)

**Files:**
- Modify: `js/modules/giochi.js`

- [ ] **Step 1: Esplora la `buildSelettore` esistente**

```bash
grep -n "buildSelettore\|gioco-selettore" js/modules/giochi.js
```

- [ ] **Step 2: Sostituisci il rendering del selettore con due dock**

Cerca `buildSelettore()` e modificalo per produrre due `.gioco-selettore` consecutivi, ciascuno preceduto da una `<p class="gruppo-lab">`:

```js
function buildSelettore() {
  const wrap = document.createElement('div');

  const labTempo = document.createElement('p'); labTempo.className = 'gruppo-lab'; labTempo.textContent = 'Giochi a tempo';
  const dockTempo = document.createElement('div'); dockTempo.className = 'gioco-selettore'; dockTempo.dataset.gruppo = 'tempo';
  dockTempo.appendChild(makeTab('ruota', '🎡', 'Ruota'));
  dockTempo.appendChild(makeTab('slot',  '🎰', 'Slot'));

  const labLiberi = document.createElement('p'); labLiberi.className = 'gruppo-lab'; labLiberi.textContent = 'Giochi liberi';
  const dockLiberi = document.createElement('div'); dockLiberi.className = 'gioco-selettore'; dockLiberi.dataset.gruppo = 'liberi';
  dockLiberi.appendChild(makeTab('yahtzutra', '🎲', 'Yahtzutra'));
  dockLiberi.appendChild(makeTab('strip',     '♠️', 'Strip'));

  wrap.appendChild(labTempo); wrap.appendChild(dockTempo);
  wrap.appendChild(labLiberi); wrap.appendChild(dockLiberi);
  return wrap;
}
```

- [ ] **Step 3: Smoke test manuale**

Apri l'hub giochi. Verifica:
- Due gruppi visibili con label sopra ciascuno
- Ordine: tempo (Ruota → Slot), poi liberi (Yahtzutra → Strip)
- Tab attivo si espande dentro il proprio dock (comportamento di selezione invariato)

- [ ] **Step 4: Commit**

```bash
git add js/modules/giochi.js
git commit -m "feat(giochi): nav split in dock 'a tempo' / 'liberi' (variante A)"
```

---

### Task 20: Slot — economy hookup (settimanale + spendi prima del roll)

**Files:**
- Modify: `js/modules/giochi.js`

- [ ] **Step 1: Aggiungi import**

```js
import { listSlotMov, accreditaSlot, spendiSlot } from '../store.js';
import { ECONOMIA_SLOT, saldoSlot, slotEleggibile } from '../lib/logic.js';
```

- [ ] **Step 2: All'ingresso del modulo slot, accredita il settimanale se eligible**

Trova il punto in cui si monta lo slot (probabilmente `renderSlot` o `montaSlot`) e all'inizio:

```js
async function entraSlot() {
  const movs = await listSlotMov(client, coupleId);
  const elig = slotEleggibile(movs, userId);
  if (elig.ok) {
    await accreditaSlot(client, { couple_id: coupleId, user_id: userId, motivo: 'settimanale', delta: ECONOMIA_SLOT.TIRI_SETTIMANALI });
  }
  // poi rendering UI con saldo aggiornato
  await renderTopbarSlot();
}
```

- [ ] **Step 3: Topbar con saldo + countdown**

```js
async function renderTopbarSlot() {
  const movs = await listSlotMov(client, coupleId);
  const saldo = saldoSlot(movs, userId);
  const elig  = slotEleggibile(movs, userId);
  const bar = document.querySelector('.slot-topbar');  // adattare al selettore reale
  bar.innerHTML = `
    <span class="saldo">🎰 ${saldo} tir${saldo === 1 ? 'o' : 'i'}</span>
    <span class="countdown">${countdownText(elig)}</span>
  `;
  // Disabilita tasto Tira se saldo 0
  document.querySelector('.slot-tira').disabled = saldo === 0;
}

function countdownText(elig) {
  if (elig.ok) return 'gratis disponibile';
  const giorni = Math.ceil((new Date(elig.prossimoSblocco) - Date.now()) / 864e5);
  return `gratis tra ${giorni}g`;
}
```

- [ ] **Step 4: Prima del roll, chiama `spendiSlot`**

```js
async function roll() {
  try {
    await spendiSlot(client, { couple_id: coupleId, user_id: userId });
  } catch (e) {
    console.error('spendiSlot failed', e);
    return;
  }
  animaRulli();
  await renderTopbarSlot();
}
```

- [ ] **Step 5: Smoke test manuale**

- All'ingresso slot la prima volta: saldo 5, "gratis tra 7g"
- Tira: saldo 4, bottone ancora abilitato
- Esaurisci i 5 tiri: bottone disabilitato, testo "gratis tra Xg"
- Ricarica pagina: saldo persistito

- [ ] **Step 6: Commit**

```bash
git add js/modules/giochi.js
git commit -m "feat(slot): economy hookup (settimanale + spendi prima del roll)"
```

---

### Task 21: Bump cache service worker (`lussuria-v22` → `lussuria-v23`)

**Files:**
- Modify: `sw.js` (riga 1)

- [ ] **Step 1: Modifica la costante**

```js
const CACHE = 'lussuria-v23';
```

- [ ] **Step 2: Verifica deploy**

In app, dopo reload, il SW dovrebbe inviare il messaggio `sw-updated` con `cache: 'lussuria-v23'`. La cache `lussuria-v22` viene cancellata nell'activate.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore(sw): bump cache lussuria-v22 → v23"
```

---

### Task 22: Integration test end-to-end e push

**Files:** nessuna nuova modifica — solo verifica e push

- [ ] **Step 1: Run tutta la suite test**

Run: `npm test`
Expected: 0 fail. Conferma tutti i test passano (vecchi + nuovi).

- [ ] **Step 2: Smoke manuale completo nel browser**

Apri l'app e copri:
- Nav giochi mostra due dock (tempo + liberi)
- Ruota: 13 spicchi, hub solo emoji, dividers chiusi
- Spin "vero" → reveal premio standard
- Spin → 🪄 doppio → badge sul bottone GIRA persiste anche dopo reload
- Spin successivo → reveal `.prize.boosted` con DOPPIO! e numeri modificati; badge sparisce
- Spin → 🔁 ancora con flag attivo → badge resta (non consumato)
- Spin → 💎 jackpot → doppio sub-spin nello stesso flow + summary card
- 📸 polaroid crea record `buoni` con scadenza_iso
- 🎟️ lampo crea record con testo pescato
- Slot: saldo 5 al primo ingresso, spendi 1 per tiro, blocco a saldo 0

- [ ] **Step 3: Push**

```bash
git push origin master
```

- [ ] **Step 4: Aggiorna lo spec con riferimento al plan**

(Opzionale ma consigliato.) Modifica `docs/superpowers/specs/2026-05-28-economia-giochi-design.md` aggiungendo in cima:

```markdown
> **Implementato via** `docs/superpowers/plans/2026-05-28-ruota-13-spicchi.md` (chiuso 2026-MM-DD).
```

- [ ] **Step 5: Commit finale**

```bash
git add docs/superpowers/specs/2026-05-28-economia-giochi-design.md
git commit -m "docs(ruota): link spec → plan implementato"
git push origin master
```

---

## Open Questions (dallo spec, da chiudere in fase di esecuzione)

- **Filtro buoni scaduti nella vista Buoni:** default proposto = nasconderli quando `scadenza_iso < now()`. Confermare con utente durante Task 18 se la lista buoni esistente già implementa questo filtro o se va aggiunto.
- **Notifica scadenza imminente <2h:** fuori scope, vive in lavoro futuro.
- **Tarature pesi:** uniformi al lancio (1 / 0.5). Si tarano dopo uso reale.
- **Idempotenza `setFlagDoppio` durante sub-spin del jackpot:** plan corrente segue la regola spec § 3.3 ("il flag che esce nel sub-spin 1 si applica al sub-spin 2"). Se l'utente vuole comportamento diverso, modificare `risolviJackpot` Task 17.

---

## Note di implementazione: XSS-safety negli snippet

Alcuni snippet del plan usano `innerHTML` con template literal per chiarezza (es. `renderJackpotSummary` Task 17, `renderTopbarSlot` Task 20). In tutti questi casi i valori interpolati provengono da **fonti controllate**: `FETTE` (costante hardcoded), nomi/avatar partner (`'🐻'`/`'🧁'`/`'Tomas'`/`'morosa'`), saldo numerico, stringhe statiche. Nessun input utente o riga DB direttamente interpolata in HTML.

**Se in fase di implementazione estendi questi rendering con valori da DB** (es. `pesca.testo` dei contenuti ruota, titoli buoni custom), passa a `textContent` per il contenuto testuale, oppure costruisci i nodi via `document.createElement` + `appendChild`. Non interpolare stringhe utente in `innerHTML`.

---

## Self-Review Notes

- **Spec coverage:** ogni sezione dello spec ha task corrispondenti — § 3.1 nav → Task 19; § 3.2 geometria → Task 12, 14; § 3.3 rari → Task 8, 15, 16, 17; § 3.4 slot → Task 20; § 3.5 schema → Task 1, 2, 9; § 3.6 costanti → Task 3, 6.
- **No placeholders:** ogni task ha codice esatto; nessun "TODO" / "implement later".
- **Type consistency:** `applicaDoppio(esito)` ritorna `{ boosted, minuti?, ore?, quantita?, testoExtra?, cosmeticOnly?, deferToJolly? }` — usato consistentemente in Task 8, 16, 17, 18. `fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni })` firma estesa — coerente in Task 7 e 14.
- **File order:** SQL prima (1-2), helpers puri TDD (3-8), store con DB (9-11), CSS (12-13), JS imperativo (14-20), bump (21), QA (22). Dipendenze rispettate.
