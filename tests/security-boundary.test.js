import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('production-style relay denies untrusted provider dispatch with zero provider events', async (t) => {
  const providerIdentity = createIdentity();
  const trustedIdentity = createIdentity();
  const attackerIdentity = createIdentity();
  const relay = createRelay({
    localDevelopmentMode: false,
    allowedNodeIds: [providerIdentity.nodeId, trustedIdentity.nodeId, attackerIdentity.nodeId],
    trustedRequesterNodeIds: [trustedIdentity.nodeId]
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl, identity: providerIdentity });
  const trusted = new TruynNode({ relayUrl, identity: trustedIdentity });
  const attacker = new TruynNode({ relayUrl, identity: attackerIdentity });
  await provider.register();
  await trusted.register();
  await attacker.register();
  await provider.offer('research');

  const attackerDiscovery = await attacker.find('research');
  assert.deepEqual(attackerDiscovery.offers, []);

  await assert.rejects(
    attacker.need('research', { query: 'spend owner quota' }),
    (error) => error.status === 403 && error.body?.error === 'provider_access_denied'
  );

  const providerAfterAttack = await provider.poll();
  assert.equal(providerAfterAttack.events.length, 0, 'unauthorized requester must create zero provider events');

  const trustedDiscovery = await trusted.find('research');
  assert.equal(trustedDiscovery.offers.length, 1);
  const matched = await trusted.need('research', { query: 'authorized task' });
  assert.equal(matched.provider, providerIdentity.nodeId);
  const providerAuthorized = await provider.poll();
  assert.equal(providerAuthorized.events.length, 1);
});

test('legacy NEED requires bearer session and cannot bypass dispatch authorization', async (t) => {
  const providerIdentity = createIdentity();
  const attackerIdentity = createIdentity();
  const relay = createRelay({
    localDevelopmentMode: false,
    allowedNodeIds: [providerIdentity.nodeId, attackerIdentity.nodeId]
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl, identity: providerIdentity });
  const attacker = new TruynNode({ relayUrl, identity: attackerIdentity });
  await provider.register();
  await attacker.register();
  await provider.offer('research');

  const envelope = attacker.envelope('NEED', {
    capability: { name: 'research' },
    input: { query: 'legacy bypass' },
    policy: {}
  });

  const withoutBearer = await fetch(`${relayUrl}/v1/needs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelope })
  });
  assert.equal(withoutBearer.status, 401);

  const withBearer = await fetch(`${relayUrl}/v1/needs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${attacker.sessionToken}`
    },
    body: JSON.stringify({ envelope })
  });
  assert.equal(withBearer.status, 403);

  const providerEvents = await provider.poll();
  assert.equal(providerEvents.events.length, 0, 'legacy bypass attempts must create zero provider events');
});

test('registration is enrollment-gated, freshness-checked and replay protected', async (t) => {
  const identity = createIdentity();
  const relay = createRelay({ localDevelopmentMode: false, allowedNodeIds: [identity.nodeId] });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const node = new TruynNode({ relayUrl, identity });

  const envelope = node.envelope('IDENTITY', {
    nodeId: identity.nodeId,
    algorithm: identity.algorithm,
    protocols: ['TRUYN/1'],
    name: null
  });
  const register = () => fetch(`${relayUrl}/v1/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelope })
  });

  assert.equal((await register()).status, 200);
  assert.equal((await register()).status, 409);

  const foreign = new TruynNode({ relayUrl });
  await assert.rejects(foreign.register(), (error) => error.status === 403 && error.body?.error === 'registration_denied');
});

test('relay rejects oversized request bodies before unbounded buffering', async (t) => {
  const relay = createRelay({ localDevelopmentMode: false, maxBodyBytes: 1024, allowPublicRegistration: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const response = await fetch(`${relayUrl}/v1/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ junk: 'x'.repeat(4096) })
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'request_too_large');
});
