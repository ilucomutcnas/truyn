import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createAttestation, createClaim } from '../core/claims/index.js';
import {
  assessActiveTrust,
  createChallenge,
  createDispute,
  createLineageCertificate,
  createTrustRevocation,
  createVerification,
  verifyChallenge,
  verifyDispute,
  verifyLineageCertificate,
  verifyTrustRevocation,
  verifyVerification
} from '../core/trust/lifecycle.js';

function makeEvidence({ claim, attester, sourceId, originId, publisherId, createdAt = new Date().toISOString() }) {
  return createAttestation({
    identity: attester,
    claim,
    verdict: 'support',
    evidence: [{ kind: 'source', sourceId }],
    lineage: { originIds: [originId], publisherIds: [publisherId], generatorIds: [] },
    createdAt
  });
}

test('CHALLENGE -> VERIFY -> DISPUTE objects are signed, claim-bound and tamper evident', () => {
  const issuer = createIdentity();
  const challenger = createIdentity();
  const verifier = createIdentity();
  const disputer = createIdentity();
  const claim = createClaim({ identity: issuer, domain: 'science', statement: 'The sample temperature was 18 C.' });
  const attestation = createAttestation({
    identity: verifier,
    claim,
    verdict: 'support',
    evidence: [{ kind: 'observation', sourceId: 'lab-a' }],
    lineage: { originIds: ['lab-a'], publisherIds: ['lab-a'] }
  });

  const challenge = createChallenge({ identity: challenger, claim, methods: ['independent-review'] });
  assert.equal(verifyChallenge(challenge, claim.claimId).ok, true);

  const verification = createVerification({ identity: verifier, challenge, attestation });
  assert.equal(verifyVerification(verification, challenge.objectId).ok, true);

  const dispute = createDispute({
    identity: disputer,
    claim,
    targetAttestationIds: [attestation.attestationId],
    groundsDigest: 'sha256:counter-evidence'
  });
  assert.equal(verifyDispute(dispute, claim.claimId).ok, true);

  const tampered = structuredClone(dispute);
  tampered.body.groundsDigest = 'sha256:tampered';
  assert.equal(verifyDispute(tampered, claim.claimId).ok, false);
});

