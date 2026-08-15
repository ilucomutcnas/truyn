import { ORIGIN_GUARD_HEADER } from './origin-guard-contract.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function resolveOriginConfig(env = {}) {
  const rawOrigin = String(env.TRUYN_ORIGIN_URL || '').trim();
  const token = String(env.TRUYN_ORIGIN_GUARD_TOKEN || '').trim();
  if (!rawOrigin || !token) return null;

  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return null;
  }

  if (origin.protocol !== 'https:') return null;
  if (origin.username || origin.password) return null;
  if (origin.pathname !== '/' || origin.search || origin.hash) return null;
  return { origin, token };
}

function targetUrl(requestUrl, origin) {
  const incoming = new URL(requestUrl);
  const target = new URL(origin.origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}

export async function proxyCloudflareOrigin(request, env, fetchImpl = globalThis.fetch) {
  const config = resolveOriginConfig(env);
  if (!config || typeof fetchImpl !== 'function') {
    return jsonResponse(503, { ok: false, error: 'edge_not_configured' });
  }

  const headers = new Headers(request.headers);
  // Never trust a proof supplied by the public client. The Worker overwrites it
  // with the secret binding for this deployment.
  headers.delete(ORIGIN_GUARD_HEADER);
  headers.set(ORIGIN_GUARD_HEADER, config.token);

  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  try {
    return await fetchImpl(targetUrl(request.url, config.origin), init);
  } catch {
    return jsonResponse(502, { ok: false, error: 'origin_unavailable' });
  }
}

export default {
  fetch(request, env) {
    return proxyCloudflareOrigin(request, env);
  }
};
