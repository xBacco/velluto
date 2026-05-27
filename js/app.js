import { client } from './supabase.js';
import { login, logout, currentProfile } from './auth.js';
import { mk, add, clear, toast } from './ui.js';
import { renderDesideri } from './modules/desideri.js';
import { renderCalendario, openTipiSettings } from './modules/calendario.js';
import { renderBuoni } from './modules/buoni.js';
import { renderGalleria } from './modules/galleria.js';
import { renderGiochi } from './modules/giochi.js';
import { renderMappa } from './modules/mappa.js';

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

async function boot() {
  const { data: { session } } = await client.auth.getSession();
  if (session) await enterApp();
  $('loginForm').addEventListener('submit', onLogin);
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

async function enterApp() {
  me = await currentProfile();
  if (!me) { location.reload(); return; } // token scaduto/non valido → torna al login
  $('login').classList.add('gone');
  $('app').style.display = '';
  $('fab').style.display = '';
  const gear = $('gear');
  gear.style.display = '';
  gear.onclick = () => openTipiSettings({ client, me }, () => render());
  const chip = $('meChip');
  clear(chip);
  add(chip, mk('span', null, me.avatar), mk('span', null, me.display_name + ' · esci'));
  chip.onclick = async () => {
    try { await logout(); } catch { /* la sessione locale si pulisce comunque */ }
    location.reload();
  };
  buildNav();
  go('desideri');
}

function buildNav() {
  const n = $('nav'); clear(n);
  for (const [k, i, l] of TABS) {
    const b = mk('button'); add(b, mk('span', null, i), mk('span', 'lab', l));
    b.dataset.k = k; b.onclick = () => go(k); n.appendChild(b);
  }
  enableSwipe(n);
}

// swipe orizzontale sulla dock → tab precedente/successiva (con wrap-around)
function enableSwipe(n) {
  let startX = null;
  const navByOffset = d => {
    const i = TABS.findIndex(t => t[0] === cur);
    go(TABS[(i + d + TABS.length) % TABS.length][0]);
  };
  n.addEventListener('pointerdown', e => { startX = e.clientX; });
  n.addEventListener('pointerup', e => {
    if (startX === null) return;
    const dx = e.clientX - startX; startX = null;
    if (Math.abs(dx) > 34) navByOffset(dx < 0 ? 1 : -1);
  });
  n.addEventListener('pointercancel', () => { startX = null; });
  n.addEventListener('pointerleave', () => { startX = null; });
}

function go(k) {
  cur = k;
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  $('p-' + k).classList.add('on');
  render();
}

function render() {
  if (cur === 'desideri') renderDesideri({ client, me, panel: $('p-desideri') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'calendario') renderCalendario({ client, me, panel: $('p-calendario') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'buoni') renderBuoni({ client, me, panel: $('p-buoni') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'galleria') renderGalleria({ client, me, panel: $('p-galleria') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'giochi') renderGiochi({ client, me, panel: $('p-giochi') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'mappa') renderMappa({ client, me, panel: $('p-mappa') }).catch(err => toast('Errore: ' + err.message, 'err'));
}

// il FAB delega al modulo corrente tramite evento
$('fab').onclick = () => document.dispatchEvent(new CustomEvent('fab:' + cur));

// la Galleria chiede di navigare alla sezione d'origine di una foto
document.addEventListener('goto', e => go(e.detail));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

boot().catch(err => toast('Errore avvio: ' + err.message, 'err'));
