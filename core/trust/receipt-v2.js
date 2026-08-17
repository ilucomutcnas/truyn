import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';
import { claimDigest } from '../claims/index.js';
import { assessClaimEvidence } from './claim-verification.js';
import { authorityChainDigest, verifyDelegationCertificate, verifySourceOwnerCertificate } from './source-owner-pki.js';

export const TRUST_RECEIPT_V2_VERSION = 2;
export const TRUST_RECEIPT_V2_PROTOCOL = 'truyn-trust-receipt-v2';
const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

function validateCommittedState({ lifecycleHead, revocationState, sourceOwnerId, delegationId, claimId }) {
  if (!lifecycleHead || !revocationState) throw new Error('trust receipt v2 requires lifecycleHead and revocationState');
  if (lifecycleHead.sourceOwnerId !== sourceOwnerId || revocationState.sourceOwnerId !== sourceOwnerId) throw new Error('trust receipt v2 source owner state mismatch');
  if (lifecycleHead.logId !== revocationState.logId || lifecycleHead.sequence !== revocationState.sequence || lifecycleHead.headHash !== revocationState.headHash) throw new Error('trust receipt v2 lifecycle/revocation head mismatch');
  if (lifecycleHead.revocationStateDigest !== revocationState.stateDigest) throw new Error('trust receipt v2 revocation digest mismatch');
  const relevant = new Map((revocationState.relevant || []).map((item) => [item.targetId, item]));
  if (!relevant.has(delegationId) || !relevant.has(claimId)) throw new Error('trust receipt v2 revocation state lacks relevant subjects');
  if (relevant.get(delegationId)?.revoked) throw new Error('trust receipt v2 verifier delegation is revoked');
  if (relevant.get(claimId)?.revoked) throw new Error('trust receipt v2 claim is revoked');
}

export function createTrustReceiptV2({
  identity,
  claim,
  attestations = [],
  retrievalProvenance = null,
  policy = {},
  ownerCertificate,
  delegation,
  lifecycleHead,
  revocationState,
  createdAt = new Date().toISOString()
} = {}) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem || nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('trust receipt v2 verifier identity is required');
  const ownerCheck = verifySourceOwnerCertificate(ownerCertificate);
  if (!ownerCheck.ok) throw new Error(`trust receipt v2 source owner invalid: ${ownerCheck.reason}`);
  const delegationCheck = verifyDelegationCertificate(delegation, ownerCertificate, { requiredScope: 'trust.verify' });
  if (!delegationCheck.ok || delegation.body.delegateNodeId !== identity.nodeId) throw new Error(`trust receipt v2 delegation invalid: ${delegationCheck.reason || 'delegate mismatch'}`);
  validateCommittedState({ lifecycleHead, revocationState, sourceOwnerId: ownerCertificate.body.sourceOwnerId, delegationId: delegation.delegationId, claimId: claim.claimId });
  const assessment = assessClaimEvidence({ claim, attestations, retrievalProvenance, policy });
  const authorityChain = { ownerCertificate, delegation };
  const payload = {
    protocol: TRUST_RECEIPT_V2_PROTOCOL,
    version: TRUST_RECEIPT_V2_VERSION,
    claimId: claim.claimId,
    claimDigest: claimDigest(claim),
    retrievalIntegrity: assessment.retrievalIntegrity,
    truthAssessment: assessment.truthAssessment,
    policy: assessment.policy,
    provenanceGraphDigest: assessment.provenanceGraphDigest,
    attestationCommitments: attestations.map((attestation) => digest({ attestationId: attestation.attestationId, attesterNodeId: attestation.attesterNodeId, verdict: attestation.body.verdict })).sort(),
    verifierAuthority: {
      sourceOwnerId: ownerCertificate.body.sourceOwnerId,
      rootCertificateId: ownerCertificate.certificateId,
      delegationId: delegation.delegationId,
      authorityChainDigest: authorityChainDigest(ownerCertificate, delegation)
    },
    lifecycleHead: structuredClone(lifecycleHead),
    revocationState: structuredClone(revocationState)
  };
  const receiptId = `truyn:trust:v2:${digest({ payload, verifierNodeId: identity.nodeId }).slice(7)}`;
  const signed = { receiptId, payload, verifierNodeId: identity.nodeId, createdAt: new Date(createdAt).toISOString() };
  return { ...signed, authorityChain, publicKey: identity.publicKeyPem, signature: signValue(signed, identity.privateKeyPem) };
}

