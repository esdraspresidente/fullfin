const CACHE = 'fullfin-v3.18';
const SHARE_CACHE = 'fullfin-share';
const ASSETS = [
  '/fullfin/',
  '/fullfin/index.html',
  '/fullfin/manifest.json',
  '/fullfin/icon-192.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Intercepta POST do Share Target
  if (e.request.url.includes('/fullfin/share-target') && e.request.method === 'POST') {
    e.respondWith((async () => {
      try {
        const formData = await e.request.formData();
        const file = formData.get('file');
        if (file && file.size > 0) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put('/fullfin/shared-file', new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-File-Name': encodeURIComponent(file.name || 'comprovante')
            }
          }));
        }
      } catch (err) {
        console.error('[SW] Share target error:', err);
      }
      // Redireciona para URL base SEM query param
      // O app verifica o cache diretamente ao carregar
      return Response.redirect('/fullfin/', 303);
    })());
    return;
  }

  // Ignora Supabase
  if (e.request.url.includes('supabase.co')) return;

  // Network first
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
