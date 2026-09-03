const CACHE = 'gautier-family-shell-v2';
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Réseau d'abord, cache en repli (hors ligne uniquement) : chaque déploiement
// doit être visible dès le premier chargement en ligne, jamais une version
// mise en cache lors d'un passage précédent (bug constaté : après un push,
// le premier rechargement affichait encore l'ancien shell).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // ne jamais intercepter PocketBase (autre origine)
  if (url.pathname === '/config.js') return; // config runtime, toujours dynamique

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
