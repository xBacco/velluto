# Ruota a premi + economia a giri (Fase 4a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la Ruota a premi della web app "Velluto": una moneta-giro spendibile, una ruota di 8 premi con animazioni approvate, premi immediati/differiti, contenuti editabili dalla coppia.

**Architecture:** Funzioni pure in `js/lib/logic.js` (saldo, eleggibilità, fette, estrazione, contenuti) testate con `node --test`; accesso dati in `js/store.js` (client Supabase iniettato, ledger insert-only); modulo UI `js/modules/ruota.js` montato dentro la tab Giochi da `js/modules/giochi.js`; CSS portato dai mockup approvati. Niente cron: il giro gratis settimanale matura pigro all'apertura.

**Tech Stack:** Vanilla ES modules, Supabase (Postgres + RLS), `node:test` + `node:assert/strict`, CSS puro. Nessuna build, nessuna dipendenza npm runtime.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-27-economia-giri-ruota-premi-design.md` (+ spec segreti e Fase 4 collegate).

**Mockup approvati (fonte di verità per la UI), in `mockups/`:**
- `ruota-popup-dallo-spicchio.html` — **scheda 3**: ruota, emoji dritte, spin, spotlight, pop-up "proiezione di luce". È il riferimento verbatim per geometria/animazioni.
- `ruota-bottone-stili.html` — pagina/card saldo + bottone ghost "GIRA LA RUOTA".
- `ruota-contenuti.html` — pop-up proposta 🔥 e card buono 🎁.

---

## File Structure

- `supabase/giri.sql` — **create**: migrazione (`giri_movimenti`, `ruota_contenuti`, drop `ruota_giri`).
- `supabase/schema.sql` — **modify**: rimuove `ruota_giri`/`ruota_all`, aggiunge le due tabelle nuove + policy.
- `js/lib/logic.js` — **modify**: blocco `ECONOMIA`/`FETTE`, default contenuti, funzioni pure economia + contenuti.
- `js/store.js` — **modify**: funzioni giri (`listGiri`/`accreditaGiro`/`spendiGiro`/`concediGiro`) e contenuti (`list/seed/add/update/deleteRuotaContenuti`).
- `js/modules/ruota.js` — **create**: modulo UI Ruota (render, spin, premi, editor).
- `js/modules/giochi.js` — **modify**: selettore gioco (Dadi + Ruota), instradamento `fab:giochi` al gioco corrente.
- `styles.css` — **modify**: classi `.ruota-*`, `.wheel*`, `.slice-lbl`, `.spotlight`, `.prize*`, `.coin*` portate dai mockup.
- `test/ruota.test.js` — **create**: unit delle funzioni pure + store (fake client).
- `test/smoke.md` — **modify**: checklist smoke manuale/Playwright per la Ruota.

**Convenzioni da rispettare (dal codice esistente):**
- `store.js`: ogni funzione riceve `client` come primo arg, usa `check({data,error})`, lancia su errore. Vedi `addBuono`/`listDadiFacce`.
- `ui.js`: costruzione DOM con `mk(tag,cls,txt)`, `add(parent,...kids)`, `clear(node)`; **mai `innerHTML`** (un hook lo blocca); overlay modali con classe `.modal` o `.dadi-scrim` → lo scroll-lock è automatico (MutationObserver in `ui.js`); toast con `toast(msg,'err')`.
- `app.js`: il FAB fa `dispatchEvent(new CustomEvent('fab:' + cur))`; `renderGiochi({client,me,panel})` è già cablato sul pannello `#p-giochi`.
- Test: `import { test } from 'node:test'; import assert from 'node:assert/strict';`. Per lo store si usa un **fake client** locale (vedi `test/store.test.js`).

---

## Task 1: Migrazione SQL

**Files:**
- Create: `supabase/giri.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Scrivere `supabase/giri.sql`**

```sql
-- Economia a giri (Fase 4a). Eseguire nel SQL Editor di Supabase.

-- 1. Ledger dei movimenti-giro. Rimpiazza la mai-usata ruota_giri.
drop table if exists ruota_giri cascade;

create table if not exists giri_movimenti (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id   uuid not null references auth.users(id),
  delta     int  not null,
  motivo    text not null check (motivo in ('settimanale','gioco','giro','ancora')),
  esito     text,
  creato    timestamptz not null default now()
);
create index if not exists giri_mov_couple_idx on giri_movimenti (couple_id, user_id, creato desc);

alter table giri_movimenti enable row level security;
create policy giri_mov_all on giri_movimenti
  for all using (is_member(couple_id)) with check (is_member(couple_id));

-- 2. Contenuti editabili delle fette 🔥 (piccante) e 🎁 (buono a sorpresa).
create table if not exists ruota_contenuti (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id),
  categoria   text not null check (categoria in ('piccante','buono')),
  emoji       text,
  testo       text not null,
  descrizione text,
  ordine      int  not null default 0,
  creato      timestamptz not null default now()
);
create index if not exists ruota_cont_idx on ruota_contenuti (couple_id, categoria, ordine);

alter table ruota_contenuti enable row level security;
create policy ruota_cont_all on ruota_contenuti
  for all using (is_member(couple_id)) with check (is_member(couple_id));
```

- [ ] **Step 2: Aggiornare `supabase/schema.sql`**

Nel blocco tabelle, **eliminare** la sezione `-- 7. GIRI RUOTA` (la `create table ... ruota_giri`). Sostituirla con:

```sql
-- 7. ECONOMIA A GIRI (ledger insert-only)
create table if not exists giri_movimenti (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id   uuid not null references auth.users(id),
  delta     int  not null,
  motivo    text not null check (motivo in ('settimanale','gioco','giro','ancora')),
  esito     text,
  creato    timestamptz not null default now()
);
create index if not exists giri_mov_couple_idx on giri_movimenti (couple_id, user_id, creato desc);

-- 7b. CONTENUTI RUOTA editabili (fette piccante/buono)
create table if not exists ruota_contenuti (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id),
  categoria   text not null check (categoria in ('piccante','buono')),
  emoji       text,
  testo       text not null,
  descrizione text,
  ordine      int  not null default 0,
  creato      timestamptz not null default now()
);
create index if not exists ruota_cont_idx on ruota_contenuti (couple_id, categoria, ordine);
```

Nel blocco RLS: **rimuovere** la riga `alter table ruota_giri enable row level security;` e la policy `ruota_all`. Aggiungere:

```sql
alter table giri_movimenti  enable row level security;
alter table ruota_contenuti enable row level security;
create policy giri_mov_all   on giri_movimenti   for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy ruota_cont_all on ruota_contenuti  for all using (is_member(couple_id)) with check (is_member(couple_id));
```

- [ ] **Step 3: Applicare la migrazione su Supabase**

Eseguire il contenuto di `supabase/giri.sql` nel SQL Editor del progetto. Verificare nella dashboard che `giri_movimenti` e `ruota_contenuti` esistano con RLS attiva e che `ruota_giri` non esista più.

- [ ] **Step 4: Commit**

```bash
git add supabase/giri.sql supabase/schema.sql
git commit -m "feat(ruota): migrazione economia a giri (giri_movimenti, ruota_contenuti)"
```

---

## Task 2: `logic.js` — costanti economia + saldo/eleggibilità

**Files:**
- Modify: `js/lib/logic.js` (append in coda al file)
- Test: `test/ruota.test.js` (create)

- [ ] **Step 1: Scrivere i test (saldo, puoGirare, eleggibilità)**

Creare `test/ruota.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECONOMIA, saldoGiri, puoGirare, giriEleggibile,
} from '../js/lib/logic.js';

