import { createHash, randomUUID, sign as cryptoSign, verify as cryptoVerify, createPublicKey } from 'node:crypto';

export const PROTOCOL = 'TRUYN/1';
export const MVP_TYPES = Object.freeze(['IDENTITY', 'OFFER', 'NEED', 'RESULT', 'REVOKE']);

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])])
    );
  }
  return value;
}

export function canonicalize(value) {
  return JSON.stringify(normalize(value));
}

export function publicKeyFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}

export function nodeIdFromPublicKey(publicKeyPem) {
  return `truyn:node:${publicKeyFingerprint(publicKeyPem)}`;
}

export function unsignedEnvelope(envelope) {
  const { signature, ...unsigned } = envelope;
  return unsigned;
}

export function createEnvelope({ type, from, payload, privateKeyPem, publicKeyPem, to = null, id = randomUUID(), createdAt = new Date().toISOString() }) {
  if (!MVP_TYPES.includes(type)) {
    throw new Error(`Unsupported MVP message type: ${type}`);
  }
  if (!from || !payload || !privateKeyPem || !publicKeyPem) {
    throw new Error('from, payload, privateKeyPem and publicKeyPem are required');
  }

  const expectedNodeId = nodeIdFromPublicKey(publicKeyPem);
  if (expectedNodeId !== from) {
    throw new Error('Sender node ID does not match the supplied public key');
  }

  const unsigned = {
    protocol: PROTOCOL,
    type,
    id,
    from,
    to,
    createdAt,
    publicKey: publicKeyPem,
    payload
  };

  const signature = cryptoSign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64');
  return { ...unsigned, signature };
}

export function verifyEnvelope(envelope, { allowedTypes = MVP_TYPES } = {}) {
  if (!envelope || envelope.protocol !== PROTOCOL) {
    return { ok: false, reason: 'unsupported_protocol' };
  }
  if (!allowedTypes.includes(envelope.type)) {
    return { ok: false, reason: 'unsupported_type' };
  }
  if (!envelope.id || !envelope.from || !envelope.createdAt || !envelope.publicKey || !envelope.payload || !envelope.signature) {
    return { ok: false, reason: 'missing_required_field' };
  }
  if (nodeIdFromPublicKey(envelope.publicKey) !== envelope.from) {
    return { ok: false, reason: 'node_id_key_mismatch' };
  }

  const unsigned = unsignedEnvelope(envelope);
  const ok = cryptoVerify(
    null,
    Buffer.from(canonicalize(unsigned)),
    envelope.publicKey,
    Buffer.from(envelope.signature, 'base64')
  );

  return ok ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}
