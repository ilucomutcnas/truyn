import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRelay } from '../network/relay/server.js';

function request(agent, baseUrl, { method = 'GET', path = '/', body = null, headers = {} } = {}) {
  const target = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    let socketRef = null;
    const req = http.request({
      host: target.hostname,
      port: Number(target.port),
      path: `${target.pathname}${target.search}`,
      method,
      agent,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        socket: socketRef
      }));
    });
    req.on('socket', (socket) => { socketRef = socket; });
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

test('413 closes an oversized keep-alive connection so the next pooled request is clean', async (t) => {
  const relay = createRelay({ maxBodyBytes: 64, allowPublicRegistration: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  t.after(() => agent.destroy());

  const oversized = 'x'.repeat(1024);
  const first = await request(agent, relayUrl, {
    method: 'POST',
    path: '/v1/register',
    body: oversized,
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(oversized)
    }
  });
  assert.equal(first.status, 413);
  assert.equal(first.headers.connection, 'close');
  assert.deepEqual(JSON.parse(first.body), { ok: false, error: 'request_too_large' });

  const second = await request(agent, relayUrl, { method: 'GET', path: '/health' });
  assert.equal(second.status, 200);
  assert.equal(JSON.parse(second.body).ok, true);
  assert.notEqual(second.socket, first.socket, 'the poisoned oversized-request socket must not be reused');
});
