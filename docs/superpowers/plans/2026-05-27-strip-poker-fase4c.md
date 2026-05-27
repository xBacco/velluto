# Strip Poker (Fase 4c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere lo Strip Poker come terzo gioco della tab "Giochi": due modalità (Texas Hold'em e Draw poker) con passa-il-telefono, avatar SVG acquerello che si spogliano, storico testa-a-testa persistito su Supabase.

**Architecture:** La logica pura (motore poker + state machine del guardaroba) vive in `js/lib/logic.js` ed è coperta da unit test deterministici (`rnd` iniettabile). Il modulo di rendering `js/modules/strip.js` porta il controller del mockup approvato `strip-poker-final3.html`, usa gli helper `ui.js` (`mk/add/clear/toast`) e legge/scrive lo storico via `store.js`. Lo stato della partita (mano corrente, guardaroba residuo) resta **solo in memoria**; si persiste solo l'esito in `strip_partite`. La tab "Giochi" (`giochi.js`) guadagna una terza scheda che delega a `renderStrip`.

**Tech Stack:** Vanilla ES modules, Supabase JS client, `node:test` per gli unit test, SVG inline per gli avatar. Nessuna dipendenza nuova.

**Mockup di riferimento (nel repo):** `.superpowers/brainstorm/12256-1779803591/content/strip-poker-final3.html` — implementazione mono-file funzionante da cui portare motore poker, avatar SVG e flusso. Le righe citate sotto si riferiscono a questo file.

**Decisioni bloccate (sessione 2026-05-27):**
- Guardaroba **simmetrico, 13 capi a testa**, dal più esterno al più intimo: `cappello, occhiali, sciarpa, giacca, felpa, maglietta, [gonna(Lei) | pantaloncini(Lui)], scarpe ×2, calzini ×2, mutande, [reggiseno(Lei) | canottiera(Lui)]`. Scarpe e calzini contano 2 e si tolgono uno alla volta. **Niente** autoreggenti, niente pantaloni lunghi, niente cintura/canotta. Questa lista **sostituisce** sia lo spec §3.4.4 sia il catalogo `CAT` del mockup.
- Avatar in stile acquerello + inchiostro (geometria SVG corpo pieno da `strip-poker-final3.html`, derivata da `strip-avatar-styles-3.html`).
- Modalità: Texas Hold'em + Draw poker. **Mano più bassa perde un capo.**

**Convenzioni del codebase (verificate):**
- `js/lib/logic.js`: funzioni pure, `export function`, `rnd = Math.random` iniettabile.
- `js/store.js`: ogni funzione riceve `client` come primo argomento, usa l'helper `check({data,error})`, lancia eccezioni (niente fallimenti silenziosi).
- `js/ui.js`: `mk(tag, cls, txt)`, `add(parent, ...kids)`, `clear(node)`, `toast(msg, kind)`, `openSheet(title, buildBody)`. Lo scroll-lock dello sfondo è centralizzato in `ui.js` su `.modal`/`.dadi-scrim` → gli overlay dello strip useranno la classe `.dadi-scrim` oppure `.modal` per ereditare il lock.
- `js/modules/giochi.js`: selettore `giocoCorrente`, monta nel `.gioco-host`, wiring `fab:giochi` una volta sola.
- Palette CSS (`styles.css` `:root`): `--bg #160409`, `--bg2 #2a0813`, `--wine #5c1026`, `--wine2 #7a1533`, `--gold #d4a86c`, `--gold-soft #e9c98f`, `--cream #f3d9b0`, `--rose #c2557a`. (Il mockup usa `--oro/--crema/--bg1`: rimappare a questi.)
- RLS Supabase: helper `is_member(couple_id)` (vedi `supabase/giri.sql`).
- Test: file dedicato per dominio (`test/dadi.test.js`, `test/ruota.test.js`) → creare `test/strip.test.js`. I test dello store si aggiungono a `test/store.test.js`.
- Comando test: `node --test` dalla root del repo.

---

## File Structure

| File | Stato | Responsabilità |
|------|-------|----------------|
| `supabase/strip.sql` | Create | Tabella `strip_partite` + indice + RLS. Da eseguire a mano nel SQL Editor. |
| `js/lib/logic.js` | Modify | Aggiungere motore poker puro, `GUARDAROBA`, state machine guardaroba, `testaATesta`. |
| `js/store.js` | Modify | Aggiungere `listStripPartite`, `addStripPartita`. |
| `js/modules/strip.js` | Create | Modulo di rendering Strip Poker: apertura+testa-a-testa, setup guardaroba, mano (draw/holdem), avatar, spogliarello, salvataggio esito. |
| `js/modules/giochi.js` | Modify | Aggiungere la scheda `strip` al selettore e delegare a `renderStrip`. |
| `styles.css` | Modify | Blocco CSS namespaced `.strip-*` portato dal mockup, rimappato alla palette dell'app. |
| `test/strip.test.js` | Create | Unit test motore poker + state machine guardaroba + `testaATesta`. |
| `test/store.test.js` | Modify | Unit test `listStripPartite`/`addStripPartita`. |

`app.js` **non va toccato**: il ramo `else if (cur === 'giochi') renderGiochi(...)`, l'import e il pannello `#p-giochi` esistono già.

---

## Task 1: Migrazione DB `strip_partite`

**Files:**
- Create: `supabase/strip.sql`

- [ ] **Step 1: Creare il file di migrazione**

Create `supabase/strip.sql`:

```sql
-- Strip Poker (Fase 4c). Eseguire nel SQL Editor di Supabase.
-- Persiste solo l'ESITO delle partite; lo stato di gioco vive in memoria.

create table if not exists strip_partite (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples(id),
  vincitore_id uuid not null references auth.users(id),
  perdente_id  uuid not null references auth.users(id),
  modalita     text not null check (modalita in ('draw','holdem')),
  creato       timestamptz not null default now()
);
create index if not exists strip_partite_idx on strip_partite (couple_id, creato desc);

alter table strip_partite enable row level security;
create policy strip_partite_all on strip_partite
  for all using (is_member(couple_id)) with check (is_member(couple_id));
```

- [ ] **Step 2: Eseguire la migrazione su Supabase**

