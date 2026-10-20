// Bump VERSION on each release so installed copies pick up the new shell and
// the page shows its "updated" prompt.
const VERSION = 'v3';
const SHELL_CACHE = `trip-shell-${VERSION}`;
const TILE_CACHE = 'trip-tiles-v1';
const TILE_LIMIT = 600;

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/tz-lookup/tz.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // cache: 'reload' skips the browser HTTP cache so a new version never
      // precaches stale files.
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, req));
    return;
  }
  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(tileNetworkFirst(event, req));
  }
  // Everything else (place search) goes straight to the network.
});

// App shell: answer instantly from cache, refresh the cache in the background
// so the next launch gets any update. Navigations (including ?action=add from
// the home-screen shortcut) all map to the cached index page.
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(SHELL_CACHE);
  const isNav = req.mode === 'navigate';
  const cached = isNav
    ? (await cache.match('./index.html')) || (await cache.match(req, { ignoreSearch: true }))
    : await cache.match(req);

  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(isNav ? './index.html' : req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

// Map tiles: fresh when online, last-seen copy when offline. Only tiles you've
// actually viewed are kept (capped), per OpenStreetMap's tile usage policy.
async function tileNetworkFirst(event, req) {
  const cache = await caches.open(TILE_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) {
      event.waitUntil(cache.put(req, res.clone()).then(() => trimCache(cache, TILE_LIMIT)));
    }
    return res;
  } catch (e) {
    return (await cache.match(req)) || Response.error();
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
