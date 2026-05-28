import { client } from './supabase.js';
import { login, logout, currentProfile } from './auth.js';
import { mk, add, clear, toast } from './ui.js';
import { renderDesideri } from './modules/desideri.js';
import { renderCalendario } from './modules/calendario.js';
import { openImpostazioni } from './modules/impostazioni.js';
import { renderBuoni } from './modules/buoni.js';
import { renderGalleria } from './modules/galleria.js';
import { renderGiochi } from './modules/giochi.js';
import { renderMappa } from './modules/mappa.js';
import { isLockEnabled, verifyPin, getPudica, isBioEnabled, bioSupported, unlockBio } from './lib/lock.js';

const TABS = [
  ['desideri', '🔥', 'Desideri'],
  ['giochi', '🎲', 'Giochi'],
  ['calendario', '📅', 'Esperienze'],
  ['mappa', '🗺️', 'Mappa'],
  ['buoni', '🎟️', 'Buoni'],
  ['galleria', '🖼️', 'Galleria'],
];

let me = null;     // profilo loggato
let cur = 'desideri';

const $ = id => document.getElementById(id);

const viewport = () => $('viewport');
const track = () => $('track');
let index = 0;                 // pagina corrente
const rendered = new Set();    // indici già renderizzati
let pagerInit = false;         // guard: enablePager si registra una volta sola

async function boot() {
  const t0 = Date.now();
  setTimeout(openIntroCurtains, 3000); // failsafe
  const { data: { session } } = await client.auth.getSession();
  if (session) await enterApp();
  else $('login').style.display = '';
  $('loginForm').addEventListener('submit', onLogin);
  const wait = Math.max(0, 400 - (Date.now() - t0));
  setTimeout(openIntroCurtains, wait);
}

let introOpened = false;
function openIntroCurtains() {
  if (introOpened) return;
  introOpened = true;
  const el = $('intro');
  if (!el) return;
  el.classList.add('open');
  setTimeout(() => el.remove(), 2800);
}

async function onLogin(e) {
  e.preventDefault();
  $('loginErr').textContent = '';
  try {
    await login($('email').value.trim(), $('password').value);
    await enterApp();
  } catch (err) {
    $('loginErr').textContent = err.message;
  }
}

function refreshChip() {
  const chip = $('meChip'); clear(chip);
  add(chip, mk('span', null, me.avatar), mk('span', null, me.display_name));
}

async function enterApp() {
  me = await currentProfile();
  if (!me) { location.reload(); return; } // token scaduto/non valido → torna al login
  if (isLockEnabled()) { await requireUnlock(); }
  if (getPudica()) document.body.classList.add('pudica');
  $('login').classList.add('gone');
  $('app').style.display = '';
  $('fab').style.display = '';
  refreshChip();
  $('meChip').onclick = () => openImpostazioni({ client, me, onProfileChange: () => refreshChip() });
  buildNav();
  go('desideri');
}

function requireUnlock() {
  return new Promise(resolve => {
    const gate = $('lockgate'); gate.style.display = '';
    let pin = '';
    const dots = $('pinDots'); const pad = $('pinPad');
    const draw = () => { clear(dots); for (let i = 0; i < 6; i++) { const d = mk('span', i < pin.length ? 'd on' : 'd'); dots.appendChild(d); } };
    const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    clear(pad);
    keys.forEach(k => {
      const b = mk('button', k === '' ? 'empty' : null, k);
      if (k === '') { pad.appendChild(b); return; }
      b.onclick = async () => {
        if (k === '⌫') { pin = pin.slice(0, -1); draw(); return; }
        if (pin.length >= 6) return;
        $('lockErr').textContent = '';
        pin += k; draw();
        if (pin.length >= 4) {
          if (await verifyPin(pin)) { gate.style.display = 'none'; resolve(); }
          else if (pin.length === 6) { $('lockErr').textContent = 'Codice errato'; pin = ''; draw(); }
        }
      };
      pad.appendChild(b);
    });
    draw();
    const bio = $('pinBio');
    if (isBioEnabled() && bioSupported()) {
      bio.style.display = '';
      bio.onclick = async () => { if (await unlockBio()) { gate.style.display = 'none'; resolve(); } };
      bio.click();   // tenta subito la biometria all'apertura
    } else { bio.style.display = 'none'; }
  });
}

function buildNav() {
  const n = $('nav'); clear(n);
  TABS.forEach(([k, i, l]) => {
    const b = mk('button'); add(b, mk('span', null, i), mk('span', 'lab', l));
    b.dataset.k = k; b.onclick = () => go(k); n.appendChild(b);
  });
  enablePager();
  layout(false);
  renderNear();
}

function go(k) {
  const i = TABS.findIndex(t => t[0] === k);
  if (i < 0) return;
  index = i; cur = k;
  layout(true);
  renderNear();
}

