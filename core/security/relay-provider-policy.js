function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function normalizedAccessMode(value) {
  return String(value || 'owner-only').trim().toLowerCase() === 'public' ? 'public' : 'owner-only';
}

export function providerPolicyFromOffer(envelope) {
  const providerNodeId = envelope?.from;
  if (typeof providerNodeId !== 'string' || providerNodeId.length === 0) {
    throw new Error('Provider OFFER requires a signed provider identity');
  }

  const metadata = envelope?.payload?.metadata && typeof envelope.payload.metadata === 'object'
    ? envelope.payload.metadata
    : {};
  const accessMode = normalizedAccessMode(metadata.accessMode);

  return Object.freeze({
    providerNodeId,
    ownerNodeId: providerNodeId,
    accessMode,
    visibility: accessMode === 'public' ? 'network' : 'private',
    allowedRequesterIds: accessMode === 'owner-only' ? normalizeIds(metadata.allowedRequesterIds) : []
  });
}

export function providerPolicyAllowsRequester(policy, requesterNodeId, { trustedRequesterNodeIds = [] } = {}) {
  if (!policy || typeof requesterNodeId !== 'string' || requesterNodeId.length === 0) return false;
  if (policy.accessMode === 'public') return true;
  if (policy.accessMode !== 'owner-only') return false;

  const allowed = new Set(normalizeIds(policy.allowedRequesterIds));
  const trusted = new Set(normalizeIds(trustedRequesterNodeIds));
  return allowed.has(requesterNodeId) || trusted.has(requesterNodeId);
}

export function providerPolicyVisibleToRequester(policy, requesterNodeId, options = {}) {
  return providerPolicyAllowsRequester(policy, requesterNodeId, options);
}

export function publicProviderPolicy(policy) {
  if (!policy) return null;
  return {
    accessMode: policy.accessMode,
    visibility: policy.visibility
  };
}
