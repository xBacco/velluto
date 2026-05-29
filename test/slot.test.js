import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMIA_SLOT, LAMPO_TTL_MS, POLAROID_TTL_MS, accreditoConCap, saldoSlot, slotEleggibile } from '../js/lib/logic.js';

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

const mov = (user_id, delta, motivo, creato) => ({ user_id, delta, motivo, creato });

test('saldoSlot somma solo i movimenti dell\'utente', () => {
  const m = [
    mov('me', 5, 'settimanale', '2026-05-01'),
    mov('me', -1, 'tiro', '2026-05-02'),
    mov('altro', 5, 'settimanale', '2026-05-01'),
  ];
  assert.equal(saldoSlot(m, 'me'), 4);
  assert.equal(saldoSlot(m, 'altro'), 5);
  assert.equal(saldoSlot(m, 'nessuno'), 0);
});

test('slotEleggibile: nessun settimanale → ok', () => {
  const r = slotEleggibile([], 'me', new Date('2026-05-28T10:00:00Z'));
  assert.equal(r.ok, true);
  assert.equal(r.prossimoSblocco, null);
});

test('slotEleggibile: settimanale recente → non ok, ritorna prossimoSblocco', () => {
  const m = [mov('me', 5, 'settimanale', '2026-05-26T10:00:00Z')];
  const r = slotEleggibile(m, 'me', new Date('2026-05-28T10:00:00Z'));
  assert.equal(r.ok, false);
  assert.equal(r.prossimoSblocco, '2026-06-02T10:00:00.000Z');
});

test('slotEleggibile: settimanale 7+ giorni fa → ok', () => {
  const m = [mov('me', 5, 'settimanale', '2026-05-20T10:00:00Z')];
  const r = slotEleggibile(m, 'me', new Date('2026-05-28T10:00:00Z'));
  assert.equal(r.ok, true);
});
