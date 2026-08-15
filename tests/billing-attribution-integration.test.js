import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';

async function createNodes(t) {
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  await requester.register();
  return { providerIdentity, requesterIdentity, providerNode, requester };
}

test('successful BYOK execution emits attribution bound to requester and cryptographic provider identity', async (t) => {
  const { providerIdentity, requesterIdentity, providerNode, requester } = await createNodes(t);
  const accessPolicy = createProviderAccessPolicy({
    mode: 'owner-only',
    allowedRequesterIds: [requesterIdentity.nodeId]
  });
  const host = new TruynAdapterHost({
    node: providerNode,
    accessPolicy,
    billingPolicy: createProviderBillingPolicy({ mode: 'byok' }),
    adapter: createFunctionAdapter({
      capabilities: ['billing.attribution'],
      async execute() {
        return {
          output: 'ATTRIBUTED',
          metadata: {
            inputTokens: 12,
            outputTokens: 3,
            requestId: 'provider-request-1',
            apiKey: 'must-not-enter-receipt'
          }
        };
      }
    })
  });

  await host.publishCapabilities();
  const match = await requester.need('billing.attribution', { prompt: 'own provider' });
  assert.equal(match.provider, providerIdentity.nodeId);
  await host.runOnce();

  const events = (await requester.poll()).events;
  assert.equal(events.length, 1);
  const metadata = events[0].envelope.payload.metadata;
  const receipt = metadata.billingAttribution;
  assert.equal(receipt.requesterId, requesterIdentity.nodeId);
  assert.equal(receipt.providerId, providerIdentity.nodeId);
  assert.equal(receipt.providerOwnerId, providerIdentity.nodeId);
  assert.equal(receipt.billingMode, 'byok');
  assert.equal(receipt.billingResponsibility, 'provider-owner');
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.usage.totalTokens, 15);
  assert.equal(receipt.providerRequestId, 'provider-request-1');
  assert.equal(JSON.stringify(receipt).includes('must-not-enter-receipt'), false);
});

test('provider failure emits failed attribution without losing payer identity', async (t) => {
  const { providerIdentity, requesterIdentity, providerNode, requester } = await createNodes(t);
  const host = new TruynAdapterHost({
    node: providerNode,
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [requesterIdentity.nodeId]
    }),
    billingPolicy: createProviderBillingPolicy({ mode: 'byok' }),
    adapter: createFunctionAdapter({
      capabilities: ['billing.failure'],
      async execute() {
        throw new Error('provider failed');
      }
    })
  });

  await host.publishCapabilities();
  await requester.need('billing.failure', { prompt: 'fail' });
  await host.runOnce();

  const events = (await requester.poll()).events;
  const metadata = events[0].envelope.payload.metadata;
  assert.equal(metadata.failed, true);
  assert.equal(metadata.billingAttribution.status, 'failed');
  assert.equal(metadata.billingAttribution.requesterId, requesterIdentity.nodeId);
  assert.equal(metadata.billingAttribution.providerOwnerId, providerIdentity.nodeId);
});

test('billing-denied request never receives a success attribution receipt and never executes adapter', async (t) => {
  const { requesterIdentity, providerNode, requester } = await createNodes(t);
  let executions = 0;
  const host = new TruynAdapterHost({
    node: providerNode,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: createProviderBillingPolicy({ mode: 'owner-funded' }),
    adapter: createFunctionAdapter({
      capabilities: ['billing.denied'],
      async execute() {
        executions += 1;
        return { output: 'must-not-run' };
      }
    })
  });

  await host.publishCapabilities();
  await requester.need('billing.denied', { prompt: 'try owner funds' });
  await host.runOnce();

  assert.equal(executions, 0);
  const events = (await requester.poll()).events;
  assert.equal(events[0].envelope.payload.metadata.billingDenied, true);
  assert.equal(events[0].envelope.payload.metadata.billingAttribution, undefined);
  assert.equal(events[0].envelope.payload.metadata.billingMode, 'owner-funded');
  assert.equal(requesterIdentity.nodeId.length > 0, true);
});
