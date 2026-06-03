import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALFABETO_CODICE, generaCodiceInvito, codiceScaduto } from '../js/lib/logic.js';

test('ALFABETO_CODICE esclude i simboli ambigui 0 O 1 I L', () => {
  for (const ch of '0O1IL') assert.equal(ALFABETO_CODICE.includes(ch), false, `contiene ${ch}`);
  assert.equal(ALFABETO_CODICE.length, 31);
});

test('generaCodiceInvito produce 6 caratteri dal solo alfabeto', () => {
  const cod = generaCodiceInvito();
  assert.equal(cod.length, 6);
  for (const ch of cod) assert.ok(ALFABETO_CODICE.includes(ch), `char fuori alfabeto: ${ch}`);
});

test('generaCodiceInvito usa rnd iniettabile in modo deterministico', () => {
  // rnd costante = 0 → sempre il primo carattere dell'alfabeto
  const cod = generaCodiceInvito(() => 0);
  assert.equal(cod, ALFABETO_CODICE[0].repeat(6));
});

test('generaCodiceInvito accetta lunghezza custom', () => {
  assert.equal(generaCodiceInvito(Math.random, 8).length, 8);
});

test('codiceScaduto: scadenza null non scade mai', () => {
  assert.equal(codiceScaduto(null, new Date('2030-01-01T00:00:00Z')), false);
});

test('codiceScaduto: scadenza futura non è scaduta', () => {
  assert.equal(codiceScaduto('2026-06-10T00:00:00Z', new Date('2026-06-03T00:00:00Z')), false);
});

test('codiceScaduto: scadenza passata è scaduta', () => {
  assert.equal(codiceScaduto('2026-06-01T00:00:00Z', new Date('2026-06-03T00:00:00Z')), true);
});

test('codiceScaduto: accetta now come stringa ISO', () => {
  assert.equal(codiceScaduto('2026-06-01T00:00:00Z', '2026-06-03T00:00:00Z'), true);
});
