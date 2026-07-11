const CACHE = 'fullfin-v3.64';
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

// Grava um log de diagnóstico que sobrevive ao redirect.
// O index.html lê isso no painel "Diagnóstico do Compartilhamento".
async function gravarShareLog(dados) {
  try {
    const cache = await caches.open(SHARE_CACHE);
    dados.quando = new Date().toISOString();
    await cache.put('/fullfin/share-log', new Response(JSON.stringify(dados), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (e) { /* se nem isso grava, o problema é permissão de cache */ }
}

async function handleShare(e) {
  const log = { etapa: 'inicio', campos: [], salvou: false };
  let salvou = false;
  try {
    const formData = await e.request.formData();
    log.etapa = 'formdata_ok';

    // Registra TUDO que o Android mandou: nome do campo, tipo e tamanho
    for (const [nome, v] of formData.entries()) {
      if (v && typeof v === 'object' && 'size' in v) {
        log.campos.push(nome + ' [arquivo ' + (v.type || 'sem-tipo') + ' ' + v.size + 'b]');
      } else {
        log.campos.push(nome + ' [texto: "' + String(v).slice(0, 40) + '"]');
      }
    }

    // Tenta pegar o arquivo por qualquer nome de campo (file, files, etc.)
    let file = formData.get('file');
    if (!file || !file.size) {
      for (const [, v] of formData.entries()) {
        if (v && typeof v === 'object' && 'size' in v && v.size > 0) { file = v; break; }
      }
    }

    if (file && file.size > 0) {
      log.etapa = 'arquivo_encontrado';
      log.arquivo = (file.name || '?') + ' / ' + (file.type || 'sem-tipo') + ' / ' + file.size + 'b';
      const cache = await caches.open(SHARE_CACHE);
      await cache.put('/fullfin/shared-file', new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || 'comprovante.pdf')
        }
      }));
      const check = await cache.match('/fullfin/shared-file');
      salvou = !!check;
      log.etapa = salvou ? 'gravado_ok' : 'put_falhou';
      log.salvou = salvou;
    } else {
      log.etapa = 'nenhum_arquivo';
    }
  } catch (err) {
    log.etapa = 'excecao';
    log.erro = (err && err.message) ? err.message : String(err);
    console.error('[SW] Share error:', err);
  }
  await gravarShareLog(log);
  return Response.redirect('/fullfin/?share=' + (salvou ? '1' : 'erro'), 303);
}
