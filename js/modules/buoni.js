import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  sortByRecent, applicaTransizioneBuono, gruppoBundle,
  buoniRicevuti, buoniInviati, richiesteDaConcedere, richiesteInviate,
} from '../lib/logic.js';
import { listBuoni, addBuono, updateStatoBuono, deleteBuono, listFoto, signedUrl, deleteFotoDi } from '../store.js';
import { fotoEditor, thumbEl } from './foto.js';

let ctx = null;
let rows = [];
let vista = 'ricevuti';
let wired = false;

const STATO_PILL = {
  attivo: 'ok', riscattato: '', in_attesa: 'wait', rifiutato: 'no',
};

export async function renderBuoni(context) {
  ctx = context;
  if (!wired) { document.addEventListener('fab:buoni', () => openCrea()); wired = true; }
  try { rows = await listBuoni(ctx.client, ctx.me.couple_id); }
  catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🎟️ Buoni'),
         mk('p', 'psub', 'Regali, bundle e richieste — da riscattare quando vuoi.'));

  const me = ctx.me.id;
  const nDaConcedere = richiesteDaConcedere(rows, me).length;
  const filters = mk('div', 'filters');
  for (const [k, label] of [['ricevuti', 'Ricevuti'], ['inviati', 'Inviati'], ['richieste', 'Richieste']]) {
    const b = mk('button', vista === k ? 'on' : null, label);
    if (k === 'richieste' && nDaConcedere) add(b, mk('span', 'pill wait', ' ' + nDaConcedere));
    b.onclick = () => { vista = k; draw(); };
    filters.appendChild(b);
  }
  p.appendChild(filters);

  if (vista === 'ricevuti') drawRicevuti(p, me);
  else if (vista === 'inviati') drawInviati(p, me);
  else drawRichieste(p, me);
}

function drawRicevuti(p, me) {
  const list = sortByRecent(buoniRicevuti(rows, me));
  if (!list.length) { p.appendChild(mk('div', 'empty', 'Nessun buono ricevuto.\nFatti regalare qualcosa 😏')); return; }
  for (const g of gruppoBundle(list)) p.appendChild(g.bundle_id ? bundleCard(g) : buonoCard(g.buoni[0], { redeem: true }));
}

function drawInviati(p, me) {
  const list = sortByRecent(buoniInviati(rows, me));
  if (!list.length) { p.appendChild(mk('div', 'empty', 'Non hai ancora inviato buoni.\nTocca ＋ per crearne uno.')); return; }
  for (const g of gruppoBundle(list)) p.appendChild(g.bundle_id ? bundleCard(g) : buonoCard(g.buoni[0], { canDelete: true }));
}

function drawRichieste(p, me) {
  const daConcedere = sortByRecent(richiesteDaConcedere(rows, me));
  const inviate = sortByRecent(richiesteInviate(rows, me));
  if (!daConcedere.length && !inviate.length) { p.appendChild(mk('div', 'empty', 'Nessuna richiesta in sospeso.')); return; }
  if (daConcedere.length) {
    add(p, mk('div', 'section-label', 'Ti hanno chiesto'));
    for (const b of daConcedere) p.appendChild(buonoCard(b, { grant: true }));
  }
  if (inviate.length) {
    add(p, mk('div', 'section-label', 'In attesa di risposta'));
    for (const b of inviate) p.appendChild(buonoCard(b, {}));
  }
}

function buonoCard(b, opts) {
  const c = mk('div', 'card');
  const top = mk('div', 'row spread');
  const left = mk('div', 'row');
  add(left, mk('span', 'bemoji', b.emoji), mk('p', 'btitle', b.titolo));
  add(top, left, mk('span', 'pill ' + (STATO_PILL[b.stato] || ''), b.stato.replace('_', ' ')));
  c.appendChild(top);
  if (b.descrizione) c.appendChild(mk('p', 'bdesc', b.descrizione));

  const thumbs = mk('div', 'thumbs'); c.appendChild(thumbs);
  loadBuonoThumbs(b.id, thumbs);

  const act = mk('div', 'actions');
  if (opts.redeem && b.stato === 'attivo') act.appendChild(azione('Riscatta 🔓', 'gold', () => transizione(b, 'riscatta')));
  if (opts.grant) {
    act.appendChild(azione('Accetta', 'gold', () => transizione(b, 'accetta')));
    act.appendChild(azione('Rifiuta', 'ghost', () => transizione(b, 'rifiuta')));
  }
  if (opts.canDelete) act.appendChild(azione('Elimina', 'ghost', () => elimina(b)));
  if (act.children.length) c.appendChild(act);
  return c;
}

function bundleCard(g) {
  const c = mk('div', 'card'); c.style.borderColor = 'rgba(212,168,108,.45)';
  const top = mk('div', 'row spread');
  add(top, mk('span', 'pill', '🎁 Bundle · ' + g.buoni.length + ' buoni'),
           mk('span', 'pill ' + (STATO_PILL[g.buoni[0].stato] || ''), g.buoni[0].stato.replace('_', ' ')));
  c.appendChild(top);
  const emojis = mk('div', 'row'); emojis.style.cssText = 'gap:12px;margin-top:10px;font-size:22px;';
  for (const b of g.buoni) emojis.appendChild(mk('span', null, b.emoji));
  c.appendChild(emojis);
  const open = azione('Apri bundle', '', () => openBundle(g));
  const act = mk('div', 'actions'); act.appendChild(open); c.appendChild(act);
  return c;
}

