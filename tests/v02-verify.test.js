import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createAttestation, createClaim, verifyAttestation, verifyClaim } from '../core/claims/index.js';
import { createVerification, verifyDispute, verifyTrustReceipt, verifyVerification } from '../core/trust/index.js';
import { DurableVerificationEventLog, VerificationWorkflow } from '../core/verify/index.js';

function evidence(label) {
  return [{
    kind: 'document',
    sourceId: `source://${label}`,
    contentDigest: `sha256:${label.padEnd(64, label[0] || '0').slice(0, 64)}`
  }];
}

function fixture() {
  const issuer = createIdentity();
  const coordinator = createIdentity();
  const verifierA = createIdentity();
  const verifierB = createIdentity();
  const claim = createClaim({
    identity: issuer,
    domain: 'v02-gate',
    subject: 'TRUYN Verify',
    statement: 'TRUYN v0.2 can carry a claim through independent verification.',
    basis: { kind: 'structured-test-evidence', commitment: `sha256:${'1'.repeat(64)}` }
  });
  return { issuer, coordinator, verifierA, verifierB, claim };
}

async function tempDir() { return mkdtemp(join(tmpdir(), 'truyn-v02-')); }

function verifierDescriptor(identity, suffix) {
  return { nodeId: identity.nodeId, capability: `trust.verify.v02.${suffix}`, methods: ['independent-review'] };
}

function signedResponse(identity, claim, challenge, verdict, lineage, sourceLabel) {
  const attestation = createAttestation({
    identity,
    claim,
    verdict,
    evidence: evidence(sourceLabel),
    lineage,
    method: 'independent-review'
  });
  const verification = createVerification({ identity, challenge, attestation });
  return { attestation, verification };
}

