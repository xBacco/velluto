import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, tempoRelativo } from '../js/modules/posta-card.js';

const NOW = new Date('2026-06-05T12:00:00Z');
const oreFa = (n) => new Date(NOW.getTime() - n * 3600e3).toISOString();
const giorniFa = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();

// ---- esc ----

test('esc: escapa & < > " \'', () => {
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('esc: null/undefined → stringa vuota', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

// ---- tempoRelativo ----

test('tempoRelativo: < 60s → "ora"', () => {
  assert.equal(tempoRelativo(new Date(NOW.getTime() - 30e3).toISOString(), NOW), 'ora');
});

test('tempoRelativo: minuti → "Xm"', () => {
  assert.equal(tempoRelativo(new Date(NOW.getTime() - 30 * 60e3).toISOString(), NOW), '30m');
});

test('tempoRelativo: ore → "Xh"', () => {
  assert.equal(tempoRelativo(oreFa(7), NOW), '7h');
});

test('tempoRelativo: ieri (giorno di calendario, oltre 24h) → "ieri"', () => {
  // NOW è il 5 giugno a mezzogiorno: 28 ore fa è il 4 giugno → "ieri"
  assert.equal(tempoRelativo(oreFa(28), NOW), 'ieri');
});

test('tempoRelativo: giorni → "X gg fa"', () => {
  assert.equal(tempoRelativo(giorniFa(3), NOW), '3 gg fa');
});
