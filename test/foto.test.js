import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadFoto, listFoto, listFotoGalleria, signedUrl, deleteFoto, deleteFotoDi } from '../js/store.js';

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
          rows.push(created); resolve({ data: state.single ? created : [created], error: null });
        } else if (state.op === 'delete') {
          for (let i = rows.length - 1; i >= 0; i--)
            if (Object.entries(state.filters).every(([k, v]) => rows[i][k] === v)) rows.splice(i, 1);
          resolve({ data: null, error: null });
        } else { resolve({ data: null, error: null }); }
      },
    };
    return api;
  }
  const storage = { ops: [], from(bucket) { return {
    upload: async (path, file) => { storage.ops.push({ op: 'upload', bucket, path, file }); return { data: { path }, error: null }; },
    createSignedUrl: async (path, exp) => { storage.ops.push({ op: 'sign', bucket, path, exp }); return { data: { signedUrl: 'https://signed/' + path + '?e=' + exp }, error: null }; },
    remove: async (paths) => { storage.ops.push({ op: 'remove', bucket, paths }); return { data: {}, error: null }; },
  }; } };
  return { from: builder, storage, _calls: calls, _tables: tables, _storage: storage };
}

test('uploadFoto carica e registra riga con contesto e ref_id', async () => {
  const c = fakeClient();
  const row = await uploadFoto(c, { coupleId: 'cpl', autoreId: 'u1', contesto: 'buono', refId: 'b1', file: { name: 'x.jpg' }, path: 'cpl/buono/b1/1-x.jpg', didascalia: 'ciao' });
  const up = c._storage.ops.find(o => o.op === 'upload');
  assert.equal(up.bucket, 'foto');
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.contesto, 'buono');
  assert.equal(ins.payload.ref_id, 'b1');
  assert.equal(ins.payload.didascalia, 'ciao');
  assert.equal(ins.payload.storage_path, 'cpl/buono/b1/1-x.jpg');
  assert.ok(row.id);
});

test('uploadFoto: didascalia vuota -> null', async () => {
  const c = fakeClient();
  await uploadFoto(c, { coupleId: 'cpl', autoreId: 'u1', contesto: 'buono', refId: 'b1', file: { name: 'x.jpg' }, path: 'p' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.didascalia, null);
});

test('listFoto filtra per contesto e ref_id', async () => {
  const c = fakeClient({ foto: [
    { id: 'f1', contesto: 'buono', ref_id: 'b1', storage_path: 'a' },
    { id: 'f2', contesto: 'esperienza', ref_id: 'e1', storage_path: 'b' },
  ] });
  const data = await listFoto(c, { contesto: 'buono', refId: 'b1' });
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'f1');
});

test('listFotoGalleria prende tutte le foto della coppia', async () => {
  const c = fakeClient({ foto: [
    { id: 'f1', couple_id: 'cpl', contesto: 'buono' }, { id: 'f2', couple_id: 'cpl', contesto: 'esperienza' },
    { id: 'f3', couple_id: 'altra', contesto: 'buono' },
  ] });
  const data = await listFotoGalleria(c, 'cpl');
  assert.equal(data.length, 2);
});

test('signedUrl ritorna URL firmato', async () => {
  const c = fakeClient();
  assert.equal(await signedUrl(c, 'p/x.jpg', 3600), 'https://signed/p/x.jpg?e=3600');
});

test('deleteFoto rimuove da storage e cancella riga', async () => {
  const c = fakeClient({ foto: [{ id: 'f1', storage_path: 'p/x.jpg' }] });
  await deleteFoto(c, { id: 'f1', storagePath: 'p/x.jpg' });
  assert.deepEqual(c._storage.ops.find(o => o.op === 'remove').paths, ['p/x.jpg']);
  assert.equal(c._tables.foto.length, 0);
});

test('deleteFotoDi cancella tutte le foto di un genitore e ritorna 0 fallite', async () => {
  const c = fakeClient({ foto: [
    { id: 'f1', contesto: 'buono', ref_id: 'b1', storage_path: 'a' },
    { id: 'f2', contesto: 'buono', ref_id: 'b1', storage_path: 'b' },
  ] });
  const fallite = await deleteFotoDi(c, { contesto: 'buono', refId: 'b1' });
  assert.equal(fallite, 0);
  assert.equal(c._tables.foto.length, 0);
});
