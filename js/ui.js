// Helper DOM SENZA innerHTML (un hook di sicurezza blocca innerHTML).
export function mk(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
export function add(parent, ...kids) {
  for (const k of kids) if (k) parent.appendChild(k);
  return parent;
}
export function clear(node) { node.replaceChildren(); }

// Blocca lo scroll del body finché è aperta una modale centrata (.modal) o lo scrim dei dadi
// (.dadi-scrim). Centralizzato qui: vale per qualunque modulo, comunque apra/chiuda l'overlay.
new MutationObserver(() => {
  document.body.classList.toggle('locked', document.querySelector('.modal,.dadi-scrim') != null);
}).observe(document.body, { childList: true });

// Toast d'errore/avviso visibile (no fallimenti silenziosi)
export function toast(message, kind = 'info') {
  const t = mk('div', 'toast toast-' + kind, message);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

// Bottom sheet modale; buildBody(sheetEl) riempie il contenuto.
export function openSheet(title, buildBody) {
  const overlay = mk('div', 'modal on');
  const sheet = mk('div', 'sheet');
  const x = mk('span', 'x', '✕');
  x.onclick = () => overlay.remove();
  add(sheet, x, mk('h3', null, title));
  buildBody(sheet);
  overlay.appendChild(sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}
