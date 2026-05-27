import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  monthMatrix, monthLabel, groupByDay, sortByDateDesc, fiammeLabel,
  findTipo, countTipoOnDate, splitGiorno, tipiDefaultRows,
} from '../lib/logic.js';
import {
  listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza, deleteFotoDi, addMomento,
  listTipi, seedTipi, addTipo, updateTipo, deleteTipo,
} from '../store.js';
import { fotoEditor, loadThumbsInto, loadCoverInto } from './foto.js';
import { renderDati } from './dati.js';

let ctx = null;        // { client, me, panel }
let rows = [];         // esperienze della coppia
let tipi = [];         // tipi di momento della coppia
let viewY, viewM;      // mese visualizzato
let wired = false;

const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export async function renderCalendario(context) {
  ctx = context;
  if (!wired) { document.addEventListener('fab:calendario', () => openEdit(null, todayISO())); wired = true; }
  if (viewY == null) { const t = new Date(); viewY = t.getFullYear(); viewM = t.getMonth(); }
  try {
    tipi = await loadTipi(ctx);
    rows = await listEsperienze(ctx.client, ctx.me.couple_id);
  } catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; }
  draw();
}

// Carica i tipi; alla prima apertura della coppia semina i default.
async function loadTipi(c) {
  let list = await listTipi(c.client, c.me.couple_id);
  if (!list.length) {
    await seedTipi(c.client, tipiDefaultRows(c.me.couple_id));
    list = await listTipi(c.client, c.me.couple_id);
  }
  return list;
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '📅 Calendario & esperienze'),
         mk('p', 'psub', 'Segna al volo, o aggiungi un evento speciale col ＋.'));

  drawTally(p);
  drawCalendar(p);

  add(p, mk('div', 'section-label', 'Più recenti'));
  if (!rows.length) { p.appendChild(mk('div', 'empty', 'Ancora niente.\nSegna un momento qui sopra, o tocca ＋.')); return; }
  const byDay = groupByDay(rows);
  const giorni = Object.keys(byDay).sort().reverse().slice(0, 8);
  for (const iso of giorni) p.appendChild(dayBlock(iso, sortByDateDesc(byDay[iso])));

  // I numeri (ex tab "Dati") incorporati in fondo alla pagina
  const stats = mk('div', 'dati-embed');
  p.appendChild(stats);
  renderDati({ client: ctx.client, me: ctx.me, panel: stats }).catch(() => {});
}

// ---- "Segna al volo · oggi": una tally per tipo, col conteggio di oggi ----
function drawTally(p) {
  const today = todayISO();
  add(p, mk('div', 'tally-lbl', 'Segna al volo · oggi'));
  const trow = mk('div', 'tally-row');
  for (const t of tipi) {
    const b = mk('div', 'tally');
    const n = countTipoOnDate(rows, t.id, today);
    add(b, mk('span', 'te', t.emoji), mk('span', 'tl', t.label),
        mk('span', 'cnt' + (n ? '' : ' zero'), n ? '+' + n : ''));
    b.onclick = () => segnaMomento(t);
    trow.appendChild(b);
  }
  p.appendChild(trow);
}

