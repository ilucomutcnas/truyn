import { createHash } from 'node:crypto';
import { verifyAttestation, verifyClaim } from '../claims/index.js';
import { buildProvenanceGraph } from '../provenance/index.js';
import {
  createChallenge,
  createDispute,
  createTrustReceipt,
  verifyChallenge,
  verifyDispute,
  verifyTrustReceipt,
  verifyVerification
} from '../trust/index.js';
import { DurableVerificationEventLog, verificationWorkflowId } from './event-log.js';

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function requireIdentity(identity) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('verification coordinator identity is required');
  return identity;
}

function normalizeVerifiers(value, limit) {
  if (!Array.isArray(value)) throw new Error('verifier discovery must return an array');
  const seen = new Set();
  const verifiers = [];
  for (const item of value) {
    if (!item?.nodeId || typeof item.nodeId !== 'string') continue;
    if (seen.has(item.nodeId)) continue;
    seen.add(item.nodeId);
    verifiers.push({
      nodeId: item.nodeId,
      capability: typeof item.capability === 'string' ? item.capability : null,
      methods: Array.isArray(item.methods) ? [...new Set(item.methods.filter((entry) => typeof entry === 'string'))].sort() : []
    });
    if (verifiers.length >= limit) break;
  }
  return verifiers;
}

function structuredEvidence(attestation) {
  return Array.isArray(attestation?.body?.evidence) && attestation.body.evidence.length > 0 &&
    attestation.body.evidence.every((item) => typeof item?.kind === 'string' && typeof item?.sourceId === 'string');
}

function publicEvidenceRefs(attestation) {
  return [
    attestation.attestationId,
    ...(attestation.body.evidence || []).map((item) => item.contentDigest).filter((value) => typeof value === 'string' && value)
  ];
}

