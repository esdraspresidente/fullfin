const CACHE = 'fullfin-v2.7';
const ASSETS = [
  '/fullfin/',
  '/fullfin/index.html',
  '/fullfin/manifest.json',
  '/fullfin/icon-192.png'
];

// Instala e faz cache dos assets principais
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Remove caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network first — sempre tenta buscar versão nova, cai no cache só se offline
self.addEventListener('fetch', e => {
  // Ignora requisições ao Supabase (sempre direto na rede)
  if (e.request.url.includes('supabase.co')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza cache com versão nova
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