Aprire il SQL Editor del progetto Supabase, incollare il contenuto di `supabase/strip.sql`, eseguire. Verificare che la tabella `strip_partite` compaia in Table Editor con RLS abilitato.
Nota: passo manuale (non automatizzabile da test). Annotare nel commit che la migrazione va applicata a mano.

- [ ] **Step 3: Commit**

```bash
git add supabase/strip.sql
git commit -m "feat(strip): migrazione strip_partite + RLS"
```

---

## Task 2: Motore poker puro in `logic.js`

**Files:**
- Modify: `js/lib/logic.js` (in coda al file)
- Test: `test/strip.test.js`

- [ ] **Step 1: Scrivere i test del motore poker**

Create `test/strip.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mazzo52, mescola, valutaMano, miglioreManoDa7, confronta,
} from '../js/lib/logic.js';

// helper: costruisce una carta {r,s}. r 2..14, s 0..3 (0=picche,1=cuori,2=quadri,3=fiori)
const C = (r, s) => ({ r, s });

test('mazzo52 ha 52 carte uniche', () => {
  const d = mazzo52();
  assert.equal(d.length, 52);
  const chiavi = new Set(d.map(c => c.r + '-' + c.s));
  assert.equal(chiavi.size, 52);
});

test('mescola non muta il mazzo originale ed è deterministico con rnd iniettato', () => {
  const d = mazzo52();
  const copia = [...d];
  const rnd = () => 0; // sceglie sempre l'indice 0 in Fisher-Yates
  const m = mescola(d, rnd);
  assert.deepEqual(d, copia, 'originale non mutato');
  assert.equal(m.length, 52);
  // con rnd costante il risultato è riproducibile
  assert.deepEqual(mescola(mazzo52(), rnd), m);
});

test('valutaMano riconosce le categorie', () => {
  // scala reale di picche
  assert.equal(valutaMano([C(14,0),C(13,0),C(12,0),C(11,0),C(10,0)]).categoria, 8);
  // poker di K
  assert.equal(valutaMano([C(13,0),C(13,1),C(13,2),C(13,3),C(2,0)]).categoria, 7);
  // full (3xK + 2xQ)
  assert.equal(valutaMano([C(13,0),C(13,1),C(13,2),C(12,0),C(12,1)]).categoria, 6);
  // colore
  assert.equal(valutaMano([C(2,0),C(5,0),C(9,0),C(11,0),C(13,0)]).categoria, 5);
  // scala (anche A-2-3-4-5)
  assert.equal(valutaMano([C(14,0),C(5,1),C(4,2),C(3,3),C(2,0)]).categoria, 4);
  // tris
  assert.equal(valutaMano([C(7,0),C(7,1),C(7,2),C(2,3),C(9,0)]).categoria, 3);
  // doppia coppia
  assert.equal(valutaMano([C(7,0),C(7,1),C(9,2),C(9,3),C(2,0)]).categoria, 2);
  // coppia
  assert.equal(valutaMano([C(7,0),C(7,1),C(3,2),C(9,3),C(2,0)]).categoria, 1);
  // carta alta
  assert.equal(valutaMano([C(2,0),C(5,1),C(9,2),C(11,3),C(13,0)]).categoria, 0);
});

test('confronta: scala batte tris; full batte colore; poker batte full', () => {
  const scala = valutaMano([C(6,0),C(5,1),C(4,2),C(3,3),C(2,0)]);
  const tris = valutaMano([C(14,0),C(14,1),C(14,2),C(2,3),C(3,0)]);
  assert.ok(confronta(scala, tris) > 0);

  const full = valutaMano([C(13,0),C(13,1),C(13,2),C(12,0),C(12,1)]);
  const colore = valutaMano([C(2,0),C(5,0),C(9,0),C(11,0),C(14,0)]);
  assert.ok(confronta(full, colore) > 0);

  const poker = valutaMano([C(13,0),C(13,1),C(13,2),C(13,3),C(2,0)]);
  assert.ok(confronta(poker, full) > 0);
});

test('confronta: coppia più alta vince; tie-break sui kicker; parità reale = 0', () => {
  const coppiaK = valutaMano([C(13,0),C(13,1),C(3,2),C(9,3),C(2,0)]);
  const coppia7 = valutaMano([C(7,0),C(7,1),C(3,2),C(9,3),C(2,0)]);
  assert.ok(confronta(coppiaK, coppia7) > 0);

  const a = valutaMano([C(7,0),C(7,1),C(13,2),C(9,3),C(2,0)]);
  const b = valutaMano([C(7,2),C(7,3),C(12,2),C(9,0),C(2,1)]); // kicker K vs Q
  assert.ok(confronta(a, b) > 0);

  const x = valutaMano([C(7,0),C(7,1),C(13,2),C(9,3),C(2,0)]);
  const y = valutaMano([C(7,2),C(7,3),C(13,0),C(9,1),C(2,2)]);
  assert.equal(confronta(x, y), 0);
});

test('miglioreManoDa7 sceglie la migliore mano da 5 su 7 (Hold\'em)', () => {
  // 7 carte: due hole + 5 board → contengono un colore di cuori
  const sette = [C(14,1),C(13,1),C(2,0),C(9,1),C(4,1),C(7,1),C(3,3)];
  const best = miglioreManoDa7(sette);
  assert.equal(best.categoria, 5); // colore
  assert.equal(best.carte.length, 5);
  assert.ok(best.carte.every(c => c.s === 1));
});
```

- [ ] **Step 2: Eseguire i test e verificarne il fallimento**

Run: `node --test test/strip.test.js`
Expected: FAIL — `mazzo52`/`mescola`/`valutaMano`/`miglioreManoDa7`/`confronta` non esportate (SyntaxError o "is not a function").

- [ ] **Step 3: Implementare il motore poker in `logic.js`**

Aggiungere in coda a `js/lib/logic.js`:

