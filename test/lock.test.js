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

const { isPinValid, setPin, verifyPin, isLockEnabled, disableLock, getPudica, setPudica } = await import('../js/lib/lock.js');

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