export class VerificationWorkflow {
  constructor({
    identity,
    claim,
    directory,
    discoverVerifiers,
    invokeVerifier,
    verifierLimit = 8,
    methods = ['independent-review'],
    policy = {},
    requireEvidence = true,
    startedAt = new Date().toISOString()
  } = {}) {
    this.identity = requireIdentity(identity);
    const claimCheck = verifyClaim(claim);
    if (!claimCheck.ok) throw new Error(`invalid claim: ${claimCheck.reason}`);
    if (!directory) throw new Error('verification workflow directory is required');
    if (typeof discoverVerifiers !== 'function') throw new Error('discoverVerifiers callback is required');
    if (typeof invokeVerifier !== 'function') throw new Error('invokeVerifier callback is required');
    if (!Number.isInteger(verifierLimit) || verifierLimit < 1 || verifierLimit > 32) throw new Error('verifierLimit must be 1..32');
    this.claim = structuredClone(claim);
    this.discoverVerifiers = discoverVerifiers;
    this.invokeVerifier = invokeVerifier;
    this.verifierLimit = verifierLimit;
    this.methods = [...new Set(methods.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
    this.policy = { ...policy };
    this.requireEvidence = requireEvidence !== false;
    this.startedAt = new Date(startedAt).toISOString();
    this.workflowId = verificationWorkflowId({ claimId: claim.claimId, coordinatorNodeId: identity.nodeId, startedAt: this.startedAt });
    this.log = new DurableVerificationEventLog({ directory, workflowId: this.workflowId, claimId: claim.claimId });
  }

  async run({ retrievalProvenance = null } = {}) {
    await this.log.open();
    if (this.log.head().sequence !== 0) throw new Error('verification_workflow_already_started');

    await this.log.append({
      identity: this.identity,
      eventType: 'CLAIM_ACCEPTED',
      subjectId: this.claim.claimId,
      data: { domain: this.claim.body.domain, issuerNodeId: this.claim.issuedBy, retrievalBound: this.claim.body.basis?.kind === 'distributed-context' }
    });

    const challenge = createChallenge({ identity: this.identity, claim: this.claim, methods: this.methods, reason: 'v0.2-verification' });
    const challengeCheck = verifyChallenge(challenge, this.claim.claimId);
    if (!challengeCheck.ok) throw new Error(`challenge verification failed: ${challengeCheck.reason}`);
    await this.log.append({
      identity: this.identity,
      eventType: 'CHALLENGE_CREATED',
      subjectId: challenge.objectId,
      evidenceRefs: [this.claim.claimId],
      data: { methods: challenge.body.methods, domain: challenge.body.domain }
    });

    const discovered = normalizeVerifiers(await this.discoverVerifiers({
      claim: structuredClone(this.claim),
      challenge: structuredClone(challenge),
      domain: this.claim.body.domain,
      methods: [...this.methods],
      limit: this.verifierLimit
    }), this.verifierLimit);
    if (discovered.length === 0) throw new Error('verification_no_verifiers_discovered');

    const attestations = [];
    const verifications = [];
    for (const verifier of discovered) {
      await this.log.append({
        identity: this.identity,
        eventType: 'VERIFIER_SELECTED',
        subjectId: verifier.nodeId,
        evidenceRefs: verifier.capability ? [verifier.capability] : [],
        data: { capability: verifier.capability, methods: verifier.methods }
      });

      let response;
      try {
        response = await this.invokeVerifier({
          verifier: structuredClone(verifier),
          claim: structuredClone(this.claim),
          challenge: structuredClone(challenge)
        });
      } catch (error) {
        await this.log.append({
          identity: this.identity,
          eventType: 'ATTEST_REJECTED',
          subjectId: verifier.nodeId,
          data: { reason: 'verifier_invocation_failed', errorCode: error?.code || null }
        });
        continue;
      }

      const attestation = response?.attestation;
      const attestationCheck = verifyAttestation(attestation, this.claim.claimId);
      const signerMatches = attestation?.attesterNodeId === verifier.nodeId;
      const evidenceOk = !this.requireEvidence || structuredEvidence(attestation);
      if (!attestationCheck.ok || !signerMatches || !evidenceOk) {
        await this.log.append({
          identity: this.identity,
          eventType: 'ATTEST_REJECTED',
          subjectId: attestation?.attestationId || verifier.nodeId,
          data: {
            reason: !attestationCheck.ok ? attestationCheck.reason : !signerMatches ? 'attestation_provider_mismatch' : 'structured_evidence_required'
          }
        });
        continue;
      }

      attestations.push(structuredClone(attestation));
      await this.log.append({
        identity: this.identity,
        eventType: 'ATTEST_ACCEPTED',
        subjectId: attestation.attestationId,
        evidenceRefs: publicEvidenceRefs(attestation),
        data: { attesterNodeId: attestation.attesterNodeId, verdict: attestation.body.verdict, method: attestation.body.method, evidenceCount: attestation.body.evidence.length }
      });

      if (response?.verification) {
        const verifyCheck = verifyVerification(response.verification, challenge.objectId);
        const verifySignerMatches = response.verification.signerNodeId === verifier.nodeId;
        const verifyAttestationMatches = response.verification.body?.attestationId === attestation.attestationId;
        if (!verifyCheck.ok || !verifySignerMatches || !verifyAttestationMatches) throw new Error(`signed VERIFY rejected: ${verifyCheck.reason || 'binding_mismatch'}`);
        verifications.push(structuredClone(response.verification));
        await this.log.append({
          identity: this.identity,
          eventType: 'VERIFY_ACCEPTED',
          subjectId: response.verification.objectId,
          evidenceRefs: [challenge.objectId, attestation.attestationId],
          data: { verifierNodeId: verifier.nodeId, verdict: attestation.body.verdict }
        });
      }
    }

    if (attestations.length === 0) throw new Error('verification_no_valid_attestations');

    const provenanceGraph = buildProvenanceGraph({ claim: this.claim, attestations });
    const verdicts = new Set(attestations.map((attestation) => attestation.body.verdict));
    let dispute = null;
    if (verdicts.has('support') && verdicts.has('contradict')) {
      dispute = createDispute({
        identity: this.identity,
        claim: this.claim,
        targetAttestationIds: attestations.map((attestation) => attestation.attestationId),
        groundsDigest: digest({ reason: 'independent_evidence_conflict', graphDigest: provenanceGraph.graphDigest }),
        evidenceCommitments: attestations.flatMap(publicEvidenceRefs)
      });
      const disputeCheck = verifyDispute(dispute, this.claim.claimId);
      if (!disputeCheck.ok) throw new Error(`dispute verification failed: ${disputeCheck.reason}`);
      await this.log.append({
        identity: this.identity,
        eventType: 'DISPUTE_OBSERVED',
        subjectId: dispute.objectId,
        evidenceRefs: attestations.map((attestation) => attestation.attestationId),
        data: { conflictingVerdicts: [...verdicts].sort(), provenanceGraphDigest: provenanceGraph.graphDigest }
      });
    }

    const receipt = createTrustReceipt({
      identity: this.identity,
      claim: this.claim,
      attestations,
      retrievalProvenance,
      policy: this.policy
    });
    const receiptCheck = verifyTrustReceipt(receipt, this.claim.claimId);
    if (!receiptCheck.ok) throw new Error(`trust receipt verification failed: ${receiptCheck.reason}`);

    await this.log.append({
      identity: this.identity,
      eventType: 'VERIFICATION_COMPLETED',
      subjectId: receipt.receiptId,
      evidenceRefs: [provenanceGraph.graphDigest, ...attestations.map((attestation) => attestation.attestationId)],
      data: {
        status: receipt.payload.truthAssessment.status,
        attestationCount: attestations.length,
        verificationCount: verifications.length,
        provenanceGraphDigest: provenanceGraph.graphDigest,
        disputeObserved: Boolean(dispute)
      }
    });

    return {
      workflowId: this.workflowId,
      claim: structuredClone(this.claim),
      challenge,
      verifiers: discovered,
      attestations,
      verifications,
      dispute,
      provenanceGraph,
      receipt,
      eventLog: this.log.head()
    };
  }
}
