import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedEventi, contaNuovi } from '../js/lib/logic.js';

const NOW = new Date('2026-06-01T12:00:00Z');
const giorniFa = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();
const oreFa = (n) => new Date(NOW.getTime() - n * 3600e3).toISOString();
const ME = { id: 'me' };

// ---- sorgenti: filtro autore ≠ me ----

test('fantasia della partner entra nel feed con la shape attesa', () => {
  const liste = { desideri: [{ id: 'd1', autore_id: 'lei', stato: 'da_provare', testo: 'stasera vorrei…', creato: oreFa(2) }] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed.length, 1);
  const e = feed[0];
  assert.equal(e.tipo, 'fantasia');
  assert.equal(e.emoji, '🔥');
  assert.equal(e.sezioneKey, 'desideri');
  assert.equal(e.hand, 'stasera vorrei…');
  assert.equal(e.autoreId, 'lei');
  assert.equal(e.daLei, true);
  assert.equal(e.quandoISO, oreFa(2));
  assert.equal(e.refId, 'd1');
});

test('le mie fantasie e quelle non da_provare non entrano', () => {
  const liste = { desideri: [
    { id: 'd1', autore_id: 'me', stato: 'da_provare', testo: 'mia', creato: oreFa(1) },
    { id: 'd2', autore_id: 'lei', stato: 'realizzato', testo: 'fatta', creato: oreFa(1) },
  ] };
  assert.equal(feedEventi(liste, ME, null, NOW).length, 0);
});

test('polaroid: foto della partner entra (galleria), le mie no; didascalia in hand', () => {
  const liste = { foto: [
    { id: 'f1', autore_id: 'lei', didascalia: 'ieri sera', creato: oreFa(3) },
    { id: 'f2', autore_id: 'me', didascalia: 'mia', creato: oreFa(1) },
  ] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].tipo, 'polaroid');
  assert.equal(feed[0].emoji, '🖼️');
  assert.equal(feed[0].sezioneKey, 'galleria');
  assert.equal(feed[0].hand, 'ieri sera');   // voce di lei → hand, non titolo
  assert.equal(feed[0].titolo, '');
  assert.equal(feed[0].refId, 'f1');
});

test('polaroid senza didascalia → niente hand né titolo (nessuna riga morta)', () => {
  const liste = { foto: [{ id: 'f1', autore_id: 'lei', creato: oreFa(3) }] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed[0].hand, undefined);
  assert.equal(feed[0].titolo, '');
});

test('esperienza della partner entra (calendario), la mia no', () => {
  const liste = { esperienze: [
    { id: 'e1', autore_id: 'lei', titolo: 'Cena al lago', creato: oreFa(5) },
    { id: 'e2', autore_id: 'me', titolo: 'Mia', creato: oreFa(1) },
  ] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].tipo, 'esperienza');
  assert.equal(feed[0].emoji, '📅');
  assert.equal(feed[0].sezioneKey, 'calendario');
  assert.equal(feed[0].titolo, 'Cena al lago');
});

test('luogo segnato dalla partner entra (mappa), il mio no', () => {
  const liste = { luoghi: [
    { id: 'l1', autore_id: 'lei', nome: 'B&B sul lago', descrizione: 'weekend lungo', creato: oreFa(4) },
    { id: 'l2', autore_id: 'me', nome: 'Mio', creato: oreFa(1) },
  ] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].tipo, 'luogo');
  assert.equal(feed[0].emoji, '🗺️');
  assert.equal(feed[0].sezioneKey, 'mappa');
  assert.equal(feed[0].titolo, 'B&B sul lago');
  assert.equal(feed[0].hand, 'weekend lungo');
});

// ---- buoni: solo regali ricevuti attivi ----

test('buono regalo attivo ricevuto entra; inviati/usati/richieste no', () => {
  const liste = { buoni: [
    { id: 'b1', tipo: 'regalo', stato: 'attivo', da_id: 'lei', a_id: 'me', titolo: 'Cena al buio', creato: oreFa(6) },
    { id: 'b2', tipo: 'regalo', stato: 'attivo', da_id: 'me', a_id: 'lei', titolo: 'Inviato', creato: oreFa(1) },
    { id: 'b3', tipo: 'regalo', stato: 'usato', da_id: 'lei', a_id: 'me', titolo: 'Usato', creato: oreFa(1) },
    { id: 'b4', tipo: 'richiesta', stato: 'in_attesa', da_id: 'lei', a_id: 'me', titolo: 'Richiesta', creato: oreFa(1) },
  ] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed.length, 1);
  const e = feed[0];
  assert.equal(e.tipo, 'buono');
  assert.equal(e.emoji, '🎟️');
  assert.equal(e.sezioneKey, 'buoni');
  assert.equal(e.titolo, 'Cena al buio');
  assert.equal(e.autoreId, 'lei');
  assert.equal(e.daLei, true);
});

