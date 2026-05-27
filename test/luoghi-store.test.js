import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listLuoghi, addLuogo, updateLuogo, deleteLuogo } from '../js/store.js';

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

test('listLuoghi seleziona per couple_id', async () => {
  const c = fakeClient([
    { id: 'a', couple_id: 'cpl', nome: 'x' },
    { id: 'z', couple_id: 'altra', nome: 'y' },
  ]);
  const data = await listLuoghi(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'a');
  assert.equal(c._calls[0].table, 'luoghi');
  assert.equal(c._calls[0].filters.couple_id, 'cpl');
});

test('addLuogo inserisce con default e ritorna la riga', async () => {
  const c = fakeClient();
  const row = await addLuogo(c, {
    couple_id: 'cpl', autore_id: 'u1', nome: 'Tropea', citta: '',
    lat: 38.6, lng: 15.8, intimo: true, voto: 5, descrizione: '', data_evento: '2025-08-21',
  });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.nome, 'Tropea');
  assert.equal(ins.payload.citta, null);      // stringa vuota → null
  assert.equal(ins.payload.intimo, true);
  assert.equal(ins.payload.voto, 5);
  assert.ok(row.id);
});

test('updateLuogo aggiorna per id', async () => {
  const c = fakeClient();
  await updateLuogo(c, 'id1', { nome: 'Nuovo', citta: 'Roma', intimo: false, voto: 0, descrizione: 'x', data_evento: '2026-01-01' });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.nome, 'Nuovo');
  assert.equal(upd.filters.id, 'id1');
});

test('deleteLuogo elimina per id', async () => {
  const c = fakeClient();
  await deleteLuogo(c, 'id1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'id1');
});