```js
// ============================================================================
// STRIP POKER (Fase 4c) — motore poker puro
// Carta: { r, s } con r 2..14 (11=J,12=Q,13=K,14=A), s 0..3 (0♠ 1♥ 2♦ 3♣).
// ============================================================================

export const CATEGORIE_POKER = [
  'Carta alta', 'Coppia', 'Doppia coppia', 'Tris', 'Scala', 'Colore', 'Full', 'Poker', 'Scala colore',
];

export function mazzo52() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  return d;
}

// Fisher-Yates puro: non muta `deck`. `rnd` iniettabile per test deterministici.
export function mescola(deck, rnd = Math.random) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
}

// Valuta 5 carte → { categoria (0..8), tieBreakers: [int...] }.
export function valutaMano(carte5) {
  const rs = carte5.map(c => c.r).sort((a, b) => b - a);
  const flush = carte5.every(c => c.s === carte5[0].s);
  const uniq = rs.filter((v, i) => rs.indexOf(v) === i);
  let straight = false, hi = rs[0];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { straight = true; hi = uniq[0]; }
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) { straight = true; hi = 5; } // A-2-3-4-5
  }
  const cnt = {}; rs.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
  const groups = Object.keys(cnt).map(r => [cnt[r], +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const counts = groups.map(g => g[0]);
  const ordered = groups.map(g => g[1]);
  let categoria, tieBreakers;
  if (straight && flush) { categoria = 8; tieBreakers = [hi]; }
  else if (counts[0] === 4) { categoria = 7; tieBreakers = ordered; }
  else if (counts[0] === 3 && counts[1] === 2) { categoria = 6; tieBreakers = ordered; }
  else if (flush) { categoria = 5; tieBreakers = rs; }
  else if (straight) { categoria = 4; tieBreakers = [hi]; }
  else if (counts[0] === 3) { categoria = 3; tieBreakers = ordered; }
  else if (counts[0] === 2 && counts[1] === 2) { categoria = 2; tieBreakers = ordered; }
  else if (counts[0] === 2) { categoria = 1; tieBreakers = ordered; }
  else { categoria = 0; tieBreakers = rs; }
  return { categoria, tieBreakers };
}

// >0 se A è più forte, <0 se B è più forte, 0 parità. (La mano più bassa perde un capo.)
export function confronta(a, b) {
  const va = [a.categoria, ...a.tieBreakers];
  const vb = [b.categoria, ...b.tieBreakers];
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const x = va[i] || 0, y = vb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function combinazioni5(carte) {
  const r = [], n = carte.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++)
      r.push([carte[a], carte[b], carte[c], carte[d], carte[e]]);
  return r;
}

// Migliore mano da 5 su 7 (per Hold'em). Ritorna { categoria, tieBreakers, carte:[5] }.
export function miglioreManoDa7(carte7) {
  let best = null, bestCarte = null;
  for (const combo of combinazioni5(carte7)) {
    const v = valutaMano(combo);
    if (!best || confronta(v, best) > 0) { best = v; bestCarte = combo; }
  }
  return { categoria: best.categoria, tieBreakers: best.tieBreakers, carte: bestCarte };
}
```

- [ ] **Step 4: Eseguire i test e verificarne il passaggio**

Run: `node --test test/strip.test.js`
Expected: PASS (tutti i test del motore poker verdi).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/strip.test.js
git commit -m "feat(strip): motore poker puro in logic.js + test"
```

---

## Task 3: Guardaroba + state machine in `logic.js`

**Files:**
- Modify: `js/lib/logic.js` (in coda)
- Test: `test/strip.test.js` (aggiunta)

- [ ] **Step 1: Scrivere i test della state machine**

Aggiungere in coda a `test/strip.test.js`:

```js
import {
  GUARDAROBA, capiIniziali, statoInizialePartita, togliCapo, eNudo, risultatoPartita,
} from '../js/lib/logic.js';

test('capiIniziali: 13 capi a testa, simmetrici per conteggio', () => {
  const conta = lista => lista.reduce((n, c) => n + c.qty, 0);
  assert.equal(conta(capiIniziali('lui')), 13);
  assert.equal(conta(capiIniziali('lei')), 13);
});

test('capiIniziali: Lei ha gonna+reggiseno, Lui ha pantaloncini+canottiera; niente autoreggenti', () => {
  const lei = capiIniziali('lei').map(c => c.k);
  const lui = capiIniziali('lui').map(c => c.k);
  assert.ok(lei.includes('gonna') && lei.includes('reggiseno'));
  assert.ok(!lei.includes('pantaloncini') && !lei.includes('canottiera'));
  assert.ok(lui.includes('pantaloncini') && lui.includes('canottiera'));
  assert.ok(!lui.includes('gonna') && !lui.includes('reggiseno'));
  assert.ok(!lei.includes('autoreggenti') && !lui.includes('autoreggenti'));
});

test('capiIniziali: ordine dal più esterno (cappello) al più intimo (intimo)', () => {
  const lui = capiIniziali('lui').map(c => c.k);
  assert.equal(lui[0], 'cappello');
  assert.equal(lui[lui.length - 1], 'canottiera');
});

test('scarpe e calzini hanno qty 2', () => {
  const m = Object.fromEntries(capiIniziali('lui').map(c => [c.k, c.qty]));
  assert.equal(m.scarpe, 2);
  assert.equal(m.calzini, 2);
  assert.equal(m.cappello, 1);
});

test('togliCapo decrementa la quantità e non muta lo stato in ingresso', () => {
  const s0 = statoInizialePartita();
  const s1 = togliCapo(s0, 'lui', 'scarpe');
  assert.equal(s0.lui.scarpe, 2, 'originale intatto');
  assert.equal(s1.lui.scarpe, 1);
  const s2 = togliCapo(s1, 'lui', 'scarpe');
  assert.equal(s2.lui.scarpe, undefined, 'a 0 la chiave sparisce');
});

test('eNudo vero solo quando tutti i capi sono stati tolti', () => {
  let s = statoInizialePartita();
  assert.equal(eNudo(s, 'lei'), false);
  for (const c of capiIniziali('lei')) {
    for (let i = 0; i < c.qty; i++) s = togliCapo(s, 'lei', c.k);
  }
  assert.equal(eNudo(s, 'lei'), true);
  assert.equal(eNudo(s, 'lui'), false);
});

