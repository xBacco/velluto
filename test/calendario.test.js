import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthMatrix, monthLabel, groupByDay, sortByDateDesc, fiammeLabel, fotoPath } from '../js/lib/logic.js';

test('monthMatrix gennaio 2026: 5 settimane, giorno 1 al posto giovedì (lun-dom)', () => {
  const w = monthMatrix(2026, 0); // 0 = gennaio
  assert.equal(w.length, 5);
  assert.equal(w[0][0], null);              // lun vuoto
  assert.equal(w[0][1], null);              // mar vuoto
  assert.equal(w[0][2], null);              // mer vuoto
  assert.equal(w[0][3].day, 1);             // gio = 1 gennaio
  assert.equal(w[0][3].iso, '2026-01-01');
});

test('monthMatrix conta tutti i giorni del mese', () => {
  const days = monthMatrix(2026, 0).flat().filter(Boolean);
  assert.equal(days.length, 31);
  assert.equal(days[days.length - 1].iso, '2026-01-31');
});

test('monthLabel in italiano', () => {
  assert.equal(monthLabel(2026, 0), 'Gennaio 2026');
  assert.equal(monthLabel(2026, 4), 'Maggio 2026');
});

test('groupByDay raggruppa per data', () => {
  const g = groupByDay([
    { id: 'a', data: '2026-05-01' },
    { id: 'b', data: '2026-05-01' },
    { id: 'c', data: '2026-05-03' },
  ]);
  assert.equal(g['2026-05-01'].length, 2);
  assert.equal(g['2026-05-03'].length, 1);
  assert.equal(g['2026-05-02'], undefined);
});

test('sortByDateDesc ordina dalla data più recente, senza mutare', () => {
  const src = [{ id: 'a', data: '2026-01-01' }, { id: 'b', data: '2026-03-01' }, { id: 'c', data: '2026-02-01' }];
  const copy = [...src];
  const out = sortByDateDesc(src);
  assert.deepEqual(out.map(x => x.id), ['b', 'c', 'a']);
  assert.deepEqual(src, copy);
});

test('fiammeLabel: voto -> 5 simboli', () => {
  assert.equal(fiammeLabel(0), '🤍🤍🤍🤍🤍');
  assert.equal(fiammeLabel(3), '🔥🔥🔥🤍🤍');
  assert.equal(fiammeLabel(5), '🔥🔥🔥🔥🔥');
  assert.equal(fiammeLabel(9), '🔥🔥🔥🔥🔥'); // clamp
});

test('fotoPath: <couple>/<contesto>/<ref>/<now>-<file sanificato>', () => {
  const p = fotoPath('cpl', 'esperienza', 'esp', 'La mia foto!.JPG', 1700000000000);
  assert.equal(p, 'cpl/esperienza/esp/1700000000000-La_mia_foto_.JPG');
});
