import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createSponsoredEntitlementVerifier } from '../core/security/sponsored-entitlement.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';
import { createRuntimeProviderBillingPolicy } from '../runtime/billing-config.js';

function signedEntitlement(claims, privateKey) {
  const payload = Buffer.from(JSON.stringify({ version: 1, ...claims })).toString('base64url');
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64url');
  return `${payload}.${signature}`;
}

function durableTestUsageStore() {
  const usage = new Map();
  return {
    durable: true,
    reserve({ actorId, entitlementId, day, requestLimit, tokenLimit, estimatedTokens }) {
      const key = `${actorId}:${entitlementId}:${day}`;
      const current = usage.get(key) || { requests: 0, tokens: 0 };
      if (current.requests >= requestLimit) return { ok: false, reason: 'sponsored_request_quota_exhausted' };
      if (current.tokens + estimatedTokens > tokenLimit) return { ok: false, reason: 'sponsored_token_quota_exhausted' };
      current.requests += 1;
      current.tokens += estimatedTokens;
      usage.set(key, current);
      return {
        ok: true,
        remainingRequests: requestLimit - current.requests,
        remainingTokens: tokenLimit - current.tokens
      };
    }
  };
}

function sponsoredNeed(requesterId, entitlement) {
  return {
    from: requesterId,
    payload: { policy: { billing: { entitlement } } }
  };
}

test('runtime billing defaults to private owner-funded and sponsored quota disabled', () => {
  const policy = createRuntimeProviderBillingPolicy({});
  assert.equal(policy.mode, 'owner-funded');
  assert.equal(policy.sponsoredAccess, false);
  assert.equal(policy.freeDailyRequests, 0);
  assert.equal(policy.freeDailyTokens, 0);
});

test('runtime cannot enable sponsored access without signed entitlement verification and durable quota state', () => {
  assert.throws(() => createRuntimeProviderBillingPolicy({
    TRUYN_PROVIDER_BILLING_MODE: 'sponsored',
    TRUYN_SPONSORED_ACCESS: '1',
    TRUYN_FREE_DAILY_REQUESTS: '1',
    TRUYN_FREE_DAILY_TOKENS: '100'
  }), /signed entitlement verifier/);
});

test('BYOK billing requires a private provider and an access-authorized requester', () => {
  const requesterId = 'truyn:node:requester';
  const accessPolicy = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [requesterId] });
  const billing = createProviderBillingPolicy({ mode: 'byok' });

  assert.equal(billing.authorize({ from: requesterId }, { accessPolicy }).ok, true);
  assert.equal(billing.authorize({ from: 'truyn:node:attacker' }, { accessPolicy }).ok, false);

  const publicAccess = createProviderAccessPolicy({ mode: 'public' });
  const publicDecision = billing.authorize({ from: requesterId }, { accessPolicy: publicAccess });
  assert.equal(publicDecision.ok, false);
  assert.equal(publicDecision.reason, 'byok_provider_must_be_private');
});

test('owner-funded billing refuses a public provider even when access policy is public', () => {
  const billing = createProviderBillingPolicy({ mode: 'owner-funded' });
  const publicAccess = createProviderAccessPolicy({ mode: 'public' });
  const decision = billing.authorize({ from: 'truyn:node:external' }, { accessPolicy: publicAccess });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'owner_paid_external_access_disabled');
});

test('prepaid and subscription remain disabled without an entitlement resolver', () => {
  const requesterId = 'truyn:node:requester';
  const accessPolicy = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [requesterId] });
  for (const mode of ['prepaid', 'subscription']) {
    const decision = createProviderBillingPolicy({ mode }).authorize({ from: requesterId }, { accessPolicy });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, 'entitlement_resolver_unavailable');
  }
});

