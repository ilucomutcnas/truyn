import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';
import { claimDigest, verifyAttestation, verifyClaim } from '../claims/index.js';
import { buildProvenanceGraph } from '../provenance/index.js';

export const TRUST_RECEIPT_VERSION = 1;
export const TRUST_RECEIPT_PROTOCOL = 'truyn-trust-receipt-v1';

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

function normalizePolicy(policy = {}) {
  const minIndependentSupport = Number.isInteger(policy.minIndependentSupport) ? policy.minIndependentSupport : 2;
  const maxContradictForVerified = Number.isInteger(policy.maxContradictForVerified) ? policy.maxContradictForVerified : 0;
  if (minIndependentSupport < 1 || minIndependentSupport > 32) throw new Error('minIndependentSupport must be 1..32');
  if (maxContradictForVerified < 0 || maxContradictForVerified > 32) throw new Error('maxContradictForVerified must be 0..32');
  return {
    version: 1,
    minIndependentSupport,
    maxContradictForVerified,
    requireKnownLineage: policy.requireKnownLineage !== false
  };
}

function verifyRetrievalBinding(claim, retrievalProvenance) {
  const basis = claim?.body?.basis;
  if (!basis || basis.kind !== 'distributed-context') {
    return { required: false, verified: null, reason: 'not_retrieval_bound' };
  }
  if (!retrievalProvenance?.verified) return { required: true, verified: false, reason: 'retrieval_provenance_unverified' };
  if (retrievalProvenance.rootCid !== basis.rootCid) return { required: true, verified: false, reason: 'retrieval_root_mismatch' };
  if (retrievalProvenance.queryHash !== basis.queryHash) return { required: true, verified: false, reason: 'retrieval_query_mismatch' };
  if (digest(retrievalProvenance) !== basis.provenanceDigest) return { required: true, verified: false, reason: 'retrieval_provenance_digest_mismatch' };
  const expected = (basis.evidenceCommitments || []).map((entry) => canonicalize(entry)).sort();
  const actual = (retrievalProvenance.selected || []).map((entry) => canonicalize({
    contentCommitment: entry.contentCommitment,
    holderReceiptDigest: entry.holderReceiptDigest
  })).sort();
  if (canonicalize(expected) !== canonicalize(actual)) return { required: true, verified: false, reason: 'retrieval_selection_commitment_mismatch' };
  return {
    required: true,
    verified: true,
    rootCid: basis.rootCid,
    queryHash: basis.queryHash,
    provenanceDigest: basis.provenanceDigest,
    selectedEvidence: expected.length
  };
}

export function assessClaimEvidence({ claim, attestations = [], retrievalProvenance = null, policy = {} }) {
  const claimVerification = verifyClaim(claim);
  if (!claimVerification.ok) throw new Error(`invalid claim: ${claimVerification.reason}`);
  if (!Array.isArray(attestations)) throw new Error('attestations must be an array');
  for (const attestation of attestations) {
    const verification = verifyAttestation(attestation, claim.claimId);
    if (!verification.ok) throw new Error(`invalid attestation: ${verification.reason}`);
  }

  const normalizedPolicy = normalizePolicy(policy);
  const retrieval = verifyRetrievalBinding(claim, retrievalProvenance);
  const graph = buildProvenanceGraph({ claim, attestations });
  const independence = graph.independence;
  const support = independence.supportGroups;
  const contradict = independence.contradictGroups;
  const mixed = independence.mixedGroups;
  const decisive = support + contradict + mixed;
  const evidenceBalance = decisive === 0 ? null : Number(((support - contradict) / decisive).toFixed(6));

  let status = 'insufficient_independence';
  let reason = 'independent_support_below_policy';

  if (retrieval.required && !retrieval.verified) {
    status = 'retrieval_unverified';
    reason = retrieval.reason;
  } else if (attestations.length === 0) {
    status = 'unsupported';
    reason = 'no_attestations';
  } else if (mixed > 0 || (support > 0 && contradict > 0)) {
    status = 'disputed';
    reason = 'independent_evidence_conflicts';
  } else if (contradict >= normalizedPolicy.minIndependentSupport && support === 0) {
    status = 'contradicted';
    reason = 'independent_contradiction_meets_policy';
  } else if (
    support >= normalizedPolicy.minIndependentSupport &&
    contradict <= normalizedPolicy.maxContradictForVerified &&
    (!normalizedPolicy.requireKnownLineage || independence.independentKnownGroups >= normalizedPolicy.minIndependentSupport)
  ) {
    status = 'verified';
    reason = 'independent_support_meets_policy';
  } else if (independence.unknownLineageGroups > 0 && independence.independentKnownGroups < normalizedPolicy.minIndependentSupport) {
    status = 'insufficient_independence';
    reason = 'lineage_unknown_or_correlated';
  }

  return {
    protocol: 'truyn-claim-assessment-v1',
    version: 1,
    claimId: claim.claimId,
    retrievalIntegrity: retrieval,
    truthAssessment: {
      status,
      reason,
      evidenceBalance,
      // This is evidence state, not a calibrated probability that the proposition is true.
      calibratedTruthProbability: null,
      independentKnownGroups: independence.independentKnownGroups,
      supportGroups: support,
      contradictGroups: contradict,
      mixedGroups: mixed,
      uncertainGroups: independence.uncertainGroups,
      unknownLineageGroups: independence.unknownLineageGroups,
      rawAttestations: independence.rawAttestations
    },
    policy: normalizedPolicy,
    provenanceGraphDigest: graph.graphDigest,
    provenanceGraph: graph
  };
}

