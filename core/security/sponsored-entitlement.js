import { verify } from 'node:crypto';

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function decodeBase64UrlCanonical(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  let decoded;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    return null;
  }
  if (decoded.length === 0 || decoded.toString('base64url') !== value) return null;
  return decoded;
}

export function createSponsoredEntitlementVerifier({ publicKey, now = () => new Date() } = {}) {
  if (!publicKey) throw new Error('sponsored entitlement public key is required');

  return function verifySponsoredEntitlement(token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 16_384) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    const payloadBytes = decodeBase64UrlCanonical(parts[0]);
    const signature = decodeBase64UrlCanonical(parts[1]);
    if (!payloadBytes || !signature) return null;

    let valid = false;
    try {
      valid = verify(null, Buffer.from(parts[0], 'utf8'), publicKey, signature);
    } catch {
      return null;
    }
    if (!valid) return null;

    let claims;
    try {
      claims = JSON.parse(payloadBytes.toString('utf8'));
    } catch {
      return null;
    }

    const actorId = typeof claims?.actorId === 'string' ? claims.actorId.trim() : '';
    const entitlementId = typeof claims?.entitlementId === 'string' ? claims.entitlementId.trim() : '';
    const expiresAtMs = Date.parse(claims?.expiresAt || '');
    const maxDailyRequests = positiveInteger(claims?.maxDailyRequests);
    const maxDailyTokens = positiveInteger(claims?.maxDailyTokens);
    if (claims?.version !== 1 || !actorId || !entitlementId || !Number.isFinite(expiresAtMs)) return null;
    if (expiresAtMs <= now().getTime() || !maxDailyRequests || !maxDailyTokens) return null;

    return {
      version: 1,
      actorId,
      entitlementId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      maxDailyRequests,
      maxDailyTokens
    };
  };
}
