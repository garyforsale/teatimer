// Service worker: offline podpora a instalace na plochu.
// Při změně zvuků nebo ikon zvyš VERSION, aby se stáhly nové soubory.
const VERSION = 'gft-v2.0.0';
const FONTS = 'gft-fonts';
const NET_TIMEOUT = 3500;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sounds/chime.wav',
  './sounds/tick.wav',
  './sounds/silence.wav',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Mažeme jen vlastní staré cache — na stejné doméně (github.io) můžou běžet i jiné projekty.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('gft-') && k !== VERSION && k !== FONTS)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);

  // Stránka: nejdřív síť (ať se aktualizace projeví hned), při výpadku nebo pomalé síti z cache.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetchWithTimeout(req, NET_TIMEOUT);
        const html = (res.headers.get('content-type') || '').includes('text/html');
        if (res.ok && !res.redirected && html && url.origin === self.location.origin) {
          const copy = res.clone();
          e.waitUntil(caches.open(VERSION).then((c) => c.put('./index.html', copy)));
        }
        return res;
      } catch (err) {
        const hit = (await caches.match('./index.html')) || (await caches.match('./'));
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  // Vlastní soubory (zvuky, ikony): nejdřív cache.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(VERSION).then((c) => c.put(req, copy)));
        }
        return res;
      }))
    );
    return;
  }

  // Google Fonts: z cache a na pozadí obnovit.
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        if (hit) { e.waitUntil(net); return hit; }
        return net;
      })
    );
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(scope) && 'focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
