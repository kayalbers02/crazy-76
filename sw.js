// Crazy 76: de app-schil werkt offline na het eerste bezoek. Scores en bewijs gaan altijd via internet.
const CACHE = 'crazy-76-v2';
const CORE = ['./', 'index.html', 'begeleiders/', 'begeleiders/index.html', 'begeleiders/manifest.webmanifest',
  'shared/ui.css', 'shared/tasks.js', 'shared/rules.js', 'shared/config.js', 'shared/backend.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');

  if (req.mode === 'navigate') {
    // Eerst het netwerk (voor updates), anders de opgeslagen versie.
    const key = url.pathname.includes('/begeleiders') ? 'begeleiders/index.html' : 'index.html';
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); return res; })
        .catch(() => caches.match(key))
    );
    return;
  }

  // Alleen eigen bestanden, letters en de Firebase-bibliotheek bewaren. Bewijs en scores nooit.
  if (url.origin === location.origin || isFont || isSdk) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
