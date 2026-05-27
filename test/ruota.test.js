import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECONOMIA, saldoGiri, puoGirare, giriEleggibile,
} from '../js/lib/logic.js';

const mov = (user_id, delta, motivo, creato, esito = null) => ({ user_id, delta, motivo, esito, creato });

test('saldoGiri somma solo i movimenti dell\'utente', () => {
  const m = [
    mov('me', 1, 'settimanale', '2026-05-01'),
    mov('me', -1, 'giro', '2026-05-02', 'dadi'),
    mov('altro', 1, 'gioco', '2026-05-02'),
    mov('me', 1, 'ancora', '2026-05-03'),
  ];
  assert.equal(saldoGiri(m, 'me'), 1);
  assert.equal(saldoGiri(m, 'altro'), 1);
  assert.equal(saldoGiri([], 'me'), 0);
});

test('puoGirare confronta col costo del giro', () => {
  assert.equal(puoGirare(ECONOMIA.COSTO_GIRO), true);
  assert.equal(puoGirare(ECONOMIA.COSTO_GIRO - 1), false);
});

test('giriEleggibile: senza movimenti settimanali -> ok', () => {
  const r = giriEleggibile([], 'me', new Date('2026-05-27T10:00:00Z'));
  assert.equal(r.ok, true);
  assert.equal(r.prossimoSblocco, null);
});

test('giriEleggibile: dentro la settimana -> non ok, con prossimoSblocco', () => {
  const m = [mov('me', 1, 'settimanale', '2026-05-25T10:00:00Z')];
  const r = giriEleggibile(m, 'me', new Date('2026-05-27T10:00:00Z'));
  assert.equal(r.ok, false);
  assert.equal(r.prossimoSblocco, new Date('2026-06-01T10:00:00Z').toISOString());
});

test('giriEleggibile: passati 7 giorni -> ok', () => {
  const m = [mov('me', 1, 'settimanale', '2026-05-20T10:00:00Z')];
  const r = giriEleggibile(m, 'me', new Date('2026-05-27T10:00:01Z'));
  assert.equal(r.ok, true);
});
