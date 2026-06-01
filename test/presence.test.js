import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOnline, tempoRelativo } from '../js/lib/presence.js';

const NOW = new Date('2026-06-01T12:00:00Z');
const secFa = (s) => new Date(NOW.getTime() - s * 1000).toISOString();

test('isOnline: entro la soglia → true', () => {
  assert.equal(isOnline(secFa(30), NOW), true);   // soglia default 60s
});
test('isOnline: oltre la soglia → false', () => {
  assert.equal(isOnline(secFa(120), NOW), false);
});
test('isOnline: last_seen mancante → false', () => {
  assert.equal(isOnline(null, NOW), false);
  assert.equal(isOnline(undefined, NOW), false);
});
test('isOnline: soglia personalizzabile', () => {
  assert.equal(isOnline(secFa(120), NOW, 300), true);
});

test('tempoRelativo: mancante → "mai"', () => {
  assert.equal(tempoRelativo(null, NOW), 'mai');
});
test('tempoRelativo: pochi secondi → "ora"', () => {
  assert.equal(tempoRelativo(secFa(20), NOW), 'ora');
});
test('tempoRelativo: minuti → "N′ fa"', () => {
  assert.equal(tempoRelativo(secFa(120), NOW), '2′ fa');
});
test('tempoRelativo: ore → "Nh fa"', () => {
  assert.equal(tempoRelativo(secFa(2 * 3600), NOW), '2h fa');
});
test('tempoRelativo: un giorno → "ieri"', () => {
  assert.equal(tempoRelativo(secFa(26 * 3600), NOW), 'ieri');
});
test('tempoRelativo: più giorni → "Ng fa"', () => {
  assert.equal(tempoRelativo(secFa(3 * 86400), NOW), '3g fa');
});
