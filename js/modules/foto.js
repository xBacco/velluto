import { mk, add, toast, openSheet } from '../ui.js';
import { fotoPath } from '../lib/logic.js';
import { uploadFoto, listFoto, signedUrl, deleteFoto } from '../store.js';

// Le thumbnail foto/galleria hanno il proprio onclick (rimuove .thumb-blur);
// il CSS body.pudica [data-spicy].revealed resta valido se in futuro
// marcheremo contenuti con data-spicy.

// Editor riusabile. refId può essere null (genitore non ancora creato):
// le foto già esistenti si mostrano solo se refId è valorizzato; i nuovi file
// vengono caricati da flush(finalRefId) DOPO il salvataggio del genitore.
export function fotoEditor(ctx, { contesto, refId }) {
  const pending = [];
  const wrap = mk('div');
  const file = mk('input', 'file-row'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true;
  const thumbs = mk('div', 'thumbs');
  if (refId) loadThumbsInto(ctx, { contesto, refId }, thumbs, true).catch(err => toast('Errore foto: ' + err.message, 'err'));
  file.onchange = () => {
    for (const f of file.files) if (!pending.some(x => x.name === f.name && x.size === f.size)) pending.push(f);
    file.value = ''; toast(pending.length + ' foto pronte da caricare');
  };
  add(wrap, file, thumbs);
  async function flush(finalRefId) {
    for (const f of pending) {
      const path = fotoPath(ctx.me.couple_id, contesto, finalRefId, f.name);
      await uploadFoto(ctx.client, { coupleId: ctx.me.couple_id, autoreId: ctx.me.id, contesto, refId: finalRefId, file: f, path });
    }
    pending.length = 0;
  }
  return { el: wrap, flush };
}

// Carica la copertina (prima foto) sfocata dentro `coverEl`; badge "📷 N" se più d'una.
// Non lancia: in caso d'errore lascia la copertina vuota. Riempie in modo asincrono.
export async function loadCoverInto(ctx, { contesto, refId }, coverEl) {
  let foto;
  try { foto = await listFoto(ctx.client, { contesto, refId }); }
  catch { return; }
  if (!foto.length) return;
  coverEl.classList.add('thumb-blur');
  const img = mk('img'); img.alt = '';
  try { img.src = await signedUrl(ctx.client, foto[0].storage_path); } catch { return; }
  coverEl.appendChild(img);
  if (foto.length > 1) coverEl.appendChild(mk('span', 'nmore', '📷 ' + foto.length));
}

// Carica le thumbnail via signed URL dentro `container`. withRemove=true mostra la ✕.
export async function loadThumbsInto(ctx, { contesto, refId }, container, withRemove) {
  const foto = await listFoto(ctx.client, { contesto, refId });
  for (const f of foto) {
    const url = await signedUrl(ctx.client, f.storage_path);
    container.appendChild(thumbEl(ctx, f, url, withRemove));
  }
}

// Thumb sfocata di default; tap = rivela/viewer. Riusata anche dalla Galleria.
export function thumbEl(ctx, foto, url, withRemove) {
  const wrap = mk('div', 'thumb thumb-blur');
  const img = mk('img'); img.src = url; img.alt = '';
  wrap.appendChild(img);
  let revealed = false;
  wrap.onclick = () => {
    if (!revealed) { wrap.classList.remove('thumb-blur'); revealed = true; }
    else openViewer(ctx, foto, url);
  };
  if (withRemove) {
    const rm = mk('button', 'rm', '✕');
    rm.onclick = async (e) => {
      e.stopPropagation();
      try { await deleteFoto(ctx.client, { id: foto.id, storagePath: foto.storage_path }); wrap.remove(); }
      catch (err) { toast('Errore rimozione foto: ' + err.message, 'err'); }
    };
    wrap.appendChild(rm);
  }
  return wrap;
}

// Vista grande in bottom sheet, con didascalia.
export function openViewer(ctx, foto, url) {
  openSheet('Foto', s => {
    const big = mk('div', 'viewer-big'); big.style.backgroundImage = `url("${url}")`;
    add(s, big);
    if (foto.didascalia) add(s, mk('p', 'viewer-cap', foto.didascalia));
  });
}
