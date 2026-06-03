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

// ---- WRAPPER STORE: RPC pairing ----
import { createCouple, joinCouple, regenInvite, getInvitoAttivo } from '../js/store.js';

// fake client con supporto a .rpc(name, params) e select su codici_invito
function fakeRpcClient(rpcImpl = {}, rows = []) {
  const calls = [];
  return {
    _calls: calls,
    rpc(name, params) {
      calls.push({ name, params });
      const impl = rpcImpl[name];
      if (impl) return Promise.resolve(impl(params));
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      const state = { table, filters: {} };
      const api = {
        select() { return api; },
        eq(c, v) { state.filters[c] = v; return api; },
        is(c, v) { state.filters[c] = v; return api; },
        maybeSingle() {
          calls.push({ table, filters: state.filters });
          const found = rows.find(r =>
            Object.entries(state.filters).every(([k, v]) => (v === null ? r[k] == null : r[k] === v)));
          return Promise.resolve({ data: found || null, error: null });
        },
      };
      return api;
    },
  };
}

test('createCouple chiama crea_coppia coi parametri giusti e ritorna il codice', async () => {
  const c = fakeRpcClient({ crea_coppia: () => ({ data: 'ABC234', error: null }) });
  const cod = await createCouple(c, { nome: 'Lei', avatar: '🌹' });
  assert.equal(cod, 'ABC234');
  assert.deepEqual(c._calls[0], { name: 'crea_coppia', params: { p_nome: 'Lei', p_avatar: '🌹' } });
});

test('joinCouple chiama unisci_coppia e ritorna il couple_id', async () => {
  const c = fakeRpcClient({ unisci_coppia: () => ({ data: 'cpl-1', error: null }) });
  const id = await joinCouple(c, { codice: 'abc234', nome: 'Lui', avatar: '🔥' });
  assert.equal(id, 'cpl-1');
  assert.deepEqual(c._calls[0], { name: 'unisci_coppia', params: { p_codice: 'abc234', p_nome: 'Lui', p_avatar: '🔥' } });
});

test('regenInvite chiama rigenera_codice e ritorna il nuovo codice', async () => {
  const c = fakeRpcClient({ rigenera_codice: () => ({ data: 'XYZ789', error: null }) });
  const cod = await regenInvite(c);
  assert.equal(cod, 'XYZ789');
  assert.deepEqual(c._calls[0], { name: 'rigenera_codice', params: {} });
});

test('createCouple propaga l\'errore RPC come eccezione', async () => {
  const c = fakeRpcClient({ crea_coppia: () => ({ data: null, error: { message: 'Sei già in una coppia' } }) });
  await assert.rejects(() => createCouple(c, { nome: 'X', avatar: '❤️' }), /Sei già in una coppia/);
});

test('getInvitoAttivo legge il codice non ancora usato della coppia', async () => {
  const c = fakeRpcClient({}, [
    { codice: 'ABC234', couple_id: 'cpl-1', usato_da: null },
    { codice: 'OLD999', couple_id: 'cpl-1', usato_da: 'u-vecchio' },
  ]);
  const row = await getInvitoAttivo(c, 'cpl-1');
  assert.equal(row.codice, 'ABC234');
});

test('getInvitoAttivo ritorna null se non c\'è codice attivo', async () => {
  const c = fakeRpcClient({}, []);
  const row = await getInvitoAttivo(c, 'cpl-1');
  assert.equal(row, null);
});