const mov = (user_id, delta, motivo, creato, esito = null) => ({ user_id, delta, motivo, esito, creato });

test('saldoGiri somma solo i movimenti dell\'utente', () => {
  const m = [
    mov('me', 1, 'settimanale', '2026-05-01'),
    mov('me', -1, 'giro', '2026-05-02', 'dadi'),
    mov('altro', 1, 'gioco', '2026-05-02'),
    mov('me', 1, 'ancora', '2026-05-03'),
  ];
  assert.equal(saldoGiri(m, 'me'), 1);
  assert.equal(saldoGiri(m, 'altro'), 1);
  assert.equal(saldoGiri([], 'me'), 0);
});

test('puoGirare confronta col costo del giro', () => {
  assert.equal(puoGirare(ECONOMIA.COSTO_GIRO), true);
  assert.equal(puoGirare(ECONOMIA.COSTO_GIRO - 1), false);
});

test('giriEleggibile: senza movimenti settimanali -> ok', () => {
  const r = giriEleggibile([], 'me', new Date('2026-05-27T10:00:00Z'));
  assert.equal(r.ok, true);
  assert.equal(r.prossimoSblocco, null);
});

test('giriEleggibile: dentro la settimana -> non ok, con prossimoSblocco', () => {
  const m = [mov('me', 1, 'settimanale', '2026-05-25T10:00:00Z')];
  const r = giriEleggibile(m, 'me', new Date('2026-05-27T10:00:00Z'));
  assert.equal(r.ok, false);
  assert.equal(r.prossimoSblocco, new Date('2026-06-01T10:00:00Z').toISOString());
});

