import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDesideri, addDesiderio, markRealizzato, deleteDesiderio } from '../js/store.js';

// --- fake client supabase ---
function fakeClient(initialRows = []) {
  const calls = [];
  const rows = [...initialRows];
  function builder(table) {
    const state = { table, op: null, payload: null, filters: {}, order: null };
    const api = {
      select() { state.op = 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      order(col, opts) { state.order = { col, opts }; return api; },
      then(resolve) {
        calls.push(state);
        if (state.op === 'select') {
          let data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data, error: null });
        } else if (state.op === 'insert') {
          const created = { id: 'new', ...state.payload };
          rows.push(created);
          resolve({ data: [created], error: null });
        } else {
          resolve({ data: null, error: null });
        }
      },
    };
    return api;
  }
  return { from: builder, _calls: calls, _rows: rows };
}

test('listDesideri seleziona per couple_id', async () => {
  const c = fakeClient([{ id: 'a', couple_id: 'cpl', testo: 'x' }]);
  const data = await listDesideri(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].table, 'desideri');
  assert.equal(c._calls[0].filters.couple_id, 'cpl');
});

test('addDesiderio inserisce con stato default da_provare', async () => {
  const c = fakeClient();
  await addDesiderio(c, { couple_id: 'cpl', autore_id: 'u1', testo: 'voglio x', categoria: 'Gioco' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.stato, 'da_provare');
  assert.equal(ins.payload.testo, 'voglio x');
  assert.equal(ins.payload.couple_id, 'cpl');
});

test('markRealizzato setta stato e data', async () => {
  const c = fakeClient();
  await markRealizzato(c, 'id1', '2026-05-26');
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.stato, 'realizzato');
  assert.equal(upd.payload.data_realizzato, '2026-05-26');
  assert.equal(upd.filters.id, 'id1');
});

test('deleteDesiderio elimina per id', async () => {
  const c = fakeClient();
  await deleteDesiderio(c, 'id1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'id1');
});

test('listDesideri propaga errore', async () => {
  const bad = { from: () => ({ select() { return this; }, eq() { return this; },
    order() { return this; }, then(r){ r({ data: null, error: { message: 'boom' } }); } }) };
  await assert.rejects(() => listDesideri(bad, 'cpl'), /boom/);
});
