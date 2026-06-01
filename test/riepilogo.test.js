import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riepilogoSezioni } from '../js/lib/logic.js';

const NOW = new Date('2026-06-01T12:00:00Z');
const giorniFa = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();
const ME = { id: 'me' };
const get = (out, key) => out.find(r => r.key === key);

test('ritorna esattamente le 6 sezioni reali in ordine', () => {
  const out = riepilogoSezioni({}, ME, NOW);
  assert.deepEqual(out.map(r => r.key),
    ['desideri', 'giochi', 'calendario', 'mappa', 'buoni', 'galleria']);
});

test('fantasie: proposta recente della partner → hot', () => {
  const liste = { desideri: [{ autore_id: 'lei', stato: 'da_provare', creato: giorniFa(0) }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'desideri');
  assert.equal(r.count, 1);
  assert.equal(r.novita, 'hot');
});

test('fantasie: le mie non contano', () => {
  const liste = { desideri: [{ autore_id: 'me', stato: 'da_provare', creato: giorniFa(0) }] };
  assert.equal(get(riepilogoSezioni(liste, ME, NOW), 'desideri').count, 0);
});

test('fantasie: proposta vecchia (non recente) → warn', () => {
  const liste = { desideri: [{ autore_id: 'lei', stato: 'da_provare', creato: giorniFa(10) }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'desideri');
  assert.equal(r.count, 1);
  assert.equal(r.novita, 'warn');
});

test('giochi: somma giri + tiri disponibili → warn se > 0', () => {
  const liste = {
    giri: [{ user_id: 'me', delta: 2 }],
    slot: [{ user_id: 'me', delta: 1 }],
  };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'giochi');
  assert.equal(r.count, 3);
  assert.equal(r.novita, 'warn');
});

test('esperienze: solo quelle con data >= oggi sono "in arrivo"', () => {
  const liste = { esperienze: [{ data: '2026-06-05' }, { data: '2026-05-20' }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'calendario');
  assert.equal(r.count, 1);
  assert.equal(r.novita, 'warn');
});

test('buoni: regalo attivo ricevuto → hot; in scadenza → warn', () => {
  const base = { a_id: 'me', tipo: 'regalo', stato: 'attivo', creato: giorniFa(10) };
  const hot = get(riepilogoSezioni({ buoni: [base] }, ME, NOW), 'buoni');
  assert.equal(hot.count, 1);
  assert.equal(hot.novita, 'hot');
  const conScadenza = { ...base, scadenza_iso: new Date(NOW.getTime() + 86400e3).toISOString() };
  const warn = get(riepilogoSezioni({ buoni: [conScadenza] }, ME, NOW), 'buoni');
  assert.equal(warn.novita, 'warn');
});

test('mappa: luogo aggiunto di recente → hot; conta tutti i luoghi', () => {
  const liste = { luoghi: [{ creato: giorniFa(0) }, { creato: giorniFa(40) }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'mappa');
  assert.equal(r.count, 2);
  assert.equal(r.novita, 'hot');
});

test('galleria: foto recente della partner → hot; le mie no', () => {
  const lei = { foto: [{ autore_id: 'lei', creato: giorniFa(0) }] };
  assert.equal(get(riepilogoSezioni(lei, ME, NOW), 'galleria').novita, 'hot');
  const mie = { foto: [{ autore_id: 'me', creato: giorniFa(0) }] };
  assert.equal(get(riepilogoSezioni(mie, ME, NOW), 'galleria').novita, 'none');
});

test('liste mancanti → tutto a count 0, novita none', () => {
  const out = riepilogoSezioni({}, ME, NOW);
  assert.ok(out.every(r => r.count === 0 && r.novita === 'none'));
});

test('me mancante → tutte le sezioni a zero, niente falsi positivi', () => {
  const liste = { desideri: [{ autore_id: 'lei', stato: 'da_provare', creato: giorniFa(0) }] };
  const out = riepilogoSezioni(liste, null, NOW);
  assert.deepEqual(out.map(r => r.key),
    ['desideri', 'giochi', 'calendario', 'mappa', 'buoni', 'galleria']);
  assert.ok(out.every(r => r.count === 0 && r.novita === 'none'));
});

test('esperienze: data == oggi conta come in arrivo (boundary inclusivo)', () => {
  const liste = { esperienze: [{ data: '2026-06-01' }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'calendario');
  assert.equal(r.count, 1);
  assert.equal(r.novita, 'warn');
});
