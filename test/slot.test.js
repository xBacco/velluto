import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMIA_SLOT, LAMPO_TTL_MS, POLAROID_TTL_MS, accreditoConCap } from '../js/lib/logic.js';

test('ECONOMIA_SLOT: 5 tiri/sett, cap 10, costo 1', () => {
  assert.equal(ECONOMIA_SLOT.TIRI_SETTIMANALI, 5);
  assert.equal(ECONOMIA_SLOT.CAP_SALDO, 10);
  assert.equal(ECONOMIA_SLOT.COSTO_TIRO, 1);
  assert.equal(ECONOMIA_SLOT.GRATIS_OGNI_GIORNI, 7);
});

test('LAMPO_TTL_MS e POLAROID_TTL_MS = 24h', () => {
  assert.equal(LAMPO_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(POLAROID_TTL_MS, 24 * 60 * 60 * 1000);
});

test('accreditoConCap sotto il cap accredita pieno', () => {
  assert.equal(accreditoConCap(3, 5, 10), 5);
});

test('accreditoConCap al cap accredita 0', () => {
  assert.equal(accreditoConCap(10, 5, 10), 0);
});

test('accreditoConCap eccedenza scartata', () => {
  assert.equal(accreditoConCap(8, 5, 10), 2);
});

test('accreditoConCap delta negativo (no-op)', () => {
  assert.equal(accreditoConCap(5, -3, 10), 0);
});
