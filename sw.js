// Network-first so updates show up straight away; the cache keeps it working offline.
const CACHE = 'fjordhaven-v4';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'vendor/three.module.min.js',
  'src/main.js', 'src/audio.js',
  'src/ui/camera.js',
  'src/render/view.js', 'src/render/terrain.js', 'src/render/models.js',
  'src/sim/data.js', 'src/sim/rng.js', 'src/sim/noise.js', 'src/sim/map.js', 'src/sim/path.js', 'src/sim/buildings.js',
  'src/sim/villagers.js', 'src/sim/world.js', 'src/sim/save.js', 'test/bot.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('fjordhaven-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
