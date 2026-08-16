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
export const sourceLineageCommitment = (sourceId) => digest({ sourceId: String(sourceId).normalize('NFKC').trim() });

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

function list(value, max = 64) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort().slice(0, max);
}

function signObject({ prefix, protocol, identity, body, atField, atValue }) {
  const signer = requireIdentity(identity, prefix);
  const normalized = { protocol, version: TRUST_LIFECYCLE_VERSION, ...body };
  const objectId = `truyn:${prefix}:${digest({ body: normalized, signerNodeId: signer.nodeId }).slice('sha256:'.length)}`;
  const signed = { objectId, body: normalized, signerNodeId: signer.nodeId, [atField]: iso(atValue, atField) };
  return { ...signed, publicKey: signer.publicKeyPem, signature: signValue(signed, signer.privateKeyPem) };
}

function verifyObject(object, { prefix, protocol, atField }) {
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
    sourceCommitment: sourceLineageCommitment(sourceId),
    ownerNodeId: owner.nodeId,
    originCommitments: list(lineage.originIds).map(sourceLineageCommitment),
    publisherCommitments: list(lineage.publisherIds).map(sourceLineageCommitment),
    generatorCommitments: list(lineage.generatorIds).map(sourceLineageCommitment),
    parentCertificateIds: list(parentCertificateIds)
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
  return signObject({
    prefix: 'trust-revoke',
    protocol: TRUST_REVOCATION_PROTOCOL,
    identity,
    body: { targetType, targetId: targetId.trim(), reasonDigest: typeof reasonDigest === 'string' && reasonDigest.trim() ? reasonDigest.trim() : null },
    atField: 'revokedAt',
    atValue: revokedAt
  });
}

export function verifyTrustRevocation(revocation) {
  return verifyObject(revocation, { prefix: 'trust-revoke', protocol: TRUST_REVOCATION_PROTOCOL, atField: 'revokedAt' });
}

export function createChallenge({ identity, claim, methods = ['independent-review'], reason = 'active-verification', deadlineAt = null, createdAt = new Date().toISOString() } = {}) {
  const verification = verifyClaim(claim);
  if (!verification.ok) throw new Error(`cannot challenge invalid claim: ${verification.reason}`);
  return signObject({
    prefix: 'challenge', protocol: CHALLENGE_PROTOCOL, identity,
    body: {
      claimId: claim.claimId,
      domain: claim.body.domain,
      methods: list(methods, 16),
      reason: String(reason || 'active-verification').normalize('NFKC').trim().slice(0, 512),
      deadlineAt: deadlineAt == null ? null : iso(deadlineAt, 'deadlineAt')
    },
    atField: 'createdAt', atValue: createdAt
  });
}

export function verifyChallenge(challenge, expectedClaimId = null) {
  const verification = verifyObject(challenge, { prefix: 'challenge', protocol: CHALLENGE_PROTOCOL, atField: 'createdAt' });
  if (!verification.ok) return verification;
  if (expectedClaimId && challenge.body.claimId !== expectedClaimId) return { ok: false, reason: 'challenge_claim_mismatch' };
  return verification;
}

export function createVerification({ identity, challenge, attestation, createdAt = new Date().toISOString() } = {}) {
  const challengeVerification = verifyChallenge(challenge);
  if (!challengeVerification.ok) throw new Error(`cannot verify invalid challenge: ${challengeVerification.reason}`);
  const attestationVerification = verifyAttestation(attestation, challenge.body.claimId);
  if (!attestationVerification.ok) throw new Error(`cannot use invalid attestation: ${attestationVerification.reason}`);
  if (identity?.nodeId !== attestation.attesterNodeId) throw new Error('verification signer must be the attestation signer');
  return signObject({
    prefix: 'verify', protocol: VERIFY_PROTOCOL, identity,
    body: { challengeId: challenge.objectId, claimId: challenge.body.claimId, attestationId: attestation.attestationId, verdict: attestation.body.verdict },
    atField: 'createdAt', atValue: createdAt
  });
}

export function verifyVerification(verification, expectedChallengeId = null) {
  const result = verifyObject(verification, { prefix: 'verify', protocol: VERIFY_PROTOCOL, atField: 'createdAt' });
  if (!result.ok) return result;
  if (expectedChallengeId && verification.body.challengeId !== expectedChallengeId) return { ok: false, reason: 'verification_challenge_mismatch' };
  return result;
}

export function createDispute({ identity, claim, targetAttestationIds = [], groundsDigest, evidenceCommitments = [], createdAt = new Date().toISOString() } = {}) {
  const verification = verifyClaim(claim);
  if (!verification.ok) throw new Error(`cannot dispute invalid claim: ${verification.reason}`);
  if (typeof groundsDigest !== 'string' || !groundsDigest.trim()) throw new Error('dispute groundsDigest is required');
  return signObject({
    prefix: 'dispute', protocol: DISPUTE_PROTOCOL, identity,
    body: { claimId: claim.claimId, targetAttestationIds: list(targetAttestationIds), groundsDigest: groundsDigest.trim(), evidenceCommitments: list(evidenceCommitments) },
    atField: 'createdAt', atValue: createdAt
  });
}

