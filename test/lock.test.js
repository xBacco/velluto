import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  let m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { m = {}; },
  };
})();

const { isPinValid, setPin, verifyPin, isLockEnabled, disableLock, getPudica, setPudica,
        isBioPrompted, setBioPrompted, getFreq, setFreq, getGraceMin, getLastUnlockAt,
        touchUnlock, shouldLock } = await import('../js/lib/lock.js');

beforeEach(() => localStorage.clear());

test('isPinValid accetta 4-6 cifre, rifiuta il resto', () => {
  assert.equal(isPinValid('1234'), true);
  assert.equal(isPinValid('123456'), true);
  assert.equal(isPinValid('123'), false);
  assert.equal(isPinValid('1234567'), false);
  assert.equal(isPinValid('12a4'), false);
  assert.equal(isPinValid(''), false);
});

test('setPin abilita il lock e verifyPin distingue giusto/sbagliato', async () => {
  await setPin('2468');
  assert.equal(isLockEnabled(), true);
  assert.equal(await verifyPin('2468'), true);
  assert.equal(await verifyPin('0000'), false);
});

test('il PIN non è salvato in chiaro', async () => {
  await setPin('1357');
  const raw = JSON.stringify(localStorage.getItem('lussuria.lock'));
  assert.ok(!raw.includes('1357'));
});

test('disableLock spegne il lock', async () => {
  await setPin('1234');
  disableLock();
  assert.equal(isLockEnabled(), false);
  assert.equal(await verifyPin('1234'), false);
});

test('modalità pudica: default off, persiste', () => {
  assert.equal(getPudica(), false);
  setPudica(true);
  assert.equal(getPudica(), true);
});

test('bioPrompted: default false, persiste', () => {
  assert.equal(isBioPrompted(), false);
  setBioPrompted(true);
  assert.equal(isBioPrompted(), true);
  setBioPrompted(false);
  assert.equal(isBioPrompted(), false);
});

test('freq: default "apertura", persiste i 3 valori', () => {
  assert.equal(getFreq(), 'apertura');
  setFreq('grazia'); assert.equal(getFreq(), 'grazia');
  setFreq('avvio');  assert.equal(getFreq(), 'avvio');
  setFreq('apertura'); assert.equal(getFreq(), 'apertura');
});

test('graceMin: default 5', () => {
  assert.equal(getGraceMin(), 5);
});

test('lastUnlockAt: default 0, touchUnlock lo scrive', () => {
  assert.equal(getLastUnlockAt(), 0);
  touchUnlock(1700000000000);
  assert.equal(getLastUnlockAt(), 1700000000000);
});

test('shouldLock: lock disattivo → sempre false', () => {
  assert.equal(shouldLock({ enabled: false, freq: 'apertura', coldStart: true, now: 1000 }), false);
  assert.equal(shouldLock({ enabled: false, freq: 'avvio', coldStart: true, now: 1000 }), false);
});

test('shouldLock: "apertura" → sempre true se attivo', () => {
  assert.equal(shouldLock({ enabled: true, freq: 'apertura', coldStart: false, now: 1000 }), true);
  assert.equal(shouldLock({ enabled: true, freq: 'apertura', coldStart: true, now: 1000 }), true);
});

test('shouldLock: default (freq mancante) si comporta come "apertura"', () => {
  assert.equal(shouldLock({ enabled: true, coldStart: false, now: 1000 }), true);
});

test('shouldLock: "avvio" → true solo a cold start', () => {
  assert.equal(shouldLock({ enabled: true, freq: 'avvio', coldStart: true, now: 1000 }), true);
  assert.equal(shouldLock({ enabled: true, freq: 'avvio', coldStart: false, now: 1000 }), false);
});

test('shouldLock: "grazia" → entro N min false, oltre true, senza lastUnlock true', () => {
  const T = 10 * 60 * 1000; // "adesso" = 10 min in ms
  const min = 60 * 1000;
  // sbloccato 4 min fa (entro la grazia di 5) → non riblocca
  assert.equal(shouldLock({ enabled: true, freq: 'grazia', graceMin: 5, lastUnlockAt: T - 4 * min, now: T }), false);
  // sbloccato 6 min fa (oltre la grazia) → riblocca
  assert.equal(shouldLock({ enabled: true, freq: 'grazia', graceMin: 5, lastUnlockAt: T - 6 * min, now: T }), true);
  // mai sbloccato (lastUnlockAt falsy) → riblocca
  assert.equal(shouldLock({ enabled: true, freq: 'grazia', graceMin: 5, lastUnlockAt: 0, now: T }), true);
});
