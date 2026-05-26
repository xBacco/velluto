import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicaTransizioneBuono, gruppoBundle,
  buoniRicevuti, buoniInviati, richiesteDaConcedere, richiesteInviate,
} from '../js/lib/logic.js';
import { listBuoni, addBuono, updateStatoBuono, deleteBuono } from '../js/store.js';

test('riscatta: attivo -> riscattato con timestamp', () => {
  const patch = applicaTransizioneBuono({ tipo: 'regalo', stato: 'attivo' }, 'riscatta', () => '2026-05-26T10:00:00Z');
  assert.equal(patch.stato, 'riscattato');
  assert.equal(patch.riscattato_il, '2026-05-26T10:00:00Z');
});

test('riscatta non attivo -> errore', () => {
  assert.throws(() => applicaTransizioneBuono({ tipo: 'regalo', stato: 'riscattato' }, 'riscatta'), /attivo/);
});

test('accetta richiesta in attesa -> regalo attivo', () => {
  const patch = applicaTransizioneBuono({ tipo: 'richiesta', stato: 'in_attesa' }, 'accetta');
  assert.equal(patch.tipo, 'regalo');
  assert.equal(patch.stato, 'attivo');
});

test('rifiuta richiesta in attesa -> rifiutato', () => {
  const patch = applicaTransizioneBuono({ tipo: 'richiesta', stato: 'in_attesa' }, 'rifiuta');
  assert.equal(patch.stato, 'rifiutato');
});

test('accetta un regalo -> errore', () => {
  assert.throws(() => applicaTransizioneBuono({ tipo: 'regalo', stato: 'attivo' }, 'accetta'), /richiesta/);
});

test('azione sconosciuta -> errore', () => {
  assert.throws(() => applicaTransizioneBuono({ tipo: 'regalo', stato: 'attivo' }, 'boh'), /sconosciuta/);
});

test('gruppoBundle: singoli separati, stesso bundle_id raggruppato, ordine preservato', () => {
  const g = gruppoBundle([
    { id: '1', bundle_id: null },
    { id: '2', bundle_id: 'B' },
    { id: '3', bundle_id: 'B' },
    { id: '4', bundle_id: null },
  ]);
  assert.equal(g.length, 3);
  assert.equal(g[0].buoni.length, 1);
  assert.equal(g[1].bundle_id, 'B');
  assert.equal(g[1].buoni.length, 2);
  assert.equal(g[2].buoni.length, 1);
});

test('filtri viste buoni', () => {
  const me = 'me', tu = 'tu';
  const buoni = [
    { id: 'r1', tipo: 'regalo', stato: 'attivo', a_id: me, da_id: tu },
    { id: 'r2', tipo: 'regalo', stato: 'riscattato', a_id: me, da_id: tu },
    { id: 'i1', tipo: 'regalo', stato: 'attivo', a_id: tu, da_id: me },
    { id: 'q1', tipo: 'richiesta', stato: 'in_attesa', a_id: tu, da_id: me },
    { id: 'q2', tipo: 'richiesta', stato: 'in_attesa', a_id: me, da_id: tu },
  ];
  assert.deepEqual(buoniRicevuti(buoni, me).map(b => b.id), ['r1', 'r2']);
  assert.deepEqual(buoniInviati(buoni, me).map(b => b.id), ['i1']);
  assert.deepEqual(richiesteDaConcedere(buoni, me).map(b => b.id), ['q1']);
  assert.deepEqual(richiesteInviate(buoni, me).map(b => b.id), ['q2']);
});

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
  return { from: builder, _calls: calls, _tables: tables };
}

test('listBuoni filtra per couple_id e ordina per creato desc', async () => {
  const c = fakeClient({ buoni: [{ id: 'b1', couple_id: 'cpl' }, { id: 'b2', couple_id: 'altra' }] });
  const data = await listBuoni(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].order.col, 'creato');
});

test('addBuono regalo: default emoji e ritorna riga con id', async () => {
  const c = fakeClient();
  const row = await addBuono(c, { couple_id: 'cpl', da_id: 'me', a_id: 'tu', titolo: 'Massaggio', descrizione: '', tipo: 'regalo', stato: 'attivo' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.emoji, '🎟️');
  assert.equal(ins.payload.descrizione, null);
  assert.equal(ins.payload.tipo, 'regalo');
  assert.equal(ins.payload.bundle_id, null);
  assert.ok(row.id);
});

test('addBuono con bundle_id ed emoji custom', async () => {
  const c = fakeClient();
  await addBuono(c, { couple_id: 'cpl', da_id: 'me', a_id: 'tu', emoji: '🍷', titolo: 'Cena', tipo: 'regalo', stato: 'attivo', bundle_id: 'B1' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.emoji, '🍷');
  assert.equal(ins.payload.bundle_id, 'B1');
});

test('updateStatoBuono applica la patch per id', async () => {
  const c = fakeClient();
  await updateStatoBuono(c, 'b1', { stato: 'riscattato', riscattato_il: '2026-05-26T10:00:00Z' });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.stato, 'riscattato');
  assert.equal(upd.filters.id, 'b1');
});

test('deleteBuono elimina per id', async () => {
  const c = fakeClient({ buoni: [{ id: 'b1' }] });
  await deleteBuono(c, 'b1');
  assert.equal(c._tables.buoni.length, 0);
});
