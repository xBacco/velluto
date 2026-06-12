import { client } from './supabase.js';
import { login, logout, currentProfile, signUp, resetPasswordForEmail } from './auth.js';
import { renderOnboarding } from './modules/onboarding.js';
import { mk, add, clear, toast } from './ui.js';
import { renderDesideri } from './modules/desideri.js';
import { renderCalendario } from './modules/calendario.js';
import { openImpostazioni } from './modules/impostazioni.js';
import { renderBuoni } from './modules/buoni.js';
import { renderGalleria } from './modules/galleria.js';
import { renderGiochi } from './modules/giochi.js';
import { renderMappa } from './modules/mappa.js';
import { renderHome } from './modules/home.js';
import { isLockEnabled, verifyPin, getPudica, isBioEnabled, bioSupported, unlockBio,
         enableBio, isBioPrompted, setBioPrompted,
         getFreq, getGraceMin, getLastUnlockAt, touchUnlock, shouldLock } from './lib/lock.js';
import { padReduce, padView } from './lib/porta-reducer.js';

const TABS = [
  ['desideri', '🔥', 'Fantasie'],
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
  document.addEventListener('pointerdown', skipIntroCurtains, { once: true });
  const { data: { session } } = await client.auth.getSession();
  if (session) await enterApp();
  else $('login').style.display = '';
  $('loginForm').addEventListener('submit', onLogin);
  wireAuthLinks();
  const wait = Math.max(0, 400 - (Date.now() - t0));
  setTimeout(openIntroCurtains, wait);
}

// Link "Registrati" e "Password dimenticata?" sotto il form di login.
function wireAuthLinks() {
  $('goSignup').onclick = onSignup;
  $('goReset').onclick = onReset;
}

async function onSignup() {
  const email = $('email').value.trim();
  const password = $('password').value;
  $('loginErr').textContent = '';
  if (!email || !password) { $('loginErr').textContent = 'Inserisci email e password per registrarti.'; return; }
  $('goSignup').disabled = true;
  try {
    await signUp(client, email, password);
    $('loginErr').textContent = 'Ti abbiamo inviato una mail di conferma: aprila per attivare l\'account, poi accedi.';
  } catch (e) { $('loginErr').textContent = e.message; }
  finally { $('goSignup').disabled = false; }
}

async function onReset() {
  const email = $('email').value.trim();
  $('loginErr').textContent = '';
  if (!email) { $('loginErr').textContent = 'Scrivi la tua email, poi tocca "Password dimenticata?".'; return; }
  $('goReset').disabled = true;
  try {
    await resetPasswordForEmail(client, email);
    $('loginErr').textContent = 'Se l\'email è registrata, riceverai un link per reimpostare la password.';
  } catch (e) { $('loginErr').textContent = e.message; }
  finally { $('goReset').disabled = false; }
}

let introOpened = false;
let introDone = false;
let introRemoveTimer = null;
function openIntroCurtains() {
  if (introOpened || introDone) return;
  introOpened = true;
  const el = $('intro');
  if (!el) return;
  el.classList.add('open');
  introRemoveTimer = setTimeout(() => { el.remove(); introDone = true; }, 2800);
}
function skipIntroCurtains() {
  if (introDone) return;
  const el = $('intro');
  if (!el) return;
  if (!introOpened) {
    introOpened = true;
    el.classList.add('open');
  }
  el.classList.add('fast');
  if (introRemoveTimer) clearTimeout(introRemoveTimer);
  introRemoveTimer = setTimeout(() => { el.remove(); introDone = true; }, 650);
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
  if (!me) { showOnboarding(); return; } // sessione valida ma nessun profilo → onboarding
  if (isLockEnabled()) { await requireUnlock(); await maybeOfferBio(); }
  if (getPudica()) document.body.classList.add('pudica');
  $('login').classList.add('gone');
  $('onboardingRoot').style.display = 'none'; // niente onboarding sovrapposto quando si entra in app
  $('app').style.display = '';
  $('fab').style.display = '';
  refreshChip();
  $('meChip').onclick = () => openImpostazioni({ client, me, onProfileChange: () => refreshChip() });
  $('coupleHome').onclick = () => openImpostazioni({ client, me, onProfileChange: () => { refreshChip(); showHome(); } });
  $('homeBtn').onclick = () => goHub();
  buildNav();
  go('desideri');   // inizializza il pager (dietro la home)
  showHome();       // la stanza è la schermata d'apertura
}

