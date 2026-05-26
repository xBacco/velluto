import { mk, add, clear, toast, openSheet } from '../ui.js';
import { monthMatrix, monthLabel, groupByDay, sortByDateDesc, fiammeLabel, fotoPath } from '../lib/logic.js';
import { listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza, deleteFotoDi } from '../store.js';
import { fotoEditor, loadThumbsInto } from './foto.js';

let ctx = null;        // { client, me, panel }
let rows = [];         // esperienze della coppia
let viewY, viewM;      // mese visualizzato
let wired = false;

const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export async function renderCalendario(context) {
  ctx = context;
  if (!wired) { document.addEventListener('fab:calendario', () => openEdit(null, todayISO())); wired = true; }
  if (viewY == null) { const t = new Date(); viewY = t.getFullYear(); viewM = t.getMonth(); }
  try {
    rows = await listEsperienze(ctx.client, ctx.me.couple_id);
  } catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '📅 Calendario & esperienze'),
         mk('p', 'psub', 'Il diario delle vostre esperienze: votale a fiamme e aggiungi foto.'));
  drawCalendar(p);
  add(p, mk('div', 'section-label', 'Più recenti'));
  const recent = sortByDateDesc(rows);
  if (!recent.length) { p.appendChild(mk('div', 'empty', 'Ancora nessuna esperienza.\nTocca ＋ per aggiungerne una.')); return; }
  for (const e of recent) p.appendChild(cardOf(e));
}

function drawCalendar(p) {
  const head = mk('div', 'cal-head');
  const prev = mk('button', null, '‹'); prev.onclick = () => shiftMonth(-1);
  const next = mk('button', null, '›'); next.onclick = () => shiftMonth(1);
  add(head, prev, mk('div', 'cal-month', monthLabel(viewY, viewM)), next);
  p.appendChild(head);

  const grid = mk('div', 'cal-grid');
  for (const d of DOW) grid.appendChild(mk('div', 'cal-dow', d));
  const byDay = groupByDay(rows);
  const today = todayISO();
  for (const week of monthMatrix(viewY, viewM)) {
    for (const cell of week) {
      if (!cell) { grid.appendChild(mk('div', 'cal-cell empty')); continue; }
      const has = byDay[cell.iso] && byDay[cell.iso].length;
      const c = mk('div', 'cal-cell' + (has ? ' has' : '') + (cell.iso === today ? ' today' : ''));
      c.appendChild(mk('span', null, String(cell.day)));
      if (has) { c.appendChild(mk('span', 'cal-dot')); c.onclick = () => openDay(cell.iso); }
      grid.appendChild(c);
    }
  }
  p.appendChild(grid);
}

function shiftMonth(delta) {
  viewM += delta;
  if (viewM < 0) { viewM = 11; viewY--; }
  else if (viewM > 11) { viewM = 0; viewY++; }
  draw();
}

function openDay(iso) {
  const list = sortByDateDesc(rows.filter(e => e.data === iso));
  openSheet('Esperienze del ' + fmt(iso), s => {
    if (!list.length) add(s, mk('p', 'muted', 'Niente in questa data.'));
    for (const e of list) {
      const r = mk('div', 'card');
      add(r, mk('div', 'fiamme', fiammeLabel(e.voto)), mk('p', null, e.titolo));
      s.appendChild(r);
    }
    const b = mk('button', 'btn', '＋ Aggiungi in questa data'); b.style.width = '100%';
    b.onclick = () => { s.closest('.modal').remove(); openEdit(null, iso); };
    s.appendChild(b);
  });
}

