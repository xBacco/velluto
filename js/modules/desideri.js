import { mk, add, clear, toast, openSheet } from '../ui.js';
import { filterDesideri } from '../lib/logic.js';
import { listDesideri, addDesiderio, markRealizzato, deleteDesiderio } from '../store.js';

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
  add(p, mk('h2', 'ptitle', '🔥 Desideri & fantasie'),
         mk('p', 'psub', 'Bacheca delle cose da provare. Spuntale quando le realizzate insieme.'));
  const f = mk('div', 'filters');
  for (const [k, l] of [['tutti','Tutti'],['da_provare','Da provare'],['realizzato','Realizzati'],['mine','Scritti da me']]) {
    const b = mk('button', fil === k ? 'on' : '', l);
    b.onclick = () => { fil = k; draw(); };
    f.appendChild(b);
  }
  p.appendChild(f);
  const list = filterDesideri(rows, { tipo: fil, me: ctx.me.id });
  if (!list.length) { p.appendChild(mk('div', 'empty', 'Ancora niente qui.\nTocca ＋ per aggiungere un desiderio.')); return; }
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
  openSheet('Nuovo desiderio', s => {
    const testo = mk('textarea'); testo.placeholder = 'Cosa vorreste provare…';
    const cat = mk('input'); cat.placeholder = 'Categoria (facoltativa)';
    const b = mk('button', 'btn', 'Aggiungi alla bacheca'); b.style.width = '100%'; b.style.marginTop = '6px';
    b.onclick = async () => {
      if (!testo.value.trim()) return;
      try {
        await addDesiderio(ctx.client, { couple_id: ctx.me.couple_id, autore_id: ctx.me.id, testo: testo.value.trim(), categoria: cat.value.trim() });
        s.closest('.modal').remove();
        await renderDesideri(ctx);
      } catch (e) { toast('Errore salvataggio: ' + e.message, 'err'); }
    };
    add(s, mk('label', 'lbl', 'Desiderio'), testo, mk('label', 'lbl', 'Categoria'), cat, b);
  });
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