// Registrato senza coppia: mostra la scelta crea/unisci. Al termine rientra in enterApp.
function showOnboarding() {
  $('login').style.display = 'none';
  $('login').classList.add('gone');
  $('onboardingRoot').style.display = ''; // esplicito: non dipende dal modulo per mostrarsi
  renderOnboarding({
    client,
    root: $('onboardingRoot'),
    onDone: async () => {
      $('onboardingRoot').style.display = 'none';
      await enterApp();
    },
  });
}

// La home (porta-zoom) è un overlay a sé: nav e FAB di sezione spariscono (body.on-home).
function showHome() {
  document.body.classList.add('on-home');
  $('homeRoot').style.display = '';
  renderHome({ client, me }).catch(err => toast('Errore home: ' + err.message, 'err'));
}

// Entra in una sezione: nasconde la home/hub e mostra il pager con la nav.
function enterSection(k) {
  document.body.classList.remove('on-home');
  $('homeRoot').style.display = 'none';
  go(k);
}

// Torna dall'interno di una sezione all'hub (⌂): riapre l'overlay sulla camera.
function goHub() {
  document.body.classList.add('on-home');
  $('homeRoot').style.display = '';
  document.dispatchEvent(new CustomEvent('gohub'));
}

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

// Guscio d'ingresso: mostra la porta, risolve la Promise allo sblocco (PIN o biometria).
// Stessa logica del motore (verifyPin/unlockBio); UI a stati portata dai mockup.
function requireUnlock() {
  return new Promise(resolve => {
    const gate = $('lockgate');
    gate.style.display = '';
    gate.classList.remove('zoom', 'solved', 'opening', 'dolly');
    $('lockLeaf').classList.remove('unlocked');

    const scene = $('lockScene');
    const plate = $('lockPlate');
    const hint  = $('lockHint');
    const pips  = $('lockPips');
    const keys  = $('lockKeys');
    let entry = '';
    let busy = false;

    // costruisci il tastierino: 1-9, tasto duale ✺/⌫, 0, ✓
    clear(keys);
    ['1','2','3','4','5','6','7','8','9'].forEach(n => {
      const k = mk('div', 'key', n); k.dataset.n = n; keys.appendChild(k);
    });
    const dual = mk('div', 'key fn dual'); dual.dataset.fn = 'bio';
    dual.innerHTML = '<span class="g g-bio">✺</span><span class="g g-del">⌫</span>';
    keys.appendChild(dual);
    const zero = mk('div', 'key', '0'); zero.dataset.n = '0'; keys.appendChild(zero);
    const ok = mk('div', 'key fn', '✓'); ok.dataset.fn = 'ok'; keys.appendChild(ok);

    const drawPips = () => {
      clear(pips);
      for (let i = 0; i < 6; i++) pips.appendChild(mk('span', i < entry.length ? 'pip on' : 'pip'));
      const v = padView(entry);
      plate.classList.toggle('ready', v.ready);
      plate.classList.toggle('has-entry', v.len > 0);
    };
    drawPips();

    const flash = el => { el.classList.add('lit'); setTimeout(() => el.classList.remove('lit'), 180); };

    const finish = () => {
      touchUnlock(Date.now());
      const done = () => { gate.style.display = 'none'; gate.classList.remove('zoom','solved','opening','dolly'); resolve(); };
      if (prefersReducedMotion()) { done(); return; }
      gate.classList.add('solved');
      setTimeout(() => $('lockLeaf').classList.add('unlocked'), 360);
      setTimeout(() => { gate.classList.remove('zoom'); gate.classList.add('opening'); }, 360 + 480);
      setTimeout(() => gate.classList.add('dolly'), 360 + 480 + 520);
      setTimeout(done, 360 + 480 + 520 + 1000);
    };

    const tryBio = async () => {
      if (busy || !(isBioEnabled() && bioSupported())) return;
      if (await unlockBio()) { busy = true; plate.classList.add('ok'); hint.textContent = ''; finish(); }
    };

    const approach = () => {
      if (gate.classList.contains('zoom') || busy) return;
      gate.classList.add('zoom');
      plate.classList.add('awake');
      hint.textContent = 'Tocca un numero, poi ✓';
      tryBio();                       // biometria automatica all'avvicinamento (se attiva)
    };
    scene.addEventListener('pointerdown', approach);

    plate.addEventListener('pointerdown', async e => {
      if (busy) return;
      const k = e.target.closest('.key'); if (!k) return;
      e.preventDefault();
      plate.classList.add('awake');

      if (k.dataset.fn === 'bio') {
        if (entry.length > 0) {       // ⌫ : cancella l'ultima
          entry = padReduce(entry, { type: 'del' }); drawPips(); flash(k);
          hint.textContent = 'Tocca un numero, poi ✓';
        } else {                      // ✺ : scorciatoia biometrica
          tryBio();
        }
        return;
      }
      if (k.dataset.fn === 'ok') {    // ✓ : conferma
        if (entry.length < 4) { hint.textContent = 'Prima il codice, poi ✓'; return; }
        busy = true;
        if (await verifyPin(entry)) {
          plate.classList.add('ok'); hint.innerHTML = '<span class="casa">sei a casa</span>';
          setTimeout(finish, 520);
        } else {
          plate.classList.add('no', 'shake'); hint.textContent = 'Codice errato';
          setTimeout(() => {
            entry = padReduce(entry, { type: 'clear' }); drawPips();
            plate.classList.remove('no', 'shake'); busy = false;
            hint.textContent = 'Tocca un numero, poi ✓';
          }, 760);
        }
        return;
      }
      if (k.dataset.n === undefined) return;   // cifra
      const before = entry;
      entry = padReduce(entry, { type: 'digit', n: k.dataset.n });
      if (entry !== before) flash(k);
      drawPips();
      hint.textContent = padView(entry).ready ? 'Premi ✓ per confermare' : 'Tocca un numero, poi ✓';
    });
  });
}

