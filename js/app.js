import { client } from './supabase.js';
import { login, logout, currentProfile } from './auth.js';
import { mk, add, clear, toast } from './ui.js';
import { renderDesideri } from './modules/desideri.js';

const TABS = [['desideri', '🔥', 'Desideri']]; // altri moduli nelle fasi successive

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
    const b = mk('button'); add(b, mk('span', null, i + ' '), mk('span', null, l));
    b.dataset.k = k; b.onclick = () => go(k); n.appendChild(b);
  }
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
}

// il FAB delega al modulo corrente tramite evento
$('fab').onclick = () => document.dispatchEvent(new CustomEvent('fab:' + cur));

boot().catch(err => toast('Errore avvio: ' + err.message, 'err'));
