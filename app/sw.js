/* CardTrack Meet OS service worker 1c513576f37c */
const CACHE = 'cardtrack-shell-1c513576f37c';
const SHELL = ['./','./index.html','./assets/app.css','./assets/app.js','./manifest.webmanifest','./version.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match('./index.html'))));
    return;
  }
  if (url.hostname.includes('pokemontcg.io') || /\.(png|jpg|jpeg|webp)$/i.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => { const cached = await c.match(req); const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => cached); return cached || net; }));
  }
});
