import { createHash, randomBytes, randomUUID, sign as cryptoSign, verify as cryptoVerify, createPublicKey } from 'node:crypto';

export const PROTOCOL = 'TRUYN/1';
export const MVP_TYPES = Object.freeze(['IDENTITY', 'OFFER', 'NEED', 'RESULT', 'REVOKE']);
export const COMPACT_TYPES = Object.freeze(['NEED', 'RESULT', 'CHAIN']);

const COMPACT_TYPE_CODES = Object.freeze({ NEED: 'N', RESULT: 'R', CHAIN: 'C' });
const COMPACT_CODE_TYPES = Object.freeze({ N: 'NEED', R: 'RESULT', C: 'CHAIN' });

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

export function compactRequestId() {
  return randomBytes(12).toString('base64url');
}

export function compactStageRequestId(chainId, stageIndex) {
  if (!chainId || typeof chainId !== 'string') throw new Error('chainId is required');
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex > 35) throw new Error('stageIndex must be an integer between 0 and 35');
  return `${chainId.slice(0, 15)}${stageIndex.toString(36)}`;
}

export function compactType(frame) {
  return COMPACT_CODE_TYPES[frame?.t] || null;
}

function compactSigningValue(type, id, payload) {
  const code = COMPACT_TYPE_CODES[type];
  if (!code) throw new Error(`Unsupported compact message type: ${type}`);
  return [code, id, payload];
}

export function createCompactFrame({ type, payload, privateKeyPem, id = compactRequestId() }) {
  if (!COMPACT_TYPES.includes(type)) throw new Error(`Unsupported compact message type: ${type}`);
  if (!id || typeof id !== 'string' || !payload || !privateKeyPem) {
    throw new Error('id, payload and privateKeyPem are required for compact frames');
  }

  const code = COMPACT_TYPE_CODES[type];
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalize(compactSigningValue(type, id, payload))),
    privateKeyPem
  ).toString('base64url');

  return { t: code, i: id, s: signature };
}

export function verifyCompactFrame(frame, payload, publicKeyPem, { allowedTypes = COMPACT_TYPES } = {}) {
  if (!frame || !frame.t || !frame.i || !frame.s || !payload || !publicKeyPem) {
    return { ok: false, reason: 'missing_required_field' };
  }
  const type = compactType(frame);
  if (!type || !allowedTypes.includes(type)) return { ok: false, reason: 'unsupported_type' };

  let signature;
  try {
    signature = Buffer.from(frame.s, 'base64url');
  } catch {
    return { ok: false, reason: 'invalid_signature_encoding' };
  }
  if (signature.length !== 64) return { ok: false, reason: 'invalid_signature_encoding' };

  const ok = cryptoVerify(
    null,
    Buffer.from(canonicalize(compactSigningValue(type, frame.i, payload))),
    publicKeyPem,
    signature
  );
  return ok ? { ok: true, type } : { ok: false, reason: 'invalid_signature' };
}

export function compactFrameBytes(frame) {
  return Buffer.byteLength(JSON.stringify(frame));
}
