import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';

export const CLAIM_VERSION = 1;
export const CLAIM_PROTOCOL = 'truyn-claim-v1';
export const ATTEST_PROTOCOL = 'truyn-attest-v1';
export const ATTEST_VERDICTS = Object.freeze(['support', 'contradict', 'uncertain']);

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

function requiredIdentity(identity, label) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error(`${label} identity is required`);
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error(`${label} identity key mismatch`);
  return identity;
}

function normalizeText(value, label, max = 16_384) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`);
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

function normalizeStringList(value, max = 64) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    .sort()
    .slice(0, max);
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  if (evidence.length > 64) throw new Error('attestation evidence exceeds limit');
  return evidence.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('invalid attestation evidence');
    const kind = normalizeText(item.kind || 'source', 'evidence kind', 80);
    const sourceId = normalizeText(item.sourceId, 'evidence sourceId', 512);
    const contentDigest = typeof item.contentDigest === 'string' && item.contentDigest.trim() ? item.contentDigest.trim() : null;
    const parentSourceIds = normalizeStringList(item.parentSourceIds, 32);
    return { kind, sourceId, contentDigest, parentSourceIds };
  });
}

function normalizeLineage(lineage = {}) {
  return {
    originIds: normalizeStringList(lineage.originIds, 64),
    publisherIds: normalizeStringList(lineage.publisherIds, 64),
    generatorIds: normalizeStringList(lineage.generatorIds, 64),
    parentAttestationIds: normalizeStringList(lineage.parentAttestationIds, 64)
  };
}

export function claimContentId({ domain, statement, subject = null, basis = null, qualifiers = {} }) {
  const body = {
    protocol: CLAIM_PROTOCOL,
    version: CLAIM_VERSION,
    domain: normalizeText(domain, 'claim domain', 256).toLowerCase(),
    statement: normalizeText(statement, 'claim statement'),
    subject: subject == null ? null : normalizeText(subject, 'claim subject', 2048),
    basis: basis && typeof basis === 'object' ? basis : null,
    qualifiers: qualifiers && typeof qualifiers === 'object' ? qualifiers : {}
  };
  return { claimId: `truyn:claim:${digest(body).slice('sha256:'.length)}`, body };
}

export function createClaim({ identity, domain, statement, subject = null, basis = null, qualifiers = {}, createdAt = new Date().toISOString() }) {
  const issuer = requiredIdentity(identity, 'claim issuer');
  const { claimId, body } = claimContentId({ domain, statement, subject, basis, qualifiers });
  const signed = { claimId, body, issuedBy: issuer.nodeId, createdAt };
  return {
    ...signed,
    publicKey: issuer.publicKeyPem,
    signature: signValue(signed, issuer.privateKeyPem)
  };
}

export function verifyClaim(claim) {
  try {
    if (!claim?.claimId || !claim?.body || !claim?.issuedBy || !claim?.createdAt || !claim?.publicKey || !claim?.signature) {
      return { ok: false, reason: 'claim_missing_required_field' };
    }
    if (nodeIdFromPublicKey(claim.publicKey) !== claim.issuedBy) return { ok: false, reason: 'claim_issuer_key_mismatch' };
    const expected = claimContentId(claim.body);
    if (expected.claimId !== claim.claimId || canonicalize(expected.body) !== canonicalize(claim.body)) {
      return { ok: false, reason: 'claim_content_id_mismatch' };
    }
    const signed = { claimId: claim.claimId, body: claim.body, issuedBy: claim.issuedBy, createdAt: claim.createdAt };
    return verifyValue(signed, claim.signature, claim.publicKey)
      ? { ok: true, claimId: claim.claimId }
      : { ok: false, reason: 'claim_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function createClaimFromRetrievedContext({ identity, domain, statement, subject = null, retrievalResult, qualifiers = {} }) {
  const provenance = retrievalResult?.provenance;
  if (!provenance?.verified || typeof provenance.rootCid !== 'string' || typeof provenance.queryHash !== 'string') {
    throw new Error('verified retrieval provenance is required');
  }
  const selected = Array.isArray(provenance.selected) ? provenance.selected : [];
  if (selected.length === 0) throw new Error('verified retrieval selection is required');
  const basis = {
    kind: 'distributed-context',
    rootCid: provenance.rootCid,
    queryHash: provenance.queryHash,
    provenanceDigest: digest(provenance),
    evidenceCommitments: selected.map((entry) => ({
      contentCommitment: entry.contentCommitment,
      holderReceiptDigest: entry.holderReceiptDigest
    }))
  };
  return createClaim({ identity, domain, statement, subject, basis, qualifiers });
}

export function createAttestation({
  identity,
  claim,
  verdict,
  evidence = [],
  lineage = {},
  method = 'independent-review',
  rationaleDigest = null,
  createdAt = new Date().toISOString()
}) {
  const attester = requiredIdentity(identity, 'attester');
  const claimVerification = verifyClaim(claim);
  if (!claimVerification.ok) throw new Error(`cannot attest invalid claim: ${claimVerification.reason}`);
  if (!ATTEST_VERDICTS.includes(verdict)) throw new Error('attestation verdict must be support, contradict or uncertain');
  const body = {
    protocol: ATTEST_PROTOCOL,
    version: CLAIM_VERSION,
    claimId: claim.claimId,
    verdict,
    domain: claim.body.domain,
    method: normalizeText(method, 'attestation method', 256),
    evidence: normalizeEvidence(evidence),
    lineage: normalizeLineage(lineage),
    rationaleDigest: typeof rationaleDigest === 'string' && rationaleDigest.trim() ? rationaleDigest.trim() : null
  };
  const attestationId = `truyn:attest:${digest({ ...body, attesterNodeId: attester.nodeId }).slice('sha256:'.length)}`;
  const signed = { attestationId, body, attesterNodeId: attester.nodeId, createdAt };
  return {
    ...signed,
    publicKey: attester.publicKeyPem,
    signature: signValue(signed, attester.privateKeyPem)
  };
}

export function verifyAttestation(attestation, expectedClaimId = null) {
  try {
    if (!attestation?.attestationId || !attestation?.body || !attestation?.attesterNodeId || !attestation?.createdAt || !attestation?.publicKey || !attestation?.signature) {
      return { ok: false, reason: 'attestation_missing_required_field' };
    }
    if (expectedClaimId && attestation.body.claimId !== expectedClaimId) return { ok: false, reason: 'attestation_claim_mismatch' };
    if (!ATTEST_VERDICTS.includes(attestation.body.verdict)) return { ok: false, reason: 'attestation_verdict_invalid' };
    if (nodeIdFromPublicKey(attestation.publicKey) !== attestation.attesterNodeId) return { ok: false, reason: 'attestation_attester_key_mismatch' };
    const normalizedBody = {
      protocol: ATTEST_PROTOCOL,
      version: CLAIM_VERSION,
      claimId: attestation.body.claimId,
      verdict: attestation.body.verdict,
      domain: normalizeText(attestation.body.domain, 'claim domain', 256).toLowerCase(),
      method: normalizeText(attestation.body.method, 'attestation method', 256),
      evidence: normalizeEvidence(attestation.body.evidence),
      lineage: normalizeLineage(attestation.body.lineage),
      rationaleDigest: typeof attestation.body.rationaleDigest === 'string' && attestation.body.rationaleDigest.trim() ? attestation.body.rationaleDigest.trim() : null
    };
    if (canonicalize(normalizedBody) !== canonicalize(attestation.body)) return { ok: false, reason: 'attestation_body_not_canonical' };
    const expectedId = `truyn:attest:${digest({ ...normalizedBody, attesterNodeId: attestation.attesterNodeId }).slice('sha256:'.length)}`;
    if (expectedId !== attestation.attestationId) return { ok: false, reason: 'attestation_content_id_mismatch' };
    const signed = {
      attestationId: attestation.attestationId,
      body: attestation.body,
      attesterNodeId: attestation.attesterNodeId,
      createdAt: attestation.createdAt
    };
    return verifyValue(signed, attestation.signature, attestation.publicKey)
      ? { ok: true, attestationId: attestation.attestationId }
      : { ok: false, reason: 'attestation_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function claimDigest(claim) {
  return digest({ claimId: claim?.claimId, body: claim?.body });
}
