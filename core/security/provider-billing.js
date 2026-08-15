const SUPPORTED_MODES = new Set(['byok', 'owner-funded', 'sponsored', 'prepaid', 'subscription']);

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createProviderBillingPolicy({
  mode = 'owner-funded',
  sponsoredAccess = false,
  freeDailyRequests = 0,
  freeDailyTokens = 0,
  now = () => new Date()
} = {}) {
  const normalizedMode = String(mode).trim().toLowerCase();
  if (!SUPPORTED_MODES.has(normalizedMode)) throw new Error(`Unsupported provider billing mode: ${mode}`);

  const requestLimit = nonNegativeInteger(freeDailyRequests);
  const tokenLimit = nonNegativeInteger(freeDailyTokens);
  const usage = new Map();

  function usageFor(requesterId) {
    const day = utcDayKey(now());
    const current = usage.get(requesterId);
    if (!current || current.day !== day) {
      const fresh = { day, requests: 0, tokens: 0 };
      usage.set(requesterId, fresh);
      return fresh;
    }
    return current;
  }

  function authorize(need, { accessPolicy, estimatedTokens = null } = {}) {
    const requesterId = need?.from || null;
    if (!requesterId) return { ok: false, mode: normalizedMode, reason: 'missing_requester_identity' };
    if (!accessPolicy || typeof accessPolicy.authorize !== 'function') {
      return { ok: false, mode: normalizedMode, reason: 'missing_access_policy' };
    }
    const access = accessPolicy.authorize(need);
    if (!access?.ok) return { ok: false, mode: normalizedMode, reason: 'provider_access_denied' };

    if (normalizedMode === 'byok') {
      if (accessPolicy.mode !== 'owner-only') {
        return { ok: false, mode: normalizedMode, reason: 'byok_provider_must_be_private' };
      }
      return {
        ok: true,
        mode: normalizedMode,
        requesterId,
        billingResponsibility: 'provider-owner'
      };
    }

    if (normalizedMode === 'owner-funded') {
      if (accessPolicy.mode !== 'owner-only') {
        return { ok: false, mode: normalizedMode, reason: 'owner_paid_external_access_disabled' };
      }
      return {
        ok: true,
        mode: normalizedMode,
        requesterId,
        billingResponsibility: 'provider-owner'
      };
    }

    if (normalizedMode === 'prepaid' || normalizedMode === 'subscription') {
      return { ok: false, mode: normalizedMode, reason: 'entitlement_resolver_unavailable' };
    }

    if (!sponsoredAccess) return { ok: false, mode: normalizedMode, reason: 'sponsored_access_disabled' };
    if (requestLimit <= 0 || tokenLimit <= 0) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_quota_zero' };
    }
    if (!Number.isInteger(estimatedTokens) || estimatedTokens <= 0) {
      return { ok: false, mode: normalizedMode, reason: 'sponsored_token_estimate_required' };
    }

    const current = usageFor(requesterId);
    if (current.requests >= requestLimit) return { ok: false, mode: normalizedMode, reason: 'sponsored_request_quota_exhausted' };
    if (current.tokens + estimatedTokens > tokenLimit) return { ok: false, mode: normalizedMode, reason: 'sponsored_token_quota_exhausted' };

    current.requests += 1;
    current.tokens += estimatedTokens;
    return {
      ok: true,
      mode: normalizedMode,
      requesterId,
      billingResponsibility: 'provider-owner-sponsored',
      reservedTokens: estimatedTokens,
      remainingRequests: requestLimit - current.requests,
      remainingTokens: tokenLimit - current.tokens
    };
  }

  return {
    mode: normalizedMode,
    sponsoredAccess: Boolean(sponsoredAccess),
    freeDailyRequests: requestLimit,
    freeDailyTokens: tokenLimit,
    authorize
  };
}
