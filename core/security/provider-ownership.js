const VISIBILITIES = new Set(['private', 'self', 'shared', 'network']);
const BILLING_MODES = new Set(['byok', 'owner-funded', 'prepaid', 'subscription', 'sponsored']);

function normalizeStringList(value) {
  const values = value instanceof Set
    ? [...value]
    : Array.isArray(value)
      ? value
      : value
        ? String(value).split(',')
        : [];
  return Object.freeze([...new Set(values.map((item) => String(item).trim()).filter(Boolean))]);
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
    allowedCallerIds: normalizeStringList(raw.allowedCallerIds),
    allowedTenantIds: normalizeStringList(raw.allowedTenantIds),
    allowCrossTenant: raw.allowCrossTenant === true,
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
    allowedCallerIds: Object.freeze([]),
    allowedTenantIds: Object.freeze([]),
    allowCrossTenant: false,
    source: 'derived'
  });
}

export function createProviderOwnershipRegistry({
  tenantBindings = {},
  providerPolicies = {},
  sponsoredAccessEnabled = false
} = {}) {
  const tenantByNode = normalizeMap(tenantBindings);
  const rawPolicies = normalizeMap(providerPolicies);
  const trustedByProvider = new Map();

  function tenantForNode(nodeId) {
    if (!nodeId) return null;
    return String(tenantByNode.get(nodeId) || nodeId);
  }

  for (const [providerNodeId, raw] of rawPolicies.entries()) {
    trustedByProvider.set(String(providerNodeId), trustedPolicy(String(providerNodeId), tenantForNode(providerNodeId), raw));
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
    return trustedByProvider.get(providerNodeId) || derivedPolicy(providerNodeId, tenantForNode(providerNodeId));
  }

  function authorizeProvider({ requesterNodeId, providerPolicy }) {
    const requester = requesterContext(requesterNodeId);
    if (!requester || !providerPolicy) {
      return Object.freeze({ ok: false, reason: 'provider_policy_unresolved' });
    }

    if (requester.tenantId === providerPolicy.tenantId) {
      return Object.freeze({ ok: true, reason: 'same_tenant' });
    }

    if (providerPolicy.billingMode === 'byok') {
      return Object.freeze({ ok: false, reason: 'byok_cross_tenant_forbidden' });
    }

    if (providerPolicy.billingMode === 'owner-funded') {
      return Object.freeze({ ok: false, reason: 'owner_funded_external_disabled' });
    }

    if (providerPolicy.billingMode === 'sponsored' && !sponsoredAccessEnabled) {
      return Object.freeze({ ok: false, reason: 'sponsored_access_disabled' });
    }

    if (!providerPolicy.allowCrossTenant) {
      return Object.freeze({ ok: false, reason: 'cross_tenant_disabled' });
    }

    if (providerPolicy.allowedCallerIds.includes(requester.nodeId)) {
      return Object.freeze({ ok: true, reason: 'explicit_caller_grant' });
    }

    if (providerPolicy.allowedTenantIds.includes(requester.tenantId)) {
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
