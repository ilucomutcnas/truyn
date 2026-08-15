import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';

test('BYOK-style private provider is reachable only by its provider-signed requester allowlist', async (t) => {
  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const attackerIdentity = createIdentity();

  const relay = createRelay({
    localDevelopmentMode: false,
    allowPublicRegistration: true,
    allowPublicDispatch: true
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  const attacker = new TruynNode({ relayUrl, identity: attackerIdentity });

  await requester.register();
  await attacker.register();

  let providerExecutions = 0;
  const adapter = createFunctionAdapter({
    name: 'byok-test-provider',
    capabilities: ['reasoning.private'],
    async execute({ input }) {
      providerExecutions += 1;
      return { output: `private:${input.question}` };
    }
  });
  const accessPolicy = createProviderAccessPolicy({
    mode: 'owner-only',
    allowedRequesterIds: [requesterIdentity.nodeId]
  });
  const host = new TruynAdapterHost({ node: providerNode, adapter, accessPolicy });
  await host.publishCapabilities();

  const storedOffer = [...relay.state.offers.values()].find((offer) => offer.envelope.from === providerIdentity.nodeId);
  assert.ok(storedOffer);
  assert.deepEqual(storedOffer.policy.allowedRequesterIds, [requesterIdentity.nodeId]);
  assert.equal(storedOffer.policy.ownerNodeId, providerIdentity.nodeId);

  assert.deepEqual((await attacker.find('reasoning.private')).offers, []);
  await assert.rejects(
    attacker.need('reasoning.private', { question: 'steal credits' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
  assert.equal(providerExecutions, 0);
  assert.equal((await providerNode.poll()).events.length, 0, 'attacker must create zero provider events');

  const discovery = await requester.find('reasoning.private');
  assert.equal(discovery.offers.length, 1);
  assert.equal(discovery.offers[0].from, providerIdentity.nodeId);

  const matched = await requester.need('reasoning.private', { question: 'hello' });
  assert.equal(matched.provider, providerIdentity.nodeId);
  const handled = await host.runOnce();
  assert.equal(handled.handled, 1);
  assert.equal(providerExecutions, 1);

  const resultEvents = (await requester.poll()).events;
  assert.equal(resultEvents.length, 1);
  assert.equal(resultEvents[0].kind, 'RESULT');
  assert.equal(resultEvents[0].envelope.payload.output, 'private:hello');
});
