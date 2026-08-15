import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';
import { createRuntimeProviderBillingPolicy } from '../runtime/billing-config.js';

test('runtime billing binds OWNER_AI_DAILY_REQUEST_LIMIT to owner-funded policy', () => {
  const policy = createRuntimeProviderBillingPolicy({
    TRUYN_PROVIDER_BILLING_MODE: 'owner-funded',
    OWNER_AI_DAILY_REQUEST_LIMIT: '7'
  });
  assert.equal(policy.mode, 'owner-funded');
  assert.equal(policy.ownerDailyRequestLimit, 7);
});

test('owner-funded daily request budget is per requester and resets on UTC day boundary', () => {
  let current = new Date('2026-08-16T10:00:00Z');
  const policy = createProviderBillingPolicy({
    mode: 'owner-funded',
    ownerDailyRequestLimit: 2,
    now: () => current
  });
  const requester = 'truyn:node:owner-requester';
  const other = 'truyn:node:other-owner-requester';
  const accessPolicy = createProviderAccessPolicy({
    mode: 'owner-only',
    allowedRequesterIds: [requester, other]
  });

  const first = policy.authorize({ from: requester }, { accessPolicy });
  assert.equal(first.ok, true);
  assert.equal(first.remainingOwnerRequests, 1);
  const second = policy.authorize({ from: requester }, { accessPolicy });
  assert.equal(second.ok, true);
  assert.equal(second.remainingOwnerRequests, 0);
  assert.equal(policy.authorize({ from: requester }, { accessPolicy }).reason, 'owner_request_quota_exhausted');

  assert.equal(policy.authorize({ from: other }, { accessPolicy }).ok, true, 'another authorized requester has its own budget');

  current = new Date('2026-08-17T00:00:01Z');
  const reset = policy.authorize({ from: requester }, { accessPolicy });
  assert.equal(reset.ok, true);
  assert.equal(reset.remainingOwnerRequests, 1);
});

test('owner-funded zero request budget denies before adapter.execute()', async (t) => {
  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  await requester.register();

  let executions = 0;
  const host = new TruynAdapterHost({
    node: providerNode,
    adapter: createFunctionAdapter({
      capabilities: ['owner.budget.zero'],
      async execute() {
        executions += 1;
        return { output: 'should-not-run' };
      }
    }),
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [requesterIdentity.nodeId]
    }),
    billingPolicy: createProviderBillingPolicy({
      mode: 'owner-funded',
      ownerDailyRequestLimit: 0
    })
  });
  await host.publishCapabilities();

  await requester.need('owner.budget.zero', { prompt: 'try spend' });
  await host.runOnce();
  assert.equal(executions, 0);
  const event = (await requester.poll()).events[0];
  assert.equal(event.envelope.payload.metadata.billingDenied, true);
  assert.equal(event.envelope.payload.metadata.billingReason, 'owner_request_quota_zero');
});

test('owner-funded budget exhaustion prevents additional adapter executions', async (t) => {
  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  await requester.register();

  let executions = 0;
  const host = new TruynAdapterHost({
    node: providerNode,
    adapter: createFunctionAdapter({
      capabilities: ['owner.budget.one'],
      async execute() {
        executions += 1;
        return { output: `ok-${executions}` };
      }
    }),
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: [requesterIdentity.nodeId]
    }),
    billingPolicy: createProviderBillingPolicy({
      mode: 'owner-funded',
      ownerDailyRequestLimit: 1
    })
  });
  await host.publishCapabilities();

  await requester.need('owner.budget.one', { prompt: 'first' });
  await host.runOnce();
  let event = (await requester.poll()).events[0];
  assert.equal(event.envelope.payload.output, 'ok-1');
  assert.equal(executions, 1);

  await requester.need('owner.budget.one', { prompt: 'second' });
  await host.runOnce();
  event = (await requester.poll()).events[0];
  assert.equal(event.envelope.payload.metadata.billingDenied, true);
  assert.equal(event.envelope.payload.metadata.billingReason, 'owner_request_quota_exhausted');
  assert.equal(executions, 1, 'exhausted owner budget must prevent another adapter execution');
});