test('sponsored access requires actor-bound signed entitlement plus atomic durable hard caps', () => {
  const requesterId = 'truyn:node:requester';
  const accessPolicy = createProviderAccessPolicy({ mode: 'public' });
  const disabled = createProviderBillingPolicy({ mode: 'sponsored' });
  assert.equal(disabled.authorize({ from: requesterId }, { accessPolicy, estimatedTokens: 10 }).reason, 'sponsored_access_disabled');

  assert.throws(() => createProviderBillingPolicy({
    mode: 'sponsored', sponsoredAccess: true, freeDailyRequests: 2, freeDailyTokens: 100
  }), /signed entitlement verifier/);

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const now = () => new Date('2026-08-17T00:00:00.000Z');
  const verifier = createSponsoredEntitlementVerifier({ publicKey, now });
  const store = durableTestUsageStore();
  const bounded = createProviderBillingPolicy({
    mode: 'sponsored',
    sponsoredAccess: true,
    freeDailyRequests: 2,
    freeDailyTokens: 100,
    signedEntitlementVerifier: verifier,
    sponsoredUsageStore: store,
    now
  });

  const entitlement = signedEntitlement({
    actorId: requesterId,
    entitlementId: 'ent-1',
    expiresAt: '2026-08-18T00:00:00.000Z',
    maxDailyRequests: 2,
    maxDailyTokens: 100
  }, privateKey);

  assert.equal(bounded.authorize(sponsoredNeed(requesterId, entitlement), { accessPolicy }).reason, 'sponsored_token_estimate_required');
  const first = bounded.authorize(sponsoredNeed(requesterId, entitlement), { accessPolicy, estimatedTokens: 40 });
  assert.equal(first.ok, true);
  assert.equal(first.remainingRequests, 1);
  assert.equal(first.remainingTokens, 60);
  assert.equal(bounded.authorize(sponsoredNeed(requesterId, entitlement), { accessPolicy, estimatedTokens: 70 }).reason, 'sponsored_token_quota_exhausted');
  const second = bounded.authorize(sponsoredNeed(requesterId, entitlement), { accessPolicy, estimatedTokens: 50 });
  assert.equal(second.ok, true);
  assert.equal(bounded.authorize(sponsoredNeed(requesterId, entitlement), { accessPolicy, estimatedTokens: 1 }).reason, 'sponsored_request_quota_exhausted');

  const otherActor = 'truyn:node:other';
  assert.equal(bounded.authorize(sponsoredNeed(otherActor, entitlement), {
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    estimatedTokens: 1
  }).reason, 'sponsored_entitlement_actor_mismatch');

  const tampered = `${entitlement.slice(0, -1)}${entitlement.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(bounded.authorize(sponsoredNeed(requesterId, tampered), { accessPolicy, estimatedTokens: 1 }).reason, 'sponsored_entitlement_invalid');
});

test('provider-host billing gate blocks owner-funded public execution before adapter.execute()', async (t) => {
  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  await requester.register();

  let executions = 0;
  const adapter = createFunctionAdapter({
    capabilities: ['paid.public'],
    async execute() {
      executions += 1;
      return { output: 'should-not-run' };
    }
  });
  const host = new TruynAdapterHost({
    node: providerNode,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: createProviderBillingPolicy({ mode: 'owner-funded' })
  });
  await host.publishCapabilities();

  const match = await requester.need('paid.public', { prompt: 'try spend' });
  assert.equal(match.provider, providerIdentity.nodeId);
  const handled = await host.runOnce();
  assert.equal(handled.handled, 1);
  assert.equal(executions, 0);

  const events = (await requester.poll()).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].envelope.payload.metadata.billingDenied, true);
  assert.equal(events[0].envelope.payload.metadata.billingReason, 'owner_paid_external_access_disabled');
});

test('private BYOK billing allows only the provider-authorized requester', async (t) => {
  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  await requester.register();

  let executions = 0;
  const adapter = createFunctionAdapter({
    capabilities: ['byok.private'],
    async execute() {
      executions += 1;
      return { output: 'BYOK_OK' };
    }
  });
  const accessPolicy = createProviderAccessPolicy({
    mode: 'owner-only',
    allowedRequesterIds: [requesterIdentity.nodeId]
  });
  const host = new TruynAdapterHost({
    node: providerNode,
    adapter,
    accessPolicy,
    billingPolicy: createProviderBillingPolicy({ mode: 'byok' })
  });
  await host.publishCapabilities();
  await requester.need('byok.private', { prompt: 'own provider' });
  await host.runOnce();
  assert.equal(executions, 1);

  const events = (await requester.poll()).events;
  assert.equal(events[0].envelope.payload.output, 'BYOK_OK');
  assert.equal(events[0].envelope.payload.metadata.billingMode, 'byok');
  assert.equal(events[0].envelope.payload.metadata.billingResponsibility, 'provider-owner');
});