function openBundle(g) {
  openSheet('Bundle · ' + g.buoni.length + ' buoni', s => {
    for (const b of g.buoni) {
      const row = mk('div', 'card');
      const r = mk('div', 'row'); add(r, mk('span', 'bemoji', b.emoji), mk('p', 'btitle', b.titolo));
      row.appendChild(r);
      if (b.descrizione) row.appendChild(mk('p', 'bdesc', b.descrizione));
      if (b.stato === 'attivo') {
        const a = mk('div', 'actions'); a.appendChild(azione('Riscatta 🔓', 'gold sm', () => transizione(b, 'riscatta'))); row.appendChild(a);
      }
      s.appendChild(row);
    }
  });
}

function azione(label, kind, fn) {
  const b = mk('button', 'btn sm' + (kind ? ' ' + kind : ''), label);
  b.onclick = async () => { b.disabled = true; try { await fn(); } catch (err) { b.disabled = false; toast('Errore: ' + err.message, 'err'); } };
  return b;
}

async function transizione(b, azioneNome) {
  const patch = applicaTransizioneBuono(b, azioneNome);
  await updateStatoBuono(ctx.client, b.id, patch);
  await renderBuoni(ctx);
}

async function elimina(b) {
  await deleteFotoDi(ctx.client, { contesto: 'buono', refId: b.id });
  await deleteBuono(ctx.client, b.id);
  await renderBuoni(ctx);
}

async function loadBuonoThumbs(buonoId, container) {
  try {
    const foto = await listFoto(ctx.client, { contesto: 'buono', refId: buonoId });
    for (const f of foto) {
      const url = await signedUrl(ctx.client, f.storage_path);
      container.appendChild(thumbEl(ctx, f, url, false));
    }
  } catch { /* nelle card non disturbo */ }
}

// --- creazione ---
function openCrea() {
  let tipo = 'regalo';
  openSheet('Nuovo buono', s => {
    const tabs = mk('div', 'filters');
    const voci = [['regalo', '🎁 Regalo'], ['richiesta', '🙏 Richiesta'], ['bundle', '📦 Bundle']];
    const btns = [];
    for (const [k, label] of voci) {
      const b = mk('button', tipo === k ? 'on' : null, label);
      b.onclick = () => { tipo = k; btns.forEach(x => x.classList.toggle('on', x.dataset.k === k)); bundleExtra.style.display = (k === 'bundle') ? '' : 'none'; foto.el.style.display = (k === 'bundle') ? 'none' : ''; };
      b.dataset.k = k; btns.push(b); tabs.appendChild(b);
    }

    const emoji = mk('input'); emoji.value = '🎟️'; emoji.style.cssText = 'width:64px;text-align:center;display:inline-block;';
    const titolo = mk('input'); titolo.placeholder = 'Titolo (es. Massaggio)';
    const descr = mk('textarea'); descr.placeholder = 'Descrizione (facoltativa)';

    const foto = fotoEditor(ctx, { contesto: 'buono', refId: null });

    const bundleExtra = mk('div'); bundleExtra.style.display = 'none';
    const righe = [];
    function addRiga() {
      const r = mk('div', 'row'); r.style.gap = '8px';
      const e = mk('input'); e.value = '🎟️'; e.style.cssText = 'width:56px;text-align:center;';
      const t = mk('input'); t.placeholder = 'Titolo buono'; t.style.flex = '1';
      add(r, e, t); righe.push({ e, t }); bundleExtra.appendChild(r);
    }
    addRiga(); addRiga();
    const piu = mk('button', 'btn ghost sm', '＋ aggiungi buono'); piu.onclick = addRiga; bundleExtra.appendChild(piu);

    const save = mk('button', 'btn gold', 'Crea'); save.style.cssText = 'width:100%;margin-top:14px;';
    save.onclick = async () => {
      save.disabled = true;
      try {
        const me = ctx.me.id, partner = await partnerId();
        if (tipo === 'bundle') {
          const items = righe.filter(r => r.t.value.trim());
          if (!items.length) { toast('Aggiungi almeno un buono al bundle', 'err'); save.disabled = false; return; }
          const bundleId = crypto.randomUUID();
          for (const r of items) {
            await addBuono(ctx.client, { couple_id: ctx.me.couple_id, da_id: me, a_id: partner, emoji: r.e.value || '🎟️', titolo: r.t.value.trim(), tipo: 'regalo', stato: 'attivo', bundle_id: bundleId });
          }
        } else {
          if (!titolo.value.trim()) { toast('Il titolo è obbligatorio', 'err'); save.disabled = false; return; }
          const isReq = tipo === 'richiesta';
          const row = await addBuono(ctx.client, {
            couple_id: ctx.me.couple_id,
            da_id: isReq ? partner : me,
            a_id: isReq ? me : partner,
            emoji: emoji.value || '🎟️', titolo: titolo.value.trim(), descrizione: descr.value.trim(),
            tipo: isReq ? 'richiesta' : 'regalo', stato: isReq ? 'in_attesa' : 'attivo',
          });
          await foto.flush(row.id);
        }
        s.closest('.modal').remove();
        await renderBuoni(ctx);
      } catch (err) { save.disabled = false; toast('Errore: ' + err.message, 'err'); }
    };

    const riga = mk('div', 'row'); riga.style.gap = '8px'; add(riga, emoji, titolo);
    add(s,
      mk('label', 'lbl', 'Tipo'), tabs,
      mk('label', 'lbl', 'Emoji + Titolo'), riga,
      mk('label', 'lbl', 'Descrizione'), descr,
      mk('label', 'lbl', 'Foto (facoltativa)'), foto.el,
      bundleExtra,
      save);
  });
}

async function partnerId() {
  const { data, error } = await ctx.client.from('couples').select('membro_a,membro_b').eq('id', ctx.me.couple_id).single();
  if (error) throw new Error(error.message);
  return data.membro_a === ctx.me.id ? data.membro_b : data.membro_a;
}
