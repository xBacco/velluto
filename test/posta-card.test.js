import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, tempoRelativo, cardHTML } from '../js/modules/posta-card.js';

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

test('tempoRelativo: iso nullo o invalido → stringa vuota', () => {
  assert.equal(tempoRelativo(null, NOW), '');
  assert.equal(tempoRelativo(undefined, NOW), '');
  assert.equal(tempoRelativo('non-una-data', NOW), '');
});

test('tempoRelativo: 24h esatte → "ieri" (confine del bucket ore)', () => {
  assert.equal(tempoRelativo(oreFa(24), NOW), 'ieri');
});

test('esc: & si escapa per primo (niente doppio escape)', () => {
  assert.equal(esc('<&'), '&lt;&amp;');
});

// ---- cardHTML ----

const CTX = { autoreLabel: '🧁 lei', now: NOW };

const fantasiaNuova = { tipo: 'fantasia', emoji: '🔥', sezioneKey: 'desideri',
  kicker: 'una fantasia nuova', titolo: '', hand: 'stasera scegli tu',
  autoreId: 'lei', daLei: true, quandoISO: oreFa(2), nuovo: true, refId: 'd1' };

test('cardHTML fantasia nuova: classe nuova, pallino, accent ember, hand tra virgolette, meta', () => {
  const out = cardHTML(fantasiaNuova, CTX);
  assert.ok(out.includes('class="fc nuova"'));
  assert.ok(out.includes('<span class="dot">●</span>'));
  assert.ok(out.includes('--accent:var(--ember)'));
  assert.ok(out.includes('data-sezione="desideri"'));
  assert.ok(out.includes('una fantasia nuova'));
  assert.ok(out.includes('"stasera scegli tu"'));        // virgolette tipografiche
  assert.ok(out.includes('🧁 lei'));
  assert.ok(out.includes('2h'));
  assert.ok(!out.includes('class="ttl"'));               // titolo vuoto → nessuna riga
});

test('cardHTML non nuova: niente classe nuova né pallino', () => {
  const out = cardHTML({ ...fantasiaNuova, nuovo: false }, CTX);
  assert.ok(out.includes('class="fc"'));
  assert.ok(!out.includes('fc nuova'));   // il kicker contiene "nuova": si testa la classe
  assert.ok(!out.includes('class="dot"'));
});

test('cardHTML esperienza: kicker letterale e titolo', () => {
  const out = cardHTML({ tipo: 'esperienza', emoji: '📅', sezioneKey: 'calendario',
    kicker: 'una nuova esperienza', titolo: 'Weekend alle terme',
    autoreId: 'lei', daLei: true, quandoISO: oreFa(28), nuovo: true, refId: 'e1' }, CTX);
  assert.ok(out.includes('una nuova esperienza'));
  assert.ok(out.includes('Weekend alle terme'));
  assert.ok(out.includes('ieri'));
  assert.ok(out.includes('data-sezione="calendario"'));
});

test('cardHTML polaroid senza didascalia: solo kicker + meta, nessuna riga contenuto', () => {
  const out = cardHTML({ tipo: 'polaroid', emoji: '🖼️', sezioneKey: 'galleria',
    kicker: 'una polaroid', titolo: '', autoreId: 'lei', daLei: true,
    quandoISO: oreFa(5), nuovo: true, refId: 'f1' }, CTX);
  assert.ok(out.includes('una polaroid'));
  assert.ok(!out.includes('class="ttl"'));
  assert.ok(!out.includes('class="hand"'));
  assert.ok(out.includes('class="meta"'));
});

test('cardHTML buono: accent oro, pill scadenza e meta chi·quando', () => {
  const out = cardHTML({ tipo: 'buono', emoji: '🎟️', sezioneKey: 'buoni',
    kicker: 'un buono sta per scadere', titolo: 'Cena al buio',
    pill: '⏳ domani · riscuoti', autoreId: 'lei', daLei: true,
    quandoISO: giorniFa(3), nuovo: true, refId: 'b1' }, CTX);
  assert.ok(out.includes('--accent:var(--gold)'));
  assert.ok(out.includes('Cena al buio'));
  assert.ok(out.includes('⏳ domani · riscuoti'));
  assert.ok(out.includes('🧁 lei'));
  assert.ok(out.includes('3 gg fa'));
});

test('cardHTML giri: accent rosa, mai meta (non è di lei)', () => {
  const out = cardHTML({ tipo: 'giri', emoji: '🎲', sezioneKey: 'giochi',
    kicker: 'la brace di stasera', titolo: 'Hai 2 giri da spendere',
    pill: 'gira la ruota →', autoreId: null, daLei: false,
    quandoISO: null, nuovo: false, refId: null }, CTX);
  assert.ok(out.includes('--accent:var(--rose)'));
  assert.ok(out.includes('Hai 2 giri da spendere'));
  assert.ok(out.includes('gira la ruota →'));
  assert.ok(!out.includes('class="meta"'));
});

test('cardHTML luogo: titolo + descrizione in hand', () => {
  const out = cardHTML({ tipo: 'luogo', emoji: '🗺️', sezioneKey: 'mappa',
    kicker: 'ha segnato un posto', titolo: 'B&B sul lago', hand: 'weekend lungo',
    autoreId: 'lei', daLei: true, quandoISO: oreFa(4), nuovo: true, refId: 'l1' }, CTX);
  assert.ok(out.includes('B&amp;B sul lago'));            // titolo escapato
  assert.ok(out.includes('"weekend lungo"'));
});

test('cardHTML: XSS nel testo esce escapato', () => {
  const out = cardHTML({ ...fantasiaNuova, hand: '<script>alert(1)</script>' }, CTX);
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('cardHTML: tipo ignoto o evento nullo → stringa vuota', () => {
  assert.equal(cardHTML({ ...fantasiaNuova, tipo: 'boh' }, CTX), '');
  assert.equal(cardHTML(null, CTX), '');
});
