import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPI_DEFAULT, tipiDefaultRows, findTipo, isMomentoRapido, countTipoOnDate, splitGiorno,
} from '../js/lib/logic.js';
import {
  listTipi, seedTipi, addTipo, updateTipo, deleteTipo, addMomento, addEsperienza,
} from '../js/store.js';

// ---------- logica pura ----------

test('tipiDefaultRows: una riga per default, con couple_id e ordine progressivo', () => {
  const rows = tipiDefaultRows('cpl');
  assert.equal(rows.length, TIPI_DEFAULT.length);
  assert.equal(rows[0].couple_id, 'cpl');
  assert.equal(rows[0].ordine, 0);
  assert.equal(rows[3].ordine, 3);
  assert.equal(rows[0].emoji, TIPI_DEFAULT[0].emoji);
  assert.equal(rows[0].label, TIPI_DEFAULT[0].label);
});

test('findTipo: trova per id, altrimenti fallback generico', () => {
  const tipi = [{ id: 't1', emoji: '🌶️', label: 'Scopata' }];
  assert.equal(findTipo(tipi, 't1').label, 'Scopata');
  const f = findTipo(tipi, 'inesistente');
  assert.equal(f.emoji, '✦');
  assert.equal(f.label, 'Evento');
  assert.equal(findTipo(tipi, null).label, 'Evento'); // evento legacy senza tipo
});

test('isMomentoRapido: vero se manca il titolo', () => {
  assert.equal(isMomentoRapido({ tipo_id: 't1', titolo: null }), true);
  assert.equal(isMomentoRapido({ tipo_id: 't1', titolo: '' }), true);
  assert.equal(isMomentoRapido({ tipo_id: 't1', titolo: 'Notte in hotel' }), false);
});

test('countTipoOnDate: conta eventi di un tipo in una data', () => {
  const evs = [
    { tipo_id: 't1', data: '2026-05-26' },
    { tipo_id: 't1', data: '2026-05-26' },
    { tipo_id: 't1', data: '2026-05-25' },
    { tipo_id: 't2', data: '2026-05-26' },
  ];
  assert.equal(countTipoOnDate(evs, 't1', '2026-05-26'), 2);
  assert.equal(countTipoOnDate(evs, 't2', '2026-05-26'), 1);
  assert.equal(countTipoOnDate(evs, 't1', '2026-05-01'), 0);
});

test('splitGiorno: separa card ricche e conteggi dei momenti per tipo (in ordine)', () => {
  const tipi = [{ id: 't1', emoji: '🌶️', label: 'Scopata' }, { id: 't2', emoji: '🫦', label: 'Pompino' }];
  const evs = [
    { tipo_id: 't1', titolo: 'Notte in hotel' },   // ricca
    { tipo_id: 't1', titolo: null },                // momento
    { tipo_id: 't1', titolo: null },                // momento
    { tipo_id: 't2', titolo: null },                // momento
  ];
  const { ricchi, conteggi } = splitGiorno(evs, tipi);
  assert.equal(ricchi.length, 1);
  assert.equal(ricchi[0].titolo, 'Notte in hotel');
  assert.deepEqual(conteggi.map(c => [c.tipo.id, c.n]), [['t1', 2], ['t2', 1]]);
});

// ---------- store (fake client) ----------

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
  return { from: builder, _calls: calls, _tables: tables };
}

test('listTipi filtra per couple_id e ordina per ordine', async () => {
  const c = fakeClient({ tipi: [{ id: 't1', couple_id: 'cpl', ordine: 0 }, { id: 'z', couple_id: 'altra', ordine: 0 }] });
  const data = await listTipi(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].table, 'tipi');
  assert.equal(c._calls[0].filters.couple_id, 'cpl');
  assert.equal(c._calls[0].order.col, 'ordine');
});

test('seedTipi inserisce le righe default', async () => {
  const c = fakeClient();
  await seedTipi(c, tipiDefaultRows('cpl'));
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.table, 'tipi');
  assert.equal(ins.payload.length, TIPI_DEFAULT.length);
});

test('addTipo inserisce e ritorna la riga con id', async () => {
  const c = fakeClient();
  const row = await addTipo(c, { couple_id: 'cpl', emoji: '🛁', label: 'In vasca', ordine: 4 });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.emoji, '🛁');
  assert.equal(ins.payload.label, 'In vasca');
  assert.equal(ins.payload.ordine, 4);
  assert.ok(row.id);
});

test('updateTipo aggiorna emoji/label per id', async () => {
  const c = fakeClient();
  await updateTipo(c, 't1', { emoji: '🔥', label: 'Rinominato' });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.label, 'Rinominato');
  assert.equal(upd.filters.id, 't1');
});

test('deleteTipo elimina per id', async () => {
  const c = fakeClient();
  await deleteTipo(c, 't1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 't1');
});

test('addMomento crea esperienza senza titolo (titolo null, voto 0)', async () => {
  const c = fakeClient();
  const row = await addMomento(c, { couple_id: 'cpl', autore_id: 'u1', tipo_id: 't1', data: '2026-05-26' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.table, 'esperienze');
  assert.equal(ins.payload.tipo_id, 't1');
  assert.equal(ins.payload.titolo, null);
  assert.equal(ins.payload.voto, 0);
  assert.ok(row.id);
});

test('addEsperienza propaga tipo_id e rende null un titolo vuoto', async () => {
  const c = fakeClient();
  await addEsperienza(c, { couple_id: 'cpl', autore_id: 'u1', tipo_id: 't2', titolo: 'Notte', testo: '', data: '2026-05-26', voto: 5 });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.tipo_id, 't2');
  assert.equal(ins.payload.titolo, 'Notte');
  assert.equal(ins.payload.testo, null);
  assert.equal(ins.payload.voto, 5);
});