test('buono con scadenza vicina → pill; senza scadenza → niente pill', () => {
  const domani = new Date(NOW.getTime() + 1 * 864e5).toISOString();
  const liste = { buoni: [
    { id: 'b1', tipo: 'regalo', stato: 'attivo', da_id: 'lei', a_id: 'me', titolo: 'X', creato: oreFa(6), scadenza_iso: domani },
    { id: 'b2', tipo: 'regalo', stato: 'attivo', da_id: 'lei', a_id: 'me', titolo: 'Y', creato: oreFa(7) },
  ] };
  const feed = feedEventi(liste, ME, null, NOW);
  const conPill = feed.find(e => e.refId === 'b1');
  const senzaPill = feed.find(e => e.refId === 'b2');
  assert.ok(conPill.pill && conPill.pill.includes('domani'));
  assert.equal(senzaPill.pill, undefined);
});

// ---- card sintetica "giri" ----

test('saldo giri > 0 → card giochi sintetica, daLei=false, mai nuova', () => {
  const liste = { giri: [{ user_id: 'me', delta: 3, creato: oreFa(1) }] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed.length, 1);
  const e = feed[0];
  assert.equal(e.tipo, 'giri');
  assert.equal(e.emoji, '🎲');
  assert.equal(e.sezioneKey, 'giochi');
  assert.equal(e.daLei, false);
  assert.equal(e.nuovo, false);
  assert.ok(e.titolo.includes('3 giri'));
});

test('saldo giri 1 → titolo al singolare', () => {
  const liste = { giri: [{ user_id: 'me', delta: 1, creato: oreFa(1) }] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.ok(feed[0].titolo.includes('1 giro'));
  assert.ok(!feed[0].titolo.includes('1 giri'));
});

test('saldo giri 0 → nessuna card giri', () => {
  const liste = { giri: [{ user_id: 'me', delta: 1 }, { user_id: 'me', delta: -1 }] };
  assert.equal(feedEventi(liste, ME, null, NOW).length, 0);
});

// ---- flag nuovo vs vistoAt ----

test('vistoAt null → tutte le card della partner sono nuove', () => {
  const liste = { desideri: [{ id: 'd1', autore_id: 'lei', stato: 'da_provare', testo: 'x', creato: giorniFa(30) }] };
  assert.equal(feedEventi(liste, ME, null, NOW)[0].nuovo, true);
});

test('nuovo solo se creato dopo vistoAt (confronto stretto)', () => {
  const vistoAt = giorniFa(2);
  const liste = { desideri: [
    { id: 'dopo', autore_id: 'lei', stato: 'da_provare', testo: 'x', creato: giorniFa(1) },
    { id: 'uguale', autore_id: 'lei', stato: 'da_provare', testo: 'y', creato: vistoAt },
    { id: 'prima', autore_id: 'lei', stato: 'da_provare', testo: 'z', creato: giorniFa(3) },
  ] };
  const feed = feedEventi(liste, ME, vistoAt, NOW);
  const byId = Object.fromEntries(feed.map(e => [e.refId, e.nuovo]));
  assert.equal(byId.dopo, true);
  assert.equal(byId.uguale, false);
  assert.equal(byId.prima, false);
});

// ---- ordinamento ----

test('ordina: nuovi prima, poi quandoISO desc; card giri in fondo', () => {
  const vistoAt = giorniFa(2);
  const liste = {
    desideri: [{ id: 'vecchio-recente', autore_id: 'lei', stato: 'da_provare', testo: 'a', creato: giorniFa(3) }],
    foto: [{ id: 'nuovo-vecchio', autore_id: 'lei', creato: giorniFa(1.5) }],
    luoghi: [{ id: 'nuovo-fresco', autore_id: 'lei', nome: 'N', creato: oreFa(1) }],
    buoni: [{ id: 'vecchio-antico', tipo: 'regalo', stato: 'attivo', da_id: 'lei', a_id: 'me', titolo: 'B', creato: giorniFa(10) }],
    giri: [{ user_id: 'me', delta: 2 }],
  };
  const feed = feedEventi(liste, ME, vistoAt, NOW);
  assert.deepEqual(feed.map(e => e.refId ?? e.tipo),
    ['nuovo-fresco', 'nuovo-vecchio', 'vecchio-recente', 'vecchio-antico', 'giri']);
});

// ---- edge ----

test('me mancante → feed vuoto, niente falsi positivi', () => {
  const liste = { desideri: [{ id: 'd1', autore_id: 'lei', stato: 'da_provare', testo: 'x', creato: oreFa(1) }] };
  assert.deepEqual(feedEventi(liste, null, null, NOW), []);
});

test('liste mancanti → feed vuoto', () => {
  assert.deepEqual(feedEventi({}, ME, null, NOW), []);
  assert.deepEqual(feedEventi(null, ME, null, NOW), []);
});

// ---- contaNuovi ----

test('contaNuovi conta solo nuovo && daLei (la card giri non concorre)', () => {
  const liste = {
    desideri: [{ id: 'd1', autore_id: 'lei', stato: 'da_provare', testo: 'x', creato: oreFa(1) }],
    foto: [{ id: 'f1', autore_id: 'lei', creato: giorniFa(5) }],
    giri: [{ user_id: 'me', delta: 2 }],
  };
  const vistoAt = giorniFa(2); // d1 nuova, f1 già vista, giri fuori per daLei=false
  const feed = feedEventi(liste, ME, vistoAt, NOW);
  assert.equal(contaNuovi(feed), 1);
});

test('contaNuovi su feed vuoto → 0', () => {
  assert.equal(contaNuovi([]), 0);
});