// Bottom sheet di attivazione biometrica — secondo punto d'ingresso a enableBio().
// Mostrato solo al primo ingresso utile; non re-insiste se l'utente sceglie "Non ora".
function maybeOfferBio() {
  return new Promise(resolve => {
    if (!(isLockEnabled() && bioSupported() && !isBioEnabled() && !isBioPrompted())) { resolve(); return; }
    const scrim = mk('div'); scrim.id = 'bioSheetScrim';
    const sheet = mk('div'); sheet.id = 'bioSheet';
    sheet.innerHTML =
      '<div class="bs-ttl">Entra con un tocco</div>' +
      '<div class="bs-sub">La prossima volta sblocca con il viso o l\'impronta. Il codice resta la tua riserva.</div>' +
      '<div class="bs-priv">🔒 Il riconoscimento resta sul tuo telefono.</div>' +
      '<div class="bs-row"><button class="bs-go" id="bsGo">Attiva</button><button class="bs-no" id="bsNo">Non ora</button></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { scrim.classList.add('show'); sheet.classList.add('show'); });

    const close = () => {
      scrim.classList.remove('show'); sheet.classList.remove('show');
      setTimeout(() => { scrim.remove(); sheet.remove(); resolve(); }, 340);
    };
    scrim.onclick = () => { setBioPrompted(true); close(); };
    sheet.querySelector('#bsNo').onclick = () => { setBioPrompted(true); close(); };
    sheet.querySelector('#bsGo').onclick = async () => {
      const go = sheet.querySelector('#bsGo');
      go.disabled = true; go.textContent = 'Attendi…';
      try {
        await enableBio();                       // l'OS disegna la scansione (Face ID / impronta)
        go.textContent = 'Fatto ✓'; setBioPrompted(true);
        setTimeout(close, 700);
      } catch (_) {
        go.disabled = false; go.textContent = 'Attiva';   // annullata: resta l'invito, niente «Fatto»
        toast('Riconoscimento annullato');
      }
    };
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
  document.querySelectorAll('.nav button').forEach(b => {
    b.classList.toggle('on', b.dataset.k === cur);
    // pulisci inline styles applicati durante lo swipe (snap → CSS class .on)
    b.style.flexGrow = '';
    const lab = b.querySelector('.lab');
    if (lab) { lab.style.maxWidth = ''; lab.style.opacity = ''; }
  });
}

// interpola .nav durante lo swipe: tab corrente si restringe, prossima cresce
function applyNavInterp(progress, dir) {
  const target = index + dir;
  document.querySelectorAll('.nav button').forEach((b, i) => {
    const lab = b.querySelector('.lab');
    let flex = 1, mw = 0, op = 0, on = false;
    if (i === index)       { flex = 2.5 - 1.5 * progress; mw = 120 * (1 - progress); op = 1 - progress; on = progress < 0.5; }
    else if (i === target) { flex = 1 + 1.5 * progress;   mw = 120 * progress;       op = progress;     on = progress >= 0.5; }
    b.style.flexGrow = flex;
    if (lab) { lab.style.maxWidth = mw + 'px'; lab.style.opacity = op; }
    b.classList.toggle('on', on);
  });
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
    if (e.target.closest('.game-modal')) return;   // pop-up gioco (Yahtzutra/Strip): swipe interno gestito dal modal
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
      $('nav').classList.add('dragging');           // disabilita transition: la nav segue il dito
    }
    e.preventDefault();
    const W = vp.clientWidth;
    let t = -index * W + dx;
    const min = -(TABS.length - 1) * W, max = 0;
    if (t > max) t = max + (t - max) * 0.35;          // rubber-band ai bordi
    if (t < min) t = min + (t - min) * 0.35;
    track().style.transform = 'translateX(' + t + 'px)';
    // nav swipe-follow: tab attiva si restringe, target si allarga
    const dir = dx < 0 ? +1 : -1;
    const blocked = (dir > 0 && index >= TABS.length - 1) || (dir < 0 && index <= 0);
    const progress = blocked ? 0 : Math.min(1, Math.abs(dx) / W);
    applyNavInterp(progress, dir);
  }, { passive: false });
  function end(e) {
    if (!dragging) return;
    dragging = false;
    $('nav').classList.remove('dragging');
    if (!horiz) return;
    const W = vp.clientWidth;
    const dx = (e.clientX != null ? e.clientX : startX) - startX;
    const threshold = W * 0.22;
    if (dx < -threshold && index < TABS.length - 1) go(TABS[index + 1][0]);
    else if (dx > threshold && index > 0) go(TABS[index - 1][0]);
    else layout(true);
  }
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', () => { dragging = false; $('nav').classList.remove('dragging'); layout(true); });
  window.addEventListener('resize', () => layout(false));
}

// privacy blur: quando l'app va in background (visibilitychange → hidden) e
// la flag è 'on', applica un blur sul wrap. iOS Safari/PWA cattura lo
// screenshot dell'app switcher in questo stato → il preview è già blurrato.
function refreshPrivacyBlur() {
  let on = false;
  try { on = localStorage.getItem('strip-poker:privacy-blur') === 'on'; } catch (_) {}
  document.body.classList.toggle('privacy-blurred', on && document.hidden);
}
document.addEventListener('visibilitychange', refreshPrivacyBlur);
window.addEventListener('pagehide', refreshPrivacyBlur);
window.addEventListener('pageshow', refreshPrivacyBlur);

// il FAB delega al modulo corrente tramite evento
$('fab').onclick = () => document.dispatchEvent(new CustomEvent('fab:' + cur));

// la Galleria (o la home) chiede di navigare a una sezione
document.addEventListener('goto', e => enterSection(e.detail));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data && ev.data.type === 'sw-updated' && !swReloaded) {
      swReloaded = true;
      setTimeout(() => location.reload(), 200);
    }
  });
}

boot().catch(err => toast('Errore avvio: ' + err.message, 'err'));
