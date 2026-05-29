import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMIA_SLOT, LAMPO_TTL_MS, POLAROID_TTL_MS } from '../js/lib/logic.js';

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
