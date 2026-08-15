import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity, signValue, verifyValue } from '../core/identity/index.js';
import { createEnvelope, nodeIdFromPublicKey, verifyEnvelope } from '../core/protocol/index.js';
import { trustabilityLite } from '../core/trust/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('node identity is derived from its public key', () => {
  const identity = createIdentity();
  assert.equal(identity.nodeId, nodeIdFromPublicKey(identity.publicKeyPem));
  assert.match(identity.nodeId, /^truyn:node:[a-f0-9]{64}$/);
});

test('identity can sign and verify canonical values', () => {
  const identity = createIdentity();
  const value = { b: 2, a: 1 };
  const signature = signValue(value, identity.privateKeyPem);
  assert.equal(verifyValue({ a: 1, b: 2 }, signature, identity.publicKeyPem), true);
});

test('signed TRUYN envelope verifies and tampering is rejected', () => {
  const identity = createIdentity();
  const envelope = createEnvelope({
    type: 'NEED',
    from: identity.nodeId,
    privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem,
    payload: { capability: { name: 'research' }, input: { query: 'hello' } }
  });

  assert.deepEqual(verifyEnvelope(envelope), { ok: true });
  const tampered = structuredClone(envelope);
  tampered.payload.input.query = 'changed';
  assert.deepEqual(verifyEnvelope(tampered), { ok: false, reason: 'invalid_signature' });
});

test('trustability lite increases after successful tasks', () => {
  const now = Date.now();
  const newNode = trustabilityLite({ identityVerified: true, lastSeenAt: new Date(now).toISOString(), now });
  const provenNode = trustabilityLite({ identityVerified: true, successfulTasks: 8, failedTasks: 1, lastSeenAt: new Date(now).toISOString(), now });
  assert.ok(provenNode.score > newNode.score);
});

test('two independent nodes discover, route NEED and return signed RESULT', async (t) => {
  const relay = createRelay();
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });

  await provider.register();
  await requester.register();
  const offer = await provider.offer('research');
  assert.ok(offer.offerId);

  const discovery = await requester.find('research');
  assert.equal(discovery.offers.length, 1);
  assert.equal(discovery.offers[0].from, provider.identity.nodeId);

  const matched = await requester.need('research', { query: 'TRUYN' });
  assert.equal(matched.provider, provider.identity.nodeId);

  const providerEvents = await provider.poll();
  assert.equal(providerEvents.events.length, 1);
  assert.equal(providerEvents.events[0].kind, 'NEED');
  assert.equal(providerEvents.events[0].verification.ok, true);

  const requestId = providerEvents.events[0].envelope.id;
  await provider.result(requestId, { answer: 'working' });

  const requesterEvents = await requester.poll();
  assert.equal(requesterEvents.events.length, 1);
  assert.equal(requesterEvents.events[0].kind, 'RESULT');
  assert.equal(requesterEvents.events[0].verification.ok, true);
  assert.equal(requesterEvents.events[0].envelope.payload.requestId, requestId);
  assert.ok(requesterEvents.events[0].trust.score > 0);
});
