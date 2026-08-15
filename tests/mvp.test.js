import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity, signValue, verifyValue } from '../core/identity/index.js';
import {
  compactFrameBytes,
  createCompactFrame,
  createEnvelope,
  nodeIdFromPublicKey,
  verifyCompactFrame,
  verifyEnvelope
} from '../core/protocol/index.js';
import { trustabilityLite } from '../core/trust/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';

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

test('session-bound compact frames preserve Ed25519 verification under 125 bytes', () => {
  const identity = createIdentity();
  const payload = { capability: { name: 'research' }, input: { query: 'hello' }, policy: {} };
  const frame = createCompactFrame({ type: 'NEED', payload, privateKeyPem: identity.privateKeyPem });
  assert.equal(verifyCompactFrame(frame, payload, identity.publicKeyPem).ok, true);
  assert.ok(compactFrameBytes(frame) <= 125, `compact frame was ${compactFrameBytes(frame)} bytes`);
  const tampered = structuredClone(payload);
  tampered.input.query = 'changed';
  assert.deepEqual(verifyCompactFrame(frame, tampered, identity.publicKeyPem), { ok: false, reason: 'invalid_signature' });
});

test('trustability lite increases after successful tasks', () => {
  const now = Date.now();
  const newNode = trustabilityLite({ identityVerified: true, lastSeenAt: new Date(now).toISOString(), now });
  const provenNode = trustabilityLite({ identityVerified: true, successfulTasks: 8, failedTasks: 1, lastSeenAt: new Date(now).toISOString(), now });
  assert.ok(provenNode.score > newNode.score);
});

test('two independent nodes discover, route NEED and return signed RESULT', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
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

test('compact long-poll NEED returns signed RESULT synchronously with <= 250 protocol bytes per transaction', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('research', { fastPath: true });
  const providerWork = (async () => {
    const polled = await provider.pollCompact({ waitMs: 2_000 });
    assert.equal(polled.events.length, 1);
    const event = polled.events[0];
    assert.equal(event.kind, 'NEED');
    assert.equal(event.verification.ok, true);
    await provider.compactResult(event.frame.i, { answer: 'working' }, { providerLatencyMs: 1 });
  })();
  const result = await requester.compactNeed('research', { query: 'TRUYN' }, {}, { waitMs: 2_000 });
  await providerWork;
  assert.equal(result.output.answer, 'working');
  assert.equal(result.verification.ok, true);
  assert.equal(result.provider, provider.identity.nodeId);
  assert.ok(result.protocolOverheadBytes <= 250, `compact transaction overhead was ${result.protocolOverheadBytes} bytes`);
});

test('single signed CHAIN executes two providers over persistent sockets with <= 375 protocol bytes', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const researchNode = new TruynNode({ relayUrl });
  const reviewNode = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  t.after(() => researchNode.closeFastSocket());
  t.after(() => reviewNode.closeFastSocket());
  t.after(() => requester.closeFastSocket());
  let reviewedCandidate = null;
  const researchHost = new TruynAdapterHost({
    node: researchNode,
    fastPath: true,
    socketPath: true,
    adapter: createFunctionAdapter({
      name: 'research-test',
      capabilities: ['research'],
      execute: async ({ input }) => ({ output: `candidate:${input.query}`, metadata: { providerLatencyMs: 1 } })
    })
  });
  const reviewHost = new TruynAdapterHost({
    node: reviewNode,
    fastPath: true,
    socketPath: true,
    adapter: createFunctionAdapter({
      name: 'review-test',
      capabilities: ['review'],
      execute: async ({ input }) => {
        reviewedCandidate = input.candidate;
        return { output: `reviewed:${input.candidate}`, metadata: { providerLatencyMs: 1 } };
      }
    })
  });
  await researchHost.publishCapabilities();
  await reviewHost.publishCapabilities();
  await requester.register();
  await requester.ensureFastSocket();
  const researchWork = researchHost.runOnce();
  const reviewWork = reviewHost.runOnce();
  const result = await requester.compactChain([
    { capability: { name: 'research' }, input: { query: 'TRUYN' }, policy: { expectedProvider: 'research-test' } },
    { capability: { name: 'review' }, inputTemplate: { candidate: { $previous: 'output' } }, policy: { expectedProvider: 'review-test' } }
  ], { waitMs: 2_000 });
  await Promise.all([researchWork, reviewWork]);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].verification.ok, true);
  assert.equal(result.results[1].verification.ok, true);
  assert.equal(result.results[0].payload.output, 'candidate:TRUYN');
  assert.equal(result.results[1].payload.output, 'reviewed:candidate:TRUYN');
  assert.equal(reviewedCandidate, 'candidate:TRUYN');
  assert.notEqual(result.results[0].from, result.results[1].from);
  assert.ok(result.protocolOverheadBytes <= 375, `chain protocol overhead was ${result.protocolOverheadBytes} bytes`);
  assert.equal(result.requesterTransport, 'websocket');
  assert.equal(relay.state.providerSockets.size, 3);
  const traceResponse = await fetch(`${relayUrl}/v1/fast/chains/${encodeURIComponent(result.chainId)}/trace`, {
    headers: { authorization: `Bearer ${requester.sessionToken}` }
  });
  assert.equal(traceResponse.status, 200);
  const traceBody = await traceResponse.json();
  assert.equal(traceBody.ok, true);
  assert.equal(traceBody.trace.requesterTransport, 'websocket');
  assert.deepEqual(traceBody.trace.stageTransport, ['socket', 'socket']);
  assert.ok(Number.isFinite(traceBody.trace.relayTotalMs));
  for (const value of Object.values(traceBody.trace.segments)) assert.ok(Number.isFinite(value));
});

test('relay excludes stale OFFERs and routes to the live replacement provider', async (t) => {
  const relay = createRelay({ nodeFreshnessMs: 1_000, localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const staleProvider = new TruynNode({ relayUrl });
  const liveProvider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await staleProvider.register();
  await staleProvider.offer('review');
  await liveProvider.register();
  await liveProvider.offer('review');
  await requester.register();
  relay.state.nodes.get(staleProvider.identity.nodeId).lastSeenAt = new Date(Date.now() - 5_000).toISOString();
  relay.state.nodes.get(liveProvider.identity.nodeId).lastSeenAt = new Date().toISOString();
  const discovery = await requester.find('review');
  assert.equal(discovery.offers.length, 1);
  assert.equal(discovery.offers[0].from, liveProvider.identity.nodeId);
  const matched = await requester.need('review', { candidate: 'TRUYN' });
  assert.equal(matched.provider, liveProvider.identity.nodeId);
  const staleEvents = await staleProvider.poll();
  assert.equal(staleEvents.events.length, 0);
  const liveEvents = await liveProvider.poll();
  assert.equal(liveEvents.events.length, 1);
  assert.equal(liveEvents.events[0].kind, 'NEED');
  assert.equal(liveEvents.events[0].envelope.id, matched.needId);
});
