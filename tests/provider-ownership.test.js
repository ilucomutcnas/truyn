import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderOwnershipRegistry } from '../core/security/provider-ownership.js';

test('unprovisioned provider is derived as self-scoped BYOK regardless of requester payload metadata', () => {
  const registry = createProviderOwnershipRegistry();
  const policy = registry.resolveProviderPolicy({
    from: 'truyn:node:user-provider',
    payload: {
      metadata: {
        ownerId: 'inn-media',
        tenantId: 'truyn-owner',
        visibility: 'network',
        billingMode: 'owner-funded'
      }
    }
  });

  assert.equal(policy.providerId, 'truyn:node:user-provider');
  assert.equal(policy.ownerId, 'truyn:node:user-provider');
  assert.equal(policy.tenantId, 'truyn:node:user-provider');
  assert.equal(policy.visibility, 'self');
  assert.equal(policy.billingMode, 'byok');
  assert.equal(policy.source, 'derived');
});

test('same authoritative tenant can use its own BYOK provider', () => {
  const registry = createProviderOwnershipRegistry({
    tenantBindings: {
      'truyn:node:user-requester': 'tenant:user-1',
      'truyn:node:user-provider': 'tenant:user-1'
    }
  });
  const policy = registry.resolveProviderPolicy({ from: 'truyn:node:user-provider' });
  const decision = registry.authorizeProvider({
    requesterNodeId: 'truyn:node:user-requester',
    providerPolicy: policy
  });

  assert.equal(decision.ok, true);
  assert.equal(decision.reason, 'same_tenant');
});

test('foreign requester cannot use a self-scoped BYOK provider', () => {
  const registry = createProviderOwnershipRegistry();
  const policy = registry.resolveProviderPolicy({ from: 'truyn:node:user-provider' });
  const decision = registry.authorizeProvider({
    requesterNodeId: 'truyn:node:attacker',
    providerPolicy: policy
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'cross_tenant_disabled');
});

test('owner-funded provider denies cross-tenant calls even when a caller is listed unless external funding is explicitly enabled', () => {
  const registry = createProviderOwnershipRegistry({
    tenantBindings: {
      'truyn:node:owner-provider': 'tenant:owner',
      'truyn:node:external': 'tenant:external'
    },
    providerPolicies: {
      'truyn:node:owner-provider': {
        ownerId: 'owner',
        tenantId: 'tenant:owner',
        visibility: 'shared',
        billingMode: 'owner-funded',
        allowedCallerIds: ['truyn:node:external'],
        allowCrossTenant: true
      }
    }
  });
  const policy = registry.resolveProviderPolicy({ from: 'truyn:node:owner-provider' });
  const decision = registry.authorizeProvider({
    requesterNodeId: 'truyn:node:external',
    providerPolicy: policy
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'owner_funded_external_disabled');
});

test('trusted private owner provider remains invisible and unusable to foreign tenant', () => {
  const registry = createProviderOwnershipRegistry({
    tenantBindings: {
      'truyn:node:owner-requester': 'tenant:owner',
      'truyn:node:owner-provider': 'tenant:owner',
      'truyn:node:foreign': 'tenant:foreign'
    },
    providerPolicies: {
      'truyn:node:owner-provider': {
        ownerId: 'owner',
        tenantId: 'tenant:owner',
        visibility: 'private',
        billingMode: 'owner-funded'
      }
    }
  });
  const policy = registry.resolveProviderPolicy({ from: 'truyn:node:owner-provider' });

  assert.equal(registry.authorizeProvider({ requesterNodeId: 'truyn:node:owner-requester', providerPolicy: policy }).ok, true);
  assert.equal(registry.authorizeProvider({ requesterNodeId: 'truyn:node:foreign', providerPolicy: policy }).ok, false);
  assert.equal(registry.canDiscoverProvider({ requesterNodeId: 'truyn:node:foreign', providerPolicy: policy }).ok, false);
});

test('cross-tenant sharing requires trusted server policy plus explicit cross-tenant enablement', () => {
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
        allowedTenantIds: ['tenant:customer'],
        allowCrossTenant: true
      }
    }
  });
  const policy = registry.resolveProviderPolicy({ from: 'truyn:node:provider' });
  const decision = registry.authorizeProvider({ requesterNodeId: 'truyn:node:customer', providerPolicy: policy });

  assert.equal(policy.source, 'trusted');
  assert.equal(decision.ok, true);
  assert.equal(decision.reason, 'explicit_tenant_grant');
});

test('network visibility is powerless unless it comes from trusted provisioning and cross-tenant use is explicitly enabled', () => {
  const derivedRegistry = createProviderOwnershipRegistry();
  const derived = derivedRegistry.resolveProviderPolicy({
    from: 'truyn:node:provider',
    payload: { metadata: { visibility: 'network', allowCrossTenant: true } }
  });
  assert.equal(derived.visibility, 'self');
  assert.equal(derivedRegistry.authorizeProvider({ requesterNodeId: 'truyn:node:foreign', providerPolicy: derived }).ok, false);

  const trustedRegistry = createProviderOwnershipRegistry({
    providerPolicies: {
      'truyn:node:provider': {
        visibility: 'network',
        billingMode: 'subscription',
        allowCrossTenant: true
      }
    }
  });
  const trusted = trustedRegistry.resolveProviderPolicy({ from: 'truyn:node:provider' });
  const decision = trustedRegistry.authorizeProvider({ requesterNodeId: 'truyn:node:foreign', providerPolicy: trusted });
  assert.equal(decision.ok, true);
  assert.equal(decision.reason, 'trusted_network_provider');
});
