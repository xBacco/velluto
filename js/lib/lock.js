// Stato per-dispositivo (localStorage). Niente sul server.
const LOCK_KEY = 'lussuria.lock';     // { enabled, hash, bio, credId }
const PUDICA_KEY = 'lussuria.pudica'; // "1" | assente

export function isPinValid(pin) {
  return typeof pin === 'string' && /^[0-9]{4,6}$/.test(pin);
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function loadLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || {}; }
  catch { return {}; }
}
function saveLock(st) { localStorage.setItem(LOCK_KEY, JSON.stringify(st)); }

export function isLockEnabled() { return !!loadLock().enabled; }

export async function setPin(pin) {
  if (!isPinValid(pin)) throw new Error('PIN non valido (4-6 cifre)');
  const st = loadLock();
  st.enabled = true;
  st.hash = await sha256hex(pin);
  saveLock(st);
}

export async function verifyPin(pin) {
  const st = loadLock();
  if (!st.enabled || !st.hash) return false;
  return (await sha256hex(pin)) === st.hash;
}

export function disableLock() {
  saveLock({ enabled: false, hash: null, bio: false, credId: null });
}

// ---- modalità pudica ----
export function getPudica() { return localStorage.getItem(PUDICA_KEY) === '1'; }
export function setPudica(on) {
  if (on) localStorage.setItem(PUDICA_KEY, '1');
  else localStorage.removeItem(PUDICA_KEY);
}

// ---- biometrico (WebAuthn) — presence-check locale ----
export function bioSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}
export function isBioEnabled() { return !!loadLock().bio; }

export async function enableBio() {
  if (!bioSupported()) throw new Error('Biometria non disponibile su questo dispositivo');
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'brace.' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'brace', displayName: 'brace.' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    },
  });
  const id = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  const st = loadLock(); st.bio = true; st.credId = id; saveLock(st);
}

export function disableBio() { const st = loadLock(); st.bio = false; st.credId = null; saveLock(st); }

export async function unlockBio() {
  const st = loadLock();
  if (!st.bio || !st.credId) return false;
  const raw = Uint8Array.from(atob(st.credId), c => c.charCodeAt(0));
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: raw }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return true;
  } catch { return false; }
}
