import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyCloudflareOrigin } from '../runtime/cloudflare-origin-proxy.js';
import { ORIGIN_GUARD_HEADER } from '../runtime/origin-guard-contract.js';

const FUTURE = '2099-01-01T00:00:00.000Z';

function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return {
    url,
    method,
    headers: new Headers(headers),
    body
  };
}

function edgeEnv(overrides = {}) {
  return {
    TRUYN_ORIGIN_URL: 'https://origin.example',
    TRUYN_ORIGIN_GUARD_TOKEN: 'edge-secret',
    TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT: FUTURE,
    ...overrides
  };
}

test('Cloudflare origin proxy fails closed when origin, secret, or token expiry is missing/invalid', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('unexpected');
  };

  for (const env of [
    {},
    { TRUYN_ORIGIN_URL: 'https://origin.example' },
    { TRUYN_ORIGIN_GUARD_TOKEN: 'edge-secret' },
    { TRUYN_ORIGIN_URL: 'https://origin.example', TRUYN_ORIGIN_GUARD_TOKEN: 'edge-secret' },
    { TRUYN_ORIGIN_URL: 'https://origin.example', TRUYN_ORIGIN_GUARD_TOKEN: 'edge-secret', TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT: '2020-01-01T00:00:00.000Z' },
    edgeEnv({ TRUYN_ORIGIN_URL: 'http://origin.example' }),
    edgeEnv({ TRUYN_ORIGIN_URL: 'https://user:pass@origin.example' }),
    edgeEnv({ TRUYN_ORIGIN_URL: 'https://origin.example/private' })
  ]) {
    const response = await proxyCloudflareOrigin(request('https://relay.example/v1/register'), env, fetchImpl);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'edge_not_configured' });
  }
  assert.equal(calls, 0);
});

test('Cloudflare origin proxy rejects the public edge hostname even when an alternate port is configured', async () => {
  let calls = 0;
  for (const origin of ['https://relay.example', 'https://relay.example:8443']) {
    const response = await proxyCloudflareOrigin(request('https://relay.example/v1/register'), edgeEnv({
      TRUYN_ORIGIN_URL: origin
    }), async () => {
      calls += 1;
      return new Response('unexpected');
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'edge_origin_invalid' });
  }
  assert.equal(calls, 0, 'recursive origin configuration must fail before fetch');
});

test('Cloudflare origin proxy overwrites client proof and preserves path/query/body', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url: String(url), init };
    return new Response('proxied', { status: 201 });
  };
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"hello":"world"}'));
      controller.close();
    }
  });
  const incoming = request('https://relay.example/v1/register?mode=test', {
    method: 'POST',
    headers: {
      [ORIGIN_GUARD_HEADER]: 'attacker-controlled',
      'content-type': 'application/json',
      authorization: 'Bearer requester-session'
    },
    body
  });

  const response = await proxyCloudflareOrigin(incoming, edgeEnv(), fetchImpl);

  assert.equal(response.status, 201);
  assert.equal(await response.text(), 'proxied');
  assert.equal(captured.url, 'https://origin.example/v1/register?mode=test');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.redirect, 'manual');
  assert.equal(captured.init.headers.get(ORIGIN_GUARD_HEADER), 'edge-secret');
  assert.equal(captured.init.headers.get('authorization'), 'Bearer requester-session');
  assert.equal(await new Response(captured.init.body).text(), '{"hello":"world"}');
});

test('Cloudflare origin proxy denies redirects without leaking the private redirect target', async () => {
  const response = await proxyCloudflareOrigin(request('https://relay.example/v1/needs'), edgeEnv(), async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    return new Response(null, {
      status: 302,
      headers: { location: 'https://private-origin.example/internal/path' }
    });
  });

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('location'), null);
  const text = await response.text();
  assert.equal(text.includes('private-origin.example'), false);
  assert.deepEqual(JSON.parse(text), { ok: false, error: 'origin_redirect_denied' });
});

test('Cloudflare origin proxy preserves WebSocket upgrade while injecting only the Worker proof', async () => {
  let captured = null;
  const upstreamResponse = new Response(null, { status: 204 });
  const response = await proxyCloudflareOrigin(request('https://relay.example/v1/fast/socket?nodeId=test', {
    headers: {
      upgrade: 'websocket',
      connection: 'Upgrade',
      [ORIGIN_GUARD_HEADER]: 'spoofed'
    }
  }), edgeEnv({ TRUYN_ORIGIN_GUARD_TOKEN: 'worker-secret' }), async (url, init) => {
    captured = { url: String(url), init };
    return upstreamResponse;
  });

  assert.equal(response, upstreamResponse);
  assert.equal(captured.url, 'https://origin.example/v1/fast/socket?nodeId=test');
  assert.equal(captured.init.headers.get('upgrade'), 'websocket');
  assert.equal(captured.init.headers.get(ORIGIN_GUARD_HEADER), 'worker-secret');
});

test('Cloudflare origin proxy returns a sanitized failure without exposing bindings', async () => {
  const response = await proxyCloudflareOrigin(request('https://relay.example/v1/needs'), edgeEnv({
    TRUYN_ORIGIN_GUARD_TOKEN: 'never-print-this-secret'
  }), async () => {
    throw new Error('upstream failed with sensitive details');
  });

  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text.includes('never-print-this-secret'), false);
  assert.equal(text.includes('sensitive details'), false);
  assert.deepEqual(JSON.parse(text), { ok: false, error: 'origin_unavailable' });
});
