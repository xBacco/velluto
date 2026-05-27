import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateProfile } from '../js/store.js';

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
