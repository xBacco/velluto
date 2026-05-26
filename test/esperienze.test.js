import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza,
} from '../js/store.js';

// --- fake client: query builder (con single) + storage ---
function fakeClient(initialTables = {}) {
  const calls = [];
  const tables = {};
  for (const [t, rows] of Object.entries(initialTables)) tables[t] = [...rows];
  function builder(table) {
    tables[table] ||= [];
    const state = { table, op: 'select', payload: null, filters: {}, order: null, single: false };
    const api = {
      select() { if (state.op !== 'insert') state.op = 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      order(col, opts) { state.order = { col, opts }; return api; },
      single() { state.single = true; return api; },
      then(resolve) {
        calls.push(state);
        const rows = tables[table];
        if (state.op === 'select') {
          const data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data: state.single ? (data[0] ?? null) : data, error: null });
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
  const storage = {
    ops: [],
    from(bucket) {
      return {
        upload: async (path, file) => { storage.ops.push({ op: 'upload', bucket, path, file }); return { data: { path }, error: null }; },
        createSignedUrl: async (path, exp) => { storage.ops.push({ op: 'sign', bucket, path, exp }); return { data: { signedUrl: 'https://signed/' + path + '?e=' + exp }, error: null }; },
        remove: async (paths) => { storage.ops.push({ op: 'remove', bucket, paths }); return { data: {}, error: null }; },
      };
    },
  };
  return { from: builder, storage, _calls: calls, _tables: tables, _storage: storage };
}

test('listEsperienze filtra per couple_id e ordina per data', async () => {
  const c = fakeClient({ esperienze: [{ id: 'a', couple_id: 'cpl', data: '2026-05-01' }] });
  const data = await listEsperienze(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].table, 'esperienze');
  assert.equal(c._calls[0].filters.couple_id, 'cpl');
  assert.equal(c._calls[0].order.col, 'data');
});

test('addEsperienza inserisce con voto default e ritorna la riga con id', async () => {
  const c = fakeClient();
  const row = await addEsperienza(c, { couple_id: 'cpl', autore_id: 'u1', titolo: 'Serata', testo: '', data: '2026-05-26' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.voto, 0);
  assert.equal(ins.payload.testo, null);     // stringa vuota -> null
  assert.equal(ins.payload.titolo, 'Serata');
  assert.ok(row.id);                          // id restituito per le foto
});

test('updateEsperienza aggiorna campi e filtra per id', async () => {
  const c = fakeClient();
  await updateEsperienza(c, 'e1', { titolo: 'X', testo: 'ok', data: '2026-05-26', voto: 4 });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.voto, 4);
  assert.equal(upd.payload.titolo, 'X');
  assert.equal(upd.filters.id, 'e1');
});

test('deleteEsperienza elimina per id', async () => {
  const c = fakeClient();
  await deleteEsperienza(c, 'e1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'e1');
});

test('addEsperienza propaga errore', async () => {
  const bad = { from: () => ({ insert() { return this; }, select() { return this; },
    single() { return this; }, then(r) { r({ data: null, error: { message: 'boom' } }); } }) };
  await assert.rejects(() => addEsperienza(bad, { couple_id: 'c', autore_id: 'u', titolo: 't', testo: '', data: '2026-05-26' }), /boom/);
});