function cardOf(e) {
  const c = mk('div', 'card');
  const top = mk('div', 'row spread');
  add(top, mk('div', 'fiamme', fiammeLabel(e.voto)), mk('span', 'muted', fmt(e.data)));
  c.appendChild(top);
  const t = mk('p', null, e.titolo); t.style.cssText = 'margin:8px 0 4px;font-size:18px;'; c.appendChild(t);
  if (e.testo) { const tx = mk('p', 'muted', e.testo); tx.style.fontSize = '13px'; c.appendChild(tx); }

  const thumbs = mk('div', 'thumbs'); c.appendChild(thumbs);
  loadThumbsInto(ctx, { contesto: 'esperienza', refId: e.id }, thumbs, false);

  const act = mk('div', 'row'); act.style.cssText = 'justify-content:flex-end;margin-top:10px;';
  const edit = mk('button', 'btn sm ghost', 'Modifica'); edit.onclick = () => openEdit(e, e.data);
  const del = mk('button', 'btn sm ghost', 'Elimina');
  del.onclick = async () => {
    if (del.dataset.confirm !== '1') {
      del.textContent = 'Sicuro?'; del.dataset.confirm = '1';
      setTimeout(() => { del.textContent = 'Elimina'; del.dataset.confirm = ''; }, 2000);
      return;
    }
    try { await removeEsperienzaConFoto(e.id); await renderCalendario(ctx); }
    catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  add(act, edit, del); c.appendChild(act);
  return c;
}

async function removeEsperienzaConFoto(esperienzaId) {
  const fallite = await deleteFotoDi(ctx.client, { contesto: 'esperienza', refId: esperienzaId });
  await deleteEsperienza(ctx.client, esperienzaId);
  if (fallite) toast('Esperienza eliminata, ma ' + fallite + ' foto non rimosse dallo storage', 'err');
}

function openEdit(esp, presetData) {
  const isNew = !esp;
  let voto = esp ? esp.voto : 0;

  openSheet(isNew ? 'Nuova esperienza' : 'Modifica esperienza', s => {
    const titolo = mk('input'); titolo.placeholder = 'Titolo'; titolo.value = esp ? esp.titolo : '';
    const data = mk('input'); data.type = 'date'; data.value = esp ? esp.data : presetData;
    const testo = mk('textarea'); testo.placeholder = "Com'è andata…"; testo.value = esp && esp.testo ? esp.testo : '';

    const votoPick = mk('div', 'voto-pick');
    const flames = [];
    for (let i = 1; i <= 5; i++) {
      const f = mk('span', null, i <= voto ? '🔥' : '🤍');
      f.onclick = () => { voto = i; flames.forEach((el, idx) => { el.textContent = (idx + 1) <= voto ? '🔥' : '🤍'; }); };
      flames.push(f); votoPick.appendChild(f);
    }

    const foto = fotoEditor(ctx, { contesto: 'esperienza', refId: esp ? esp.id : null });

    const save = mk('button', 'btn', 'Salva'); save.style.cssText = 'width:100%;margin-top:6px;';
    save.onclick = async () => {
      if (!titolo.value.trim() || !data.value) { toast('Titolo e data sono obbligatori', 'err'); return; }
      save.disabled = true;
      try {
        let id;
        if (isNew) {
          const row = await addEsperienza(ctx.client, {
            couple_id: ctx.me.couple_id, autore_id: ctx.me.id,
            titolo: titolo.value.trim(), testo: testo.value.trim(), data: data.value, voto,
          });
          id = row.id;
        } else {
          await updateEsperienza(ctx.client, esp.id, {
            titolo: titolo.value.trim(), testo: testo.value.trim(), data: data.value, voto,
          });
          id = esp.id;
        }
        await foto.flush(id);
        s.closest('.modal').remove();
        await renderCalendario(ctx);
      } catch (err) { save.disabled = false; toast('Errore salvataggio: ' + err.message, 'err'); }
    };

    add(s,
      mk('label', 'lbl', 'Titolo'), titolo,
      mk('label', 'lbl', 'Data'), data,
      mk('label', 'lbl', 'Voto'), votoPick,
      mk('label', 'lbl', 'Racconto'), testo,
      mk('label', 'lbl', 'Foto'), foto.el,
      save);
  });
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