export function verifyDispute(dispute, expectedClaimId = null) {
  const verification = verifyObject(dispute, { prefix: 'dispute', protocol: DISPUTE_PROTOCOL, atField: 'createdAt' });
  if (!verification.ok) return verification;
  if (expectedClaimId && dispute.body.claimId !== expectedClaimId) return { ok: false, reason: 'dispute_claim_mismatch' };
  return verification;
}

function validRevocations(revocations) {
  return (revocations || []).filter((item) => verifyTrustRevocation(item).ok);
}

function revokedByIssuer(targetType, targetId, issuerNodeId, revocations) {
  return validRevocations(revocations).some((item) => item.body.targetType === targetType && item.body.targetId === targetId && item.signerNodeId === issuerNodeId);
}

function certificateIndex(certificates, revocations, now) {
  const map = new Map();
  for (const certificate of certificates || []) {
    if (!verifyLineageCertificate(certificate, { now }).ok) continue;
    if (revokedByIssuer('lineage-certificate', certificate.certificateId, certificate.body.ownerNodeId, revocations)) continue;
    map.set(certificate.body.sourceCommitment, certificate);
  }
  return map;
}

function declaredLineageIsCertified(attestation, certs) {
  const sourceCerts = (attestation.body.evidence || []).map((evidence) => certs.get(sourceLineageCommitment(evidence.sourceId))).filter(Boolean);
  if (sourceCerts.length === 0) return false;
  const certified = {
    originIds: new Set(sourceCerts.flatMap((cert) => cert.body.originCommitments)),
    publisherIds: new Set(sourceCerts.flatMap((cert) => cert.body.publisherCommitments)),
    generatorIds: new Set(sourceCerts.flatMap((cert) => cert.body.generatorCommitments))
  };
  const declared = attestation.body.lineage || {};
  const dimensions = ['originIds', 'publisherIds', 'generatorIds'];
  let declaredCount = 0;
  for (const dimension of dimensions) {
    for (const id of list(declared[dimension])) {
      declaredCount += 1;
      if (!certified[dimension].has(sourceLineageCommitment(id))) return false;
    }
  }
  return declaredCount > 0;
}

export function assessActiveTrust({
  claim,
  attestations = [],
  lineageCertificates = [],
  revocations = [],
  disputes = [],
  authorizedDisputerNodeIds = [],
  retrievalProvenance = null,
  policy = {},
  now = Date.now(),
  maxAttestationAgeMs = 24 * 60 * 60_000,
  maxFutureSkewMs = 5 * 60_000
} = {}) {
  const claimVerification = verifyClaim(claim);
  if (!claimVerification.ok) throw new Error(`invalid claim: ${claimVerification.reason}`);
  if (revokedByIssuer('claim', claim.claimId, claim.issuedBy, revocations)) {
    return {
      protocol: 'truyn-active-trust-assessment-v1', version: 1, claimId: claim.claimId,
      lifecycleStatus: 'revoked', activeAttestations: 0, staleAttestations: 0,
      revokedAttestations: attestations.length, uncertifiedAttestations: 0, activeDisputes: 0,
      truthAssessment: { status: 'revoked', reason: 'claim_revoked', calibratedTruthProbability: null }
    };
  }

  const certs = certificateIndex(lineageCertificates, revocations, now);
  const active = [];
  let staleAttestations = 0;
  let revokedAttestations = 0;
  let uncertifiedAttestations = 0;
  for (const attestation of attestations) {
    if (!verifyAttestation(attestation, claim.claimId).ok) continue;
    if (revokedByIssuer('attestation', attestation.attestationId, attestation.attesterNodeId, revocations)) {
      revokedAttestations += 1;
      continue;
    }
    const created = new Date(attestation.createdAt).getTime();
    if (!Number.isFinite(created) || now - created > maxAttestationAgeMs || created - now > maxFutureSkewMs) {
      staleAttestations += 1;
      continue;
    }
    if (!declaredLineageIsCertified(attestation, certs)) {
      uncertifiedAttestations += 1;
      continue;
    }
    active.push(attestation);
  }

  const base = assessClaimEvidence({ claim, attestations: active, retrievalProvenance, policy });
  const authorized = new Set(authorizedDisputerNodeIds || []);
  const validDisputes = (disputes || []).filter((dispute) => verifyDispute(dispute, claim.claimId).ok && authorized.has(dispute.signerNodeId));
  let lifecycleStatus = base.truthAssessment.status;
  let truthAssessment = base.truthAssessment;
  if (validDisputes.length > 0 && lifecycleStatus !== 'retrieval_unverified') {
    lifecycleStatus = 'disputed';
    truthAssessment = { ...truthAssessment, status: 'disputed', reason: 'active_authorized_dispute_present' };
  } else if (active.length === 0 && (staleAttestations > 0 || uncertifiedAttestations > 0 || revokedAttestations > 0)) {
    lifecycleStatus = 'stale_or_uncertified';
    truthAssessment = { ...truthAssessment, status: 'stale_or_uncertified', reason: 'no_fresh_certified_attestations' };
  }
  return {
    protocol: 'truyn-active-trust-assessment-v1', version: 1, claimId: claim.claimId,
    lifecycleStatus, retrievalIntegrity: base.retrievalIntegrity, truthAssessment,
    activeAttestations: active.length, staleAttestations, revokedAttestations,
    uncertifiedAttestations, activeDisputes: validDisputes.length,
    provenanceGraphDigest: base.provenanceGraphDigest
  };
}
