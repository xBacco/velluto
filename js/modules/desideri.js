import { mk, add, clear, toast } from '../ui.js';
import { filterDesideri } from '../lib/logic.js';
import { listDesideri, addDesiderio, markRealizzato, deleteDesiderio } from '../store.js';
import { getTimbri } from '../lib/timbri.js';

let ctx = null;        // { client, me, panel }
let fil = 'tutti';
let rows = [];
let wired = false;

export async function renderDesideri(context) {
  ctx = context;
  if (!wired) { document.addEventListener('fab:desideri', () => openAdd()); wired = true; }
  try {
    rows = await listDesideri(ctx.client, ctx.me.couple_id);
  } catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🔥 Fantasie'),
         mk('p', 'psub', 'Bacheca delle cose da provare. Spuntale quando le realizzate insieme.'));
  const f = mk('div', 'filters');
  for (const [k, l] of [['tutti','Tutti'],['da_provare','Da provare'],['realizzato','Realizzati'],['mine','Scritti da me']]) {
    const b = mk('button', fil === k ? 'on' : '', l);
    b.onclick = () => { fil = k; draw(); };
    f.appendChild(b);
  }
  p.appendChild(f);
  const list = filterDesideri(rows, { tipo: fil, me: ctx.me.id });
  if (!list.length) { p.appendChild(mk('div', 'empty', 'Ancora niente qui.\nTocca ＋ per aggiungere una fantasia.')); return; }
  for (const d of list) p.appendChild(cardOf(d));
}

function cardOf(d) {
  const c = mk('div', 'card');
  const top = mk('div', 'row spread');
  const left = mk('div', 'row');
  left.appendChild(mk('span', d.stato === 'realizzato' ? 'pill done' : 'pill', d.stato === 'realizzato' ? 'Realizzato' : 'Da provare'));
  if (d.categoria) left.appendChild(mk('span', 'pill', d.categoria));
  add(top, left, mk('span', 'muted', d.data_realizzato ? 'Fatto il ' + fmt(d.data_realizzato) : ''));
  c.appendChild(top);
  const txt = mk('p', null, d.testo); txt.style.cssText = 'margin:10px 0 8px;font-size:18px;'; c.appendChild(txt);
  const act = mk('div', 'row'); act.style.justifyContent = 'flex-end';
  if (d.stato === 'da_provare') {
    const done = mk('button', 'btn sm gold', '✓ Realizzato');
    done.onclick = async () => {
      try { await markRealizzato(ctx.client, d.id, todayISO()); await renderDesideri(ctx); }
      catch (e) { toast('Errore: ' + e.message, 'err'); }
    };
    act.appendChild(done);
  }
  const del = mk('button', 'btn sm ghost', 'Elimina');
  del.onclick = async () => {
    if (del.dataset.confirm !== '1') {
      del.textContent = 'Sicuro?'; del.dataset.confirm = '1';
      setTimeout(() => { del.textContent = 'Elimina'; del.dataset.confirm = ''; }, 2000);
      return;
    }
    try { await deleteDesiderio(ctx.client, d.id); await renderDesideri(ctx); }
    catch (e) { toast('Errore: ' + e.message, 'err'); }
  };
  act.appendChild(del);
  c.appendChild(act);
  return c;
}

function openAdd() {
  const overlay = mk('div', 'modal on');
  const sheet = mk('div', 'sheet fantasia-sheet');
  const closeBtn = mk('span', 'x', '✕');
  closeBtn.onclick = () => overlay.remove();

  // Cartolina
  const card = mk('div', 'fantasia-card');
  const left = mk('div', 'fantasia-left');
  const meta = mk('div', 'fantasia-meta');
  add(meta, mk('span', null, 'Dal cuore di chi scrive'), mk('span', null, 'oggi'));
  const ta = mk('textarea', 'fantasia-ta');
  ta.placeholder = 'Cara/o noi due, vorrei provare…';
  add(left, meta, ta);
  const stamp = mk('div', 'fantasia-stamp');
  stamp.appendChild(mk('span', 'emo', '🔥'));
  stamp.appendChild(document.createTextNode('fantasia'));
  add(card, left, stamp);

  // Timbri (chip categoria — singolo selezionabile)
  const chipsLbl = mk('div', 'fantasia-chips-lbl', 'Timbri · opzionali');
  const chips = mk('div', 'fantasia-chips');
  let selectedCat = '';
  const timbri = getTimbri();
  timbri.forEach(p => {
    const c = mk('div', 'chip', p);
    c.onclick = () => {
      const wasOn = c.classList.contains('on');
      chips.querySelectorAll('.chip.on').forEach(o => o.classList.remove('on'));
      if (!wasOn) { c.classList.add('on'); selectedCat = p; }
      else selectedCat = '';
    };
    chips.appendChild(c);
  });

  // Azioni
  const acts = mk('div', 'fantasia-acts');
  const cancel = mk('button', 'fantasia-cancel', 'Annulla');
  cancel.onclick = () => overlay.remove();
  const send = mk('button', 'fantasia-send', 'Spedisci');
  send.disabled = true;
  ta.addEventListener('input', () => { send.disabled = !ta.value.trim(); });
  send.onclick = async () => {
    if (!ta.value.trim()) return;
    send.disabled = true;
    try {
      await addDesiderio(ctx.client, {
        couple_id: ctx.me.couple_id, autore_id: ctx.me.id,
        testo: ta.value.trim(), categoria: selectedCat,
      });
      overlay.remove();
      await renderDesideri(ctx);
    } catch (e) {
      toast('Errore salvataggio: ' + e.message, 'err');
      send.disabled = false;
    }
  };
  add(acts, cancel, send);

  add(sheet, closeBtn, card, chipsLbl, chips, acts);
  overlay.appendChild(sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
