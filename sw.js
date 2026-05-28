const CACHE = 'lussuria-v17';
const SHELL = ['./', './index.html', './styles.css', './js/app.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const all = await self.clients.matchAll({ type: 'window' });
    for (const c of all) c.postMessage({ type: 'sw-updated', cache: CACHE });
  })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)));
        return res;
      }).catch(async () => {
        const cached = await caches.match(e.request);
        return cached || Response.error();
      })
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(m => m || fetch(e.request)));
});
