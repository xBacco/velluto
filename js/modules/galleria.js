import { mk, add, clear, toast } from '../ui.js';
import { listFotoGalleria, signedUrl } from '../store.js';

let ctx = null;
let foto = [];
let filtro = 'tutte'; // 'tutte' | 'esperienza' | 'buono' | 'mie'

// Da contesto della foto → chiave del tab di destinazione per "vai all'origine".
const CTX_TAB = { esperienza: 'calendario', buono: 'buoni' };
const CTX_LABEL = { esperienza: 'alle Esperienze', buono: 'ai Buoni' };

let lastErr = null;

export async function renderGalleria(context) {
  ctx = context;
  lastErr = null;
  try {
    foto = await listFotoGalleria(ctx.client, ctx.me.couple_id);
  } catch (err) {
    lastErr = err;
    toast('Errore caricamento: ' + err.message, 'err');
    foto = [];
  }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🖼️ Galleria'),
         mk('p', 'psub', 'Tutte le vostre foto, raccolte. Solo voi due le vedete.'));

  const filters = mk('div', 'filters');
  for (const [k, label] of [['tutte', 'Tutte'], ['esperienza', '📅 Esperienze'], ['buono', '🎟️ Buoni'], ['mie', '👤 Mie']]) {
    const b = mk('button', filtro === k ? 'on' : null, label);
    b.onclick = () => { filtro = k; draw(); };
    filters.appendChild(b);
  }
  p.appendChild(filters);

  const viewerSlot = mk('div', 'gviewer-slot'); p.appendChild(viewerSlot);

  let visibili = foto;
  if (filtro === 'mie') visibili = foto.filter(f => f.autore_id === ctx.me.id);
  else if (filtro !== 'tutte') visibili = foto.filter(f => f.contesto === filtro);

  if (!visibili.length) {
    const why = lastErr
      ? 'Errore nel caricamento: ' + lastErr.message
      : foto.length
        ? 'Nessuna foto in questo filtro.'
        : 'Nessuna foto ancora. Carica la prima da Esperienze o Buoni.';
    p.appendChild(mk('div', 'empty', why));
    const refresh = mk('button', 'btn ghost', '🔄 Ricarica galleria');
    refresh.onclick = () => renderGalleria(ctx);
    p.appendChild(refresh);
    return;
  }

  const grid = mk('div', 'gallery'); p.appendChild(grid);
  for (const f of visibili) grid.appendChild(gTile(f, viewerSlot));
}

function gTile(f, viewerSlot) {
  const tile = mk('div', 'gtile thumb-blur');
  const img = mk('img'); img.alt = ''; tile.appendChild(img);
  add(tile, mk('span', 'gtag', f.contesto));
  signedUrl(ctx.client, f.storage_path).then(url => { img.src = url; tile._url = url; })
    .catch(err => toast('Errore foto: ' + err.message, 'err'));
  let revealed = false;
  tile.onclick = () => {
    if (!revealed) { tile.classList.remove('thumb-blur'); revealed = true; }
    else if (tile._url) showInlineViewer(viewerSlot, f, tile._url);
  };
  return tile;
}

// Viewer INLINE (non modale): foto grande + didascalia + "↩ vai all'origine".
function showInlineViewer(slot, f, url) {
  clear(slot);
  const big = mk('div', 'viewer-big'); big.style.backgroundImage = `url("${url}")`;
  slot.appendChild(big);
  if (f.didascalia) slot.appendChild(mk('p', 'viewer-cap', f.didascalia));
  const origin = mk('button', 'gorigin', '↩ Vai ' + (CTX_LABEL[f.contesto] || ''));
  origin.onclick = () => document.dispatchEvent(new CustomEvent('goto', { detail: CTX_TAB[f.contesto] }));
  slot.appendChild(origin);
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
