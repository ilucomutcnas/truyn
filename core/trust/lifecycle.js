import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';
import { verifyAttestation, verifyClaim } from '../claims/index.js';
import { assessClaimEvidence } from './claim-verification.js';

export const TRUST_LIFECYCLE_VERSION = 1;
export const LINEAGE_CERT_PROTOCOL = 'truyn-lineage-cert-v1';
export const TRUST_REVOCATION_PROTOCOL = 'truyn-trust-revoke-v1';
export const CHALLENGE_PROTOCOL = 'truyn-challenge-v1';
export const VERIFY_PROTOCOL = 'truyn-verify-v1';
export const DISPUTE_PROTOCOL = 'truyn-dispute-v1';

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
const sourceCommitment = (sourceId) => digest({ sourceId: String(sourceId).normalize('NFKC').trim() });

function requireIdentity(identity, label) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error(`${label} identity is required`);
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error(`${label} identity key mismatch`);
  return identity;
}

function iso(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid`);
  return date.toISOString();
}

function normalizeList(value, max = 64) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort().slice(0, max);
}

function signedObject({ prefix, body, identity, atField, atValue }) {
  const signer = requireIdentity(identity, prefix);
  const objectId = `truyn:${prefix}:${digest({ body, signerNodeId: signer.nodeId }).slice('sha256:'.length)}`;
  const signed = { objectId, body, signerNodeId: signer.nodeId, [atField]: iso(atValue, atField) };
  return { ...signed, publicKey: signer.publicKeyPem, signature: signValue(signed, signer.privateKeyPem) };
}

function verifySignedObject(object, { prefix, protocol, atField }) {
  try {
    if (!object?.objectId || !object?.body || !object?.signerNodeId || !object?.[atField] || !object?.publicKey || !object?.signature) {
      return { ok: false, reason: `${prefix}_missing_required_field` };
    }
    if (object.body.protocol !== protocol || object.body.version !== TRUST_LIFECYCLE_VERSION) return { ok: false, reason: `${prefix}_protocol_mismatch` };
    if (nodeIdFromPublicKey(object.publicKey) !== object.signerNodeId) return { ok: false, reason: `${prefix}_signer_key_mismatch` };
    const expectedId = `truyn:${prefix}:${digest({ body: object.body, signerNodeId: object.signerNodeId }).slice('sha256:'.length)}`;
    if (expectedId !== object.objectId) return { ok: false, reason: `${prefix}_content_id_mismatch` };
    const signed = { objectId: object.objectId, body: object.body, signerNodeId: object.signerNodeId, [atField]: object[atField] };
    return verifyValue(signed, object.signature, object.publicKey)
      ? { ok: true, objectId: object.objectId }
      : { ok: false, reason: `${prefix}_signature_invalid` };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function createLineageCertificate({
  identity,
  sourceId,
  lineage = {},
  parentCertificateIds = [],
  issuedAt = new Date().toISOString(),
  expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString()
} = {}) {
  const owner = requireIdentity(identity, 'lineage certificate');
  if (typeof sourceId !== 'string' || !sourceId.trim()) throw new Error('lineage sourceId is required');
  const issued = iso(issuedAt, 'issuedAt');
  const expires = iso(expiresAt, 'expiresAt');
  if (new Date(expires).getTime() <= new Date(issued).getTime()) throw new Error('lineage certificate expiresAt must be after issuedAt');
  const body = {
    protocol: LINEAGE_CERT_PROTOCOL,
    version: TRUST_LIFECYCLE_VERSION,
    sourceCommitment: sourceCommitment(sourceId),
    ownerNodeId: owner.nodeId,
    originCommitments: normalizeList(lineage.originIds).map(sourceCommitment),
    publisherCommitments: normalizeList(lineage.publisherIds).map(sourceCommitment),
    generatorCommitments: normalizeList(lineage.generatorIds).map(sourceCommitment),
    parentCertificateIds: normalizeList(parentCertificateIds)
  };
  const certificateId = `truyn:lineage:${digest(body).slice('sha256:'.length)}`;
  const signed = { certificateId, body, issuedAt: issued, expiresAt: expires };
  return { ...signed, publicKey: owner.publicKeyPem, signature: signValue(signed, owner.privateKeyPem) };
}

export function verifyLineageCertificate(certificate, { now = Date.now(), allowExpired = false } = {}) {
  try {
    if (!certificate?.certificateId || !certificate?.body || !certificate?.issuedAt || !certificate?.expiresAt || !certificate?.publicKey || !certificate?.signature) {
      return { ok: false, reason: 'lineage_certificate_missing_required_field' };
    }
    if (certificate.body.protocol !== LINEAGE_CERT_PROTOCOL || certificate.body.version !== TRUST_LIFECYCLE_VERSION) return { ok: false, reason: 'lineage_certificate_protocol_mismatch' };
    if (nodeIdFromPublicKey(certificate.publicKey) !== certificate.body.ownerNodeId) return { ok: false, reason: 'lineage_certificate_owner_key_mismatch' };
    const expectedId = `truyn:lineage:${digest(certificate.body).slice('sha256:'.length)}`;
    if (expectedId !== certificate.certificateId) return { ok: false, reason: 'lineage_certificate_content_id_mismatch' };
    const issued = new Date(certificate.issuedAt).getTime();
    const expires = new Date(certificate.expiresAt).getTime();
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) return { ok: false, reason: 'lineage_certificate_time_invalid' };
    if (!allowExpired && now >= expires) return { ok: false, reason: 'lineage_certificate_expired' };
    const signed = { certificateId: certificate.certificateId, body: certificate.body, issuedAt: certificate.issuedAt, expiresAt: certificate.expiresAt };
    return verifyValue(signed, certificate.signature, certificate.publicKey)
      ? { ok: true, certificateId: certificate.certificateId }
      : { ok: false, reason: 'lineage_certificate_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function createTrustRevocation({ identity, targetType, targetId, reasonDigest = null, revokedAt = new Date().toISOString() } = {}) {
  if (!['claim', 'attestation', 'lineage-certificate', 'verification'].includes(targetType)) throw new Error('trust revocation targetType is invalid');
  if (typeof targetId !== 'string' || !targetId.trim()) throw new Error('trust revocation targetId is required');
  const body = {
    protocol: TRUST_REVOCATION_PROTOCOL,
    version: TRUST_LIFECYCLE_VERSION,
    targetType,
    targetId: targetId.trim(),
    reasonDigest: typeof reasonDigest === 'string' && reasonDigest.trim() ? reasonDigest.trim() : null
  };
  return signedObject({ prefix: 'trust-revoke', body, identity, atField: 'revokedAt', atValue: revokedAt });
}

export function verifyTrustRevocation(revocation) {
  return verifySignedObject(revocation, { prefix: 'trust-revoke', protocol: TRUST_REVOCATION_PROTOCOL, atField: 'revokedAt' });
}

export function createChallenge({ identity, claim, methods = ['independent-review'], reason = 'active-verification', deadlineAt = null, createdAt = new Date().toISOString() } = {}) {
  const claimVerification = verifyClaim(claim);
  if (!claimVerification.ok) throw new Error(`cannot challenge invalid claim: ${claimVerification.reason}`);
  const body = {
    protocol: CHALLENGE_PROTOCOL,
    version: TRUST_LIFECYCLE_VERSION,
    claimId: claim.claimId,
    domain: claim.body.domain,
    methods: normalizeList(methods, 16),
    reason: String(reason || 'active-verification').normalize('NFKC').trim().slice(0, 512),
    deadlineAt: deadlineAt == null ? null : iso(deadlineAt, 'deadlineAt')
  };
  return signedObject({ prefix: 'challenge', body, identity, atField: 'createdAt', atValue: createdAt });
}

export function verifyChallenge(challenge, expectedClaimId = null) {
  const verification = verifySignedObject(challenge, { prefix: 'challenge', protocol: CHALLENGE_PROTOCOL, atField: 'createdAt' });
  if (!verification.ok) return verification;
  if (expectedClaimId && challenge.body.claimId !== expectedClaimId) return { ok: false, reason: 'challenge_claim_mismatch' };
  return verification;
}

export function createVerification({ identity, challenge, attestation, createdAt = new Date().toISOString() } = {}) {
  const challengeVerification = verifyChallenge(challenge);
  if (!challengeVerification.ok) throw new Error(`cannot verify invalid challenge: ${challengeVerification.reason}`);
  const attestationVerification = verifyAttestation(attestation, challenge.body.claimId);
  if (!attestationVerification.ok) throw new Error(`cannot use invalid attestation: ${attestationVerification.reason}`);
  const body = {
    protocol: VERIFY_PROTOCOL,
    version: TRUST_LIFECYCLE_VERSION,
    challengeId: challenge.objectId,
    claimId: challenge.body.claimId,
    attestationId: attestation.attestationId,
    verdict: attestation.body.verdict
  };
  return signedObject({ prefix: 'verify', body, identity, atField: 'createdAt', atValue: createdAt });
}

export function verifyVerification(verification, expectedChallengeId = null) {
  const result = verifySignedObject(verification, { prefix: 'verify', protocol: VERIFY_PROTOCOL, atField: 'createdAt' });
  if (!result.ok) return result;
  if (expectedChallengeId && verification.body.challengeId !== expectedChallengeId) return { ok: false, reason: 'verification_challenge_mismatch' };
  return result;
}

export function createDispute({ identity, claim, targetAttestationIds = [], groundsDigest, evidenceCommitments = [], createdAt = new Date().toISOString() } = {}) {
  const claimVerification = verifyClaim(claim);
  if (!claimVerification.ok) throw new Error(`cannot dispute invalid claim: ${claimVerification.reason}`);
  if (typeof groundsDigest !== 'string' || !groundsDigest.trim()) throw new Error('dispute groundsDigest is required');
  const body = {
    protocol: DISPUTE_PROTOCOL,
    version: TRUST_LIFECYCLE_VERSION,
    claimId: claim.claimId,
    targetAttestationIds: normalizeList(targetAttestationIds),
    groundsDigest: groundsDigest.trim(),
    evidenceCommitments: normalizeList(evidenceCommitments)
  };
  return signedObject({ prefix: 'dispute', body, identity, atField: 'createdAt', atValue: createdAt });
}

export function verifyDispute(dispute, expectedClaimId = null) {
  const verification = verifySignedObject(dispute, { prefix: 'dispute', protocol: DISPUTE_PROTOCOL, atField: 'createdAt' });
  if (!verification.ok) return verification;
  if (expectedClaimId && dispute.body.claimId !== expectedClaimId) return { ok: false, reason: 'dispute_claim_mismatch' };
  return verification;
}

function isRevoked(targetType, targetId, revocations) {
  for (const revocation of revocations || []) {
    const verification = verifyTrustRevocation(revocation);
    if (!verification.ok) continue;
    if (revocation.body.targetType === targetType && revocation.body.targetId === targetId) return true;
  }
  return false;
}

function certifiedLineage(attestation, certificates, revocations, now) {
  const certBySourceCommitment = new Map();
  for (const certificate of certificates || []) {
    const verification = verifyLineageCertificate(certificate, { now });
    if (!verification.ok || isRevoked('lineage-certificate', certificate.certificateId, revocations)) continue;
    certBySourceCommitment.set(certificate.body.sourceCommitment, certificate);
  }
  const originIds = [];
  const publisherIds = [];
  const generatorIds = [];
  let certifiedEvidence = 0;
  for (const evidence of attestation.body.evidence || []) {
    const certificate = certBySourceCommitment.get(sourceCommitment(evidence.sourceId));
    if (!certificate) continue;
    certifiedEvidence += 1;
    originIds.push(...certificate.body.originCommitments);
    publisherIds.push(...certificate.body.publisherCommitments);
    generatorIds.push(...certificate.body.generatorCommitments);
  }
  return {
    certifiedEvidence,
    lineage: {
      originIds: normalizeList(originIds),
      publisherIds: normalizeList(publisherIds),
      generatorIds: normalizeList(generatorIds),
      parentAttestationIds: normalizeList(attestation.body.lineage?.parentAttestationIds)
    }
  };
}

export function assessActiveTrust({
  claim,
  attestations = [],
  lineageCertificates = [],
  revocations = [],
  disputes = [],
  retrievalProvenance = null,
  policy = {},
  now = Date.now(),
  maxAttestationAgeMs = 24 * 60 * 60_000
} = {}) {
  const claimVerification = verifyClaim(claim);
  if (!claimVerification.ok) throw new Error(`invalid claim: ${claimVerification.reason}`);
  if (isRevoked('claim', claim.claimId, revocations)) {
    return {
      protocol: 'truyn-active-trust-assessment-v1',
      version: 1,
      claimId: claim.claimId,
      lifecycleStatus: 'revoked',
      activeAttestations: 0,
      staleAttestations: 0,
      revokedAttestations: attestations.length,
      truthAssessment: { status: 'revoked', reason: 'claim_revoked', calibratedTruthProbability: null }
    };
  }

  const active = [];
  let staleAttestations = 0;
  let revokedAttestations = 0;
  let uncertifiedAttestations = 0;
  for (const attestation of attestations) {
    const verification = verifyAttestation(attestation, claim.claimId);
    if (!verification.ok) continue;
    if (isRevoked('attestation', attestation.attestationId, revocations)) {
      revokedAttestations += 1;
      continue;
    }
    const created = new Date(attestation.createdAt).getTime();
    if (!Number.isFinite(created) || now - created > maxAttestationAgeMs) {
      staleAttestations += 1;
      continue;
    }
    const certified = certifiedLineage(attestation, lineageCertificates, revocations, now);
    if (certified.certifiedEvidence === 0) {
      uncertifiedAttestations += 1;
      continue;
    }
    active.push({
      ...structuredClone(attestation),
      body: { ...structuredClone(attestation.body), lineage: certified.lineage }
    });
  }

  const base = assessClaimEvidence({ claim, attestations: active, retrievalProvenance, policy });
  const validDisputes = (disputes || []).filter((dispute) => verifyDispute(dispute, claim.claimId).ok);
  let lifecycleStatus = base.truthAssessment.status;
  let truthAssessment = base.truthAssessment;
  if (validDisputes.length > 0 && lifecycleStatus !== 'retrieval_unverified') {
    lifecycleStatus = 'disputed';
    truthAssessment = { ...truthAssessment, status: 'disputed', reason: 'active_dispute_present' };
  } else if (active.length === 0 && (staleAttestations > 0 || uncertifiedAttestations > 0)) {
    lifecycleStatus = 'stale_or_uncertified';
    truthAssessment = { ...truthAssessment, status: 'stale_or_uncertified', reason: 'no_fresh_certified_attestations' };
  }
  return {
    protocol: 'truyn-active-trust-assessment-v1',
    version: 1,
    claimId: claim.claimId,
    lifecycleStatus,
    retrievalIntegrity: base.retrievalIntegrity,
    truthAssessment,
    activeAttestations: active.length,
    staleAttestations,
    revokedAttestations,
    uncertifiedAttestations,
    activeDisputes: validDisputes.length,
    provenanceGraphDigest: base.provenanceGraphDigest
  };
}
