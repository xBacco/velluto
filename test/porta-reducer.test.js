import { test } from 'node:test';
import assert from 'node:assert/strict';
import { padReduce, padView, PIN_MIN, PIN_MAX } from '../js/lib/porta-reducer.js';

test('padReduce digit: accoda, ignora non-cifre, cap a PIN_MAX', () => {
  assert.equal(padReduce('', { type: 'digit', n: '1' }), '1');
  assert.equal(padReduce('12', { type: 'digit', n: '3' }), '123');
  assert.equal(padReduce('12', { type: 'digit', n: 'a' }), '12');   // non-cifra ignorata
  assert.equal(padReduce('123456', { type: 'digit', n: '7' }), '123456'); // cap a 6
});

test('padReduce del: toglie l\'ultima, su vuoto resta vuoto', () => {
  assert.equal(padReduce('123', { type: 'del' }), '12');
  assert.equal(padReduce('', { type: 'del' }), '');
});

test('padReduce clear: azzera', () => {
  assert.equal(padReduce('1234', { type: 'clear' }), '');
});

test('padReduce: azione sconosciuta o entry non-stringa → entry pulita', () => {
  assert.equal(padReduce('12', { type: 'boh' }), '12');
  assert.equal(padReduce(undefined, { type: 'digit', n: '5' }), '5');
});

test('padView: mode bio a vuoto, del con cifre', () => {
  assert.equal(padView('').mode, 'bio');
  assert.equal(padView('1').mode, 'del');
});

test('padView: ready a >= PIN_MIN, full a PIN_MAX, len corretta', () => {
  assert.equal(padView('123').ready, false);
  assert.equal(padView('1234').ready, true);
  assert.equal(padView('123456').full, true);
  assert.equal(padView('12345').full, false);
  assert.equal(padView('12').len, 2);
  assert.equal(PIN_MIN, 4);
  assert.equal(PIN_MAX, 6);
});
