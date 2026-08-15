import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createIdentity } from '../core/identity/index.js';
import { PROVIDER_BACKCHANNEL_HEADER } from '../core/security/node-backchannel.js';
import { ProviderTruynNode } from '../runtime/provider-node.js';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

test('provider node keeps M2M proof in transport headers and out of signed envelopes', async (t) => {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const body = req.method === 'POST' ? await readJson(req) : {};
    seen.push({ path: req.url, headers: req.headers, body });
    if (req.url === '/v1/register') {
      const data = JSON.stringify({ ok: true, sessionToken: 'provider-session', expiresInMs: 60_000 });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
      res.end(data);
      return;
    }
    if (req.url === '/v1/offers') {
      const data = JSON.stringify({ ok: true, offerId: body.envelope?.id || 'offer' });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
      res.end(data);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not_found"}');
  });
  const relayUrl = await listen(server);
  t.after(() => close(server));

  const node = new ProviderTruynNode({
    relayUrl,
    identity: createIdentity(),
    backchannelToken: 'm2m-secret'
  });
  await node.register();
  await node.offer('reasoning.general', { accessMode: 'owner-only' });

  assert.equal(seen.length, 2);
  for (const call of seen) {
    assert.equal(call.headers[PROVIDER_BACKCHANNEL_HEADER], 'm2m-secret');
    assert.equal(JSON.stringify(call.body).includes('m2m-secret'), false);
  }
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[1].headers.authorization, 'Bearer provider-session');
});

test('provider node without M2M proof preserves ordinary TruynNode transport behavior', async (t) => {
  let header = null;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST') await readJson(req);
    header = req.headers[PROVIDER_BACKCHANNEL_HEADER] || null;
    const data = JSON.stringify({ ok: true, sessionToken: 'plain-session', expiresInMs: 60_000 });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
    res.end(data);
  });
  const relayUrl = await listen(server);
  t.after(() => close(server));

  const node = new ProviderTruynNode({ relayUrl, identity: createIdentity() });
  await node.register();
  assert.equal(header, null);
});
