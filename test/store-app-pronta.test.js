import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateProfile, wipeDesideri, wipeEsperienze, wipeBuoni, wipeGiochi, wipeLuoghi, wipeTipi } from '../js/store.js';

function fakeClient(initialRows = []) {
  const calls = [];
  const rows = [...initialRows];
  function builder(table) {
    const state = { table, op: null, payload: null, filters: {}, single: false };
    const api = {
      select() { if (!state.op) state.op = 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(c, v) { state.filters[c] = v; return api; },
      order() { return api; },
      single() { state.single = true; return api; },
      then(resolve) {
        calls.push(state);
        if (state.op === 'select') {
          const data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data: state.single ? data[0] : data, error: null });
        } else if (state.op === 'insert') {
          const created = { id: 'new-' + (rows.length + 1), ...state.payload };
          rows.push(created);
          resolve({ data: state.single ? created : [created], error: null });
        } else {
          resolve({ data: null, error: null });
        }
      },
    };
    return api;
  }
  return { from: builder, _calls: calls, _rows: rows };
}
export { fakeClient };

test('updateProfile aggiorna avatar e display_name del profilo per id', async () => {
  const c = fakeClient();
  await updateProfile(c, 'u1', { display_name: 'Tomas', avatar: '🐻' });
  const up = c._calls.find(x => x.op === 'update');
  assert.equal(up.table, 'profiles');
  assert.equal(up.payload.display_name, 'Tomas');
  assert.equal(up.payload.avatar, '🐻');
  assert.equal(up.filters.id, 'u1');
});

test('updateProfile manda solo i campi forniti', async () => {
  const c = fakeClient();
  await updateProfile(c, 'u1', { avatar: '🧁' });
  const up = c._calls.find(x => x.op === 'update');
  assert.deepEqual(Object.keys(up.payload), ['avatar']);
});

test('wipeDesideri cancella i desideri della coppia', async () => {
  const c = fakeClient();
  await wipeDesideri(c, 'cpl');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.table, 'desideri');
  assert.equal(del.filters.couple_id, 'cpl');
});

test('wipeEsperienze pulisce le foto delle esperienze poi le righe', async () => {
  const c = fakeClient([{ id: 'e1', couple_id: 'cpl' }, { id: 'e9', couple_id: 'altra' }]);
  await wipeEsperienze(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'foto' && x.op === 'select' && x.filters.ref_id === 'e1'));
  const del = c._calls.find(x => x.table === 'esperienze' && x.op === 'delete');
  assert.equal(del.filters.couple_id, 'cpl');
});

test('wipeBuoni pulisce foto buono poi righe', async () => {
  const c = fakeClient([{ id: 'b1', couple_id: 'cpl' }]);
  await wipeBuoni(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'foto' && x.op === 'select' && x.filters.ref_id === 'b1'));
  assert.ok(c._calls.some(x => x.table === 'buoni' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});

test('wipeGiochi azzera giri_movimenti e strip_partite', async () => {
  const c = fakeClient();
  await wipeGiochi(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'giri_movimenti' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
  assert.ok(c._calls.some(x => x.table === 'strip_partite' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});

test('wipeLuoghi pulisce foto luogo poi righe', async () => {
  const c = fakeClient([{ id: 'l1', couple_id: 'cpl' }]);
  await wipeLuoghi(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'foto' && x.op === 'select' && x.filters.ref_id === 'l1'));
  assert.ok(c._calls.some(x => x.table === 'luoghi' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});

test('wipeTipi cancella i tipi della coppia', async () => {
  const c = fakeClient();
  await wipeTipi(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'tipi' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});
