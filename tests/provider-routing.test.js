import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderOwnershipRegistry } from '../core/security/provider-ownership.js';
import { filterAuthorizedOffers, selectAuthorizedOffer } from '../network/relay/provider-routing.js';

function offer(id, from, capability = 'reasoning.general', metadata = {}) {
  return {
    id,
    envelope: {
      type: 'OFFER',
      from,
      payload: {
        capability: { name: capability },
        metadata
      }
    }
  };
}

test('capability match never overrides provider ownership', () => {
  const registry = createProviderOwnershipRegistry({
    tenantBindings: {
      'truyn:node:owner-provider': 'tenant:owner',
      'truyn:node:foreign': 'tenant:foreign'
    },
    providerPolicies: {
      'truyn:node:owner-provider': {
        tenantId: 'tenant:owner',
        visibility: 'private',
        billingMode: 'owner-funded'
      }
    }
  });

  const result = filterAuthorizedOffers({
    offers: [offer('offer-owner', 'truyn:node:owner-provider')],
    requesterNodeId: 'truyn:node:foreign',
    capability: 'reasoning.general',
    ownershipRegistry: registry
  });

  assert.deepEqual(result, []);
});

test('requester sees provider from its authoritative tenant', () => {
  const registry = createProviderOwnershipRegistry({
    tenantBindings: {
      'truyn:node:user-requester': 'tenant:user',
      'truyn:node:user-provider': 'tenant:user'
    }
  });

  const result = filterAuthorizedOffers({
    offers: [
      offer('offer-mine', 'truyn:node:user-provider'),
      offer('offer-other', 'truyn:node:other-provider')
    ],
    requesterNodeId: 'truyn:node:user-requester',
    capability: 'reasoning.general',
    ownershipRegistry: registry
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'offer-mine');
  assert.equal(result[0].authorization.reason, 'same_tenant');
});

test('requester-supplied network and owner metadata cannot make a foreign provider routable', () => {
  const registry = createProviderOwnershipRegistry();
  const malicious = offer('offer-malicious', 'truyn:node:provider', 'reasoning.general', {
    ownerId: 'truyn:node:foreign',
    tenantId: 'truyn:node:foreign',
    visibility: 'network',
    billingMode: 'subscription',
    allowCrossTenant: true
  });

  const result = filterAuthorizedOffers({
    offers: [malicious],
    requesterNodeId: 'truyn:node:foreign',
    capability: 'reasoning.general',
    ownershipRegistry: registry
  });

  assert.deepEqual(result, []);
});

test('explicit trusted prepaid tenant grant can become routable', () => {
  const registry = createProviderOwnershipRegistry({
    tenantBindings: {
      'truyn:node:provider': 'tenant:provider',
      'truyn:node:customer': 'tenant:customer'
    },
    providerPolicies: {
      'truyn:node:provider': {
        tenantId: 'tenant:provider',
        visibility: 'shared',
        billingMode: 'prepaid',
        allowCrossTenant: true,
        allowedTenantIds: ['tenant:customer']
      }
    }
  });

  const selected = selectAuthorizedOffer({
    offers: [offer('offer-prepaid', 'truyn:node:provider')],
    requesterNodeId: 'truyn:node:customer',
    capability: 'reasoning.general',
    ownershipRegistry: registry
  });

  assert.equal(selected.id, 'offer-prepaid');
  assert.equal(selected.authorization.reason, 'explicit_tenant_grant');
});

test('wrong capability remains excluded even for an authorized tenant', () => {
  const registry = createProviderOwnershipRegistry({
    tenantBindings: {
      'truyn:node:user-requester': 'tenant:user',
      'truyn:node:user-provider': 'tenant:user'
    }
  });

  const result = filterAuthorizedOffers({
    offers: [offer('offer-image', 'truyn:node:user-provider', 'media.image.generate')],
    requesterNodeId: 'truyn:node:user-requester',
    capability: 'reasoning.general',
    ownershipRegistry: registry
  });

  assert.deepEqual(result, []);
});
