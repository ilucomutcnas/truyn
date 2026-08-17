import { createHash } from 'node:crypto';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { signValue, verifyValue } from '../../core/identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../../core/protocol/index.js';
import { authorityChainDigest, verifyDelegationCertificate, verifySourceOwnerCertificate } from '../../core/trust/source-owner-pki.js';
import { readJsonStream, requestJson, writeJsonStream } from '../transport/json-stream.js';

export const VERIFIER_DISCOVERY_VERSION = 2;
export const VERIFIER_DISCOVERY_PROTOCOL = '/truyn/verifier-record/2.0.0';
const RECORD_PROTOCOL = 'truyn-verifier-record-v2';
const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
const normalizedDomain = (domain) => {
  if (typeof domain !== 'string' || !domain.trim()) throw new Error('verifier domain is required');
  return domain.normalize('NFKC').trim().toLowerCase();
};

export async function verifierDiscoveryCid(domain) {
  const key = new TextEncoder().encode(`truyn:verifier:${normalizedDomain(domain)}`);
  return CID.createV1(raw.code, await sha256.digest(key));
}

export function createSignedVerifierRecord({
  identity,
  libp2pPeerId,
  multiaddrs = [],
  domain,
  methods = ['independent-review'],
  ownerCertificate,
  delegation,
  issuedAt = new Date().toISOString(),
  expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
} = {}) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem || nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('verifier identity is invalid');
  const ownerCheck = verifySourceOwnerCertificate(ownerCertificate);
  if (!ownerCheck.ok) throw new Error(`source owner certificate invalid: ${ownerCheck.reason}`);
  const delegationCheck = verifyDelegationCertificate(delegation, ownerCertificate, { requiredScope: 'trust.verify' });
  if (!delegationCheck.ok || delegation.body.delegateNodeId !== identity.nodeId) throw new Error(`verifier delegation invalid: ${delegationCheck.reason || 'delegate mismatch'}`);
  const body = {
    protocol: RECORD_PROTOCOL,
    version: VERIFIER_DISCOVERY_VERSION,
    domain: normalizedDomain(domain),
    verifierNodeId: identity.nodeId,
    libp2pPeerId: String(libp2pPeerId),
    multiaddrs: [...new Set(multiaddrs.map(String))].sort(),
    methods: [...new Set(methods.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort(),
    sourceOwnerId: ownerCertificate.body.sourceOwnerId,
    rootCertificateId: ownerCertificate.certificateId,
    delegationId: delegation.delegationId,
    authorityChainDigest: authorityChainDigest(ownerCertificate, delegation)
  };
  const recordId = `truyn:verifier-record:${digest(body).slice(7)}`;
  const signed = { recordId, body, issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() };
  return {
    ...signed,
    publicKey: identity.publicKeyPem,
    ownerCertificate,
    delegation,
    signature: signValue(signed, identity.privateKeyPem)
  };
}

export function verifySignedVerifierRecord(record, { expectedDomain = null, expectedPeerId = null, now = Date.now(), revocationState = null } = {}) {
  try {
    if (!record?.recordId || !record?.body || !record?.publicKey || !record?.ownerCertificate || !record?.delegation || !record?.signature) return { ok: false, reason: 'verifier_record_missing_field' };
    if (record.body.protocol !== RECORD_PROTOCOL || record.body.version !== VERIFIER_DISCOVERY_VERSION) return { ok: false, reason: 'verifier_record_protocol_mismatch' };
    if (expectedDomain && record.body.domain !== normalizedDomain(expectedDomain)) return { ok: false, reason: 'verifier_record_domain_mismatch' };
    if (expectedPeerId && record.body.libp2pPeerId !== String(expectedPeerId)) return { ok: false, reason: 'verifier_record_peer_mismatch' };
    if (nodeIdFromPublicKey(record.publicKey) !== record.body.verifierNodeId) return { ok: false, reason: 'verifier_record_key_mismatch' };
    if (record.recordId !== `truyn:verifier-record:${digest(record.body).slice(7)}`) return { ok: false, reason: 'verifier_record_content_id_mismatch' };
    if (record.body.authorityChainDigest !== authorityChainDigest(record.ownerCertificate, record.delegation)) return { ok: false, reason: 'verifier_record_authority_digest_mismatch' };
    const ownerCheck = verifySourceOwnerCertificate(record.ownerCertificate, { now });
    if (!ownerCheck.ok) return { ok: false, reason: ownerCheck.reason };
    const delegationCheck = verifyDelegationCertificate(record.delegation, record.ownerCertificate, { now, requiredScope: 'trust.verify' });
    if (!delegationCheck.ok || delegationCheck.delegateNodeId !== record.body.verifierNodeId) return { ok: false, reason: delegationCheck.reason || 'verifier_record_delegate_mismatch' };
    const issued = new Date(record.issuedAt).getTime();
    const expires = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || now >= expires) return { ok: false, reason: 'verifier_record_expired_or_invalid' };
    if (revocationState?.relevant?.some((item) => item.targetId === record.delegation.delegationId && item.revoked)) return { ok: false, reason: 'verifier_delegation_revoked' };
    const signed = { recordId: record.recordId, body: record.body, issuedAt: record.issuedAt, expiresAt: record.expiresAt };
    return verifyValue(signed, record.signature, record.publicKey)
      ? { ok: true, verifierNodeId: record.body.verifierNodeId, sourceOwnerId: record.body.sourceOwnerId, delegationId: record.body.delegationId }
      : { ok: false, reason: 'verifier_record_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export class DecentralizedVerifierDiscovery {
  constructor({ node, identity, domain, ownerCertificate, delegation, methods = ['independent-review'], recordTtlMs = 10 * 60_000, routingTimeoutMs = 5_000 } = {}) {
    if (!node) throw new Error('libp2p node is required');
    this.node = node;
    this.identity = identity;
    this.domain = normalizedDomain(domain);
    this.ownerCertificate = ownerCertificate;
    this.delegation = delegation;
    this.methods = methods;
    this.recordTtlMs = recordTtlMs;
    this.routingTimeoutMs = routingTimeoutMs;
    this.record = null;
    this.started = false;
  }

  async publish() {
    if (!this.started) {
      await this.node.handle(VERIFIER_DISCOVERY_PROTOCOL, async (stream) => {
        const request = await readJsonStream(stream, { maxBytes: 16_384 });
        if (request?.type !== 'GET_VERIFIER_RECORD' || normalizedDomain(request.domain) !== this.domain) {
          await writeJsonStream(stream, { ok: false, error: 'verifier_record_not_found' });
          return;
        }
        await writeJsonStream(stream, { ok: true, record: this.record });
      });
      this.started = true;
    }
    this.record = createSignedVerifierRecord({
      identity: this.identity,
      libp2pPeerId: this.node.peerId,
      multiaddrs: this.node.getMultiaddrs().map(String),
      domain: this.domain,
      methods: this.methods,
      ownerCertificate: this.ownerCertificate,
      delegation: this.delegation,
      expiresAt: new Date(Date.now() + this.recordTtlMs).toISOString()
    });
    await this.node.contentRouting.provide(await verifierDiscoveryCid(this.domain), { signal: AbortSignal.timeout(this.routingTimeoutMs) });
    return structuredClone(this.record);
  }
}

export async function discoverVerifiers(node, domain, {
  limit = 8,
  timeoutMs = 5_000,
  revocationState = null,
  candidateLimit = Math.max(limit * 2, limit + 2),
  perPeerTimeoutMs = Math.max(500, Math.min(1_500, Math.floor(timeoutMs / 2)))
} = {}) {
  const cid = await verifierDiscoveryCid(domain);
  const selfPeerId = node.peerId.toString();
  const candidates = [];
  const seen = new Set();
  const collectionTimeoutMs = Math.max(500, Math.min(timeoutMs, Math.floor(timeoutMs * 0.6)));

  try {
    for await (const provider of node.contentRouting.findProviders(cid, { signal: AbortSignal.timeout(collectionTimeoutMs) })) {
      const peerId = provider.id.toString();
      if (seen.has(peerId) || peerId === selfPeerId) continue;
      seen.add(peerId);
      candidates.push(provider);
      if (candidates.length >= candidateLimit) break;
    }
  } catch (error) {
    if (error?.name !== 'AbortError' && error?.name !== 'TimeoutError') throw error;
  }

  const verified = await Promise.all(candidates.map(async (provider) => {
    const peerId = provider.id.toString();
    try {
      const response = await requestJson(
        node,
        provider.id,
        VERIFIER_DISCOVERY_PROTOCOL,
        { type: 'GET_VERIFIER_RECORD', domain: normalizedDomain(domain) },
        { timeoutMs: perPeerTimeoutMs, maxBytes: 256_000 }
      );
      if (!response?.ok || !response.record) return null;
      const check = verifySignedVerifierRecord(response.record, { expectedDomain: domain, expectedPeerId: peerId, revocationState });
      return check.ok ? { peerId, record: response.record, verification: check } : null;
    } catch {
      return null;
    }
  }));

  const latestByVerifier = new Map();
  for (const entry of verified) {
    if (!entry) continue;
    const verifierNodeId = entry.record.body.verifierNodeId;
    const previous = latestByVerifier.get(verifierNodeId);
    if (!previous || new Date(entry.record.issuedAt).getTime() > new Date(previous.record.issuedAt).getTime()) {
      latestByVerifier.set(verifierNodeId, entry);
    }
  }

  return [...latestByVerifier.values()]
    .sort((a, b) => new Date(b.record.issuedAt).getTime() - new Date(a.record.issuedAt).getTime())
    .slice(0, limit);
}
