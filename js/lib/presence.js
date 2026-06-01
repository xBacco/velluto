// Presenza del partner. isOnline/tempoRelativo sono PURI (testabili).
// avviaHeartbeat ha effetti (timer + rete) e NON è unit-testato: verifica sul device.

import { updateLastSeen } from '../store.js';

// Online se l'ultimo battito è entro `sogliaSec` secondi da `now`.
export function isOnline(lastSeenISO, now = new Date(), sogliaSec = 60) {
  if (!lastSeenISO) return false;
  const diff = now.getTime() - new Date(lastSeenISO).getTime();
  return diff >= 0 && diff <= sogliaSec * 1000;
}

// Stringa relativa italiana compatta: "ora" | "2′ fa" | "2h fa" | "ieri" | "3g fa" | "mai".
export function tempoRelativo(lastSeenISO, now = new Date()) {
  if (!lastSeenISO) return 'mai';
  let sec = (now.getTime() - new Date(lastSeenISO).getTime()) / 1000;
  if (sec < 0) sec = 0;
  if (sec < 45) return 'ora';
  const min = Math.round(sec / 60);
  if (min < 60) return min + '′ fa';
  const ore = Math.round(sec / 3600);
  if (ore < 24) return ore + 'h fa';
  const giorni = Math.floor(sec / 86400);
  return giorni === 1 ? 'ieri' : giorni + 'g fa';
}

// Aggiorna profiles.last_seen di `me` a intervalli mentre l'app è in foreground.
// Stop su visibilitychange→hidden, ripartenza su visible. Ritorna stop().
export function avviaHeartbeat({ client, me, intervalloSec = 30 }) {
  let timer = null;
  const battito = () => {
    updateLastSeen(client, me.id, new Date().toISOString())
      .catch(e => console.error('[presence] battito fallito:', e));
  };
  const start = () => { if (timer) return; battito(); timer = setInterval(battito, intervalloSec * 1000); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const onVis = () => { document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVis);
  start();
  return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
}
