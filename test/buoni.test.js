import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicaTransizioneBuono, gruppoBundle,
  buoniRicevuti, buoniInviati, richiesteDaConcedere, richiesteInviate,
} from '../js/lib/logic.js';

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
