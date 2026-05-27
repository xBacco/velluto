import { mk, add, clear, toast } from '../ui.js';
import { updateProfile, listTipi, addTipo, updateTipo, deleteTipo, seedTipi,
         wipeDesideri, wipeEsperienze, wipeBuoni, wipeGiochi, wipeLuoghi, wipeTipi } from '../store.js';
import { logout } from '../auth.js';
import { isLockEnabled, setPin, disableLock, isPinValid, getPudica, setPudica,
         bioSupported, isBioEnabled, enableBio, disableBio } from '../lib/lock.js';
import { tipiDefaultRows } from '../lib/logic.js';

const EMOJI = ['🐻','🧁','🦊','🦋','🐰','🐱','🐺','🦌','🌹','🍑','🔥','💋','🍒','🌙','⭐','🥃','🍫','🐝','🦢','🕯️','🍓','💎'];

let CTX = null;            // { client, me, onProfileChange }

export function openImpostazioni(ctx) {
  if (ctx) CTX = ctx;
  ensureDom();
  document.getElementById('setScrim').classList.add('show');
  document.getElementById('setSheet').classList.add('show');
  document.body.classList.add('locked');
  renderMain();
}
function closeImpostazioni() {
  document.getElementById('setScrim').classList.remove('show');
  document.getElementById('setSheet').classList.remove('show');
  document.body.classList.remove('locked');
}

function ensureDom() {
  if (document.getElementById('setSheet')) return;
  const scrim = mk('div', 'set-scrim'); scrim.id = 'setScrim'; scrim.onclick = closeImpostazioni;
  const sheet = mk('div', 'set-sheet'); sheet.id = 'setSheet';
  const body = mk('div', 'set-body'); body.id = 'setBody';
  const head = mk('div', 'set-head');
  add(head, mk('h2', null, 'Impostazioni'));
  const x = mk('button', 'set-x', '✕'); x.onclick = closeImpostazioni;
  add(head, x);
  add(sheet, head, body);
  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
}

function sec(title) { const s = mk('div', 'set-sec'); add(s, mk('div', 'set-sec-t', title)); return s; }
function card() { return mk('div', 'set-card'); }
function row(emoji, name, sub) {
  const r = mk('div', 'set-row');
  const l = mk('div', 'set-l'); add(l, mk('span', 'set-em', emoji));
  const t = mk('div'); add(t, mk('div', 'set-nm', name)); if (sub) add(t, mk('div', 'set-sub', sub));
  add(l, t); add(r, l);
  return r;
}
function sw(on, onToggle) {
  const s = mk('div', on ? 'set-sw on' : 'set-sw'); add(s, mk('div', 'knob'));
  s.onclick = () => { s.classList.toggle('on'); onToggle(s.classList.contains('on')); };
  return s;
}

function renderMain() {
  const body = document.getElementById('setBody'); clear(body);
  const { client, me } = CTX;

  // PROFILO
  const pSec = sec('Profilo'); const pCard = mk('div', 'set-card pad');
  const prof = mk('div', 'set-prof');
  const av = mk('div', 'set-avatar'); const face = mk('span', null, me.avatar || '❤️');
  add(av, face, mk('div', 'set-pen', '✎'));
  const grow = mk('div', 'set-grow');
  const lbl = mk('label', 'set-lbl', 'Il tuo nome');
  const inp = mk('input', 'set-fld'); inp.id = 'setNameInput'; inp.value = me.display_name || '';
  lbl.htmlFor = inp.id;
  add(grow, lbl);
  add(grow, inp); add(prof, av, grow);
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(doSave, 600); };
  async function doSave() {
    try {
      await updateProfile(client, me.id, { display_name: inp.value.trim(), avatar: face.textContent });
      me.display_name = inp.value.trim(); me.avatar = face.textContent;
      CTX.onProfileChange && CTX.onProfileChange(me);
      toast('Profilo salvato', 'ok');
    } catch (e) { toast('Errore: ' + e.message, 'err'); }
  }
  inp.oninput = save;
  const picker = mk('div', 'set-picker');
  EMOJI.forEach(e => { const b = mk('button', null, e); b.onclick = () => { face.textContent = e; picker.classList.remove('show'); save(); }; add(picker, b); });
  av.onclick = () => picker.classList.toggle('show');
  add(pCard, prof, picker); add(pSec, pCard); add(body, pSec);

  // PRIVACY & BLOCCO  → Task 10
  add(body, renderPrivacy());
  // PERSONALIZZA      → Task 12
  add(body, renderPersonalizza());
  // DATI              → Task 12
  add(body, renderDati());

  // ACCOUNT
  const aSec = sec('Account'); const aCard = card();
  const pw = row('🔐', 'Cambia password'); add(pw, mk('span', 'set-chev', '›'));
  pw.classList.add('tap'); pw.onclick = openCambiaPassword;   // Task 12 (form)
  add(aCard, pw); add(aSec, aCard);
  const out = mk('button', 'set-logout', 'Esci da Lussuria');
  out.onclick = async () => { closeImpostazioni(); try { await logout(); } catch (_) {} location.reload(); };
  add(aSec, out); add(body, aSec);

  // FOOTER
  const info = mk('div', 'set-appinfo');
  add(info, mk('div', 'set-nm', 'LUSSURIA'), mk('div', null, 'il vostro spazio · v1.0'));
  const inst = mk('div', 'set-inst', '📲 Installa sulla Home'); inst.onclick = showInstall;
  add(info, inst); add(body, info);
}

