import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('public dispatch routes only to authorized provider offers while owner providers stay hidden', async (t) => {
  const ownerProviderIdentity = createIdentity();
  const publicProviderIdentity = createIdentity();
  const trustedOwnerIdentity = createIdentity();
  const externalIdentity = createIdentity();

  const relay = createRelay({
    localDevelopmentMode: false,
    allowPublicRegistration: true,
    allowPublicDispatch: true,
    trustedRequesterNodeIds: [trustedOwnerIdentity.nodeId]
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const ownerProvider = new TruynNode({ relayUrl, identity: ownerProviderIdentity });
  const publicProvider = new TruynNode({ relayUrl, identity: publicProviderIdentity });
  const trustedOwner = new TruynNode({ relayUrl, identity: trustedOwnerIdentity });
  const external = new TruynNode({ relayUrl, identity: externalIdentity });

  await ownerProvider.register();
  await publicProvider.register();
  await trustedOwner.register();
  await external.register();

  const ownerOffer = await ownerProvider.offer('owner.private', {
    accessMode: 'owner-only',
    ownerId: externalIdentity.nodeId,
    tenantId: 'forged-tenant'
  });
  await publicProvider.offer('network.public', {
    accessMode: 'public',
    ownerId: 'forged-owner'
  });

  const storedOwnerPolicy = relay.state.offers.get(ownerOffer.offerId)?.policy;
  assert.equal(storedOwnerPolicy.ownerNodeId, ownerProviderIdentity.nodeId, 'relay must bind provider ownership to signed OFFER.from');
  assert.equal(storedOwnerPolicy.accessMode, 'owner-only');

  const hiddenOwner = await external.find('owner.private');
  assert.deepEqual(hiddenOwner.offers, [], 'external requester must not discover owner-only provider');

  const visiblePublic = await external.find('network.public');
  assert.equal(visiblePublic.offers.length, 1);
  assert.equal(visiblePublic.offers[0].from, publicProviderIdentity.nodeId);

  await assert.rejects(
    external.need('owner.private', { query: 'try owner spend' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
  assert.equal((await ownerProvider.poll()).events.length, 0, 'unauthorized owner-provider dispatch must create zero provider events');

  const publicMatch = await external.need('network.public', { query: 'use public provider' });
  assert.equal(publicMatch.provider, publicProviderIdentity.nodeId);
  const publicEvents = await publicProvider.poll();
  assert.equal(publicEvents.events.length, 1);

  const trustedDiscovery = await trustedOwner.find('owner.private');
  assert.equal(trustedDiscovery.offers.length, 1);
  const trustedMatch = await trustedOwner.need('owner.private', { query: 'authorized owner task' });
  assert.equal(trustedMatch.provider, ownerProviderIdentity.nodeId);
  assert.equal((await ownerProvider.poll()).events.length, 1);
});

test('fast and websocket chain paths use the same provider authorization filter', async (t) => {
  const publicProviderIdentity = createIdentity();
  const ownerProviderIdentity = createIdentity();
  const externalIdentity = createIdentity();

  const relay = createRelay({
    localDevelopmentMode: false,
    allowPublicRegistration: true,
    allowPublicDispatch: true
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const publicProvider = new TruynNode({ relayUrl, identity: publicProviderIdentity });
  const ownerProvider = new TruynNode({ relayUrl, identity: ownerProviderIdentity });
  const external = new TruynNode({ relayUrl, identity: externalIdentity });

  await publicProvider.register();
  await ownerProvider.register();
  await external.register();
  await publicProvider.offer('fast.public', { accessMode: 'public' });
  await ownerProvider.offer('fast.owner', { accessMode: 'owner-only' });

  const fastPublic = await external.compactNeed('fast.public', { q: 'ok' }, {}, { waitMs: 0 });
  assert.equal(fastPublic.provider, publicProviderIdentity.nodeId);

  await assert.rejects(
    external.compactNeed('fast.owner', { q: 'deny' }, {}, { waitMs: 0 }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
  assert.equal((await ownerProvider.pollCompact({ waitMs: 0 })).events.length, 0);

  await external.ensureFastSocket();
  await assert.rejects(
    external.compactChain([
      { capability: 'fast.public', input: 'stage one' },
      { capability: 'fast.owner', inputTemplate: { $previous: 'output' } }
    ], { waitMs: 2000 }),
    /no_matching_provider/
  );
  assert.equal((await ownerProvider.pollCompact({ waitMs: 0 })).events.length, 0, 'WebSocket chain preflight must not dispatch owner-only provider');
});

test('public dispatch remains disabled unless relay explicitly opts in', async (t) => {
  const providerIdentity = createIdentity();
  const externalIdentity = createIdentity();
  const relay = createRelay({
    localDevelopmentMode: false,
    allowPublicRegistration: true
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl, identity: providerIdentity });
  const external = new TruynNode({ relayUrl, identity: externalIdentity });
  await provider.register();
  await external.register();
  await provider.offer('network.public', { accessMode: 'public' });

  await assert.rejects(
    external.need('network.public', { query: 'must stay closed' }),
    (error) => error.status === 403 && error.body?.error === 'provider_access_denied'
  );
  assert.equal((await provider.poll()).events.length, 0);
});