function layout(animate) {
  const W = viewport().clientWidth;
  track().style.transition = animate ? 'transform .34s cubic-bezier(.17,.67,.18,1)' : 'none';
  track().style.transform = 'translateX(' + (-index * W) + 'px)';
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.k === cur));
}

// renderizza la pagina corrente e le adiacenti (lazy, una volta)
function renderNear() {
  [index - 1, index, index + 1].forEach(i => {
    if (i < 0 || i >= TABS.length || rendered.has(i)) return;
    rendered.add(i);
    renderTab(TABS[i][0]);
  });
  // resize ogni volta che la mappa torna visibile (Leaflet perde il layout durante il transform)
  if (cur === 'mappa') setTimeout(() => document.dispatchEvent(new CustomEvent('mappa:resize')), 360);
}

function renderTab(k) {
  const map = {
    desideri:   () => renderDesideri({ client, me, panel: $('p-desideri') }),
    calendario: () => renderCalendario({ client, me, panel: $('p-calendario') }),
    buoni:      () => renderBuoni({ client, me, panel: $('p-buoni') }),
    galleria:   () => renderGalleria({ client, me, panel: $('p-galleria') }),
    giochi:     () => renderGiochi({ client, me, panel: $('p-giochi') }),
    mappa:      () => renderMappa({ client, me, panel: $('p-mappa') }),
  };
  (map[k] || (() => Promise.resolve()))().catch(err => toast('Errore: ' + err.message, 'err'));
}

// motore gesto: il track segue il dito, snap al rilascio, niente wrap, mappa = isola
function enablePager() {
  if (pagerInit) return;
  pagerInit = true;
  const vp = viewport();
  let startX = 0, startY = 0, dragging = false, decided = false, horiz = false;
  vp.addEventListener('pointerdown', e => {
    if (e.target.closest('.mappa-area')) return;   // dentro la mappa: lascia fare a Leaflet
    if (e.target.closest('.yz-scrim')) return;     // tavolo/popup Yahtzutra = isola
    if (document.body.classList.contains('yz-busy')) return; // partita Yahtzutra in corso: niente swipe
    dragging = true; decided = false; horiz = false;
    startX = e.clientX; startY = e.clientY;
    track().style.transition = 'none';
    try { vp.setPointerCapture(e.pointerId); } catch (_) {}
  });
  vp.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided = true; horiz = Math.abs(dx) > Math.abs(dy);
      if (!horiz) { dragging = false; return; }     // verticale → scroll nativo della pagina
    }
    e.preventDefault();
    const W = vp.clientWidth;
    let t = -index * W + dx;
    const min = -(TABS.length - 1) * W, max = 0;
    if (t > max) t = max + (t - max) * 0.35;          // rubber-band ai bordi
    if (t < min) t = min + (t - min) * 0.35;
    track().style.transform = 'translateX(' + t + 'px)';
  }, { passive: false });
  function end(e) {
    if (!dragging) return;
    dragging = false;
    if (!horiz) return;
    const W = vp.clientWidth;
    const dx = (e.clientX != null ? e.clientX : startX) - startX;
    const threshold = W * 0.22;
    if (dx < -threshold && index < TABS.length - 1) go(TABS[index + 1][0]);
    else if (dx > threshold && index > 0) go(TABS[index - 1][0]);
    else layout(true);
  }
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', () => { dragging = false; layout(true); });
  window.addEventListener('resize', () => layout(false));
}

// il FAB delega al modulo corrente tramite evento
$('fab').onclick = () => document.dispatchEvent(new CustomEvent('fab:' + cur));

// la Galleria chiede di navigare alla sezione d'origine di una foto
document.addEventListener('goto', e => go(e.detail));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Error reporter persistente per smoke test mobile: cattura JS error e promise
// rejection uncaught e li mostra in un banner che NON sparisce da solo (il
// toast normale dura 3.2s, troppo poco per screenshot). Da disattivare dopo
// che lo smoke Android è verde.
(function installErrorReporter() {
  const box = mk('div', 'errbox'); box.style.display = 'none';
  document.body.appendChild(box);
  function show(label, err) {
    clear(box); box.style.display = '';
    const head = mk('div', 'errbox-head');
    const t = mk('strong', null, '⚠️ ' + label);
    const x = mk('button', 'errbox-x', '✕');
    x.onclick = () => { box.style.display = 'none'; };
    add(head, t, x); box.appendChild(head);
    const msg = (err && err.message) ? err.message : String(err);
    box.appendChild(mk('div', 'errbox-msg', msg));
    if (err && err.stack) {
      const lines = String(err.stack).split('\n').slice(0, 5).join('\n');
      box.appendChild(mk('pre', 'errbox-stk', lines));
    }
  }
  window.addEventListener('error', e => show('Errore JS', e.error || e.message || 'ignoto'));
  window.addEventListener('unhandledrejection', e => show('Promise rifiutata', e.reason));
})();

boot().catch(err => toast('Errore avvio: ' + err.message, 'err'));
