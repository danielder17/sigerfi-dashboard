/**
 * KoBoToolbox Proxy — Cloudflare Worker
 * 
 * Render no puede resolver los DNS de kobotoolbox.org.
 * Este Worker actúa como puente: Render llama a este Worker,
 * y el Worker llama a KoBo con los headers correctos.
 * 
 * URLs compatibles:
 *   GET  /api/v2/assets/?format=json
 *   GET  /api/v2/assets/{uid}/
 *   GET  /api/v2/assets/{uid}/data.json
 *   POST /api/v2/assets/{uid}/data.json
 */

// Mapa de servidores KoBo
const KOBO_SERVERS = {
  'eu': 'https://eu.kobotoolbox.org',
  'kf': 'https://kf.kobotoolbox.org',
};

// API Keys permitidas (configurables via variables de entorno en Cloudflare)
const ALLOWED_API_KEYS = new Set([
  '97a77c88deeb94b960641479dce47a961cfde047',  // Cuenta eu: danielder71@yandex.com
  '093c5dba7a74f4f9c8e439239ce2a9fc9596ded2',  // Cuenta kf: danielder71
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'kobo-proxy' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Obtener server desde query param: ?server=eu o ?server=kf
    const serverKey = url.searchParams.get('server') || 'eu';
    const koboBase = KOBO_SERVERS[serverKey];
    if (!koboBase) {
      return new Response(JSON.stringify({ error: 'Servidor KoBo inválido. Usa ?server=eu o ?server=kf' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Extraer API key
    const apiKey = url.searchParams.get('api_key') || request.headers.get('X-API-Key') || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key requerida (query param api_key o header X-API-Key)' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Construir URL hacia KoBo
    const koboUrl = new URL(path, koboBase);
    // Copiar todos los query params excepto server y api_key
    url.searchParams.forEach((value, key) => {
      if (key !== 'server' && key !== 'api_key') {
        koboUrl.searchParams.set(key, value);
      }
    });
    // Forzar format=json si no está presente
    if (!koboUrl.searchParams.has('format')) {
      koboUrl.searchParams.set('format', 'json');
    }

    // Headers para KoBo
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Token ${apiKey}`);
    headers.delete('X-API-Key');
    headers.delete('Host');

    try {
      const koboResponse = await fetch(koboUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      // Clone response para poder leer el body
      const responseData = await koboResponse.json();
      
      return new Response(JSON.stringify(responseData), {
        status: koboResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ 
        error: 'Error al conectar con KoBoToolbox', 
        detail: err.message,
        server: koboBase,
        path: path,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};
