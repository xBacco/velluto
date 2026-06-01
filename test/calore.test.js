import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaCalore, CALORE } from '../js/lib/logic.js';

// "Adesso" fisso per i test; gli eventi si posizionano N giorni fa.
const NOW = new Date('2026-06-01T12:00:00Z');
const giorniFa = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();

test('senza eventi il calore è il pavimento base', () => {
  const r = calcolaCalore([], NOW);
  assert.equal(r.gradi, CALORE.pavBase);
  assert.equal(r.pavimento, CALORE.pavBase);
  assert.equal(r.braci, 0);
});

test('un evento fuori finestra non scalda, ma il calore resta sul pavimento (non si spegne)', () => {
  const r = calcolaCalore([{ quando: giorniFa(20), peso: 6 }], NOW);
  assert.equal(r.braci, 0);
  assert.equal(r.gradi, r.pavimento);     // non si spegne: appoggiato al pavimento
  assert.ok(r.gradi > CALORE.pavBase);    // il pavimento è cresciuto con la storia
});

test('un evento appena fatto accende le braci sopra il pavimento', () => {
  const r = calcolaCalore([{ quando: giorniFa(0), peso: 6 }], NOW);
  assert.ok(r.braci > 0);
  assert.ok(r.gradi > r.pavimento);
  assert.ok(r.gradi < CALORE.vetta);
});

test('raw pari allo sforzo-vetta (Rfull) tocca i 100°', () => {
  // un evento di peso = Rfull, appena fatto → raw = Rfull → saturazione = 1
  const r = calcolaCalore([{ quando: giorniFa(0), peso: CALORE.Rfull }], NOW);
  assert.equal(Math.round(r.gradi), CALORE.vetta);
  assert.ok(r.gradi <= CALORE.vetta);
});

test('oltre la vetta il calore resta clampato a 100 (non sfora)', () => {
  const r = calcolaCalore([{ quando: giorniFa(0), peso: CALORE.Rfull * 3 }], NOW);
  assert.ok(r.gradi <= CALORE.vetta);
  assert.equal(Math.round(r.gradi), CALORE.vetta);
});

test('decadimento dolce nella finestra: più recente scalda di più', () => {
  const oggi    = calcolaCalore([{ quando: giorniFa(0), peso: 6 }], NOW);
  const setteFa = calcolaCalore([{ quando: giorniFa(7), peso: 6 }], NOW);
  assert.ok(oggi.gradi > setteFa.gradi);
  assert.ok(setteFa.gradi > CALORE.pavBase); // ancora dentro la finestra: un po' di brace resta
});

test('al bordo della finestra (>= finestraGiorni) la brace è spenta', () => {
  const r = calcolaCalore([{ quando: giorniFa(CALORE.finestraGiorni), peso: 6 }], NOW);
  assert.equal(r.braci, 0);
});

test('il pavimento cresce con la storia ma cappa a pavMax', () => {
  // 30 eventi tutti fuori finestra → effetto solo sul pavimento, braci spente
  const vecchi = Array.from({ length: 30 }, () => ({ quando: giorniFa(40), peso: 6 }));
  const r = calcolaCalore(vecchi, NOW);
  assert.equal(r.pavimento, CALORE.pavMax);
  assert.equal(r.gradi, CALORE.pavMax);
});

test('gli eventi futuri vengono ignorati', () => {
  const futuro = new Date(NOW.getTime() + 864e5).toISOString();
  const r = calcolaCalore([{ quando: futuro, peso: 6 }], NOW);
  assert.equal(r.gradi, CALORE.pavBase);
  assert.equal(r.pavimento, CALORE.pavBase);
});

test('accetta sia Date sia stringa ISO per quando', () => {
  const conISO  = calcolaCalore([{ quando: giorniFa(0), peso: 6 }], NOW);
  const conDate = calcolaCalore([{ quando: new Date(NOW.getTime()), peso: 6 }], NOW);
  assert.equal(conISO.gradi, conDate.gradi);
});
