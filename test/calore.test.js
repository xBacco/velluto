import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaCalore, eventiCalore, CALORE, PESI_CALORE } from '../js/lib/logic.js';

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

// ---- eventiCalore: normalizza [{tipo, quando}] → [{quando, peso}] ----

test('eventiCalore mappa ogni tipo noto al suo peso', () => {
  const out = eventiCalore([
    { tipo: 'esperienza', quando: giorniFa(0) },
    { tipo: 'desiderio',  quando: giorniFa(1) },
    { tipo: 'foto',       quando: giorniFa(2) },
  ]);
  assert.deepEqual(out.map(e => e.peso), [
    PESI_CALORE.esperienza, PESI_CALORE.desiderio, PESI_CALORE.foto,
  ]);
  assert.equal(out[0].quando, giorniFa(0));
});

test('eventiCalore scarta i tipi sconosciuti', () => {
  const out = eventiCalore([
    { tipo: 'esperienza', quando: giorniFa(0) },
    { tipo: 'sconosciuto', quando: giorniFa(0) },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].peso, PESI_CALORE.esperienza);
});

test('eventiCalore scarta gli eventi senza quando', () => {
  const out = eventiCalore([
    { tipo: 'esperienza', quando: null },
    { tipo: 'buono', quando: undefined },
    { tipo: 'buono', quando: giorniFa(0) },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].peso, PESI_CALORE.buono);
});

test('eventiCalore su lista vuota torna []', () => {
  assert.deepEqual(eventiCalore([]), []);
});

test('eventiCalore alimenta calcolaCalore end-to-end', () => {
  const eventi = eventiCalore([{ tipo: 'esperienza', quando: giorniFa(0) }]);
  const r = calcolaCalore(eventi, NOW);
  assert.ok(r.gradi > r.pavimento); // un'esperienza di oggi accende le braci
});
