import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECONOMIA, saldoGiri, puoGirare, giriEleggibile,
} from '../js/lib/logic.js';

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