test('risultatoPartita: chi resta nudo perde, l\'altro vince; null se nessuno è nudo', () => {
  let s = statoInizialePartita();
  assert.equal(risultatoPartita(s), null);
  for (const c of capiIniziali('lui')) {
    for (let i = 0; i < c.qty; i++) s = togliCapo(s, 'lui', c.k);
  }
  assert.deepEqual(risultatoPartita(s), { vincitore: 'lei', perdente: 'lui' });
});
```

- [ ] **Step 2: Eseguire i test e verificarne il fallimento**

Run: `node --test test/strip.test.js`
Expected: FAIL — `GUARDAROBA`/`capiIniziali`/`statoInizialePartita`/`togliCapo`/`eNudo`/`risultatoPartita` non esportate.

- [ ] **Step 3: Implementare guardaroba e state machine in `logic.js`**

Aggiungere in coda a `js/lib/logic.js`:

```js
// ============================================================================
// STRIP POKER — guardaroba e state machine (pura)
// Lista simmetrica: 13 capi a testa. Differenze per sesso solo su capo "sotto"
// (gonna/pantaloncini) e intimo (reggiseno/canottiera). Ordine = dal più esterno
// al più intimo (ordine in cui si tolgono). via:'avatar' = si tocca la zona del
// corpo; via:'chip' = chip a lato (scarpe/calzini, qty 2).
// ============================================================================

export const GUARDAROBA = [
  { k: 'cappello',   n: 'Cappello',   e: '🎩', gruppo: 'Testa',  qty: 1, via: 'avatar', zona: 'head' },
  { k: 'occhiali',   n: 'Occhiali',   e: '🕶️', gruppo: 'Testa',  qty: 1, via: 'avatar', acc: 'occhiali' },
  { k: 'sciarpa',    n: 'Sciarpa',    e: '🧣', gruppo: 'Testa',  qty: 1, via: 'avatar', acc: 'sciarpa' },
  { k: 'giacca',     n: 'Giacca',     e: '🧥', gruppo: 'Sopra',  qty: 1, via: 'avatar', zona: 'torso' },
  { k: 'felpa',      n: 'Felpa',      e: '🧶', gruppo: 'Sopra',  qty: 1, via: 'avatar', zona: 'torso' },
  { k: 'maglietta',  n: 'Maglietta',  e: '👕', gruppo: 'Sopra',  qty: 1, via: 'avatar', zona: 'torso' },
  { k: 'gonna',      n: 'Gonna',      e: '👗', gruppo: 'Sotto',  qty: 1, via: 'avatar', zona: 'legs', sesso: 'lei' },
  { k: 'pantaloncini', n: 'Pantaloncini', e: '🩳', gruppo: 'Sotto', qty: 1, via: 'avatar', zona: 'legs', sesso: 'lui' },
  { k: 'scarpe',     n: 'Scarpe',     e: '👟', gruppo: 'Piedi',  qty: 2, via: 'chip' },
  { k: 'calzini',    n: 'Calzini',    e: '🧦', gruppo: 'Piedi',  qty: 2, via: 'chip' },
  { k: 'mutande',    n: 'Mutande',    e: '🩲', gruppo: 'Intimo', qty: 1, via: 'avatar', zona: 'pelvis' },
  { k: 'reggiseno',  n: 'Reggiseno',  e: '👙', gruppo: 'Intimo', qty: 1, via: 'avatar', zona: 'torso', sesso: 'lei' },
  { k: 'canottiera', n: 'Canottiera', e: '🦺', gruppo: 'Intimo', qty: 1, via: 'avatar', zona: 'torso', sesso: 'lui' },
];

export const GUARDAROBA_META = Object.fromEntries(GUARDAROBA.map(c => [c.k, c]));

// Capi iniziali per sesso ('lui' | 'lei'), nell'ordine in cui si tolgono.
export function capiIniziali(sesso) {
  return GUARDAROBA
    .filter(c => !c.sesso || c.sesso === sesso)
    .map(c => ({ k: c.k, qty: c.qty }));
}

// Stato completo della partita: residuo capi per persona.
export function statoInizialePartita() {
  const build = sesso => {
    const o = {};
    for (const c of capiIniziali(sesso)) o[c.k] = c.qty;
    return o;
  };
  return { lui: build('lui'), lei: build('lei') };
}

// Toglie un capo a `persona` ('lui'|'lei'). Ritorna NUOVO stato (immutabile).
export function togliCapo(stato, persona, capoId) {
  const cur = stato[persona];
  if (!cur || !cur[capoId]) return stato;
  const next = { ...cur, [capoId]: cur[capoId] - 1 };
  if (next[capoId] <= 0) delete next[capoId];
  return { ...stato, [persona]: next };
}

export function eNudo(stato, persona) {
  const cur = stato[persona] || {};
  return Object.values(cur).reduce((a, b) => a + b, 0) === 0;
}

// { vincitore, perdente } se uno è nudo, altrimenti null.
export function risultatoPartita(stato) {
  if (eNudo(stato, 'lui')) return { vincitore: 'lei', perdente: 'lui' };
  if (eNudo(stato, 'lei')) return { vincitore: 'lui', perdente: 'lei' };
  return null;
}
```

- [ ] **Step 4: Eseguire i test e verificarne il passaggio**

Run: `node --test test/strip.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/strip.test.js
git commit -m "feat(strip): guardaroba + state machine pura in logic.js"
```

---

## Task 4: `testaATesta` in `logic.js`

**Files:**
- Modify: `js/lib/logic.js` (in coda)
- Test: `test/strip.test.js` (aggiunta)

- [ ] **Step 1: Scrivere il test**

Aggiungere in coda a `test/strip.test.js`:

```js
import { testaATesta } from '../js/lib/logic.js';

test('testaATesta conta le vittorie per me e per il partner', () => {
  const partite = [
    { vincitore_id: 'u1', perdente_id: 'u2' },
    { vincitore_id: 'u2', perdente_id: 'u1' },
    { vincitore_id: 'u1', perdente_id: 'u2' },
  ];
  assert.deepEqual(testaATesta(partite, 'u1', 'u2'), { mie: 2, sue: 1 });
  assert.deepEqual(testaATesta([], 'u1', 'u2'), { mie: 0, sue: 0 });
});
```

- [ ] **Step 2: Eseguire il test e verificarne il fallimento**

Run: `node --test test/strip.test.js`
Expected: FAIL — `testaATesta` non esportata.

- [ ] **Step 3: Implementare `testaATesta`**

Aggiungere in coda a `js/lib/logic.js`:

```js
// Conteggio testa-a-testa per la schermata d'apertura.
export function testaATesta(partite, me, partner) {
  let mie = 0, sue = 0;
  for (const p of partite) {
    if (p.vincitore_id === me) mie++;
    else if (p.vincitore_id === partner) sue++;
  }
  return { mie, sue };
}
```

- [ ] **Step 4: Eseguire il test e verificarne il passaggio**

Run: `node --test test/strip.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/strip.test.js
git commit -m "feat(strip): testaATesta in logic.js"
```

---

## Task 5: Funzioni store `strip_partite`

**Files:**
- Modify: `js/store.js` (in coda, prima della sezione RUOTA contenuti se presente; comunque in fondo va bene)
- Test: `test/store.test.js` (aggiunta)

- [ ] **Step 1: Scrivere i test dello store**

Aggiungere in coda a `test/store.test.js` (riusa `fakeClient` già definito in cima al file):

```js
import { listStripPartite, addStripPartita } from '../js/store.js';

