import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { contextQueryHash } from '../core/context/index.js';
import { createClaimFromRetrievedContext } from '../core/claims/index.js';
import {
  createLineageCertificate,
  verifyChallenge,
  verifyVerification
} from '../core/trust/lifecycle.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { ActiveChallengeAttesterHost, ActiveTrustCoordinator } from '../node/active-trust-network.js';

function fixtureClaim(identity) {
  const rootCid = `truyn:ctx:${'7'.repeat(64)}`;
  const retrievalResult = {
    context: 'The controlled launch window opens on 2026-09-01.',
    provenance: {
      version: 1,
      protocol: 'truyn-distributed-context-v1',
      rootCid,
      manifestCid: rootCid,
      queryHash: contextQueryHash('When does the controlled launch window open?'),
      verified: true,
      partitionCount: 2,
      authorizedHolderOffers: 6,
      queriedHolders: 6,
      networkCandidateCount: 4,
      networkBytes: 1400,
      selected: [{
        holderNodeId: `truyn:node:${'8'.repeat(64)}`,
        partitionIndex: 1,
        contentCommitment: `sha256:${'9'.repeat(64)}`,
        holderReceiptDigest: `sha256:${'a'.repeat(64)}`
      }]
    }
  };
  const claim = createClaimFromRetrievedContext({
    identity,
    domain: 'release-calendar',
    subject: 'controlled launch',
    statement: 'The controlled launch window opens on 2026-09-01.',
    retrievalResult
  });
  return { claim, retrievalResult };
}

test('network CHALLENGE routes to independent verifier nodes and returns signed VERIFY proofs backed by certified lineage', async (t) => {
  const coordinatorIdentity = createIdentity();
  const issuerIdentity = createIdentity();
  const verifierIdentities = [createIdentity(), createIdentity()];
  const sourceOwnerIdentities = [createIdentity(), createIdentity()];
  const relay = createRelay({
    allowedNodeIds: [coordinatorIdentity.nodeId, issuerIdentity.nodeId, ...verifierIdentities.map((identity) => identity.nodeId)],
    trustedRequesterNodeIds: [coordinatorIdentity.nodeId],
    nodeFreshnessMs: 30_000
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const { claim, retrievalResult } = fixtureClaim(issuerIdentity);
  const sources = [
    { sourceId: 'release-source-a', originId: 'origin-a', publisherId: 'publisher-a' },
    { sourceId: 'release-source-b', originId: 'origin-b', publisherId: 'publisher-b' }
  ];
  const now = Date.now();
  const lineageCertificates = sources.map((source, index) => createLineageCertificate({
    identity: sourceOwnerIdentities[index],
    sourceId: source.sourceId,
    lineage: { originIds: [source.originId], publisherIds: [source.publisherId] },
    issuedAt: new Date(now - 2_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  }));

  const hosts = [];
  for (let index = 0; index < verifierIdentities.length; index += 1) {
    const source = sources[index];
    const host = new ActiveChallengeAttesterHost({
      node: new TruynNode({ relayUrl, identity: verifierIdentities[index] }),
      domain: claim.body.domain,
      allowedRequesterIds: [coordinatorIdentity.nodeId],
      pollIntervalMs: 2,
      verifier: async ({ challenge }) => ({
        verdict: 'support',
        evidence: [{ kind: 'independent-source', sourceId: source.sourceId }],
        lineage: { originIds: [source.originId], publisherIds: [source.publisherId] },
        method: challenge.body.methods[0]
      })
    });
    await host.start();
    hosts.push(host);
  }
  t.after(async () => Promise.all(hosts.map((host) => host.stop())));

  const coordinator = new ActiveTrustCoordinator({
    node: new TruynNode({ relayUrl, identity: coordinatorIdentity }),
    verifierLimit: 2,
    resultTimeoutMs: 5_000,
    pollIntervalMs: 2
  });
  const result = await coordinator.challenge({
    claim,
    methods: ['independent-review'],
    lineageCertificates,
    retrievalProvenance: retrievalResult.provenance,
    policy: { minIndependentSupport: 2 },
    now
  });

  assert.equal(verifyChallenge(result.challenge, claim.claimId).ok, true);
  assert.equal(result.attestations.length, 2);
  assert.equal(result.verifications.length, 2);
  assert.equal(result.assessment.retrievalIntegrity.verified, true);
  assert.equal(result.assessment.lifecycleStatus, 'verified');
  assert.equal(result.assessment.truthAssessment.independentKnownGroups, 2);
  assert.equal(result.assessment.activeAttestations, 2);

  for (let index = 0; index < result.verifications.length; index += 1) {
    const verification = result.verifications[index];
    const attestation = result.attestations.find((item) => item.attestationId === verification.body.attestationId);
    assert.ok(attestation);
    assert.equal(verifyVerification(verification, result.challenge.objectId).ok, true);
    assert.equal(verification.signerNodeId, attestation.attesterNodeId);
    assert.ok(verifierIdentities.some((identity) => identity.nodeId === verification.signerNodeId));
  }

  assert.equal(hosts.every((host) => host.stats().verificationsSigned === 1), true);
  assert.equal(coordinator.stats().verificationsAccepted, 2);
});
