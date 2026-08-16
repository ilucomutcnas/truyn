export function trustabilityLite({ identityVerified = false, successfulTasks = 0, failedTasks = 0, lastSeenAt = null, attestations = 0, now = Date.now() } = {}) {
  const total = successfulTasks + failedTasks;
  const successRate = (successfulTasks + 1) / (total + 2);
  const seenAt = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const recency = seenAt > 0 && now - seenAt <= 5 * 60_000 ? 1 : 0;
  const attestationScore = Math.min(1, Math.max(0, attestations / 5));

  const score =
    0.40 * (identityVerified ? 1 : 0) +
    0.35 * successRate +
    0.15 * recency +
    0.10 * attestationScore;

  return {
    version: 'trustability-lite/1',
    score: Number(score.toFixed(4)),
    inputs: {
      identityVerified,
      successfulTasks,
      failedTasks,
      successRate: Number(successRate.toFixed(4)),
      recency,
      attestations
    }
  };
}

// Node-level execution reputation and claim-level evidence verification are deliberately separate.
// trustabilityLite() remains a routing/runtime signal. The exports below assess a specific claim.
export {
  TRUST_RECEIPT_PROTOCOL,
  TRUST_RECEIPT_VERSION,
  assessClaimEvidence,
  createTrustReceipt,
  trustReceiptDigest,
  verifyTrustReceipt
} from './claim-verification.js';

export {
  CHALLENGE_PROTOCOL,
  DISPUTE_PROTOCOL,
  LINEAGE_CERT_PROTOCOL,
  TRUST_LIFECYCLE_VERSION,
  TRUST_REVOCATION_PROTOCOL,
  VERIFY_PROTOCOL,
  assessActiveTrust,
  createChallenge,
  createDispute,
  createLineageCertificate,
  createTrustRevocation,
  createVerification,
  sourceLineageCommitment,
  verifyChallenge,
  verifyDispute,
  verifyLineageCertificate,
  verifyTrustRevocation,
  verifyVerification
} from './lifecycle.js';

export {
  SOURCE_DELEGATION_PROTOCOL,
  SOURCE_OWNER_PKI_VERSION,
  SOURCE_OWNER_PROTOCOL,
  authorityChainDigest,
  createDelegationCertificate,
  createSourceOwnerCertificate,
  sourceOwnerIdFromPublicKey,
  verifyDelegationCertificate,
  verifySourceOwnerCertificate
} from './source-owner-pki.js';

export {
  DurableTransparencyLog,
  TRANSPARENCY_ENTRY_PROTOCOL,
  TRANSPARENCY_EVENT_TYPES,
  TRANSPARENCY_LOG_VERSION,
  transparencyLogId,
  verifyTransparencyEntry
} from './transparency-log.js';

export {
  TRUST_RECEIPT_V2_PROTOCOL,
  TRUST_RECEIPT_V2_VERSION,
  createTrustReceiptV2,
  trustReceiptV2Digest,
  verifyTrustReceiptV2
} from './receipt-v2.js';
