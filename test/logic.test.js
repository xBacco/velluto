import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortByRecent, filterDesideri } from '../js/lib/logic.js';
import { fotoPath, groupFotoByContesto } from '../js/lib/logic.js';

const sample = [
  { id: 'a', stato: 'da_provare', autore_id: 'u1', creato: '2026-01-01T00:00:00Z' },
  { id: 'b', stato: 'realizzato', autore_id: 'u2', creato: '2026-03-01T00:00:00Z' },
  { id: 'c', stato: 'da_provare', autore_id: 'u2', creato: '2026-02-01T00:00:00Z' },
];

test('sortByRecent ordina dal più recente', () => {
  const out = sortByRecent(sample);
  assert.deepEqual(out.map(x => x.id), ['b', 'c', 'a']);
});

test('sortByRecent non muta l\'array originale', () => {
  const copy = [...sample];
  sortByRecent(sample);
  assert.deepEqual(sample, copy);
});

test('filterDesideri tutti', () => {
  assert.equal(filterDesideri(sample, { tipo: 'tutti', me: 'u1' }).length, 3);
});

test('filterDesideri da_provare', () => {
  const out = filterDesideri(sample, { tipo: 'da_provare', me: 'u1' });
  assert.deepEqual(out.map(x => x.id).sort(), ['a', 'c']);
});

test('filterDesideri realizzato', () => {
  const out = filterDesideri(sample, { tipo: 'realizzato', me: 'u1' });
  assert.deepEqual(out.map(x => x.id), ['b']);
});

test('filterDesideri mine filtra per autore loggato', () => {
  const out = filterDesideri(sample, { tipo: 'mine', me: 'u2' });
  assert.deepEqual(out.map(x => x.id).sort(), ['b', 'c']);
});

test('filterDesideri ritorna ordinato per recente', () => {
  const out = filterDesideri(sample, { tipo: 'tutti', me: 'u1' });
  assert.deepEqual(out.map(x => x.id), ['b', 'c', 'a']);
});

test('fotoPath usa couple/contesto/ref e sanifica il filename', () => {
  const p = fotoPath('cpl', 'buono', 'b1', 'fo to!@#.jpg', 1000);
  assert.equal(p, 'cpl/buono/b1/1000-fo_to___.jpg');
});

test('groupFotoByContesto raggruppa per contesto', () => {
  const g = groupFotoByContesto([
    { id: '1', contesto: 'esperienza' }, { id: '2', contesto: 'buono' }, { id: '3', contesto: 'esperienza' },
  ]);
  assert.equal(g.esperienza.length, 2);
  assert.equal(g.buono.length, 1);
});
