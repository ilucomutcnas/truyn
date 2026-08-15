function parseIds(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function createProviderAccessPolicy({
  mode = process.env.TRUYN_PROVIDER_ACCESS_MODE || 'owner-only',
  allowedRequesterIds = process.env.TRUYN_ALLOWED_REQUESTER_IDS || ''
} = {}) {
  const normalizedMode = String(mode).trim().toLowerCase();
  const allowed = new Set(parseIds(allowedRequesterIds));

  if (!['owner-only', 'public'].includes(normalizedMode)) {
    throw new Error('Unsupported provider access mode');
  }

  return {
    mode: normalizedMode,
    authorize(need) {
      const requesterId = need?.from || null;
      if (!requesterId) return { ok: false, mode: normalizedMode, reason: 'missing_requester_identity' };
      if (normalizedMode === 'public') return { ok: true, mode: normalizedMode, requesterId };
      if (allowed.size === 0) return { ok: false, mode: normalizedMode, reason: 'no_allowed_requesters' };
      if (!allowed.has(requesterId)) return { ok: false, mode: normalizedMode, reason: 'requester_not_allowed' };
      return { ok: true, mode: normalizedMode, requesterId };
    }
  };
}