// placeholder reali (implementati nei task seguenti) per evitare riferimenti rotti
function renderPrivacy() {
  const s = sec('Privacy & blocco'); const c = card();

  // blocco con codice
  const rLock = row('🔒', 'Blocco con codice', "Chiede un PIN all'apertura");
  add(rLock, sw(isLockEnabled(), on => { if (on) openSetPin(); else { disableLock(); disableBio(); renderMain(); } }));
  add(c, rLock);

  // cambia codice (solo se attivo)
  if (isLockEnabled()) {
    const rCh = row('🔑', 'Cambia codice'); rCh.classList.add('tap');
    add(rCh, mk('span', 'set-chev', '›')); rCh.onclick = openSetPin; add(c, rCh);
  }

  // biometrico (solo se supportato)
  if (bioSupported()) {
    const rBio = row('👆', 'Face ID / impronta', 'Sblocco biometrico del dispositivo');
    add(rBio, sw(isBioEnabled(), async on => {
      try { if (on) { if (!isLockEnabled()) { toast('Attiva prima il PIN'); renderMain(); return; } await enableBio(); } else disableBio(); }
      catch (e) { toast('Errore: ' + e.message, 'err'); renderMain(); }
    }));
    add(c, rBio);
  }

  // modalità pudica
  const rPud = row('🙈', 'Modalità pudica', 'Sfoca foto e contenuti spinti');
  add(rPud, sw(getPudica(), on => { setPudica(on); document.body.classList.toggle('pudica', on); }));
  add(c, rPud);

  add(s, c); return s;
}

function openSetPin() {
  const ov = mk('div', 'set-confirm show');
  const box = mk('div', 'set-cbox');
  add(box, mk('h3', null, 'Imposta codice'));
  add(box, mk('p', null, 'Scegli un PIN di 4-6 cifre. Resta su questo dispositivo.'));
  const inp = mk('input', 'set-fld'); inp.type = 'tel'; inp.inputMode = 'numeric'; inp.maxLength = 6; inp.placeholder = '••••';
  add(box, inp);
  const rowB = mk('div', 'set-crow');
  const ann = mk('button', 'set-ann', 'Annulla'); ann.onclick = () => { ov.remove(); renderMain(); };
  const go = mk('button', 'set-go', 'Salva'); go.onclick = async () => {
    if (!isPinValid(inp.value)) { toast('PIN non valido (4-6 cifre)'); return; }
    await setPin(inp.value); ov.remove(); renderMain(); toast('Blocco attivo', 'ok');
  };
  add(rowB, ann, go); add(box, rowB); add(ov, box);
  document.getElementById('setSheet').appendChild(ov);
  inp.focus();
}
function renderPersonalizza() { return sec('Personalizza'); }
function renderDati() { return sec('Dati'); }
function openCambiaPassword() {}
function showInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(ios ? 'Condividi → "Aggiungi a Home"' : 'Menu del browser → "Installa app"');
}
