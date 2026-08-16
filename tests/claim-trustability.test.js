import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { contextQueryHash } from '../core/context/index.js';
import {
  createAttestation,
  createClaimFromRetrievedContext,
  verifyAttestation,
  verifyClaim
} from '../core/claims/index.js';
import { analyzeAttestationIndependence, buildProvenanceGraph } from '../core/provenance/index.js';
import { assessClaimEvidence, createTrustReceipt, verifyTrustReceipt } from '../core/trust/index.js';

function retrievalFixture() {
  const rootCid = `truyn:ctx:${'a'.repeat(64)}`;
  const queryHash = contextQueryHash('What is the verified launch date?');
  return {
    context: 'The verified launch date is 2026-09-01.',
    provenance: {
      version: 1,
      protocol: 'truyn-distributed-context-v1',
      rootCid,
      manifestCid: rootCid,
      queryHash,
      verified: true,
      partitionCount: 4,
      authorizedHolderOffers: 4,
      queriedHolders: 4,
      networkCandidateCount: 8,
      networkBytes: 1200,
      selected: [{
        holderNodeId: `truyn:node:${'b'.repeat(64)}`,
        partitionIndex: 2,
        contentCommitment: `sha256:${'c'.repeat(64)}`,
        holderReceiptDigest: `sha256:${'d'.repeat(64)}`
      }]
    }
  };
}

function claimFixture() {
  const issuer = createIdentity();
  const retrievalResult = retrievalFixture();
  const claim = createClaimFromRetrievedContext({
    identity: issuer,
    domain: 'release-calendar',
    subject: 'TRUYN launch',
    statement: 'The verified launch date is 2026-09-01.',
    retrievalResult
  });
  return { issuer, retrievalResult, claim };
}

function attest({ claim, identity = createIdentity(), verdict = 'support', originIds = [], publisherIds = [], generatorIds = [], sourceId = null }) {
  return createAttestation({
    identity,
    claim,
    verdict,
    evidence: sourceId ? [{ kind: 'document', sourceId, contentDigest: `sha256:${'e'.repeat(64)}` }] : [],
    lineage: { originIds, publisherIds, generatorIds }
  });
}

test('CLAIM and ATTEST are content-bound signed objects and reject tampering', () => {
  const { claim } = claimFixture();
  assert.equal(verifyClaim(claim).ok, true);
  const attestation = attest({ claim, originIds: ['registry-A'], sourceId: 'source-A' });
  assert.equal(verifyAttestation(attestation, claim.claimId).ok, true);

  const tamperedClaim = structuredClone(claim);
  tamperedClaim.body.statement = 'The verified launch date is 2030-01-01.';
  assert.equal(verifyClaim(tamperedClaim).ok, false);

  const tamperedAttestation = structuredClone(attestation);
  tamperedAttestation.body.verdict = 'contradict';
  assert.equal(verifyAttestation(tamperedAttestation, claim.claimId).ok, false);
});

test('multiple attesters repeating one lineage count as one independent evidence family', () => {
  const { claim, retrievalResult } = claimFixture();
  const attestations = Array.from({ length: 3 }, (_, index) => attest({
    claim,
    originIds: ['wire-origin-1'],
    publisherIds: [`mirror-${index}`],
    sourceId: `mirror-source-${index}`
  }));
  const independence = analyzeAttestationIndependence(attestations);
  assert.equal(independence.rawAttestations, 3);
  assert.equal(independence.independentKnownGroups, 1);
  assert.equal(independence.supportGroups, 1);

  const assessment = assessClaimEvidence({ claim, attestations, retrievalProvenance: retrievalResult.provenance });
  assert.equal(assessment.retrievalIntegrity.verified, true);
  assert.equal(assessment.truthAssessment.status, 'insufficient_independence');
  assert.equal(assessment.truthAssessment.reason, 'independent_support_below_policy');
});

test('two independently sourced support groups can satisfy the default verification policy', () => {
  const { claim, retrievalResult } = claimFixture();
  const attestations = [
    attest({ claim, originIds: ['official-registry'], publisherIds: ['registry-publisher'], sourceId: 'registry-source' }),
    attest({ claim, originIds: ['direct-observation'], publisherIds: ['independent-observer'], sourceId: 'observer-source' })
  ];
  const assessment = assessClaimEvidence({ claim, attestations, retrievalProvenance: retrievalResult.provenance });
  assert.equal(assessment.retrievalIntegrity.verified, true);
  assert.equal(assessment.truthAssessment.independentKnownGroups, 2);
  assert.equal(assessment.truthAssessment.supportGroups, 2);
  assert.equal(assessment.truthAssessment.status, 'verified');
  assert.equal(assessment.truthAssessment.calibratedTruthProbability, null);
});