export function createTrustReceipt({
  identity,
  claim,
  attestations = [],
  retrievalProvenance = null,
  policy = {},
  createdAt = new Date().toISOString()
}) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('trust receipt verifier identity is required');
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('trust receipt verifier identity key mismatch');
  const assessment = assessClaimEvidence({ claim, attestations, retrievalProvenance, policy });
  const payload = {
    protocol: TRUST_RECEIPT_PROTOCOL,
    version: TRUST_RECEIPT_VERSION,
    claimId: claim.claimId,
    claimDigest: claimDigest(claim),
    retrievalIntegrity: assessment.retrievalIntegrity,
    truthAssessment: assessment.truthAssessment,
    policy: assessment.policy,
    provenanceGraphDigest: assessment.provenanceGraphDigest,
    attestationCommitments: attestations.map((attestation) => digest({
      attestationId: attestation.attestationId,
      attesterNodeId: attestation.attesterNodeId,
      verdict: attestation.body.verdict
    })).sort()
  };
  const receiptId = `truyn:trust:${digest({ payload, verifierNodeId: identity.nodeId }).slice('sha256:'.length)}`;
  const signed = { receiptId, payload, verifierNodeId: identity.nodeId, createdAt };
  return {
    ...signed,
    publicKey: identity.publicKeyPem,
    signature: signValue(signed, identity.privateKeyPem)
  };
}

export function verifyTrustReceipt(receipt, expectedClaimId = null) {
  try {
    if (!receipt?.receiptId || !receipt?.payload || !receipt?.verifierNodeId || !receipt?.createdAt || !receipt?.publicKey || !receipt?.signature) {
      return { ok: false, reason: 'trust_receipt_missing_required_field' };
    }
    if (receipt.payload.protocol !== TRUST_RECEIPT_PROTOCOL || receipt.payload.version !== TRUST_RECEIPT_VERSION) {
      return { ok: false, reason: 'trust_receipt_protocol_mismatch' };
    }
    if (expectedClaimId && receipt.payload.claimId !== expectedClaimId) return { ok: false, reason: 'trust_receipt_claim_mismatch' };
    if (nodeIdFromPublicKey(receipt.publicKey) !== receipt.verifierNodeId) return { ok: false, reason: 'trust_receipt_verifier_key_mismatch' };
    const expectedId = `truyn:trust:${digest({ payload: receipt.payload, verifierNodeId: receipt.verifierNodeId }).slice('sha256:'.length)}`;
    if (expectedId !== receipt.receiptId) return { ok: false, reason: 'trust_receipt_content_id_mismatch' };
    const signed = {
      receiptId: receipt.receiptId,
      payload: receipt.payload,
      verifierNodeId: receipt.verifierNodeId,
      createdAt: receipt.createdAt
    };
    return verifyValue(signed, receipt.signature, receipt.publicKey)
      ? { ok: true, receiptId: receipt.receiptId, status: receipt.payload.truthAssessment?.status || null }
      : { ok: false, reason: 'trust_receipt_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function trustReceiptDigest(receipt) {
  return digest(receipt);
}
