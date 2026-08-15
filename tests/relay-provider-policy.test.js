import test from 'node:test';
import assert from 'node:assert/strict';
import {
  providerPolicyAllowsRequester,
  providerPolicyFromOffer,
  providerPolicyVisibleToRequester,
  publicProviderPolicy
} from '../core/security/relay-provider-policy.js';

function offer(from, metadata = {}) {
  return {
    from,
    payload: {
      capability: { name: 'reasoning.general' },
      metadata
    }
  };
}

test('provider ownership is bound to signed OFFER.from and ignores forged owner fields', () => {
  const policy = providerPolicyFromOffer(offer('truyn:node:provider-a', {
    ownerId: 'inn-media',
    tenantId: 'truyn-owner',
    accessMode: 'owner-only',
    allowedRequesterIds: ['truyn:node:owner-requester']
  }));

  assert.equal(policy.providerNodeId, 'truyn:node:provider-a');
  assert.equal(policy.ownerNodeId, 'truyn:node:provider-a');
  assert.equal(policy.accessMode, 'owner-only');
  assert.equal(policy.visibility, 'private');
  assert.deepEqual(policy.allowedRequesterIds, ['truyn:node:owner-requester']);
  assert.equal('tenantId' in policy, false);
});

test('missing or unknown provider access mode fails closed to owner-only', () => {
  const missing = providerPolicyFromOffer(offer('truyn:node:provider-a'));
  const unknown = providerPolicyFromOffer(offer('truyn:node:provider-b', { accessMode: 'shared-maybe' }));

  assert.equal(missing.accessMode, 'owner-only');
  assert.equal(missing.visibility, 'private');
  assert.equal(unknown.accessMode, 'owner-only');
  assert.equal(unknown.visibility, 'private');
  assert.equal(providerPolicyAllowsRequester(missing, 'truyn:node:external'), false);
});

test('owner-only provider allows only explicit or trusted requester identities', () => {
  const policy = providerPolicyFromOffer(offer('truyn:node:provider-a', {
    accessMode: 'owner-only',
    allowedRequesterIds: ['truyn:node:allowed', ' truyn:node:allowed ', null, '']
  }));

  assert.deepEqual(policy.allowedRequesterIds, ['truyn:node:allowed']);
  assert.equal(providerPolicyAllowsRequester(policy, 'truyn:node:allowed'), true);
  assert.equal(providerPolicyAllowsRequester(policy, 'truyn:node:trusted', {
    trustedRequesterNodeIds: ['truyn:node:trusted']
  }), true);
  assert.equal(providerPolicyAllowsRequester(policy, 'truyn:node:external'), false);
  assert.equal(providerPolicyVisibleToRequester(policy, 'truyn:node:external'), false);
});

test('public provider is visible and usable by any authenticated requester but exposes no allowlist', () => {
  const policy = providerPolicyFromOffer(offer('truyn:node:user-provider', {
    accessMode: 'public',
    allowedRequesterIds: ['truyn:node:should-not-matter']
  }));

  assert.equal(policy.accessMode, 'public');
  assert.equal(policy.visibility, 'network');
  assert.deepEqual(policy.allowedRequesterIds, []);
  assert.equal(providerPolicyAllowsRequester(policy, 'truyn:node:external'), true);
  assert.equal(providerPolicyVisibleToRequester(policy, 'truyn:node:external'), true);
  assert.deepEqual(publicProviderPolicy(policy), { accessMode: 'public', visibility: 'network' });
});

test('provider policy rejects an OFFER without a cryptographic sender identity', () => {
  assert.throws(() => providerPolicyFromOffer({ payload: { metadata: { accessMode: 'public' } } }), /signed provider identity/);
});
