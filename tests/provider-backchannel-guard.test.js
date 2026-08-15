import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createIdentity } from '../core/identity/index.js';
import { PROVIDER_BACKCHANNEL_HEADER } from '../core/security/node-backchannel.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createProviderBackchannelGuard } from '../runtime/provider-backchannel-guard.js';
import { ProviderTruynNode } from '../runtime/provider-node.js';

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test('protected provider requires M2M proof for registration, session requests and websocket while ordinary nodes are unchanged', async (t) => {
  const protectedIdentity = createIdentity();
  const ordinaryIdentity = createIdentity();
  const relay = createRelay({
    allowedNodeIds: [protectedIdentity.nodeId, ordinaryIdentity.nodeId],
    allowPublicDispatch: true
  });
  const relayUrl = await relay.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => relay.close());

  const targetPort = Number(new URL(relayUrl).port);
  const guard = createProviderBackchannelGuard({
    targetPort,
    protectedNodeIds: [protectedIdentity.nodeId],
    token: 'owner-m2m-secret'
  });
  const guardUrl = await guard.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => guard.close());

  const plainProtected = new TruynNode({ relayUrl: guardUrl, identity: protectedIdentity });
  await assert.rejects(() => plainProtected.register(), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, 'provider_backchannel_denied');
    return true;
  });

  const wrongProtected = new ProviderTruynNode({
    relayUrl: guardUrl,
    identity: protectedIdentity,
    backchannelToken: 'wrong-secret'
  });
  await assert.rejects(() => wrongProtected.register(), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, 'provider_backchannel_denied');
    return true;
  });

  const protectedNode = new ProviderTruynNode({
    relayUrl: guardUrl,
    identity: protectedIdentity,
    backchannelToken: 'owner-m2m-secret'
  });
  const registered = await protectedNode.register();
  assert.equal(registered.nodeId, protectedIdentity.nodeId);
  await protectedNode.offer('reasoning.general', { accessMode: 'owner-only' });

  const stolenSessionWithoutProof = new TruynNode({ relayUrl: guardUrl, identity: protectedIdentity });
  stolenSessionWithoutProof.sessionToken = protectedNode.sessionToken;
  await assert.rejects(() => stolenSessionWithoutProof.offer('reasoning.other'), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, 'provider_backchannel_denied');
    return true;
  });
  await assert.rejects(() => stolenSessionWithoutProof.ensureFastSocket());

  const protectedSocket = await protectedNode.ensureFastSocket();
  assert.equal(protectedSocket.readyState, protectedSocket.OPEN);
  protectedNode.closeFastSocket();

  const ordinary = new TruynNode({ relayUrl: guardUrl, identity: ordinaryIdentity });
  const ordinaryRegistration = await ordinary.register();
  assert.equal(ordinaryRegistration.nodeId, ordinaryIdentity.nodeId);
  const found = await ordinary.find('reasoning.general');
  assert.equal(found.offers.length, 0, 'owner-only provider remains hidden from the ordinary requester');
});

test('backchannel proof is removed before requests reach the inner relay', async (t) => {
  const identity = createIdentity();
  const observed = [];
  const inner = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    observed.push({ path: req.url, proof: req.headers[PROVIDER_BACKCHANNEL_HEADER] || null, body });
    const payload = req.url === '/v1/register'
      ? { ok: true, nodeId: identity.nodeId, sessionToken: 'protected-session', expiresInMs: 60_000 }
      : { ok: true };
    const data = JSON.stringify(payload);
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
    res.end(data);
  });
  await new Promise((resolve) => inner.listen(0, '127.0.0.1', resolve));
  t.after(() => close(inner));

  const guard = createProviderBackchannelGuard({
    targetPort: inner.address().port,
    protectedNodeIds: [identity.nodeId],
    token: 'transport-only-secret'
  });
  const guardUrl = await guard.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => guard.close());

  const node = new ProviderTruynNode({
    relayUrl: guardUrl,
    identity,
    backchannelToken: 'transport-only-secret'
  });
  await node.register();
  await node.offer('reasoning.general', { accessMode: 'owner-only' });

  assert.equal(observed.length, 2);
  for (const request of observed) {
    assert.equal(request.proof, null);
    assert.equal(request.body.includes('transport-only-secret'), false);
  }
});
