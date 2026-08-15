import { timingSafeEqual } from 'node:crypto';

export const PROVIDER_BACKCHANNEL_HEADER = 'x-truyn-provider-backchannel-token';

function parseIds(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function createNodeBackchannelPolicy({ protectedNodeIds = [], token = null } = {}) {
  const protectedNodes = new Set(parseIds(protectedNodeIds));
  const expectedToken = String(token || '').trim();

  if (protectedNodes.size > 0 && !expectedToken) {
    throw new Error('Protected provider node IDs require a backchannel token');
  }
  if (protectedNodes.size === 0 && expectedToken) {
    throw new Error('Provider backchannel token requires protected provider node IDs');
  }

  function requiresProof(nodeId) {
    return Boolean(nodeId && protectedNodes.has(nodeId));
  }

  function authorize(nodeId, presentedToken) {
    if (!nodeId) return { ok: false, protected: false, reason: 'missing_node_identity' };
    if (!requiresProof(nodeId)) return { ok: true, protected: false };
    if (!constantTimeEqual(presentedToken, expectedToken)) {
      return { ok: false, protected: true, reason: 'provider_backchannel_denied' };
    }
    return { ok: true, protected: true };
  }

  return {
    configured: protectedNodes.size > 0,
    protectedNodeIds: [...protectedNodes],
    requiresProof,
    authorize
  };
}