test('fresh independently certified source lineages can satisfy active Trustability policy', () => {
  const now = Date.now();
  const issuer = createIdentity();
  const attesterA = createIdentity();
  const attesterB = createIdentity();
  const sourceOwnerA = createIdentity();
  const sourceOwnerB = createIdentity();
  const claim = createClaim({ identity: issuer, domain: 'finance', statement: 'Issuer X reported audited revenue of 10 units.' });

  const attestationA = makeEvidence({ claim, attester: attesterA, sourceId: 'source-a', originId: 'origin-a', publisherId: 'publisher-a', createdAt: new Date(now - 1000).toISOString() });
  const attestationB = makeEvidence({ claim, attester: attesterB, sourceId: 'source-b', originId: 'origin-b', publisherId: 'publisher-b', createdAt: new Date(now - 1000).toISOString() });
  const certificateA = createLineageCertificate({
    identity: sourceOwnerA,
    sourceId: 'source-a',
    lineage: { originIds: ['origin-a'], publisherIds: ['publisher-a'] },
    issuedAt: new Date(now - 2000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  });
  const certificateB = createLineageCertificate({
    identity: sourceOwnerB,
    sourceId: 'source-b',
    lineage: { originIds: ['origin-b'], publisherIds: ['publisher-b'] },
    issuedAt: new Date(now - 2000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  });
  assert.equal(verifyLineageCertificate(certificateA, { now }).ok, true);
  assert.equal(verifyLineageCertificate(certificateB, { now }).ok, true);

  const assessment = assessActiveTrust({
    claim,
    attestations: [attestationA, attestationB],
    lineageCertificates: [certificateA, certificateB],
    now,
    policy: { minIndependentSupport: 2 }
  });
  assert.equal(assessment.lifecycleStatus, 'verified');
  assert.equal(assessment.activeAttestations, 2);
  assert.equal(assessment.uncertifiedAttestations, 0);
  assert.equal(assessment.truthAssessment.independentKnownGroups, 2);
});

test('uncertified, stale and issuer-revoked evidence cannot remain active', () => {
  const now = Date.now();
  const issuer = createIdentity();
  const attesterA = createIdentity();
  const attesterB = createIdentity();
  const sourceOwnerA = createIdentity();
  const stranger = createIdentity();
  const claim = createClaim({ identity: issuer, domain: 'news', statement: 'Event Y occurred at noon.' });
  const fresh = makeEvidence({ claim, attester: attesterA, sourceId: 'source-a', originId: 'origin-a', publisherId: 'publisher-a', createdAt: new Date(now - 1000).toISOString() });
  const stale = makeEvidence({ claim, attester: attesterB, sourceId: 'source-b', originId: 'origin-b', publisherId: 'publisher-b', createdAt: new Date(now - 3 * 60 * 60_000).toISOString() });
  const certA = createLineageCertificate({
    identity: sourceOwnerA,
    sourceId: 'source-a',
    lineage: { originIds: ['origin-a'], publisherIds: ['publisher-a'] },
    issuedAt: new Date(now - 2000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  });

  const forgedAuthorityRevocation = createTrustRevocation({ identity: stranger, targetType: 'attestation', targetId: fresh.attestationId });
  assert.equal(verifyTrustRevocation(forgedAuthorityRevocation).ok, true, 'signature is valid even though signer is not authorized to revoke the attestation');
  let assessment = assessActiveTrust({
    claim,
    attestations: [fresh, stale],
    lineageCertificates: [certA],
    revocations: [forgedAuthorityRevocation],
    now,
    maxAttestationAgeMs: 60 * 60_000
  });
  assert.equal(assessment.activeAttestations, 1, 'stranger revocation must not deactivate attester-owned evidence');
  assert.equal(assessment.staleAttestations, 1);

  const realRevocation = createTrustRevocation({ identity: attesterA, targetType: 'attestation', targetId: fresh.attestationId });
  assessment = assessActiveTrust({
    claim,
    attestations: [fresh, stale],
    lineageCertificates: [certA],
    revocations: [realRevocation],
    now,
    maxAttestationAgeMs: 60 * 60_000
  });
  assert.equal(assessment.activeAttestations, 0);
  assert.equal(assessment.revokedAttestations, 1);
  assert.equal(assessment.staleAttestations, 1);
  assert.equal(assessment.lifecycleStatus, 'stale_or_uncertified');
});

test('only an authorized signed DISPUTE changes active assessment state', () => {
  const now = Date.now();
  const issuer = createIdentity();
  const attesterA = createIdentity();
  const attesterB = createIdentity();
  const ownerA = createIdentity();
  const ownerB = createIdentity();
  const disputer = createIdentity();
  const stranger = createIdentity();
  const claim = createClaim({ identity: issuer, domain: 'security', statement: 'Control Z was enabled.' });
  const a = makeEvidence({ claim, attester: attesterA, sourceId: 'a', originId: 'oa', publisherId: 'pa', createdAt: new Date(now - 1000).toISOString() });
  const b = makeEvidence({ claim, attester: attesterB, sourceId: 'b', originId: 'ob', publisherId: 'pb', createdAt: new Date(now - 1000).toISOString() });
  const ca = createLineageCertificate({ identity: ownerA, sourceId: 'a', lineage: { originIds: ['oa'], publisherIds: ['pa'] }, issuedAt: new Date(now - 2000).toISOString(), expiresAt: new Date(now + 60_000).toISOString() });
  const cb = createLineageCertificate({ identity: ownerB, sourceId: 'b', lineage: { originIds: ['ob'], publisherIds: ['pb'] }, issuedAt: new Date(now - 2000).toISOString(), expiresAt: new Date(now + 60_000).toISOString() });
  const authorized = createDispute({ identity: disputer, claim, targetAttestationIds: [a.attestationId], groundsDigest: 'sha256:valid-dispute' });
  const unauthorized = createDispute({ identity: stranger, claim, targetAttestationIds: [a.attestationId], groundsDigest: 'sha256:noise' });

  const base = assessActiveTrust({ claim, attestations: [a, b], lineageCertificates: [ca, cb], now });
  assert.equal(base.lifecycleStatus, 'verified');

  const noisy = assessActiveTrust({
    claim,
    attestations: [a, b], lineageCertificates: [ca, cb], disputes: [unauthorized],
    authorizedDisputerNodeIds: [disputer.nodeId], now
  });
  assert.equal(noisy.lifecycleStatus, 'verified');

  const disputed = assessActiveTrust({
    claim,
    attestations: [a, b], lineageCertificates: [ca, cb], disputes: [authorized],
    authorizedDisputerNodeIds: [disputer.nodeId], now
  });
  assert.equal(disputed.lifecycleStatus, 'disputed');
  assert.equal(disputed.truthAssessment.reason, 'active_authorized_dispute_present');
});
