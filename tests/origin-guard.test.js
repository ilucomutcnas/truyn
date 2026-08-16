import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  createOriginGuard,
  createRuntimeOriginGuardConfig,
  ORIGIN_GUARD_HEADER
} from '../runtime/origin-guard.js';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server.address().port;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function wsMessage(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers, handshakeTimeout: 2_000 });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('websocket_test_timeout'));
    }, 3_000);
    socket.once('message', (data) => {
      clearTimeout(timer);
      const value = JSON.parse(data.toString());
      socket.close();
      resolve(value);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('origin guard config is opt-in and fails closed on partial configuration', () => {
  assert.deepEqual(createRuntimeOriginGuardConfig({}), {
    enabled: false,
    token: null,
    headerName: ORIGIN_GUARD_HEADER
  });
  assert.throws(
    () => createRuntimeOriginGuardConfig({ TRUYN_ORIGIN_GUARD: '1' }),
    /TRUYN_ORIGIN_GUARD_TOKEN/
  );
  assert.throws(
    () => createRuntimeOriginGuardConfig({ TRUYN_ORIGIN_GUARD_TOKEN: 'secret' }),
    /TRUYN_ORIGIN_GUARD=1/
  );
  assert.throws(
    () => createRuntimeOriginGuardConfig({ TRUYN_ORIGIN_GUARD_HEADER: 'x-azure-fdid' }),
    /TRUYN_ORIGIN_GUARD=1/
  );
  assert.deepEqual(createRuntimeOriginGuardConfig({
    TRUYN_ORIGIN_GUARD: 'true',
    TRUYN_ORIGIN_GUARD_TOKEN: 'secret'
  }), {
    enabled: true,
    token: 'secret',
    headerName: ORIGIN_GUARD_HEADER
  });
  assert.deepEqual(createRuntimeOriginGuardConfig({
    TRUYN_ORIGIN_GUARD: 'true',
    TRUYN_ORIGIN_GUARD_TOKEN: 'front-door-id',
    TRUYN_ORIGIN_GUARD_HEADER: 'X-Azure-FDID'
  }), {
    enabled: true,
    token: 'front-door-id',
    headerName: 'x-azure-fdid'
  });
});

test('origin guard blocks direct data-plane HTTP and strips the edge secret upstream', async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((req, res) => {
    upstreamRequests += 1;
    const body = JSON.stringify({
      ok: true,
      method: req.method,
      path: req.url,
      guardHeader: req.headers[ORIGIN_GUARD_HEADER] || null
    });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  });
  const upstreamPort = await listen(upstream);
  t.after(() => closeServer(upstream));

  const guard = createOriginGuard({ targetPort: upstreamPort, token: 'edge-secret' });
  const guardUrl = await guard.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => guard.close());

  const health = await fetch(`${guardUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, protocol: 'TRUYN/1' });
  assert.equal(upstreamRequests, 0, 'unauthenticated health must not expose upstream diagnostics');

  const denied = await fetch(`${guardUrl}/v1/register`, { method: 'POST', body: '{}' });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { ok: false, error: 'origin_guard_denied' });
  assert.equal(upstreamRequests, 0, 'denied requests must not reach the origin relay');

  const allowed = await fetch(`${guardUrl}/v1/register`, {
    method: 'POST',
    headers: { [ORIGIN_GUARD_HEADER]: 'edge-secret', 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    ok: true,
    method: 'POST',
    path: '/v1/register',
    guardHeader: null
  });
  assert.equal(upstreamRequests, 1);
});

test('origin guard can validate X-Azure-FDID and strips all origin proof headers upstream', async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((req, res) => {
    upstreamRequests += 1;
    const body = JSON.stringify({
      azureFrontDoorId: req.headers['x-azure-fdid'] || null,
      legacyGuardHeader: req.headers[ORIGIN_GUARD_HEADER] || null
    });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  });
  const upstreamPort = await listen(upstream);
  t.after(() => closeServer(upstream));

  const guard = createOriginGuard({
    targetPort: upstreamPort,
    token: 'specific-front-door-id',
    headerName: 'X-Azure-FDID'
  });
  const guardUrl = await guard.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => guard.close());

  const wrongHeader = await fetch(`${guardUrl}/v1/register`, {
    method: 'POST',
    headers: { [ORIGIN_GUARD_HEADER]: 'specific-front-door-id', 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(wrongHeader.status, 403);
  assert.equal(upstreamRequests, 0);

  const allowed = await fetch(`${guardUrl}/v1/register`, {
    method: 'POST',
    headers: {
      'X-Azure-FDID': 'specific-front-door-id',
      [ORIGIN_GUARD_HEADER]: 'attacker-controlled',
      'content-type': 'application/json'
    },
    body: '{}'
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    azureFrontDoorId: null,
    legacyGuardHeader: null
  });
  assert.equal(upstreamRequests, 1);
});

test('origin guard enforces the same secret on websocket upgrades and strips it upstream', async (t) => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server: upstream });
  wss.on('connection', (socket, req) => {
    socket.send(JSON.stringify({ guardHeader: req.headers[ORIGIN_GUARD_HEADER] || null }));
  });
  const upstreamPort = await listen(upstream);
  t.after(async () => {
    wss.close();
    await closeServer(upstream);
  });

  const guard = createOriginGuard({ targetPort: upstreamPort, token: 'edge-secret' });
  const guardUrl = await guard.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => guard.close());
  const wsUrl = `${guardUrl.replace(/^http:/, 'ws:')}/v1/fast/socket?nodeId=test`;

  const allowed = await wsMessage(wsUrl, { [ORIGIN_GUARD_HEADER]: 'edge-secret' });
  assert.deepEqual(allowed, { guardHeader: null });

  const deniedStatus = await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { handshakeTimeout: 2_000 });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('websocket_denial_timeout'));
    }, 3_000);
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      resolve(response.statusCode);
      response.resume();
      socket.terminate();
    });
    socket.once('error', () => {});
  });
  assert.equal(deniedStatus, 403);
});

test('runtime relay wires configured origin guard header around an internal loopback relay', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../runtime/service.js', import.meta.url), 'utf8'));
  assert.match(source, /createRuntimeOriginGuardConfig/);
  assert.match(source, /relay\.listen\(\{ host: '127\.0\.0\.1', port: 0 \}\)/);
  assert.match(source, /createOriginGuard/);
  assert.match(source, /headerName: originGuardConfig\.headerName/);
});
