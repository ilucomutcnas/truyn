const VISIBILITIES = new Set(['private', 'self', 'shared', 'network']);
const BILLING_MODES = new Set(['byok', 'owner-funded', 'prepaid', 'subscription', 'sponsored']);

function normalizeStringSet(value) {
  if (!value) return new Set();
  if (value instanceof Set) return new Set([...value].map((item) => String(item).trim()).filter(Boolean));
  if (Array.isArray(value)) return new Set(value.map((item) => String(item).trim()).filter(Boolean));
  return new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean));
}

function normalizeMap(value) {
  if (!value) return new Map();
  if (value instanceof Map) return new Map(value);
  return new Map(Object.entries(value));
}

function assertEnum(name, value, allowed) {
  if (!allowed.has(value)) throw new Error(`Unsupported ${name}: ${value}`);
}

function trustedPolicy(providerNodeId, tenantId, raw = {}) {
  const visibility = String(raw.visibility || 'private').trim().toLowerCase();
  const billingMode = String(raw.billingMode || 'owner-funded').trim().toLowerCase();
  assertEnum('provider visibility', visibility, VISIBILITIES);
  assertEnum('provider billing mode', billingMode, BILLING_MODES);

  return Object.freeze({
    providerId: providerNodeId,
    ownerId: String(raw.ownerId || providerNodeId),
    tenantId: String(raw.tenantId || tenantId),
    visibility,
    billingMode,
    allowedCallerIds: normalizeStringSet(raw.allowedCallerIds),
    allowedTenantIds: normalizeStringSet(raw.allowedTenantIds),
    allowCrossTenant: raw.allowCrossTenant === true,
    allowOwnerFundedExternal: raw.allowOwnerFundedExternal === true,
    source: 'trusted'
  });
}

function derivedPolicy(providerNodeId, tenantId) {
  return Object.freeze({
    providerId: providerNodeId,
    ownerId: providerNodeId,
    tenantId,
    visibility: 'self',
    billingMode: 'byok',
    allowedCallerIds: new Set(),
    allowedTenantIds: new Set(),
    allowCrossTenant: false,
    allowOwnerFundedExternal: false,
    source: 'derived'
  });
}

export function createProviderOwnershipRegistry({ tenantBindings = {}, providerPolicies = {} } = {}) {
  const tenantByNode = normalizeMap(tenantBindings);
  const trustedByProvider = normalizeMap(providerPolicies);

  function tenantForNode(nodeId) {
    if (!nodeId) return null;
    return String(tenantByNode.get(nodeId) || nodeId);
  }

  function requesterContext(nodeId) {
    if (!nodeId) return null;
    return Object.freeze({
      nodeId: String(nodeId),
      tenantId: tenantForNode(nodeId)
    });
  }

  function resolveProviderPolicy(envelope) {
    const providerNodeId = envelope?.from ? String(envelope.from) : null;
    if (!providerNodeId) throw new Error('Provider OFFER requires an authenticated provider identity');

    const tenantId = tenantForNode(providerNodeId);
    const configured = trustedByProvider.get(providerNodeId);
    if (!configured) return derivedPolicy(providerNodeId, tenantId);

    return trustedPolicy(providerNodeId, tenantId, configured);
  }

  function authorizeProvider({ requesterNodeId, providerPolicy }) {
    const requester = requesterContext(requesterNodeId);
    if (!requester || !providerPolicy) {
      return Object.freeze({ ok: false, reason: 'provider_policy_unresolved' });
    }

    if (requester.tenantId === providerPolicy.tenantId) {
      return Object.freeze({ ok: true, reason: 'same_tenant' });
    }

    if (providerPolicy.billingMode === 'owner-funded' && !providerPolicy.allowOwnerFundedExternal) {
      return Object.freeze({ ok: false, reason: 'owner_funded_external_disabled' });
    }

    if (!providerPolicy.allowCrossTenant) {
      return Object.freeze({ ok: false, reason: 'cross_tenant_disabled' });
    }

    if (providerPolicy.allowedCallerIds.has(requester.nodeId)) {
      return Object.freeze({ ok: true, reason: 'explicit_caller_grant' });
    }

    if (providerPolicy.allowedTenantIds.has(requester.tenantId)) {
      return Object.freeze({ ok: true, reason: 'explicit_tenant_grant' });
    }

    if (providerPolicy.visibility === 'network' && providerPolicy.source === 'trusted') {
      return Object.freeze({ ok: true, reason: 'trusted_network_provider' });
    }

    return Object.freeze({ ok: false, reason: 'provider_not_authorized' });
  }

  function canDiscoverProvider(input) {
    return authorizeProvider(input);
  }

  return Object.freeze({
    tenantForNode,
    requesterContext,
    resolveProviderPolicy,
    authorizeProvider,
    canDiscoverProvider
  });
}
