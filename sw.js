const CACHE = 'fullfin-v3.47';
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
  const url = e.request.url;

  // ── Intercepta POST do Share Target ──
  if (url.includes('/fullfin/share-target') && e.request.method === 'POST') {
    // CRÍTICO: waitUntil garante que o SW não seja morto antes de terminar de escrever o cache.
    // respondWith só resolve DEPOIS que o arquivo foi 100% gravado.
    e.respondWith(handleShare(e));
    return;
  }

  if (url.includes('supabase.co')) return;

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

async function handleShare(e) {
  let salvou = false;
  try {
    const formData = await e.request.formData();
    // Tenta pegar o arquivo por qualquer nome de campo (file, files, etc.)
    let file = formData.get('file');
    if (!file || !file.size) {
      // fallback: procura qualquer entrada que seja um File
      for (const [, v] of formData.entries()) {
        if (v && typeof v === 'object' && 'size' in v && v.size > 0) { file = v; break; }
      }
    }
    if (file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      // Grava o arquivo E ESPERA terminar antes de redirecionar
      await cache.put('/fullfin/shared-file', new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || 'comprovante.pdf')
        }
      }));
      // Confirma que gravou
      const check = await cache.match('/fullfin/shared-file');
      salvou = !!check;
    }
  } catch (err) {
    console.error('[SW] Share error:', err);
  }
  // Só redireciona DEPOIS de gravar. Passa flag de status na URL.
  return Response.redirect('/fullfin/?share=' + (salvou ? '1' : 'erro'), 303);
}