async function segnaMomento(t) {
  try {
    await addMomento(ctx.client, { couple_id: ctx.me.couple_id, autore_id: ctx.me.id, tipo_id: t.id, data: todayISO() });
    toast(t.emoji + ' segnato!');
    await renderCalendario(ctx);
  } catch (err) { toast('Errore: ' + err.message, 'err'); }
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
      const evs = byDay[cell.iso] || [];
      const c = mk('div', 'cal-cell' + (evs.length ? ' has' : '') + (cell.iso === today ? ' today' : ''));
      c.appendChild(mk('span', null, String(cell.day)));
      if (evs.length) {
        const dots = mk('div', 'cal-dots');
        for (let i = 0; i < Math.min(evs.length, 3); i++) dots.appendChild(mk('span', 'cal-dot'));
        c.appendChild(dots);
        c.onclick = () => openDay(cell.iso);
      }
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

// ---- blocco giornaliero: card ricche + conteggi dei momenti rapidi ----
function dayBlock(iso, evs) {
  const wrap = mk('div');
  wrap.appendChild(mk('div', 'day-date', fmt(iso)));
  const { ricchi, conteggi } = splitGiorno(evs, tipi);
  for (const e of ricchi) wrap.appendChild(richCard(e));
  for (const c of conteggi) wrap.appendChild(qcard(c.tipo, c.n));
  return wrap;
}

function qcard(tipo, n) {
  const q = mk('div', 'qcard');
  add(q, mk('span', 'qe', tipo.emoji), mk('span', 'qt', tipo.label), mk('span', 'qx', '×' + n));
  return q;
}

function richCard(e) {
  const t = findTipo(tipi, e.tipo_id);
  const c = mk('div', 'ev-card');
  c.onclick = () => openEvent(e);

  const cover = mk('div', 'ev-cover');
  loadCoverInto(ctx, { contesto: 'esperienza', refId: e.id }, cover);
  c.appendChild(cover);

  const body = mk('div', 'ev-body');
  const top = mk('div', 'ev-top');
  const tag = mk('span', 'ev-tag'); add(tag, mk('span', 'te', t.emoji), mk('span', null, t.label));
  add(top, tag, mk('span', 'fiamme', fiammeLabel(e.voto)));
  add(body, top, mk('p', 'ev-title', e.titolo));
  if (e.testo) body.appendChild(mk('p', 'ev-text', e.testo));
  const foot = mk('div', 'ev-foot');
  foot.appendChild(mk('span', 'ev-cam', 'tocca per aprire ›'));
  body.appendChild(foot);

  c.appendChild(body);
  return c;
}

function openDay(iso) {
  const evs = sortByDateDesc(rows.filter(e => e.data === iso));
  openSheet('Recap del ' + fmt(iso), s => {
    if (!evs.length) { add(s, mk('p', 'muted', 'Niente in questa data.')); return; }
    const { ricchi, conteggi } = splitGiorno(evs, tipi);
    for (const c of conteggi) s.appendChild(qcard(c.tipo, c.n));
    for (const e of ricchi) s.appendChild(richCard(e));
    const b = mk('button', 'btn', '＋ Aggiungi evento in questa data'); b.style.cssText = 'width:100%;margin-top:8px;';
    b.onclick = () => { s.closest('.modal').remove(); openEdit(null, iso); };
    s.appendChild(b);
  });
}

function openEvent(e) {
  const t = findTipo(tipi, e.tipo_id);
  openSheet('', s => {
    const top = mk('div', 'row spread');
    const tag = mk('span', 'ev-tag'); add(tag, mk('span', 'te', t.emoji), mk('span', null, t.label));
    add(top, tag, mk('span', 'muted', fmt(e.data)));
    s.appendChild(top);

    const h = mk('h3', null, e.titolo || t.label); h.style.margin = '10px 0 4px'; s.appendChild(h);
    s.appendChild(mk('div', 'fiamme', fiammeLabel(e.voto)));
    if (e.testo) { const tx = mk('p', null, e.testo); tx.style.cssText = 'color:#cbab9e;font-size:14px;line-height:1.55;margin:12px 0;'; s.appendChild(tx); }

    const thumbs = mk('div', 'thumbs'); s.appendChild(thumbs);
    loadThumbsInto(ctx, { contesto: 'esperienza', refId: e.id }, thumbs, false)
      .catch(err => toast('Errore foto: ' + err.message, 'err'));

    const act = mk('div', 'row'); act.style.cssText = 'justify-content:flex-end;gap:8px;margin-top:16px;';
    const edit = mk('button', 'btn sm ghost', 'Modifica');
    edit.onclick = () => { s.closest('.modal').remove(); openEdit(e, e.data); };
    const del = mk('button', 'btn sm ghost', 'Elimina');
    del.onclick = async () => {
      if (del.dataset.confirm !== '1') {
        del.textContent = 'Sicuro?'; del.dataset.confirm = '1';
        setTimeout(() => { del.textContent = 'Elimina'; del.dataset.confirm = ''; }, 2000);
        return;
      }
      try { await removeEsperienzaConFoto(e.id); s.closest('.modal').remove(); await renderCalendario(ctx); }
      catch (err) { toast('Errore: ' + err.message, 'err'); }
    };
    add(act, edit, del); s.appendChild(act);
  });
}

async function removeEsperienzaConFoto(esperienzaId) {
  const fallite = await deleteFotoDi(ctx.client, { contesto: 'esperienza', refId: esperienzaId });
  await deleteEsperienza(ctx.client, esperienzaId);
  if (fallite) toast('Esperienza eliminata, ma ' + fallite + ' foto non rimosse dallo storage', 'err');
}

// ---- form evento ricco (con selettore tag) ----
function openEdit(esp, presetData) {
  const isNew = !esp;
  let voto = esp ? esp.voto : 0;
  let chosen = esp && esp.tipo_id ? esp.tipo_id : (tipi[0] ? tipi[0].id : null);

  openSheet(isNew ? 'Nuovo evento' : 'Modifica evento', s => {
    add(s, mk('label', 'lbl', 'Tag · conta nei totali'));
    const tagsel = mk('div', 'tagsel');
    const renderTags = () => {
      clear(tagsel);
      for (const t of tipi) {
        const b = mk('button', t.id === chosen ? 'on' : '');
        add(b, mk('span', 'tge', t.emoji), mk('span', null, ' ' + t.label));
        b.onclick = () => { chosen = t.id; renderTags(); };
        tagsel.appendChild(b);
      }
      const addB = mk('button', null, '＋ tag');
      addB.onclick = () => { s.closest('.modal').remove(); openTipiSettings(ctx, () => renderCalendario(ctx)); };
      tagsel.appendChild(addB);
    };
    renderTags();
    s.appendChild(tagsel);

    const titolo = mk('input'); titolo.placeholder = 'Es. Notte in hotel'; titolo.value = esp ? (esp.titolo || '') : '';
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
      if (!chosen) { toast('Scegli un tag', 'err'); return; }
      save.disabled = true;
      try {
        let id;
        if (isNew) {
          const row = await addEsperienza(ctx.client, {
            couple_id: ctx.me.couple_id, autore_id: ctx.me.id, tipo_id: chosen,
            titolo: titolo.value.trim(), testo: testo.value.trim(), data: data.value, voto,
          });
          id = row.id;
        } else {
          await updateEsperienza(ctx.client, esp.id, {
            tipo_id: chosen, titolo: titolo.value.trim(), testo: testo.value.trim(), data: data.value, voto,
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

// ---- gestione tipi/tag (apribile dal ⚙️ e dal "＋ tag" nel form) ----
export function openTipiSettings(context, onChange) {
  const c = context;
  openSheet('Gestisci i tag', s => {
    add(s, mk('p', 'muted', 'Aggiungi, modifica o elimina i tipi di momento. Ogni tag ha un\'emoji e un nome (es. "Pompino in doccia").'));
    const listBox = mk('div'); listBox.style.margin = '12px 0';
    const emEl = mk('input', 'em'); emEl.placeholder = '🌶️'; emEl.maxLength = 4;
    const lblEl = mk('input'); lblEl.placeholder = 'Nome (es. Pompino in doccia)';
    const addBtn = mk('button', 'btn'); addBtn.textContent = 'Aggiungi tag'; addBtn.style.cssText = 'width:100%;margin-top:4px;';
    let lista = [];
    let editId = null;

    const notify = () => { if (onChange) onChange(); };

    const reload = async () => {
      lista = await listTipi(c.client, c.me.couple_id);
      renderList();
    };

    const renderList = () => {
      clear(listBox);
      for (const t of lista) {
        const r = mk('div', 'tipo-row');
        add(r, mk('span', 'te', t.emoji), mk('span', 'tn', t.label));
        const ed = mk('button', 'ed', 'Modifica');
        ed.onclick = () => { emEl.value = t.emoji; lblEl.value = t.label; editId = t.id; addBtn.textContent = 'Salva modifica'; };
        const del = mk('button', 'del', '✕');
        del.onclick = async () => {
          if (del.dataset.confirm !== '1') {
            del.textContent = 'Sicuro?'; del.dataset.confirm = '1';
            setTimeout(() => { del.textContent = '✕'; del.dataset.confirm = ''; }, 2000);
            return;
          }
          try { await deleteTipo(c.client, t.id); await reload(); notify(); }
          catch (err) { toast('Errore: ' + err.message, 'err'); }
        };
        add(r, ed, del); listBox.appendChild(r);
      }
    };

    addBtn.onclick = async () => {
      const e = (emEl.value || '✦').trim();
      const l = lblEl.value.trim();
      if (!l) { toast('Dai un nome al tag', 'err'); return; }
      addBtn.disabled = true;
      try {
        if (editId) {
          await updateTipo(c.client, editId, { emoji: e, label: l });
          editId = null; addBtn.textContent = 'Aggiungi tag';
        } else {
          await addTipo(c.client, { couple_id: c.me.couple_id, emoji: e, label: l, ordine: lista.length });
        }
        emEl.value = ''; lblEl.value = '';
        await reload(); notify();
      } catch (err) { toast('Errore: ' + err.message, 'err'); }
      finally { addBtn.disabled = false; }
    };

    add(s, listBox, mk('label', 'lbl', 'Nuovo / modifica tag'));
    const ar = mk('div', 'addrow'); add(ar, emEl, lblEl); s.appendChild(ar);
    s.appendChild(addBtn);
    reload().catch(err => toast('Errore caricamento tag: ' + err.message, 'err'));
  });
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