test('listStripPartite seleziona per couple_id', async () => {
  const c = fakeClient([
    { id: 'a', couple_id: 'cpl', vincitore_id: 'u1', perdente_id: 'u2', modalita: 'draw' },
    { id: 'z', couple_id: 'altra', vincitore_id: 'u3', perdente_id: 'u4', modalita: 'holdem' },
  ]);
  const data = await listStripPartite(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'a');
  assert.equal(c._calls[0].table, 'strip_partite');
});

test('addStripPartita inserisce esito con couple_id, vincitore, perdente, modalita', async () => {
  const c = fakeClient([]);
  await addStripPartita(c, { couple_id: 'cpl', vincitore_id: 'u1', perdente_id: 'u2', modalita: 'holdem' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.ok(ins);
  assert.equal(ins.table, 'strip_partite');
  assert.equal(ins.payload.couple_id, 'cpl');
  assert.equal(ins.payload.vincitore_id, 'u1');
  assert.equal(ins.payload.perdente_id, 'u2');
  assert.equal(ins.payload.modalita, 'holdem');
});
```

- [ ] **Step 2: Eseguire i test e verificarne il fallimento**

Run: `node --test test/store.test.js`
Expected: FAIL — `listStripPartite`/`addStripPartita` non esportate.

- [ ] **Step 3: Implementare le funzioni store**

Aggiungere in coda a `js/store.js`:

```js
// ---- STRIP POKER ----
export async function listStripPartite(client, coupleId) {
  const res = await client.from('strip_partite').select('*').eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addStripPartita(client, { couple_id, vincitore_id, perdente_id, modalita }) {
  const res = await client.from('strip_partite').insert({ couple_id, vincitore_id, perdente_id, modalita });
  return check(res);
}
```

- [ ] **Step 4: Eseguire i test e verificarne il passaggio**

Run: `node --test test/store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js
git commit -m "feat(strip): store listStripPartite/addStripPartita + test"
```

---

## Task 6: CSS Strip Poker in `styles.css`

**Files:**
- Modify: `styles.css` (in coda)
- Reference: `.superpowers/brainstorm/12256-1779803591/content/strip-poker-final3.html` (blocco `<style>`, righe 10-148)

- [ ] **Step 1: Portare il blocco CSS dal mockup, namespaced e rimappato alla palette**

Aprire il mockup `strip-poker-final3.html` e copiare il blocco `<style>` (righe 10-148) in coda a `styles.css`, applicando queste trasformazioni:
- Prefissare ogni selettore con `.strip-root ` (es. `.felt` → `.strip-root .felt`) per evitare collisioni con gli altri moduli. Eccezione: gli overlay che usano `.dadi-scrim`/`.modal` per ereditare lo scroll-lock (vedi Task 8).
- Rimappare le variabili del mockup alle variabili dell'app: `--bg1`→`var(--bg2)`, `--oro`→`var(--gold)`, `--oro-b`→`var(--gold-soft)`, `--crema`→`var(--cream)`, `--rosso`→`var(--wine)`. Rimuovere il blocco `:root{...}` del mockup (riga 11): l'app ha già la sua palette.
- Mantenere invariati: `.card`, `.squeeze`/`.sqc`/`.notch`/`.peel*` (piega 3D), `.fig`/`.robe`/`.chip`, `.it`/`.who-card` (setup), `.felt`/`.board`, `.banner`, `.pm` (scelta modalità).
- Rimuovere lo stile della cornice telefono `.phone` (righe 19-21): nel modulo reale il gioco vive dentro `.gioco-host`, non in un finto telefono.

Verifica: i selettori sono tutti sotto `.strip-root` (o `.dadi-scrim`/`.modal`), nessun `:root` duplicato, nessun riferimento a `--oro`/`--crema`/`--bg1` residuo.

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat(strip): stili Strip Poker (port da final3, palette app)"
```

---

## Task 7: Modulo `strip.js` — avatar, setup, motore di gioco

> Questo task è grande: il modulo porta il controller del mockup `strip-poker-final3.html`. Procede a sotto-passi committabili. Le funzioni pure (poker, state machine) **non** vanno riscritte qui: si importano da `logic.js`. La geometria SVG dell'avatar (lunghe costanti `path`) si copia **verbatim** dal mockup ai punti indicati.

**Files:**
- Create: `js/modules/strip.js`
- Reference: `.superpowers/brainstorm/12256-1779803591/content/strip-poker-final3.html`

### Step 1: Scheletro del modulo + import

- [ ] Create `js/modules/strip.js` con l'intelaiatura, gli import e lo stato di modulo:

```js
import { mk, add, clear, toast } from '../ui.js';
import {
  mazzo52, mescola, valutaMano, miglioreManoDa7, confronta, CATEGORIE_POKER,
  GUARDAROBA, GUARDAROBA_META, capiIniziali, statoInizialePartita, togliCapo, eNudo,
  risultatoPartita, testaATesta,
} from '../lib/logic.js';
import { listStripPartite, addStripPartita } from '../store.js';

// ---- stato di modulo ----
let ctx = null;                 // { client, me, panel }
let host = null;                // nodo .gioco-host in cui montare lo strip
let partite = [];               // storico da strip_partite
let mode = 'holdem';            // 'holdem' | 'draw'
let stato = null;               // statoInizialePartita() — residuo capi {lui,lei}
let deck = [], board = [], meHole = [], oppHole = [], meSet = [], oppSet = [];
let phase = 'start';            // macchina a stati del flusso mano
let discard = [];               // indici carte da cambiare (draw)
let stripBusy = false;          // blocca doppi tap durante lo spogliarello

// 'Lui' = me (utente loggato), 'Lei' = partner. I sessi avatar: Lui→'lui', Lei→'lei'.

export async function renderStrip(context) {
  ctx = context;
  host = context.panel;
  try {
    partite = await listStripPartite(ctx.client, ctx.me.couple_id);
  } catch (err) { toast('Errore storico strip: ' + err.message, 'err'); partite = []; }
  drawApertura();
}
```

- [ ] Run: `node --test` → Expected: PASS (nessun test rotto; il modulo non è ancora importato da nessuno). Commit:

```bash
git add js/modules/strip.js
git commit -m "feat(strip): scheletro modulo strip.js"
```

### Step 2: Helper di rendering carte (port da mockup, righe 236-289)

- [ ] Aggiungere a `strip.js` gli helper carta, copiando e adattando dal mockup le funzioni `rname`, `cardFace`, `cardBack`, `rot`, `renderCovered`, `renderShown`, `renderSelect` (righe 236-289). Adattamenti:
- Usare `mk(...)` di `ui.js` al posto di `document.createElement` dove comodo (facoltativo; va bene anche `document.createElement` come nel mockup).
- Sostituire i riferimenti globali a `SUITS`/`RANKS` con costanti locali (copiarle dalle righe 237-239 del mockup):

```js
const SEMI = [{ g: '♠', red: 0 }, { g: '♥', red: 1 }, { g: '♦', red: 1 }, { g: '♣', red: 0 }];
const NOMI_RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function rname(r) { return NOMI_RANK[r] || (r === 10 ? '10' : String(r)); }
```

- `renderSelect` usa la variabile di modulo `discard` (già dichiarata) e chiama `aggiornaHintCambio()` (definita più avanti) invece di scrivere direttamente in `#hint`.
- `inSet(card, set)` (riga 256) va copiato verbatim.

- [ ] Run: `node --test` → Expected: PASS. Commit:

```bash
git add js/modules/strip.js
git commit -m "feat(strip): helper rendering carte e piega 3D"
```

### Step 3: Avatar SVG acquerello (port verbatim da mockup, righe 411-514)

- [ ] Copiare **verbatim** in `strip.js` il blocco geometria + rendering avatar dal mockup (righe 411-514): le costanti `SVGNS`, `sv`, `shade`, tutte le costanti path (`TORSO_F/M`, `LEGS_F/M`, `ARM_*`, `HAIR_*`, `HAT_*`, `topPath`, `pantsPath`, `braL/braR/braBand`, `pantyPath`), `FIG_W/FIG_H/VB_W/VB_H`, `bodySVG`, `garmentSVG`, `accSVG`, `ACCDRAW`, `LBLTOP`, `ACCTOP`, `buildFig`, `outermost`. Adattamenti minimi:
- `garmentSVG`/`accSVG` leggono il colore da `META[k].col`: poiché il nuovo `GUARDAROBA` non ha `col`, definire una mappa colori locale:

```js
const COLORI_CAPO = {
  cappello: '#5a1228', giacca: '#3a2a4a', felpa: '#4a5a36', maglietta: '#6e2440',
  gonna: '#6e2440', pantaloncini: '#335a4e', mutande: '#8a1838',
  reggiseno: '#8a1838', canottiera: '#cfc3b0', occhiali: '#241712',
  sciarpa: '#7a2444',
};
function coloreCapo(k) { return COLORI_CAPO[k] || '#6e1f3a'; }
```

  e sostituire `META[k].col||'#...'` con `coloreCapo(k)`, e `META[k].n` con `GUARDAROBA_META[k].n`.
- `outermost(zone, st)` usa `ZONES`: definire la mappa zone→capi (ordine esterno→interno) coerente col nuovo guardaroba:

```js
const ZONE_CAPI = {
  head: ['cappello'],
  torso: ['giacca', 'felpa', 'maglietta', 'canottiera', 'reggiseno'],
  legs: ['gonna', 'pantaloncini'],
  pelvis: ['mutande'],
};
const ZDRAW = ['pelvis', 'legs', 'torso', 'head']; // ordine di disegno
function outermost(zone, st) {
  const arr = ZONE_CAPI[zone] || [];
  for (const k of arr) if (st[k] > 0) return k;
  return null;
}
```

- Il blocco `if(zone==='legs') Gar(pantsPath(F))` in `garmentSVG` resta valido: gonna e pantaloncini usano entrambi `pantsPath` come sagoma (la differenza visiva è il colore). Lasciare invariato.

- [ ] Run: `node --test` → Expected: PASS. Commit:

```bash
git add js/modules/strip.js
git commit -m "feat(strip): avatar SVG acquerello (port verbatim)"
```

### Step 4: Schermata d'apertura + testa-a-testa + scelta modalità

- [ ] Aggiungere a `strip.js` `drawApertura()` e `chooseMode()`. `drawApertura` disegna nel `host` la schermata iniziale con il testa-a-testa (da `testaATesta(partite, me.id, partner.id)`), la scelta modalità e "Nuova partita". Struttura via `mk/add/clear`, classe radice `.strip-root`:

```js
function partnerId() {
  // l'app conosce me.couple_id e me.id; il partner è l'altro membro.
  // Se ctx.me espone partner_id usalo, altrimenti deduci dallo storico.
  if (ctx.me.partner_id) return ctx.me.partner_id;
  const p = partite.find(x => x.vincitore_id !== ctx.me.id || x.perdente_id !== ctx.me.id);
  return p ? (p.vincitore_id === ctx.me.id ? p.perdente_id : p.vincitore_id) : null;
}

function drawApertura() {
  clear(host);
  const root = mk('div', 'strip-root');
  add(root,
    mk('h2', 'ptitle', '♠️ Strip Poker'),
    mk('p', 'psub', 'Mano più bassa = si toglie un capo.'));

  const tt = testaATesta(partite, ctx.me.id, partnerId());
  add(root, mk('div', 'strip-score', `🐻 Tu ${tt.mie} — ${tt.sue} Lei 🧁`));

  const pick = mk('div', 'pick-modes');
  const mk1 = (m, titolo, sub) => {
    const card = mk('div', 'pm');
    add(card, mk('div', 'pm-t', titolo), mk('div', 'pm-s', sub));
    card.onclick = () => chooseMode(m);
    return card;
  };
  add(pick,
    mk1('holdem', '♣ Texas Hold\'em', '2 carte coperte a testa + 5 comuni sul tavolo.'),
    mk1('draw', '♦ Draw poker', '5 carte a testa, uno scambio fino a 3, poi showdown.'));
  add(root, pick);
  host.appendChild(root);
}

function chooseMode(m) {
  mode = m;
  drawSetup();
}
```

Nota: se `ctx.me` non espone `id`/`partner_id`, verificare in `app.js`/`auth.js` come è strutturato l'oggetto `me` e adattare `ctx.me.id`/`partnerId()` di conseguenza (vedi Step di verifica in Task 9). Il testa-a-testa è puramente informativo: se `partnerId()` è `null`, mostra comunque `mie` e `sue=0`.

- [ ] Run: `node --test` → Expected: PASS. Commit:

```bash
git add js/modules/strip.js
git commit -m "feat(strip): apertura + testa-a-testa + scelta modalità"
```

### Step 5: Setup guardaroba (overlay checklist)

- [ ] Aggiungere `drawSetup()` che mostra la checklist dei capi per Lui e Lei (default = tutti i capi del guardaroba selezionati), porta `renderList`/`refresh`/`initSel` dal mockup (righe 384-405) adattati al nuovo `GUARDAROBA`. Differenze:
- `CAT` → `GUARDAROBA`; `c.who==='both'||c.who===who` → `!c.sesso || c.sesso===who` (where `who` ∈ `'lui'|'lei'`).
- Default: tutti i capi selezionati (`initSel` mette `true` per ogni capo del sesso).
- Icone: il mockup usa `iconSVG(c.k,16)`; per semplicità usare l'emoji `GUARDAROBA_META[c.k].e` in uno `<span>` (evita di portare la libreria icone monoline). In alternativa portare `ICONLIB`+`iconSVG` (mockup righe 327-367) se si vuole lo stile filo-oro — opzionale, non bloccante.
- Bottone "Inizia a giocare →" abilitato solo se entrambi hanno ≥1 capo; al click chiama `startGame(selLui, selLei)`.

```js
function startGame(selLui, selLei) {
  stato = { lui: {}, lei: {} };
  for (const c of capiIniziali('lui')) if (selLui[c.k]) stato.lui[c.k] = c.qty;
  for (const c of capiIniziali('lei')) if (selLei[c.k]) stato.lei[c.k] = c.qty;
  drawTavolo();
  resetMano();
  if (mode === 'holdem') dealHold(); else dealDraw();
}
```

- [ ] Run: `node --test` → Expected: PASS. Commit:

```bash
git add js/modules/strip.js
git commit -m "feat(strip): setup guardaroba (checklist Lui/Lei)"
```

### Step 6: Tavolo + flusso mano (Hold'em e Draw) con passa-il-telefono

- [ ] Aggiungere `drawTavolo()` (disegna seat Lei in alto, felt, seat Lui in basso, hint, CTA — struttura dal mockup righe 157-182, via `mk/add`), `resetMano()`, e l'intero flusso. Portare dal mockup (righe 529-648) adattando i nomi:
- `freshDeck()`→`mazzo52()`, `shuffle(d)`→`mescola(d)` (attenzione: `mescola` è puro, quindi `deck = mescola(mazzo52())`).
- `best(carte)`→`miglioreManoDa7(carte)` per Hold'em; per Draw (5 carte esatte) usare `valutaMano(carte5)` direttamente.
- `cmp(a,b)`→`confronta(a,b)` operando su oggetti `{categoria,tieBreakers}`. Attenzione: nel mockup `best().score` è un array; qui `miglioreManoDa7` ritorna `{categoria,tieBreakers,carte}` e `valutaMano` ritorna `{categoria,tieBreakers}`. Uniformare: lo showdown confronta due oggetti-mano e usa `.carte` (Hold'em) o le 5 carte stesse (Draw) per evidenziare.
- `CATNAME[...]`→`CATEGORIE_POKER[mano.categoria]`.
- Le funzioni `dealHold`, `peekOpp`, `toTable`, `revealStep`, `renderBoard`, `dealDraw`, `applyDrawMe`, `hideMeDraw`, `applyDrawOpp`, `pass`, `showOv`, `onOv`, `onCta` si portano mantenendo la stessa macchina a stati `phase`. Sostituire i riferimenti `$('id')` (mockup) con riferimenti ai nodi creati in `drawTavolo()` tenuti in variabili di modulo (es. `els.board`, `els.cta`, `els.hint`, `els.meHole`, `els.oppHole`, `els.banner`, `els.meName`, `els.oppName`).
- Gli overlay "passa il telefono" e "scelta" usano un nodo overlay con classe `.dadi-scrim` (per ereditare lo scroll-lock di `ui.js`) invece dei `.ov` fissi del mockup; oppure `.modal`. Aggiungere/rimuovere `document.body.classList` non serve: lo gestisce `ui.js` osservando `.dadi-scrim`/`.modal`.

- [ ] **Test manuale rapido in browser** (lo smoke completo è Task 9): aprire l'app, entrare in Giochi → Strip Poker, scegliere Hold'em, confermare guardaroba, distribuire, sbirciare, flop/turn/river, showdown. Verificare che lo showdown nomini il vincitore e mostri la mano. Commit:

```bash
git add js/modules/strip.js
git commit -m "feat(strip): tavolo + flusso mano Hold'em/Draw + passa-il-telefono"
```

### Step 7: Spogliarello + game over + salvataggio esito

- [ ] Aggiungere il flusso spogliarello portando dal mockup (righe 573-641) `passStrip`, `doStrip`, `armStrip`, `disarmStrip`, `pickAvatar`, `pickAccItem`, `pickChip`, `doRemove`, `gameOver`, `stripNext`, `renderChips`, `updateCounts`, `cnt`. Adattamenti:
- Lo stato residuo capi è la variabile di modulo `stato` (`stato.lui`/`stato.lei`), non `stateM`/`stateF`. La rimozione usa la **pura** `togliCapo`: in `doRemove`, invece di mutare `st[k]--`, fare `stato = togliCapo(stato, persona, k)` dove `persona` è `'lui'` se il perdente è Lui, `'lei'` altrimenti.
- Fine partita: invece di confrontare `cnt(st)===0`, usare `risultatoPartita(stato)`. Se ritorna un esito → `gameOver`.
- `renderChips`/`buildFig` ricevono `stato.lui` o `stato.lei` (il sotto-oggetto della persona che si spoglia).
- In `gameOver(win, loser)`: salvare l'esito e aggiornare lo storico:

```js
async function gameOver(winPersona, loserPersona) {
  // disegno trofeo come nel mockup ...
  const vincitore_id = winPersona === 'lui' ? ctx.me.id : partnerId();
  const perdente_id = loserPersona === 'lui' ? ctx.me.id : partnerId();
  try {
    if (vincitore_id && perdente_id) {
      await addStripPartita(ctx.client, {
        couple_id: ctx.me.couple_id, vincitore_id, perdente_id, modalita: mode,
      });
      partite = await listStripPartite(ctx.client, ctx.me.couple_id);
    }
  } catch (err) { toast('Esito non salvato: ' + err.message, 'err'); }
  // bottone "Nuova partita" → drawApertura()
}
```

  Nota: `winPersona`/`loserPersona` sono `'lui'|'lei'`; mapparli agli `id` reali per il salvataggio. "Nuova partita" richiama `drawApertura()` (che rilegge il testa-a-testa aggiornato).

- [ ] **Test manuale**: giocare una partita completa fino a far restare nudo un avatar; verificare il pop-up vincitore, e che ricaricando l'apertura il testa-a-testa sia incrementato. Commit:

```bash
git add js/modules/strip.js
git commit -m "feat(strip): spogliarello + game over + salvataggio esito"
```

---

## Task 8: Agganciare la scheda Strip in `giochi.js`

**Files:**
- Modify: `js/modules/giochi.js:6` (import) e `js/modules/giochi.js:36` (array selettore) e `js/modules/giochi.js:45-52` (montaggio)

- [ ] **Step 1: Importare `renderStrip`**

In `js/modules/giochi.js`, dopo la riga 6 (`import { renderRuota, openEditorRuota } from './ruota.js';`) aggiungere:

```js
import { renderStrip } from './strip.js';
```

- [ ] **Step 2: Aggiungere la scheda al selettore**

In `drawSelettore()` (riga 36), estendere l'array delle schede:

```js
  for (const [k, lbl] of [['dadi', '🎲 Dadi'], ['ruota', '🎡 Ruota'], ['strip', '♠️ Strip Poker']]) {
```

- [ ] **Step 3: Delegare il montaggio**

In `montaGiocoCorrente()` (righe 45-52), aggiungere il ramo `strip`:

```js
async function montaGiocoCorrente() {
  const host = ctx.panel.querySelector('.gioco-host');
  if (giocoCorrente === 'ruota') {
    await renderRuota({ client: ctx.client, me: ctx.me, panel: host });
  } else if (giocoCorrente === 'strip') {
    await renderStrip({ client: ctx.client, me: ctx.me, panel: host });
  } else {
    await montaDadi(host);
  }
}
```

- [ ] **Step 4: Verifica in browser**

Aprire l'app → tab Giochi. Devono comparire 3 schede: Dadi, Ruota, Strip Poker. Cliccando "♠️ Strip Poker" si monta l'apertura dello strip.

- [ ] **Step 5: Commit**

```bash
git add js/modules/giochi.js
git commit -m "feat(strip): terza scheda Strip Poker nel selettore Giochi"
```

---

## Task 9: Verifica finale — unit + smoke

**Files:** nessuno (verifica)

- [ ] **Step 1: Verificare la forma dell'oggetto `me`**

Lo strip usa `ctx.me.id`, `ctx.me.couple_id` e (idealmente) `ctx.me.partner_id`. Leggere `js/auth.js` e `js/app.js` per confermare i campi reali dell'oggetto `me` passato a `render*`. Se i nomi differiscono (es. `user_id` invece di `id`), correggere i riferimenti in `strip.js` (Task 7, Step 4 e Step 7) prima di proseguire. Se `partner_id` non esiste, lasciare il fallback già previsto in `partnerId()`.

- [ ] **Step 2: Suite unit completa**

Run: `node --test`
Expected: tutti i file verdi, **0 fail**. (I nuovi test di `strip.test.js` e `store.test.js` inclusi.)

- [ ] **Step 3: Smoke manuale in browser (checklist spec §9)**

Avviare un server statico locale e fare login con un account di coppia reale, poi verificare:
- [ ] Tab Giochi mostra 3 schede; Strip Poker navigabile.
- [ ] **Hold'em**: scelta modalità → setup guardaroba (default tutti i capi) → distribuisci → sbircia (passa-il-telefono Lui→Lei) → flop/turn/river → showdown nomina vincitore ed evidenzia la mano → il perdente tocca un capo sull'avatar (o una chip per scarpe/calzini) → si toglie → prossima mano.
- [ ] **Draw**: 5 carte a testa → cambio fino a 3 → showdown → spogliarello.
- [ ] Partita completa fino a un avatar nudo → pop-up vincitore.
- [ ] Lo **storico/testa-a-testa** si aggiorna dopo la partita (tornando all'apertura il punteggio è incrementato) e **persiste dopo reload**.
- [ ] Layout corretto a viewport mobile (≤ 380px); target tap ≥ 44px.
- [ ] Con un overlay aperto lo sfondo non scrolla (scroll-lock).

- [ ] **Step 4: Commit finale (se sono serviti fix in Step 1)**

```bash
git add -A
git commit -m "fix(strip): allineamento campi me + rifiniture smoke"
```

---

## Note di esecuzione

- **Push automatico**: per preferenza globale dell'utente, committare e pushare in automatico dopo ogni task (`git push`).
- **Mostrare il risultato**: per preferenza dell'utente, le verifiche visive vanno mostrate aprendo l'app/HTML nel browser, non descritte a parole.
- **Repo reale**: `C:\Users\TomasCoro\Desktop\PERSONAL\siti-app\nostro-spazio` (la working dir `C:\Users\TomasCoro\nostro-spazio` è vuota).
- **Pure prima, UI dopo**: i Task 2-5 sono completamente testabili senza browser; sono il cuore verificabile. Il Task 7 (UI) è il più grande ma poggia su funzioni già testate.