test('independent support and contradiction produce DISPUTED even though retrieval integrity is valid', () => {
  const { claim, retrievalResult } = claimFixture();
  const attestations = [
    attest({ claim, verdict: 'support', originIds: ['source-family-A'], sourceId: 'source-A' }),
    attest({ claim, verdict: 'contradict', originIds: ['source-family-B'], sourceId: 'source-B' })
  ];
  const assessment = assessClaimEvidence({ claim, attestations, retrievalProvenance: retrievalResult.provenance });
  assert.equal(assessment.retrievalIntegrity.verified, true);
  assert.equal(assessment.truthAssessment.status, 'disputed');
  assert.equal(assessment.truthAssessment.reason, 'independent_evidence_conflicts');
});

test('unknown-lineage Sybil attestations cannot manufacture independent verification', () => {
  const { claim, retrievalResult } = claimFixture();
  const attestations = Array.from({ length: 10 }, (_, index) => attest({ claim, sourceId: `anonymous-copy-${index}` }));
  const independence = analyzeAttestationIndependence(attestations);
  assert.equal(independence.unknownLineageGroups, 1);
  assert.equal(independence.independentKnownGroups, 0);

  const assessment = assessClaimEvidence({ claim, attestations, retrievalProvenance: retrievalResult.provenance });
  assert.equal(assessment.truthAssessment.status, 'insufficient_independence');
  assert.equal(assessment.truthAssessment.reason, 'lineage_unknown_or_correlated');
});

test('retrieval provenance tampering is reported separately from claim truth assessment', () => {
  const { claim, retrievalResult } = claimFixture();
  const attestations = [
    attest({ claim, originIds: ['source-A'], sourceId: 'A' }),
    attest({ claim, originIds: ['source-B'], sourceId: 'B' })
  ];
  const tampered = structuredClone(retrievalResult.provenance);
  tampered.networkBytes += 1;
  const assessment = assessClaimEvidence({ claim, attestations, retrievalProvenance: tampered });
  assert.equal(assessment.retrievalIntegrity.verified, false);
  assert.equal(assessment.truthAssessment.status, 'retrieval_unverified');
});

test('provenance graph preserves evidence relationships without exposing raw source IDs', () => {
  const { claim } = claimFixture();
  const attestation = attest({
    claim,
    originIds: ['origin-private-label'],
    sourceId: 'private-source-name'
  });
  const graph = buildProvenanceGraph({ claim, attestations: [attestation] });
  assert.ok(graph.nodes.some((node) => node.type === 'CLAIM'));
  assert.ok(graph.nodes.some((node) => node.type === 'ATTEST'));
  assert.ok(graph.nodes.some((node) => node.type === 'SOURCE'));
  assert.ok(graph.edges.some((edge) => edge.type === 'SUPPORTS'));
  assert.ok(graph.edges.some((edge) => edge.type === 'EVIDENCED_BY'));
  assert.equal(JSON.stringify(graph).includes('private-source-name'), false);
  assert.equal(JSON.stringify(graph).includes('origin-private-label'), false);
});

test('TRUST_RECEIPT is signed, claim-bound, provenance-bound and tamper evident', () => {
  const { claim, retrievalResult } = claimFixture();
  const verifier = createIdentity();
  const attestations = [
    attest({ claim, originIds: ['origin-A'], sourceId: 'A' }),
    attest({ claim, originIds: ['origin-B'], sourceId: 'B' })
  ];
  const receipt = createTrustReceipt({
    identity: verifier,
    claim,
    attestations,
    retrievalProvenance: retrievalResult.provenance
  });
  const verification = verifyTrustReceipt(receipt, claim.claimId);
  assert.equal(verification.ok, true);
  assert.equal(verification.status, 'verified');
  assert.equal(receipt.payload.retrievalIntegrity.verified, true);
  assert.equal(receipt.payload.truthAssessment.status, 'verified');

  const tampered = structuredClone(receipt);
  tampered.payload.truthAssessment.status = 'disputed';
  assert.equal(verifyTrustReceipt(tampered, claim.claimId).ok, false);
});