test('giriEleggibile: passati 7 giorni -> ok', () => {
  const m = [mov('me', 1, 'settimanale', '2026-05-20T10:00:00Z')];
  const r = giriEleggibile(m, 'me', new Date('2026-05-27T10:00:01Z'));
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node --test test/ruota.test.js`
Expected: FAIL — `ECONOMIA`/`saldoGiri`/`puoGirare`/`giriEleggibile` non esportati.

- [ ] **Step 3: Implementare in `js/lib/logic.js`** (aggiungere in fondo al file)

```js
// ---- ECONOMIA A GIRI (pure) ----
export const ECONOMIA = {
  GRATIS_OGNI_GIORNI: 7,   // ogni quanto matura il giro gratis settimanale
  COSTO_GIRO: 1,           // giri spesi per girare
  GIRI_PER_VITTORIA: 1,    // PROVVISORIO: accreditati vincendo un gioco (hook concediGiro)
  ULTIMI_PREMI: 5,         // voci dello storico "Ultimi premi"
};

// Saldo = somma dei delta dei movimenti dell'utente (ledger insert-only).
export function saldoGiri(movimenti, userId) {
  return movimenti.filter(m => m.user_id === userId).reduce((s, m) => s + m.delta, 0);
}

export function puoGirare(saldo) {
  return saldo >= ECONOMIA.COSTO_GIRO;
}

// Giro gratis settimanale: ok se mai maturato o se passati GRATIS_OGNI_GIORNI dall'ultimo.
// `now` (Date) iniettabile per i test.
export function giriEleggibile(movimenti, userId, now = new Date()) {
  const settimanali = movimenti
    .filter(m => m.user_id === userId && m.motivo === 'settimanale')
    .map(m => new Date(m.creato))
    .sort((a, b) => b - a);
  if (!settimanali.length) return { ok: true, prossimoSblocco: null };
  const prossimo = new Date(settimanali[0].getTime() + ECONOMIA.GRATIS_OGNI_GIORNI * 864e5);
  return { ok: now >= prossimo, prossimoSblocco: prossimo.toISOString() };
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node --test test/ruota.test.js`
Expected: PASS (4 test del blocco economia base).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/ruota.test.js
git commit -m "feat(ruota): logic economia - saldo, puoGirare, giriEleggibile"
```

---

## Task 3: `logic.js` — fette, estrazione pesata, ultimi premi

**Files:**
- Modify: `js/lib/logic.js`
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungere i test (FETTE, fetteRuota, estraiFetta, ultimiPremi)**

Aggiungere in `test/ruota.test.js` (estendere l'import e i test):

```js
import {
  FETTE, fetteRuota, estraiFetta, ultimiPremi,
} from '../js/lib/logic.js';

test('FETTE sono 8, con le chiavi attese', () => {
  assert.equal(FETTE.length, 8);
  assert.deepEqual(FETTE.map(f => f.key),
    ['segreto','piccante','buono','desiderio','tod','jolly','dadi','ancora']);
});

test('fetteRuota azzera le condizionali quando manca la condizione', () => {
  const f = fetteRuota({ haSegreti: false, haCarte: false, haProposte: false, haBuoni: false });
  assert.equal(f.length, 8);
  const peso = k => f.find(x => x.key === k).peso;
  assert.equal(peso('segreto'), 0);
  assert.equal(peso('tod'), 0);
  assert.equal(peso('piccante'), 0);
  assert.equal(peso('buono'), 0);
  assert.equal(peso('dadi'), 1); // non condizionale resta a 1
});

test('fetteRuota lascia attive le condizionali quando la condizione c\'è', () => {
  const f = fetteRuota({ haSegreti: true, haCarte: true, haProposte: true, haBuoni: true });
  assert.equal(f.find(x => x.key === 'segreto').peso, 1);
  assert.equal(f.find(x => x.key === 'tod').peso, 1);
});

test('estraiFetta non estrae mai una fetta a peso 0', () => {
  const fette = fetteRuota({ haSegreti: false, haCarte: false, haProposte: true, haBuoni: true });
  for (let i = 0; i < 100; i++) {
    const r = estraiFetta(fette, () => i / 100);
    assert.notEqual(r.fetta.key, 'segreto');
    assert.notEqual(r.fetta.key, 'tod');
  }
});

test('estraiFetta con rnd deterministico atterra sulla fetta attesa', () => {
  const fette = FETTE.map(f => ({ ...f, peso: 1 })); // 8 fette uguali
  assert.equal(estraiFetta(fette, () => 0).indice, 0);        // primo spicchio
  assert.equal(estraiFetta(fette, () => 0.99).indice, 7);     // ultimo spicchio
});

test('estraiFetta restituisce null se tutti i pesi sono 0', () => {
  const fette = FETTE.map(f => ({ ...f, peso: 0 }));
  assert.equal(estraiFetta(fette, () => 0.5), null);
});

test('ultimiPremi: solo giri dell\'utente, ordinati desc, tagliati a n, con fetta risolta', () => {
  const m = [
    { user_id: 'me', delta: -1, motivo: 'giro', esito: 'dadi', creato: '2026-05-01' },
    { user_id: 'me', delta: 1,  motivo: 'settimanale', esito: null, creato: '2026-05-02' },
    { user_id: 'me', delta: -1, motivo: 'giro', esito: 'piccante', creato: '2026-05-03' },
    { user_id: 'altro', delta: -1, motivo: 'giro', esito: 'jolly', creato: '2026-05-04' },
  ];
  const r = ultimiPremi(m, 'me', 5);
  assert.equal(r.length, 2);
  assert.equal(r[0].esito, 'piccante');     // più recente prima
  assert.equal(r[0].fetta.emoji, '🔥');
  assert.equal(r[1].esito, 'dadi');
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node --test test/ruota.test.js`
Expected: FAIL — `FETTE`/`fetteRuota`/`estraiFetta`/`ultimiPremi` non esportati.

- [ ] **Step 3: Implementare in `js/lib/logic.js`** (in coda)

```js
// Le 8 fette, in ordine sulla ruota. peso = probabilità relativa (tutti 1 = uniforme).
export const FETTE = [
  { key: 'segreto',   emoji: '💋', label: 'Apri un segreto',         peso: 1, differito: false },
  { key: 'piccante',  emoji: '🔥', label: 'Proposta piccante',       peso: 1, differito: false },
  { key: 'buono',     emoji: '🎁', label: 'Buono a sorpresa',        peso: 1, differito: true },
  { key: 'desiderio', emoji: '💌', label: 'Pesca un desiderio',      peso: 1, differito: true },
  { key: 'tod',       emoji: '🃏', label: 'Carta Obbligo o Verità',  peso: 1, differito: false },
  { key: 'jolly',     emoji: '⭐', label: 'Jolly: scegli tu',        peso: 1, differito: false },
  { key: 'dadi',      emoji: '🎲', label: 'Tiro di dadi',            peso: 1, differito: false },
  { key: 'ancora',    emoji: '🔁', label: 'Gira ancora',             peso: 1, differito: false },
];

// Copia di FETTE con i pesi delle fette condizionali azzerati quando manca la condizione.
// Le fette restano tutte e 8 (la ruota ha geometria fissa).
export function fetteRuota({ haSegreti, haCarte, haProposte, haBuoni }) {
  return FETTE.map(f => {
    let peso = f.peso;
    if (f.key === 'segreto'  && !haSegreti)  peso = 0;
    if (f.key === 'tod'      && !haCarte)    peso = 0;
    if (f.key === 'piccante' && !haProposte) peso = 0;
    if (f.key === 'buono'    && !haBuoni)    peso = 0;
    return { ...f, peso };
  });
}

// Estrazione pesata. rnd ∈ [0,1) iniettabile. Salta i pesi 0. null se tutti 0.
export function estraiFetta(fette, rnd = Math.random) {
  const tot = fette.reduce((s, f) => s + f.peso, 0);
  if (tot <= 0) return null;
  let x = rnd() * tot;
  for (let i = 0; i < fette.length; i++) {
    x -= fette[i].peso;
    if (x < 0) return { indice: i, fetta: fette[i] };
  }
  return { indice: fette.length - 1, fetta: fette[fette.length - 1] };
}

// Ultimi n premi (movimenti motivo='giro') dell'utente, recenti prima, con la fetta risolta.
export function ultimiPremi(movimenti, userId, n = ECONOMIA.ULTIMI_PREMI) {
  return movimenti
    .filter(m => m.user_id === userId && m.motivo === 'giro')
    .sort((a, b) => new Date(b.creato) - new Date(a.creato))
    .slice(0, n)
    .map(m => ({ ...m, fetta: FETTE.find(f => f.key === m.esito) || null }));
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node --test test/ruota.test.js`
Expected: PASS (tutti i test economia + fette).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/ruota.test.js
git commit -m "feat(ruota): logic fette - FETTE, fetteRuota, estraiFetta, ultimiPremi"
```

---

## Task 4: `logic.js` — contenuti editabili (default + helper)

**Files:**
- Modify: `js/lib/logic.js`
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungere i test (default rows, filtri, pesca)**

Aggiungere in `test/ruota.test.js`:

```js
import {
  PROPOSTE_PICCANTI_DEFAULT, BUONI_SORPRESA_DEFAULT,
  ruotaContenutiDefaultRows, proposteDa, buoniSorpresaDa, pescaContenuto,
} from '../js/lib/logic.js';

test('ruotaContenutiDefaultRows produce righe piccante + buono con ordine progressivo', () => {
  const rows = ruotaContenutiDefaultRows('cpl');
  assert.equal(rows.length, PROPOSTE_PICCANTI_DEFAULT.length + BUONI_SORPRESA_DEFAULT.length);
  const picc = rows.filter(r => r.categoria === 'piccante');
  const buoni = rows.filter(r => r.categoria === 'buono');
  assert.equal(picc.length, PROPOSTE_PICCANTI_DEFAULT.length);
  assert.equal(picc[0].couple_id, 'cpl');
  assert.equal(picc[0].ordine, 0);
  assert.equal(picc[0].emoji, null);
  assert.equal(picc[0].testo, PROPOSTE_PICCANTI_DEFAULT[0]);
  assert.equal(buoni[0].emoji, BUONI_SORPRESA_DEFAULT[0].emoji);
  assert.equal(buoni[0].testo, BUONI_SORPRESA_DEFAULT[0].titolo);
  assert.equal(buoni[0].descrizione, BUONI_SORPRESA_DEFAULT[0].descrizione);
});

test('proposteDa / buoniSorpresaDa filtrano per categoria e ordinano per ordine', () => {
  const cont = [
    { categoria: 'piccante', testo: 'b', ordine: 1 },
    { categoria: 'piccante', testo: 'a', ordine: 0 },
    { categoria: 'buono', testo: 'B', ordine: 0 },
  ];
  assert.deepEqual(proposteDa(cont).map(c => c.testo), ['a', 'b']);
  assert.deepEqual(buoniSorpresaDa(cont).map(c => c.testo), ['B']);
});

test('pescaContenuto estrae con rnd e dà null su lista vuota', () => {
  const l = [{ testo: 'x' }, { testo: 'y' }, { testo: 'z' }];
  assert.equal(pescaContenuto(l, () => 0).testo, 'x');
  assert.equal(pescaContenuto(l, () => 0.99).testo, 'z');
  assert.equal(pescaContenuto([], () => 0.5), null);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node --test test/ruota.test.js`
Expected: FAIL — simboli contenuti non esportati.

- [ ] **Step 3: Implementare in `js/lib/logic.js`** (in coda)

```js
// ---- CONTENUTI RUOTA (default di seeding; la fonte di verità è ruota_contenuti) ----
// Approvati dall'utente il 2026-05-27 (mockups/ruota-contenuti.html). Editabili dall'app.
export const PROPOSTE_PICCANTI_DEFAULT = [
  'Spogliatevi a vicenda, lentamente, senza dire una parola.',
  'Massaggio con l’olio: dieci minuti a testa, niente fretta.',
  'Uno dei due bendato: si lascia guidare solo dal tatto.',
  'Doccia insieme, luci basse.',
  'Chi ha girato detta le regole per i prossimi dieci minuti.',
  'Un bacio lungo un minuto intero — mani dietro la schiena.',
  'Raccontatevi una fantasia che non vi siete mai detti.',
  'Striptease privato: una canzone intera, pubblico di una persona.',
];

export const BUONI_SORPRESA_DEFAULT = [
  { emoji: '💆', titolo: 'Massaggio completo',    descrizione: 'Quindici minuti di massaggio, quando lo riscatti.' },
  { emoji: '🛁', titolo: 'Bagno caldo preparato', descrizione: 'Te lo prepara il partner, candele incluse.' },
  { emoji: '😈', titolo: 'Un sì garantito',       descrizione: 'Una richiesta piccante a tua scelta, senza poter dire di no.' },
  { emoji: '🎬', titolo: 'Serata, scegli tu',     descrizione: 'Film e coccole decisi da te, per una sera.' },
  { emoji: '💋', titolo: 'Tre voglie express',    descrizione: 'Tre piccoli desideri esauditi stasera.' },
  { emoji: '🍳', titolo: 'Colazione a letto',     descrizione: 'Una mattina a tua scelta, te la porta il partner.' },
];

// Righe piatte per seminare ruota_contenuti la prima volta (stile facceDefaultRows/tipiDefaultRows).
export function ruotaContenutiDefaultRows(coupleId) {
  const rows = [];
  PROPOSTE_PICCANTI_DEFAULT.forEach((testo, i) =>
    rows.push({ couple_id: coupleId, categoria: 'piccante', emoji: null, testo, descrizione: null, ordine: i }));
  BUONI_SORPRESA_DEFAULT.forEach((b, i) =>
    rows.push({ couple_id: coupleId, categoria: 'buono', emoji: b.emoji, testo: b.titolo, descrizione: b.descrizione, ordine: i }));
  return rows;
}

export function proposteDa(contenuti) {
  return contenuti.filter(c => c.categoria === 'piccante').sort((a, b) => a.ordine - b.ordine);
}
export function buoniSorpresaDa(contenuti) {
  return contenuti.filter(c => c.categoria === 'buono').sort((a, b) => a.ordine - b.ordine);
}
// Un elemento a caso da una lista; null se vuota. rnd iniettabile.
export function pescaContenuto(lista, rnd = Math.random) {
  if (!lista.length) return null;
  return lista[Math.floor(rnd() * lista.length)];
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node --test test/ruota.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/ruota.test.js
git commit -m "feat(ruota): logic contenuti - default seeding + proposteDa/buoniSorpresaDa/pescaContenuto"
```

---

## Task 5: `store.js` — funzioni economia giri

**Files:**
- Modify: `js/store.js`
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungere i test store (fake client con `single()`)**

Aggiungere in `test/ruota.test.js`. **In testa al file** (sotto gli import esistenti) incollare questo fake client esteso (deriva da `test/store.test.js`, con `single()` e supporto `delete`):

```js
import {
  listGiri, accreditaGiro, spendiGiro, concediGiro,
} from '../js/store.js';

function fakeClient(initialRows = []) {
  const calls = [];
  const rows = [...initialRows];
  function builder() {
    const state = { table: null, op: null, payload: null, filters: {}, orders: [], single: false };
    const api = {
      _state: state,
      select() { state.op = state.op || 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      order(col, opts) { state.orders.push({ col, opts }); return api; },
      single() { state.single = true; return api; },
      then(resolve) {
        calls.push(state);
        if (state.op === 'select') {
          const data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data: state.single ? data[0] : data, error: null });
        } else if (state.op === 'insert') {
          const arr = Array.isArray(state.payload) ? state.payload : [state.payload];
          const created = arr.map((p, i) => ({ id: 'new' + i, ...p }));
          rows.push(...created);
          resolve({ data: state.single ? created[0] : created, error: null });
        } else {
          resolve({ data: null, error: null });
        }
      },
    };
    return api;
  }
  return { from(table) { const b = builder(); b._state.table = table; return b; }, _calls: calls, _rows: rows };
}

test('listGiri seleziona per couple_id', async () => {
  const c = fakeClient([
    { id: '1', couple_id: 'cpl', user_id: 'me', delta: 1, motivo: 'settimanale' },
    { id: '2', couple_id: 'altra', user_id: 'x', delta: 1, motivo: 'gioco' },
  ]);
  const data = await listGiri(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].table, 'giri_movimenti');
});

test('accreditaGiro inserisce delta +1 col motivo dato', async () => {
  const c = fakeClient();
  await accreditaGiro(c, { couple_id: 'cpl', user_id: 'me', motivo: 'settimanale' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.delta, 1);
  assert.equal(ins.payload.motivo, 'settimanale');
  assert.equal(ins.payload.esito, null);
});

test('spendiGiro inserisce delta -1, motivo giro, esito', async () => {
  const c = fakeClient();
  await spendiGiro(c, { couple_id: 'cpl', user_id: 'me', esito: 'piccante' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.delta, -1);
  assert.equal(ins.payload.motivo, 'giro');
  assert.equal(ins.payload.esito, 'piccante');
});

test('concediGiro accredita motivo gioco con delta = GIRI_PER_VITTORIA', async () => {
  const c = fakeClient();
  await concediGiro(c, { couple_id: 'cpl', user_id: 'me' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.motivo, 'gioco');
  assert.equal(ins.payload.delta, ECONOMIA.GIRI_PER_VITTORIA);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node --test test/ruota.test.js`
Expected: FAIL — funzioni store non esportate.

- [ ] **Step 3: Implementare in `js/store.js`**

In testa al file, aggiungere l'import della costante:

```js
import { ECONOMIA } from './lib/logic.js';
```

In coda al file, aggiungere:

```js
// ---- ECONOMIA A GIRI (ledger insert-only) ----
export async function listGiri(client, coupleId) {
  const res = await client.from('giri_movimenti').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

// Accredito: delta +1 di default (motivo 'settimanale'/'gioco'/'ancora').
export async function accreditaGiro(client, { couple_id, user_id, motivo, delta = 1 }) {
  const res = await client.from('giri_movimenti').insert({ couple_id, user_id, delta, motivo, esito: null });
  return check(res);
}

// Spesa di un giro: delta -1, motivo 'giro', esito = chiave della fetta vinta.
export async function spendiGiro(client, { couple_id, user_id, esito }) {
  const res = await client.from('giri_movimenti').insert({ couple_id, user_id, delta: -1, motivo: 'giro', esito });
  return check(res);
}

// Hook per i giochi: accredita i giri di una vittoria.
export async function concediGiro(client, { couple_id, user_id }) {
  return accreditaGiro(client, { couple_id, user_id, motivo: 'gioco', delta: ECONOMIA.GIRI_PER_VITTORIA });
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node --test test/ruota.test.js`
Expected: PASS.

- [ ] **Step 5: Verificare che l'intera suite resti verde**

Run: `npm test`
Expected: tutti i file `*.test.js` PASS (nessuna regressione).

- [ ] **Step 6: Commit**

```bash
git add js/store.js test/ruota.test.js
git commit -m "feat(ruota): store economia - listGiri/accreditaGiro/spendiGiro/concediGiro"
```

---

## Task 6: `store.js` — contenuti editabili

**Files:**
- Modify: `js/store.js`
- Test: `test/ruota.test.js`

- [ ] **Step 1: Aggiungere i test contenuti**

Aggiungere in `test/ruota.test.js`:

```js
import {
  listRuotaContenuti, seedRuotaContenuti, addRuotaContenuto, updateRuotaContenuto, deleteRuotaContenuto,
} from '../js/store.js';

test('listRuotaContenuti seleziona per couple_id', async () => {
  const c = fakeClient([{ id: '1', couple_id: 'cpl', categoria: 'piccante', testo: 'x', ordine: 0 }]);
  const data = await listRuotaContenuti(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].table, 'ruota_contenuti');
});

test('seedRuotaContenuti inserisce un array di righe', async () => {
  const c = fakeClient();
  await seedRuotaContenuti(c, [{ couple_id: 'cpl', categoria: 'piccante', testo: 'a', ordine: 0 }]);
  const ins = c._calls.find(x => x.op === 'insert');
  assert.ok(Array.isArray(ins.payload));
});

test('addRuotaContenuto inserisce e ritorna la riga (single)', async () => {
  const c = fakeClient();
  const r = await addRuotaContenuto(c, { couple_id: 'cpl', categoria: 'buono', emoji: '💆', testo: 'Massaggio', descrizione: 'x', ordine: 2 });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.categoria, 'buono');
  assert.equal(ins.payload.emoji, '💆');
  assert.equal(ins.single, true);
  assert.equal(r.testo, 'Massaggio');
});

test('updateRuotaContenuto aggiorna per id', async () => {
  const c = fakeClient();
  await updateRuotaContenuto(c, 'id1', { emoji: '🔥', testo: 'nuovo', descrizione: null });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.filters.id, 'id1');
  assert.equal(upd.payload.testo, 'nuovo');
});

test('deleteRuotaContenuto elimina per id', async () => {
  const c = fakeClient();
  await deleteRuotaContenuto(c, 'id1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'id1');
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node --test test/ruota.test.js`
Expected: FAIL — funzioni contenuti non esportate.

- [ ] **Step 3: Implementare in `js/store.js`** (in coda)

```js
// ---- CONTENUTI RUOTA (editabili per coppia) ----
export async function listRuotaContenuti(client, coupleId) {
  const res = await client.from('ruota_contenuti').select('*')
    .eq('couple_id', coupleId).order('categoria', { ascending: true }).order('ordine', { ascending: true });
  return check(res);
}

// Semina i default (vedi logic.ruotaContenutiDefaultRows) la prima volta per la coppia.
export async function seedRuotaContenuti(client, rows) {
  const res = await client.from('ruota_contenuti').insert(rows);
  return check(res);
}

export async function addRuotaContenuto(client, { couple_id, categoria, emoji, testo, descrizione, ordine }) {
  const res = await client.from('ruota_contenuti').insert({
    couple_id, categoria, emoji: emoji || null, testo, descrizione: descrizione || null, ordine: ordine ?? 0,
  }).select().single();
  return check(res);
}

export async function updateRuotaContenuto(client, id, { emoji, testo, descrizione }) {
  const res = await client.from('ruota_contenuti')
    .update({ emoji: emoji || null, testo, descrizione: descrizione || null }).eq('id', id);
  return check(res);
}

export async function deleteRuotaContenuto(client, id) {
  const res = await client.from('ruota_contenuti').delete().eq('id', id);
  return check(res);
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node --test test/ruota.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/ruota.test.js
git commit -m "feat(ruota): store contenuti - list/seed/add/update/delete ruota_contenuti"
```

---

## Task 7: CSS — porta gli stili della Ruota dai mockup

**Files:**
- Modify: `styles.css`

> I valori esatti (gradients, dimensioni, keyframes, timing) sono **già approvati** nei mockup. Questo task li porta in `styles.css` adattando i nomi-classe al prefisso `.ruota-`. La sorgente verbatim è `mockups/ruota-popup-dallo-spicchio.html` (scheda 3), `mockups/ruota-bottone-stili.html`, `mockups/ruota-contenuti.html`.

- [ ] **Step 1: Aggiungere il blocco CSS della Ruota**

In coda a `styles.css`, aggiungere una sezione `/* ===== RUOTA A PREMI ===== */` portando, **verbatim e adattando i selettori**, da `mockups/ruota-popup-dallo-spicchio.html`:
- `.wheel-wrap`, `.pointer`, `.wheel` (conic-gradient bordeaux + `::after` separatori oro + `transition:transform 4.2s var(--spin)`), `.slice-lbl`, `.slice-lbl .in` (con la stessa `transition` della ruota → emoji dritte), `.slice-lbl .e`, `.hub`;
- la variabile `--spin:cubic-bezier(.17,.67,.18,1)` va in `:root` di `styles.css` se non già presente;
- lo **spotlight**: la classe overlay che scurisce tutto tranne i ~45° in alto (da `mockups/ruota-spicchio-stili.html` / scheda spotlight di `ruota-popup-dallo-spicchio.html`);
- il **pop-up premio** "proiezione di luce": `.ruota-reveal` (scrim flex-center), `.beam`, `.prize`, `.prize .won/.big/.name/.body/.row`, e i keyframes di materializzazione (blur→nitido). Riusare il pattern scrim+lock dei Dadi (classe contenitore con `.modal` **oppure** `.dadi-scrim` così lo scroll-lock automatico di `ui.js` si attiva).

Da `mockups/ruota-bottone-stili.html`:
- `.giri-card` (card saldo), `.coins`/`.coin.full`/`.coin.empty` (pallini-gettone), `.giri-card .right` (countdown), il **bottone ghost** "GIRA LA RUOTA" (bordo oro, fondo trasparente) e il suo stato `:disabled`.

Da `mockups/ruota-contenuti.html`:
- `.coupon`/`.coupon .em/.tt/.ds` se serve uno stile dedicato per l'anteprima del buono nel pop-up (altrimenti riusare gli stili Buoni esistenti).

I token colore (`--wine`,`--gold`,`--gold-soft`,`--cream`,`--bg`,`--bg2`) esistono già in `styles.css`: **non ridefinirli**, riusarli.

- [ ] **Step 2: Verifica visiva rapida**

Aprire `index.html` nel browser dopo aver loggato (o aprire il mockup di riferimento accanto) e confrontare a occhio: i nuovi stili non devono rompere il layout esistente. (La verifica funzionale completa è nel Task 10.)

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(ruota): porta CSS ruota/spotlight/popup/card saldo dai mockup"
```

---

## Task 8: `ruota.js` — modulo (render, spin, premi, editor)

**Files:**
- Create: `js/modules/ruota.js`

> Questo modulo NON è unit-testato (come `giochi.js`): si verifica con lo smoke del Task 10. Segue lo stile di `giochi.js` (stato a modulo, `mk/add/clear`, scrim+lock). La geometria/animazione dello spin replica `mockups/ruota-popup-dallo-spicchio.html`.

- [ ] **Step 1: Creare `js/modules/ruota.js` con render + caricamento + seeding**

```js
import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  FETTE, fetteRuota, estraiFetta, saldoGiri, puoGirare, giriEleggibile, ultimiPremi,
  ruotaContenutiDefaultRows, proposteDa, buoniSorpresaDa, pescaContenuto, ECONOMIA,
} from '../lib/logic.js';
import {
  listGiri, accreditaGiro, spendiGiro,
  listRuotaContenuti, seedRuotaContenuti, addRuotaContenuto, updateRuotaContenuto, deleteRuotaContenuto,
  listBuoni, addBuono, listCarte, listDesideri,
} from '../store.js';
import { segretiDaRivelare } from '../lib/logic.js'; // dalla spec segreti (vedi nota sotto)

let ctx = null;        // { client, me, panel }
let state = null;      // dati caricati: { mov, cont, buoni, carte, desideri, saldo, elegg, fette }
let busy = false;
let rot = 0;           // rotazione cumulativa della ruota (gradi)

// Caricamento dati + maturazione pigra del giro gratis + seeding contenuti.
export async function renderRuota(context) {
  ctx = context;
  const { client, me } = ctx;
  let mov = await listGiri(client, me.couple_id);
  const elegg = giriEleggibile(mov, me.id);
  if (elegg.ok) {                                   // matura il gratis (pigro)
    try { await accreditaGiro(client, { couple_id: me.couple_id, user_id: me.id, motivo: 'settimanale' }); mov = await listGiri(client, me.couple_id); }
    catch { /* cosmetico: si riprova alla prossima apertura */ }
  }
  let cont = await listRuotaContenuti(client, me.couple_id);
  if (!cont.length) {                               // prima volta: semina i default
    await seedRuotaContenuti(client, ruotaContenutiDefaultRows(me.couple_id));
    cont = await listRuotaContenuti(client, me.couple_id);
  }
  const buoni = await listBuoni(client, me.couple_id);
  const carte = await listCarte(client, me.couple_id).catch(() => []);
  const proposte = proposteDa(cont), buoniS = buoniSorpresaDa(cont);
  const fette = fetteRuota({
    haSegreti: segretiDaRivelare(buoni, me.id).length > 0,
    haCarte: carte.length > 0,
    haProposte: proposte.length > 0,
    haBuoni: buoniS.length > 0,
  });
  state = { mov, cont, buoni, carte, proposte, buoniS, saldo: saldoGiri(mov, me.id), elegg: giriEleggibile(mov, me.id), fette };
  draw();
}
```

> **Nota dipendenze store:** `listCarte` e `listDesideri` devono esistere in `store.js`. `listDesideri` c'è già. Se `listCarte` non esiste ancora (modulo ToD non costruito), aggiungerla ora in `store.js` con lo stesso pattern: `select('*').eq('couple_id', coupleId)`. `segretiDaRivelare` arriva dalla spec segreti; se non ancora implementata in `logic.js`, aggiungerla qui come da spec: `buoni.filter(b => b.tipo==='segreto' && b.a_id===me && b.stato==='attivo')`.

- [ ] **Step 2: Disegnare la pagina (card saldo + ruota + bottone + storico)**

Aggiungere a `ruota.js`:

```js
function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🎡 Ruota a premi'), mk('p', 'psub', 'Spendi un giro, vinci un premio. Tocca ＋ per modificare proposte e buoni.'));

  // card saldo: pallini-gettone + countdown gratis
  const card = mk('div', 'giri-card');
  const left = mk('div');
  add(left, mk('p', 'k', 'I tuoi giri'));
  const coins = mk('div', 'coins');
  const n = Math.max(state.saldo, 0);
  for (let i = 0; i < Math.max(n, 1); i++) coins.appendChild(mk('span', 'coin ' + (i < n ? 'full' : 'empty')));
  left.appendChild(coins);
  const right = mk('div', 'right');
  right.textContent = state.elegg.ok ? 'gratis disponibile' : 'gratis tra ' + giorniA(state.elegg.prossimoSblocco);
  add(card, left, right);
  p.appendChild(card);

  // ruota
  p.appendChild(buildWheel());

  // bottone GIRA
  const btn = mk('button', 'btn ghost-gold ruota-spin', 'GIRA LA RUOTA');
  btn.disabled = !puoGirare(state.saldo);
  add(btn, mk('span', 'coin full', ''));   // costo come gettone accanto (decorativo)
  btn.onclick = spin;
  p.appendChild(btn);

  // storico ultimi premi
  const ups = ultimiPremi(state.mov, ctx.me.id);
  if (ups.length) {
    p.appendChild(mk('p', 'section-label', 'Ultimi premi'));
    const list = mk('div', 'ruota-storico');
    for (const u of ups) list.appendChild(mk('div', 'ruota-storico-row',
      (u.fetta ? u.fetta.emoji + ' ' + u.fetta.label : u.esito)));
    p.appendChild(list);
  }
}

function giorniA(iso) {
  const giorni = Math.ceil((new Date(iso) - new Date()) / 864e5);
  return giorni <= 1 ? '1 giorno' : giorni + ' giorni';
}
```

- [ ] **Step 3: Costruire la ruota con emoji dritte**

Replica la logica del mockup (`mockups/ruota-popup-dallo-spicchio.html`). Aggiungere a `ruota.js`:

```js
let wheelEl = null;
const SLICE = 360 / 8;   // 45°

function buildWheel() {
  const wrap = mk('div', 'wheel-wrap');
  wrap.appendChild(mk('div', 'pointer'));
  const wheel = mk('div', 'wheel'); wheel.style.transform = `rotate(${rot}deg)`;
  state.fette.forEach((f, i) => {
    const center = i * SLICE + SLICE / 2;        // angolo del centro spicchio (da top, orario)
    const lbl = mk('div', 'slice-lbl');
    const inner = mk('div', 'in');
    // posiziona l'emoji sul raggio dello spicchio; contro-ruota per restare dritta
    inner.style.transform = `rotate(${center}deg) translateY(-104px) rotate(${-center - rot}deg)`;
    const e = mk('span', 'e' + (f.peso === 0 ? ' spenta' : ''), f.emoji);
    inner.appendChild(e); lbl.appendChild(inner); wheel.appendChild(lbl);
  });
  wheel.appendChild(mk('div', 'hub', '💋'));
  wrap.appendChild(wheel);
  wheelEl = wheel;
  return wrap;
}
```

> Le emoji restano dritte perché `.slice-lbl .in` ha la **stessa `transition`** della `.wheel` (vedi CSS portato): quando `rot` cambia, sia la ruota sia la contro-rotazione animano insieme. La classe `.spenta` smorza le fette a peso 0 (opacity ridotta).

- [ ] **Step 4: Implementare lo spin (estrazione, spesa, atterraggio, spotlight, pop-up)**

```js
async function spin() {
  if (busy || !puoGirare(state.saldo)) return;
  busy = true;
  const pick = estraiFetta(state.fette);
  if (!pick) { busy = false; toast('Nessun premio disponibile', 'err'); return; }
  try {
    await spendiGiro(ctx.client, { couple_id: ctx.me.couple_id, user_id: ctx.me.id, esito: pick.fetta.key });
  } catch (err) { busy = false; toast('Errore: ' + err.message, 'err'); return; }

  // porta il centro dello spicchio `indice` sotto il pointer in alto, + 5 giri pieni
  const center = pick.indice * SLICE + SLICE / 2;
  rot += 360 * 5 + ((360 - (rot % 360) - center) % 360);
  wheelEl.style.transform = `rotate(${rot}deg)`;
  // aggiorna anche la contro-rotazione delle emoji per restare dritte
  wheelEl.querySelectorAll('.slice-lbl .in').forEach((inner, i) => {
    const c = i * SLICE + SLICE / 2;
    inner.style.transform = `rotate(${c}deg) translateY(-104px) rotate(${-c - rot}deg)`;
  });
  wheelEl.classList.add('spinning');

  setTimeout(() => {
    wheelEl.classList.add('spotlight-on');     // spotlight sullo spicchio in alto
    showPrize(pick.fetta);
    busy = false;
  }, 4300);                                     // ~ durata transition 4.2s
}
```

- [ ] **Step 5: Pop-up premio + risoluzione per fetta**

```js
function showPrize(fetta) {
  const scrim = mk('div', 'ruota-reveal dadi-scrim');   // .dadi-scrim → scroll-lock auto
  const stage = mk('div', 'stage'); stage.appendChild(mk('div', 'beam'));
  const card = mk('div', 'prize');
  add(card, mk('p', 'won', 'Hai vinto'), mk('div', 'big', fetta.emoji), mk('p', 'name', fetta.label));
  const body = mk('p', 'body'); card.appendChild(body);
  const row = mk('div', 'row');
  const azione = mk('button', 'btn solid');
  const chiudi = mk('button', 'btn ghost', 'Chiudi');
  chiudi.onclick = () => { scrim.remove(); renderRuota(ctx); };
  add(row, azione, chiudi); card.appendChild(row);
  stage.appendChild(card); scrim.appendChild(stage);
  scrim.onclick = e => { if (e.target === scrim) { scrim.remove(); renderRuota(ctx); } };
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
  risolvi(fetta, { body, azione, chiudi, scrim });
}

function risolvi(fetta, ui) {
  const { client, me } = ctx;
  ui.azione.style.display = 'none';   // di default solo "Chiudi"
  switch (fetta.key) {
    case 'piccante': {
      const p = pescaContenuto(state.proposte);
      ui.body.textContent = p ? p.testo : '—';
      break;
    }
    case 'buono': {
      const b = pescaContenuto(state.buoniS);
      ui.body.textContent = b ? `${b.testo}: lo trovi nei Buoni.` : 'Un buono a sorpresa!';
      if (b) addBuono(client, {
        couple_id: me.couple_id, da_id: partnerId(), a_id: me.id,
        emoji: b.emoji, titolo: b.testo, descrizione: b.descrizione, tipo: 'regalo', stato: 'attivo',
      }).catch(err => toast('Buono non salvato: ' + err.message, 'err'));
      break;
    }
    case 'desiderio': {
      const dp = state.desideri ? state.desideri.filter(d => d.stato === 'da_provare') : [];
      const d = pescaContenuto(dp);
      ui.body.textContent = d ? `Stasera: “${d.testo}”.` : 'Aggiungi qualche desiderio da provare!';
      break;
    }
    case 'tod': {
      const c = pescaContenuto(state.carte);
      ui.body.textContent = c ? `${c.tipo === 'verita' ? 'Verità' : 'Sfida'}: ${c.testo}` : 'Aggiungi carte in Obbligo o Verità.';
      break;
    }
    case 'dadi':
      ui.body.textContent = 'Tira i dadi! (vai al gioco Dadi)';
      break;
    case 'ancora':
      ui.body.textContent = 'Giro gratis: ne hai guadagnato un altro!';
      accreditaGiro(client, { couple_id: me.couple_id, user_id: me.id, motivo: 'ancora' })
        .catch(err => toast('Errore: ' + err.message, 'err'));
      break;
    case 'jolly':
      ui.body.textContent = 'Jolly! Scegli tu il premio con il partner.';
      break;
    case 'segreto':
      ui.body.textContent = 'Hai vinto il diritto di aprire un segreto.';
      ui.azione.textContent = 'Scegli quale busta →';
      ui.azione.style.display = '';
      ui.azione.onclick = () => { ui.scrim.remove(); apriSceltaSegreto(); };
      break;
  }
}

function partnerId() {
  // il partner è l'altro membro: derivato dai buoni o dal profilo. Placeholder sicuro:
  const b = state.buoni.find(x => x.da_id !== ctx.me.id) || state.buoni.find(x => x.a_id !== ctx.me.id);
  return b ? (b.da_id !== ctx.me.id ? b.da_id : b.a_id) : ctx.me.id;
}

function apriSceltaSegreto() {
  // delega alla scelta-busta dei segreti (spec segreti). In 4a, fallback: vai alla tab Buoni.
  document.dispatchEvent(new CustomEvent('goto', { detail: 'buoni' }));
}
```

> **Note su `desideri` e `partnerId`:** caricare `state.desideri` in `renderRuota` (`listDesideri`) se vuoi la fetta 💌 attiva; altrimenti il testo di fallback è già gestito. `partnerId()` è un helper provvisorio: se `me` espone `partner_id`/`couple` con i due membri, usalo direttamente (più robusto). Verificare la forma di `me` (da `currentProfile()` in `auth.js`) e preferire il campo esplicito.

- [ ] **Step 6: Editor contenuti (sheet riusando il pattern Dadi)**

```js
export function openEditorRuota() {
  openSheet('Modifica i contenuti della Ruota', s => {
    add(s, mk('p', 'muted', 'Proposte piccanti (🔥) e buoni a sorpresa (🎁). Modificabili in qualsiasi momento.'));
    sezioneEditor(s, 'piccante', '🔥 Proposte piccanti');
    sezioneEditor(s, 'buono', '🎁 Buoni a sorpresa');
  });
}

function sezioneEditor(s, categoria, titolo) {
  s.appendChild(mk('div', 'section-label', titolo));
  const items = state.cont.filter(c => c.categoria === categoria).sort((a, b) => a.ordine - b.ordine);
  for (const it of items) s.appendChild(rigaEditor(it, categoria));
  const addBtn = mk('button', 'btn', '＋ Aggiungi');
  addBtn.onclick = async () => {
    try {
      const ordine = items.length;
      await addRuotaContenuto(ctx.client, {
        couple_id: ctx.me.couple_id, categoria,
        emoji: categoria === 'buono' ? '🎁' : null,
        testo: categoria === 'buono' ? 'Nuovo buono' : 'Nuova proposta',
        descrizione: categoria === 'buono' ? '' : null, ordine,
      });
      await refreshEditor(s);
    } catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  s.appendChild(addBtn);
}

function rigaEditor(it, categoria) {
  const row = mk('div', 'ruota-edit-row');
  let emInput = null;
  if (categoria === 'buono') { emInput = mk('input', 'dadi-em'); emInput.value = it.emoji || ''; emInput.maxLength = 4; row.appendChild(emInput); }
  const tx = mk('input'); tx.value = it.testo; tx.placeholder = categoria === 'buono' ? 'titolo' : 'proposta';
  row.appendChild(tx);
  let dsInput = null;
  if (categoria === 'buono') { dsInput = mk('input'); dsInput.value = it.descrizione || ''; dsInput.placeholder = 'descrizione'; row.appendChild(dsInput); }
  const save = async () => {
    if (!tx.value.trim()) { toast('Il testo non può essere vuoto', 'err'); return; }
    try { await updateRuotaContenuto(ctx.client, it.id, { emoji: emInput ? emInput.value.trim() : null, testo: tx.value.trim(), descrizione: dsInput ? dsInput.value.trim() : null }); }
    catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  tx.onchange = save; if (emInput) emInput.onchange = save; if (dsInput) dsInput.onchange = save;
  const del = mk('button', 'icon-del', '🗑'); del.onclick = async () => {
    try { await deleteRuotaContenuto(ctx.client, it.id); row.remove(); state.cont = state.cont.filter(c => c.id !== it.id); }
    catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  row.appendChild(del);
  return row;
}

async function refreshEditor(sheet) {
  state.cont = await listRuotaContenuti(ctx.client, ctx.me.couple_id);
  const modal = sheet.closest('.modal'); if (modal) modal.remove();
  openEditorRuota();
}
```

- [ ] **Step 7: Commit**

```bash
git add js/modules/ruota.js js/store.js js/lib/logic.js
git commit -m "feat(ruota): modulo ruota.js - render, spin, premi, editor contenuti"
```

---

## Task 9: `giochi.js` — selettore gioco + instradamento FAB

**Files:**
- Modify: `js/modules/giochi.js`

> Oggi `giochi.js` mostra solo i Dadi e cabla `fab:giochi → openEditor` (editor Dadi). Va aggiunto un selettore Dadi/Ruota e l'instradamento del FAB al **gioco corrente**.

- [ ] **Step 1: Aggiungere lo stato "gioco corrente" e il selettore**

In `js/modules/giochi.js`, in cima (sotto gli import), aggiungere:

```js
import { renderRuota, openEditorRuota } from './ruota.js';
let giocoCorrente = 'dadi';   // 'dadi' | 'ruota'
```

Modificare `renderGiochi` per: cablare il FAB una sola volta instradando al gioco corrente, disegnare il **selettore** e montare il gioco scelto. Sostituire il corpo di `renderGiochi`:

```js
export async function renderGiochi(context) {
  ctx = context;
  if (!wired) {
    document.addEventListener('fab:giochi', () => {
      if (giocoCorrente === 'dadi') openEditor();
      else if (giocoCorrente === 'ruota') openEditorRuota();
    });
    wired = true;
  }
  drawSelettore();
  await montaGiocoCorrente();
}

function drawSelettore() {
  const p = ctx.panel; clear(p);
  const sel = mk('div', 'gioco-selettore');
  for (const [k, lbl] of [['dadi', '🎲 Dadi'], ['ruota', '🎡 Ruota']]) {
    const b = mk('button', 'gioco-tab' + (giocoCorrente === k ? ' on' : ''), lbl);
    b.onclick = () => { giocoCorrente = k; renderGiochi(ctx); };
    sel.appendChild(b);
  }
  p.appendChild(sel);
  // contenitore del gioco montato sotto il selettore
  p.appendChild(mk('div', 'gioco-host'));
}

async function montaGiocoCorrente() {
  const host = ctx.panel.querySelector('.gioco-host');
  if (giocoCorrente === 'ruota') {
    await renderRuota({ client: ctx.client, me: ctx.me, panel: host });
  } else {
    await montaDadi(host);   // vedi Step 2
  }
}
```

- [ ] **Step 2: Spostare il disegno dei Dadi in `montaDadi(host)`**

Il vecchio `renderGiochi` faceva: carica facce → `draw()`. La funzione `draw()` attuale disegna i Dadi **dentro `ctx.panel`**: ora deve disegnare dentro l'`host`. Adattare:
- Rinominare/avvolgere la logica di caricamento facce + `draw()` in `async function montaDadi(host)`.
- In `draw()` e `buildField()` sostituire `const p = ctx.panel;` con il parametro `host` (passarlo o tenerlo in una variabile a modulo `let dadiHost`). Mantieni invariata tutta la logica del cubo (`makeCube`, `roll`, `land`, `fling`, `showPop`, `closePop`) — cambia solo il nodo radice da `ctx.panel` a `host`.

Esempio dell'inizio di `montaDadi`:

```js
let dadiHost = null;
async function montaDadi(host) {
  dadiHost = host;
  try {
    let rows = await listDadiFacce(ctx.client, ctx.me.couple_id);
    if (!rows.length) { await seedDadiFacce(ctx.client, facceDefaultRows(ctx.me.couple_id)); rows = await listDadiFacce(ctx.client, ctx.me.couple_id); }
    facce = raggruppaFacce(rows);
  } catch (err) { toast('Errore caricamento dadi: ' + err.message, 'err'); return; }
  draw();
}
```

E in `draw()`: `const p = dadiHost;` (invece di `ctx.panel`).

- [ ] **Step 3: CSS del selettore**

In `styles.css` aggiungere `.gioco-selettore` (flex, gap) e `.gioco-tab`/`.gioco-tab.on` riusando lo stile delle chip già presenti (es. `.dadi-chip`/`.tabs button`).

- [ ] **Step 4: Verifica manuale**

Aprire l'app, tab Giochi: il selettore mostra Dadi/Ruota; Dadi funziona come prima; il FAB (＋) apre l'editor giusto a seconda del gioco selezionato.

- [ ] **Step 5: Commit**

```bash
git add js/modules/giochi.js styles.css
git commit -m "feat(giochi): selettore Dadi/Ruota + FAB instradato al gioco corrente"
```

---

## Task 10: Smoke test e verifica finale

**Files:**
- Modify: `test/smoke.md`

- [ ] **Step 1: Aggiungere la checklist smoke della Ruota**

In `test/smoke.md`, aggiungere una sezione "Ruota a premi (4a)":

```
## Ruota a premi (4a)
- [ ] Tab Giochi → selettore mostra 🎲 Dadi e 🎡 Ruota; i Dadi funzionano come prima.
- [ ] Ruota: la card saldo mostra i pallini-gettone e "gratis tra N giorni" (o "gratis disponibile").
- [ ] Alla prima apertura della coppia i contenuti si seminano (proposte/buoni presenti nell'editor).
- [ ] GIRA LA RUOTA: la ruota gira (~4s), le emoji restano DRITTE durante e dopo il giro.
- [ ] A fine giro: spotlight sullo spicchio in alto + pop-up "proiezione di luce" centrato.
- [ ] Saldo: girare scala di 1 il saldo; a saldo 0 il bottone è disabilitato.
- [ ] Premio differito: vincere 🎁 crea un buono nella tab Buoni; vincere 🔥 mostra una proposta.
- [ ] Fette condizionali: 💋 spenta senza segreti in attesa; 🃏 spenta a mazzo vuoto; 🔥/🎁 spente se svuoti la categoria nell'editor.
- [ ] Editor (＋ con Ruota selezionata): aggiungi/modifica/elimina una proposta e un buono → si riflette al giro successivo.
- [ ] "Ultimi premi" elenca le vincite recenti.
- [ ] Reload pagina: saldo e contenuti persistono.
- [ ] Con pop-up aperto, lo sfondo NON scrolla (scroll-lock).
```

- [ ] **Step 2: Eseguire la suite unit completa**

Run: `npm test`
Expected: tutti i test PASS (compresi i nuovi di `test/ruota.test.js`), 0 fail.

- [ ] **Step 3: Smoke nel browser**

Aprire `index.html`, loggarsi, e percorrere la checklist dello Step 1. Annotare eventuali scostamenti dai mockup approvati e correggerli.

- [ ] **Step 4: Commit**

```bash
git add test/smoke.md
git commit -m "test(ruota): checklist smoke Fase 4a"
```

---

## Note di dipendenza tra spec (da tenere a mente)

- **`segretiDaRivelare`** e la **scelta-busta** vengono dalla spec `coupon-segreti`. In 4a la fetta 💋 può atterrare ma il flusso completo di apertura busta dipende dall'implementazione dei segreti. Se i segreti non sono ancora implementati, tenere la fetta 💋 **spenta** (nessuna busta in attesa) finché non lo sono — il codice la spegne già via `fetteRuota`. Coordinare l'ordine: implementare i segreti **prima o insieme**, oppure accettare che 💋 resti inattiva fino ad allora.
- **`listCarte`**: se il modulo ToD non è ancora costruito, basta la funzione store `listCarte` (la tabella `carte` esiste già nel DB). La fetta 🃏 resta spenta a mazzo vuoto.
- **`concediGiro`**: l'hook è pronto ma **nessun gioco lo chiama ancora** (Strip Poker non costruito). Va agganciato quando quei giochi esistono.

## Self-review effettuata

- **Copertura spec:** §3 (migrazione → Task 1), §4 (config/default → Task 2,4), §5 (pure → Task 2,3,4), §6 (store → Task 5,6), §7 (modulo+editor → Task 8,9 + CSS Task 7), §8 (risoluzione premi → Task 8 Step 5), §11 (test → tutti i Task + Task 10). ✔
- **Tipi/firme coerenti:** `fetteRuota({haSegreti,haCarte,haProposte,haBuoni})`, `estraiFetta→{indice,fetta}`, `accreditaGiro({...,delta})`, `pescaContenuto(lista,rnd)` usati in modo identico tra logic, store e modulo. ✔
- **Punti aperti dichiarati (non placeholder):** `partnerId()` e il caricamento `desideri` sono segnalati come da rifinire sulla forma reale di `me` (Task 8 Step 5); il flusso busta-segreto dipende dalla spec segreti (Note di dipendenza). Questi sono vincoli inter-spec reali, non TODO mascherati.
