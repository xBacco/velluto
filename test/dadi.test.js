import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DADI_ORDER, DADI_DEFAULT, raggruppaFacce, facceDefaultRows, tiraDadi, componiFrase,
} from '../js/lib/logic.js';
import { listDadiFacce, seedDadiFacce, updateDadiFaccia } from '../js/store.js';

test('facceDefaultRows: 18 righe (3 dadi × 6), campi corretti', () => {
  const rows = facceDefaultRows('cpl');
  assert.equal(rows.length, 18);
  for (const dado of DADI_ORDER) assert.equal(rows.filter(r => r.dado === dado).length, 6);
  const first = rows[0];
  assert.equal(first.couple_id, 'cpl');
  assert.equal(first.dado, 'az');
  assert.equal(first.ordine, 0);
  assert.equal(first.emoji, DADI_DEFAULT.az[0].e);
  assert.equal(first.testo, DADI_DEFAULT.az[0].t);
});

test('raggruppaFacce: ordina per ordine e raggruppa per dado', () => {
  const rows = [
    { dado: 'az', ordine: 1, emoji: '👅', testo: 'Lecca' },
    { dado: 'az', ordine: 0, emoji: '💋', testo: 'Bacia' },
    { dado: 'lu', ordine: 0, emoji: '🛋️', testo: 'sul divano' },
  ];
  const g = raggruppaFacce(rows);
  assert.equal(g.az[0].testo, 'Bacia');
  assert.equal(g.az[1].testo, 'Lecca');
  assert.equal(g.lu[0].testo, 'sul divano');
  assert.equal(g.co.length, 0);
});

test('tiraDadi: solo i dadi attivi, indici da rnd iniettato', () => {
  const seq = [0.0, 0.99, 0.5];
  let i = 0;
  const rnd = () => seq[i++];
  const picks = tiraDadi({ az: true, co: false, lu: true }, rnd);
  assert.deepEqual(Object.keys(picks).sort(), ['az', 'lu']);
  assert.equal(picks.az, 0);   // 0.0*6 = 0
  assert.equal(picks.lu, 5);   // 0.99*6 = 5 (co saltato, quindi lu usa il secondo valore)
});

test('componiFrase: azione fa da verbo, resto concatenato', () => {
  const facce = raggruppaFacce(facceDefaultRows('cpl'));
  const r = componiFrase(facce, { az: 0, co: 0, lu: 0 });
  assert.equal(r.act, 'Bacia');
  assert.deepEqual(r.rest, ['il collo', 'sul divano']);
  assert.equal(r.emos.length, 3);
});

test('componiFrase: senza azione, il primo resto diventa verbo', () => {
  const facce = raggruppaFacce(facceDefaultRows('cpl'));
  const r = componiFrase(facce, { co: 0, lu: 0 });
  assert.equal(r.act, 'il collo');
  assert.deepEqual(r.rest, ['sul divano']);
});

// --- store con client finto ---
function fakeClient(initialRows = []) {
  const calls = [];
  const rows = [...initialRows];
  function builder(table) {
    const state = { table, op: null, payload: null, filters: {}, orders: [] };
    const api = {
      select() { state.op = state.op || 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      order(col, opts) { state.orders.push({ col, opts }); return api; },
      then(resolve) {
        calls.push(state);
        if (state.op === 'select') {
          const data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data, error: null });
        } else if (state.op === 'insert') {
          const arr = Array.isArray(state.payload) ? state.payload : [state.payload];
          arr.forEach(p => rows.push({ id: 'new' + rows.length, ...p }));
          resolve({ data: arr, error: null });
        } else { resolve({ data: null, error: null }); }
      },
    };
    return api;
  }
  return { from: builder, _calls: calls, _rows: rows };
}

test('listDadiFacce: filtra per couple_id', async () => {
  const c = fakeClient([
    { id: 'a', couple_id: 'cpl', dado: 'az', ordine: 0 },
    { id: 'z', couple_id: 'altra', dado: 'az', ordine: 0 },
  ]);
  const data = await listDadiFacce(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'a');
  assert.equal(c._calls[0].table, 'dadi_facce');
});

test('seedDadiFacce: inserisce le 18 righe default', async () => {
  const c = fakeClient();
  await seedDadiFacce(c, facceDefaultRows('cpl'));
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.length, 18);
  assert.equal(c._rows.length, 18);
});

test('updateDadiFaccia: aggiorna emoji e testo per id', async () => {
  const c = fakeClient();
  await updateDadiFaccia(c, 'id1', { emoji: '🔥', testo: 'Stuzzica' });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.filters.id, 'id1');
  assert.equal(upd.payload.emoji, '🔥');
  assert.equal(upd.payload.testo, 'Stuzzica');
});
