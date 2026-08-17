import { randomBytes, createHash } from 'node:crypto';
import { signValue, verifyValue } from '../../core/identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../../core/protocol/index.js';

export const PEER_SESSION_PROTOCOL = 'truyn-peer-session-v1';
const DEFAULT_MAX_SKEW_MS = 30_000;

const digest = (value) => createHash('sha256').update(canonicalize(value)).digest('hex');
const nonce = () => randomBytes(24).toString('base64url');

function assertIdentity(identity) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('peer identity is required');
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('peer identity key mismatch');
}

function validateTimestamp(value, now, maxSkewMs) {
  const time = Date.parse(value);
  return Number.isFinite(time) && Math.abs(now - time) <= maxSkewMs;
}

export function createSessionHello({ identity, transport = 'quic', endpoints = [], issuedAt = new Date().toISOString(), nonce: value = nonce() } = {}) {
  assertIdentity(identity);
  const body = {
    protocol: PEER_SESSION_PROTOCOL,
    kind: 'HELLO',
    nodeId: identity.nodeId,
    transport,
    endpoints: [...new Set(endpoints.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].sort(),
    nonce: value,
    issuedAt
  };
  return { ...body, publicKey: identity.publicKeyPem, signature: signValue(body, identity.privateKeyPem) };
}

export function sessionHandshakeBinding(hello) {
  if (!hello || hello.protocol !== PEER_SESSION_PROTOCOL || hello.kind !== 'HELLO' || !hello.nodeId || !hello.nonce) {
    throw new Error('session hello is required for handshake binding');
  }
  return `quic:hello:${digest({ ...hello, signature: undefined })}`;
}

export function verifySessionHello(hello, { now = Date.now(), maxSkewMs = DEFAULT_MAX_SKEW_MS, replayCache = null } = {}) {
  try {
    if (!hello || hello.protocol !== PEER_SESSION_PROTOCOL || hello.kind !== 'HELLO') return { ok: false, reason: 'session_hello_protocol' };
    if (!hello.nodeId || !hello.publicKey || !hello.signature || !hello.nonce || !hello.issuedAt) return { ok: false, reason: 'session_hello_missing' };
    if (nodeIdFromPublicKey(hello.publicKey) !== hello.nodeId) return { ok: false, reason: 'session_hello_key_mismatch' };
    if (!validateTimestamp(hello.issuedAt, now, maxSkewMs)) return { ok: false, reason: 'session_hello_stale' };
    const { publicKey, signature, ...body } = hello;
    if (!verifyValue(body, signature, publicKey)) return { ok: false, reason: 'session_hello_signature' };
    const replayKey = `${hello.nodeId}:${hello.nonce}`;
    if (replayCache?.has(replayKey)) return { ok: false, reason: 'session_hello_replay' };
    replayCache?.add(replayKey);
    return { ok: true, nodeId: hello.nodeId, publicKey: hello.publicKey, replayKey };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function createSessionAccept({ identity, hello, transportBinding, issuedAt = new Date().toISOString(), nonce: value = nonce() } = {}) {
  assertIdentity(identity);
  const verification = verifySessionHello(hello, { replayCache: null });
  if (!verification.ok) throw new Error(`invalid session hello: ${verification.reason}`);
  if (!transportBinding || typeof transportBinding !== 'string') throw new Error('transportBinding is required');
  const body = {
    protocol: PEER_SESSION_PROTOCOL,
    kind: 'ACCEPT',
    nodeId: identity.nodeId,
    peerNodeId: hello.nodeId,
    helloDigest: digest({ ...hello, signature: undefined }),
    helloNonce: hello.nonce,
    nonce: value,
    transport: hello.transport,
    transportBinding,
    issuedAt
  };
  return { ...body, publicKey: identity.publicKeyPem, signature: signValue(body, identity.privateKeyPem) };
}

export function verifySessionAccept(accept, hello, { now = Date.now(), maxSkewMs = DEFAULT_MAX_SKEW_MS, expectedTransportBinding = null } = {}) {
  try {
    if (!accept || accept.protocol !== PEER_SESSION_PROTOCOL || accept.kind !== 'ACCEPT') return { ok: false, reason: 'session_accept_protocol' };
    if (!accept.nodeId || !accept.peerNodeId || !accept.publicKey || !accept.signature) return { ok: false, reason: 'session_accept_missing' };
    if (nodeIdFromPublicKey(accept.publicKey) !== accept.nodeId) return { ok: false, reason: 'session_accept_key_mismatch' };
    if (accept.peerNodeId !== hello.nodeId || accept.helloNonce !== hello.nonce) return { ok: false, reason: 'session_accept_hello_mismatch' };
    if (accept.helloDigest !== digest({ ...hello, signature: undefined })) return { ok: false, reason: 'session_accept_digest_mismatch' };
    if (expectedTransportBinding && accept.transportBinding !== expectedTransportBinding) return { ok: false, reason: 'session_accept_transport_binding' };
    if (!validateTimestamp(accept.issuedAt, now, maxSkewMs)) return { ok: false, reason: 'session_accept_stale' };
    const { publicKey, signature, ...body } = accept;
    if (!verifyValue(body, signature, publicKey)) return { ok: false, reason: 'session_accept_signature' };
    return { ok: true, nodeId: accept.nodeId, publicKey: accept.publicKey };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function sessionId(hello, accept) {
  return `truyn:session:${digest({ helloNodeId: hello.nodeId, acceptNodeId: accept.nodeId, helloNonce: hello.nonce, acceptNonce: accept.nonce, transportBinding: accept.transportBinding })}`;
}

export class SessionReplayCache {
  constructor({ maxEntries = 10_000 } = {}) {
    this.maxEntries = maxEntries;
    this.entries = new Set();
  }
  has(value) { return this.entries.has(value); }
  add(value) {
    this.entries.add(value);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.values().next().value);
  }
}