export function verifyTrustReceiptV2(receipt, {
  expectedClaimId = null,
  currentLifecycleHead = null,
  currentRevocationState = null,
  now = Date.now()
} = {}) {
  try {
    if (!receipt?.receiptId || !receipt?.payload || !receipt?.verifierNodeId || !receipt?.createdAt || !receipt?.authorityChain || !receipt?.publicKey || !receipt?.signature) return { ok: false, reason: 'trust_receipt_v2_missing_required_field' };
    if (receipt.payload.protocol !== TRUST_RECEIPT_V2_PROTOCOL || receipt.payload.version !== TRUST_RECEIPT_V2_VERSION) return { ok: false, reason: 'trust_receipt_v2_protocol_mismatch' };
    if (expectedClaimId && receipt.payload.claimId !== expectedClaimId) return { ok: false, reason: 'trust_receipt_v2_claim_mismatch' };
    if (nodeIdFromPublicKey(receipt.publicKey) !== receipt.verifierNodeId) return { ok: false, reason: 'trust_receipt_v2_verifier_key_mismatch' };
    const { ownerCertificate, delegation } = receipt.authorityChain;
    if (receipt.payload.verifierAuthority?.authorityChainDigest !== authorityChainDigest(ownerCertificate, delegation)) return { ok: false, reason: 'trust_receipt_v2_authority_commitment_mismatch' };
    const ownerCheck = verifySourceOwnerCertificate(ownerCertificate, { now });
    if (!ownerCheck.ok) return { ok: false, reason: ownerCheck.reason };
    const delegationCheck = verifyDelegationCertificate(delegation, ownerCertificate, { now, requiredScope: 'trust.verify' });
    if (!delegationCheck.ok || delegationCheck.delegateNodeId !== receipt.verifierNodeId) return { ok: false, reason: delegationCheck.reason || 'trust_receipt_v2_delegate_mismatch' };
    if (receipt.payload.verifierAuthority.sourceOwnerId !== ownerCertificate.body.sourceOwnerId || receipt.payload.verifierAuthority.delegationId !== delegation.delegationId) return { ok: false, reason: 'trust_receipt_v2_authority_identity_mismatch' };
    validateCommittedState({ lifecycleHead: receipt.payload.lifecycleHead, revocationState: receipt.payload.revocationState, sourceOwnerId: ownerCertificate.body.sourceOwnerId, delegationId: delegation.delegationId, claimId: receipt.payload.claimId });
    const expectedId = `truyn:trust:v2:${digest({ payload: receipt.payload, verifierNodeId: receipt.verifierNodeId }).slice(7)}`;
    if (receipt.receiptId !== expectedId) return { ok: false, reason: 'trust_receipt_v2_content_id_mismatch' };
    const signed = { receiptId: receipt.receiptId, payload: receipt.payload, verifierNodeId: receipt.verifierNodeId, createdAt: receipt.createdAt };
    if (!verifyValue(signed, receipt.signature, receipt.publicKey)) return { ok: false, reason: 'trust_receipt_v2_signature_invalid' };
    if (currentLifecycleHead) {
      const committed = receipt.payload.lifecycleHead;
      if (currentLifecycleHead.logId !== committed.logId || currentLifecycleHead.sequence !== committed.sequence || currentLifecycleHead.headHash !== committed.headHash) return { ok: false, reason: 'trust_receipt_v2_lifecycle_head_stale', committedHead: committed, currentHead: currentLifecycleHead };
    }
    if (currentRevocationState) {
      const committed = receipt.payload.revocationState;
      if (currentRevocationState.logId !== committed.logId || currentRevocationState.sequence !== committed.sequence || currentRevocationState.headHash !== committed.headHash || currentRevocationState.stateDigest !== committed.stateDigest) return { ok: false, reason: 'trust_receipt_v2_revocation_state_stale' };
      const relevant = new Map((currentRevocationState.relevant || []).map((item) => [item.targetId, item]));
      if (relevant.get(delegation.delegationId)?.revoked) return { ok: false, reason: 'trust_receipt_v2_verifier_revoked' };
      if (relevant.get(receipt.payload.claimId)?.revoked) return { ok: false, reason: 'trust_receipt_v2_claim_revoked' };
    }
    return {
      ok: true,
      receiptId: receipt.receiptId,
      status: receipt.payload.truthAssessment?.status || null,
      lifecycleHeadHash: receipt.payload.lifecycleHead.headHash,
      revocationStateDigest: receipt.payload.revocationState.stateDigest,
      sourceOwnerId: receipt.payload.verifierAuthority.sourceOwnerId
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function trustReceiptV2Digest(receipt) {
  return digest(receipt);
}
