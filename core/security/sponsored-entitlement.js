import crypto from 'node:crypto';

function decodeBase64UrlCanonical(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError('invalid_base64url');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new TypeError('non_canonical_base64url');
  }
  return decoded;
}

function decodeJson(value) {
  return JSON.parse(decodeBase64UrlCanonical(value).toString('utf8'));
}

export function createSponsoredEntitlementIssuer({ issuerId, identity, lifetimeMs = 300_000 } = {}) {
  if (!issuerId || !identity?.sign) throw new TypeError('issuerId and identity are required');
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) throw new TypeError('lifetimeMs must be positive');
  return {
    issue({ providerId, requesterId, actorType, model, maxRequests = 1, maxTokens = 0, now = Date.now() } = {}) {
      if (!providerId || !requesterId || !actorType || !model) throw new TypeError('providerId, requesterId, actorType and model are required');
      const payload = {
        v: 1,
        iss: issuerId,
        providerId,
        requesterId,
        actorType,
        model,
        maxRequests,
        maxTokens,
        iat: now,
        exp: now + lifetimeMs,
        nonce: crypto.randomBytes(16).toString('base64url')
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const signature = identity.sign(Buffer.from(encoded, 'utf8'));
      return `${encoded}.${signature.toString('base64url')}`;
    }
  };
}

export function createSponsoredEntitlementVerifier({ issuerId, publicKey } = {}) {
  if (!issuerId || !publicKey) throw new TypeError('issuerId and publicKey are required');
  const verifier = crypto.createPublicKey(publicKey);
  return ({ token, providerId, requesterId, actorType, model, now = Date.now() } = {}) => {
    if (typeof token !== 'string') return null;
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra !== undefined) return null;
    let payload;
    let signatureBytes;
    try {
      payload = decodeJson(encoded);
      signatureBytes = decodeBase64UrlCanonical(signature);
    } catch {
      return null;
    }
    const ok = verifier.verify(Buffer.from(encoded, 'utf8'), signatureBytes);
    if (!ok) return null;
    if (payload.v !== 1 || payload.iss !== issuerId) return null;
    if (payload.providerId !== providerId || payload.requesterId !== requesterId) return null;
    if (payload.actorType !== actorType || payload.model !== model) return null;
    if (!Number.isInteger(payload.maxRequests) || payload.maxRequests < 0) return null;
    if (!Number.isInteger(payload.maxTokens) || payload.maxTokens < 0) return null;
    if (!Number.isFinite(payload.exp) || now >= payload.exp) return null;
    return payload;
  };
}