test('v0.2 end-to-end CLAIM -> capability -> ATTEST/VERIFY -> provenance -> receipt -> append-only events', async () => {
  const directory = await tempDir();
  const { coordinator, verifierA, verifierB, claim } = fixture();
  try {
    assert.equal(verifyClaim(claim).ok, true);
    const calls = [];
    const workflow = new VerificationWorkflow({
      identity: coordinator,
      claim,
      directory,
      policy: { minIndependentSupport: 2 },
      discoverVerifiers: async ({ domain, limit }) => {
        assert.equal(domain, 'v02-gate');
        assert.ok(limit >= 2);
        return [verifierDescriptor(verifierA, 'a'), verifierDescriptor(verifierB, 'b')];
      },
      invokeVerifier: async ({ verifier, claim: requestedClaim, challenge }) => {
        calls.push({ nodeId: verifier.nodeId, capability: verifier.capability });
        if (verifier.nodeId === verifierA.nodeId) return signedResponse(verifierA, requestedClaim, challenge, 'support', { originIds: ['origin-A'], publisherIds: ['publisher-A'] }, 'alpha');
        return signedResponse(verifierB, requestedClaim, challenge, 'support', { originIds: ['origin-B'], publisherIds: ['publisher-B'] }, 'bravo');
      }
    });

    const result = await workflow.run();
    assert.equal(calls.length, 2);
    assert.equal(new Set(calls.map((item) => item.capability)).size, 2);
    assert.equal(result.attestations.length, 2);
    assert.equal(result.verifications.length, 2);
    assert.equal(result.receipt.payload.truthAssessment.status, 'verified');
    assert.equal(verifyTrustReceipt(result.receipt, claim.claimId).ok, true);
    assert.equal(result.provenanceGraph.claimId, claim.claimId);
    assert.equal(result.provenanceGraph.independence.independentKnownGroups, 2);
    for (const attestation of result.attestations) assert.equal(verifyAttestation(attestation, claim.claimId).ok, true);
    for (const verification of result.verifications) assert.equal(verifyVerification(verification, result.challenge.objectId).ok, true);

    const entries = workflow.log.entries();
    assert.deepEqual(entries.map((entry) => entry.eventType), [
      'CLAIM_ACCEPTED', 'CHALLENGE_CREATED',
      'VERIFIER_SELECTED', 'ATTEST_ACCEPTED', 'VERIFY_ACCEPTED',
      'VERIFIER_SELECTED', 'ATTEST_ACCEPTED', 'VERIFY_ACCEPTED',
      'VERIFICATION_COMPLETED'
    ]);
    assert.equal(result.eventLog.sequence, entries.length);
    assert.ok(entries.every((entry, index) => entry.sequence === index + 1));
    assert.equal(JSON.stringify(entries).includes('source://alpha'), false, 'event ledger should use commitments, not raw source IDs');

    const reopened = new DurableVerificationEventLog({ directory, workflowId: result.workflowId, claimId: claim.claimId });
    await reopened.open();
    assert.deepEqual(reopened.head(), result.eventLog);
    assert.equal(reopened.entries().length, entries.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v0.2 conflicting independent attestations create signed DISPUTE evidence and disputed receipt', async () => {
  const directory = await tempDir();
  const { coordinator, verifierA, verifierB, claim } = fixture();
  try {
    const workflow = new VerificationWorkflow({
      identity: coordinator,
      claim,
      directory,
      policy: { minIndependentSupport: 1 },
      discoverVerifiers: async () => [verifierDescriptor(verifierA, 'a'), verifierDescriptor(verifierB, 'b')],
      invokeVerifier: async ({ verifier, claim: requestedClaim, challenge }) => verifier.nodeId === verifierA.nodeId
        ? signedResponse(verifierA, requestedClaim, challenge, 'support', { originIds: ['origin-A'] }, 'alpha')
        : signedResponse(verifierB, requestedClaim, challenge, 'contradict', { originIds: ['origin-B'] }, 'bravo')
    });
    const result = await workflow.run();
    assert.ok(result.dispute);
    assert.equal(verifyDispute(result.dispute, claim.claimId).ok, true);
    assert.equal(result.receipt.payload.truthAssessment.status, 'disputed');
    assert.ok(workflow.log.entries().some((entry) => entry.eventType === 'DISPUTE_OBSERVED'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v0.2 rejects tampered/wrong-provider/unstructured attestations and records the rejection', async () => {
  const directory = await tempDir();
  const { coordinator, verifierA, verifierB, claim } = fixture();
  try {
    const workflow = new VerificationWorkflow({
      identity: coordinator,
      claim,
      directory,
      policy: { minIndependentSupport: 1 },
      discoverVerifiers: async () => [verifierDescriptor(verifierA, 'a'), verifierDescriptor(verifierB, 'b')],
      invokeVerifier: async ({ verifier, claim: requestedClaim, challenge }) => {
        if (verifier.nodeId === verifierA.nodeId) {
          const response = signedResponse(verifierA, requestedClaim, challenge, 'support', { originIds: ['origin-A'] }, 'alpha');
          response.attestation.body.verdict = 'contradict';
          return response;
        }
        return signedResponse(verifierB, requestedClaim, challenge, 'support', { originIds: ['origin-B'] }, 'bravo');
      }
    });
    const result = await workflow.run();
    assert.equal(result.attestations.length, 1);
    assert.equal(result.attestations[0].attesterNodeId, verifierB.nodeId);
    assert.equal(result.receipt.payload.truthAssessment.status, 'verified');
    const rejected = workflow.log.entries().filter((entry) => entry.eventType === 'ATTEST_REJECTED');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].data.reason, 'attestation_content_id_mismatch');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v0.2 verification event ledger detects persisted tampering on reopen', async () => {
  const directory = await tempDir();
  const { coordinator, verifierA, claim } = fixture();
  try {
    const workflow = new VerificationWorkflow({
      identity: coordinator,
      claim,
      directory,
      policy: { minIndependentSupport: 1 },
      discoverVerifiers: async () => [verifierDescriptor(verifierA, 'a')],
      invokeVerifier: async ({ claim: requestedClaim, challenge }) => signedResponse(verifierA, requestedClaim, challenge, 'support', { originIds: ['origin-A'] }, 'alpha')
    });
    const result = await workflow.run();
    const content = await readFile(workflow.log.filePath, 'utf8');
    const lines = content.trim().split('\n').map((line) => JSON.parse(line));
    lines[1].data.domain = 'tampered-domain';
    await writeFile(workflow.log.filePath, `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`);

    const reopened = new DurableVerificationEventLog({ directory, workflowId: result.workflowId, claimId: claim.claimId });
    await assert.rejects(() => reopened.open(), /verification_event_(not_canonical|hash_mismatch|signature_invalid)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v0.2 refuses to complete when all verifier outputs lack required structured evidence', async () => {
  const directory = await tempDir();
  const { coordinator, verifierA, claim } = fixture();
  try {
    const workflow = new VerificationWorkflow({
      identity: coordinator,
      claim,
      directory,
      discoverVerifiers: async () => [verifierDescriptor(verifierA, 'a')],
      invokeVerifier: async ({ claim: requestedClaim, challenge }) => {
        const attestation = createAttestation({
          identity: verifierA,
          claim: requestedClaim,
          verdict: 'support',
          evidence: [],
          lineage: { originIds: ['origin-A'] }
        });
        return { attestation, verification: createVerification({ identity: verifierA, challenge, attestation }) };
      }
    });
    await assert.rejects(() => workflow.run(), /verification_no_valid_attestations/);
    const rejected = workflow.log.entries().find((entry) => entry.eventType === 'ATTEST_REJECTED');
    assert.equal(rejected.data.reason, 'structured_evidence_required');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
