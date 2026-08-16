import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { contextQueryHash } from '../core/context/index.js';
import { createClaimFromRetrievedContext } from '../core/claims/index.js';
import { verifyTrustReceipt } from '../core/trust/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { ClaimAttesterHost, ClaimVerificationCoordinator } from '../node/trust-verification.js';

function fixtureClaim(identity) {
  const rootCid = `truyn:ctx:${'1'.repeat(64)}`;
  const retrievalResult = {
    context: 'The launch date is 2026-09-01.',
    provenance: {
      version: 1,
      protocol: 'truyn-distributed-context-v1',
      rootCid,
      manifestCid: rootCid,
      queryHash: contextQueryHash('What is the launch date?'),
      verified: true,
      partitionCount: 3,
      authorizedHolderOffers: 3,
      queriedHolders: 3,
      networkCandidateCount: 6,
      networkBytes: 900,
      selected: [{
        holderNodeId: `truyn:node:${'2'.repeat(64)}`,
        partitionIndex: 0,
        contentCommitment: `sha256:${'3'.repeat(64)}`,
        holderReceiptDigest: `sha256:${'4'.repeat(64)}`
      }]
    }
  };
  const claim = createClaimFromRetrievedContext({
    identity,
    domain: 'release-calendar',
    subject: 'TRUYN launch',
    statement: 'The launch date is 2026-09-01.',
    retrievalResult
  });
  return { claim, retrievalResult };
}

test('coordinator discovers independent verifier nodes and emits a signed TRUST_RECEIPT', async (t) => {
  const coordinatorIdentity = createIdentity();
  const issuerIdentity = createIdentity();
  const attesterIdentities = [createIdentity(), createIdentity(), createIdentity()];
  const relay = createRelay({
    allowedNodeIds: [coordinatorIdentity.nodeId, issuerIdentity.nodeId, ...attesterIdentities.map((identity) => identity.nodeId)],
    trustedRequesterNodeIds: [coordinatorIdentity.nodeId],
    nodeFreshnessMs: 30_000
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const { claim, retrievalResult } = fixtureClaim(issuerIdentity);
  const decisions = [
    { verdict: 'support', origin: 'official-record', source: 'record-copy-A' },
    { verdict: 'support', origin: 'direct-observation', source: 'observer-B' },
    { verdict: 'support', origin: 'official-record', source: 'record-copy-C' }
  ];
  const hosts = [];
  for (let index = 0; index < attesterIdentities.length; index += 1) {
    const node = new TruynNode({ relayUrl, identity: attesterIdentities[index] });
    const decision = decisions[index];
    const host = new ClaimAttesterHost({
      node,
      domain: claim.body.domain,
      allowedRequesterIds: [coordinatorIdentity.nodeId],
      pollIntervalMs: 2,
      verifier: async () => ({
        verdict: decision.verdict,
        evidence: [{ kind: 'document', sourceId: decision.source, contentDigest: `sha256:${String(index + 5).repeat(64).slice(0, 64)}` }],
        lineage: { originIds: [decision.origin] },
        method: 'independent-document-check'
      })
    });
    await host.start();
    hosts.push(host);
  }
  t.after(async () => Promise.all(hosts.map((host) => host.stop())));

  const coordinatorNode = new TruynNode({ relayUrl, identity: coordinatorIdentity });
  const coordinator = new ClaimVerificationCoordinator({
    node: coordinatorNode,
    verifierLimit: 3,
    resultTimeoutMs: 5_000,
    pollIntervalMs: 2
  });
  const result = await coordinator.verify({ claim, retrievalProvenance: retrievalResult.provenance });

  assert.equal(result.verification.authorizedVerifierCount, 3);
  assert.equal(result.verification.attestationCount, 3);
  assert.equal(result.verification.retrievalIntegrity.verified, true);
  assert.equal(result.verification.truthAssessment.status, 'verified');
  assert.equal(result.verification.truthAssessment.independentKnownGroups, 2);
  assert.equal(result.verification.truthAssessment.rawAttestations, 3);
  assert.equal(verifyTrustReceipt(result.receipt, claim.claimId).ok, true);
  assert.equal(hosts.every((host) => host.stats().attestationsSigned === 1), true);
  assert.equal(coordinator.stats().attestationsAccepted, 3);

  const publicReceipt = JSON.stringify(result);
  assert.equal(publicReceipt.includes('record-copy-A'), false);
  assert.equal(publicReceipt.includes('observer-B'), false);
  assert.equal(publicReceipt.includes('record-copy-C'), false);
  assert.equal(publicReceipt.includes('official-record'), false);
  assert.equal(publicReceipt.includes('direct-observation'), false);
});

test('multiple network verifier identities with one shared origin remain insufficiently independent', async (t) => {
  const coordinatorIdentity = createIdentity();
  const issuerIdentity = createIdentity();
  const attesterIdentities = [createIdentity(), createIdentity(), createIdentity()];
  const relay = createRelay({
    allowedNodeIds: [coordinatorIdentity.nodeId, issuerIdentity.nodeId, ...attesterIdentities.map((identity) => identity.nodeId)],
    trustedRequesterNodeIds: [coordinatorIdentity.nodeId],
    nodeFreshnessMs: 30_000
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const { claim, retrievalResult } = fixtureClaim(issuerIdentity);
  const hosts = [];
  for (let index = 0; index < attesterIdentities.length; index += 1) {
    const host = new ClaimAttesterHost({
      node: new TruynNode({ relayUrl, identity: attesterIdentities[index] }),
      domain: claim.body.domain,
      allowedRequesterIds: [coordinatorIdentity.nodeId],
      pollIntervalMs: 2,
      verifier: async () => ({
        verdict: 'support',
        evidence: [{ kind: 'syndicated-copy', sourceId: `copy-${index}` }],
        lineage: { originIds: ['single-wire-origin'] }
      })
    });
    await host.start();
    hosts.push(host);
  }
  t.after(async () => Promise.all(hosts.map((host) => host.stop())));

  const coordinator = new ClaimVerificationCoordinator({
    node: new TruynNode({ relayUrl, identity: coordinatorIdentity }),
    verifierLimit: 3,
    resultTimeoutMs: 5_000,
    pollIntervalMs: 2
  });
  const result = await coordinator.verify({ claim, retrievalProvenance: retrievalResult.provenance });
  assert.equal(result.verification.attestationCount, 3);
  assert.equal(result.verification.truthAssessment.independentKnownGroups, 1);
  assert.equal(result.verification.truthAssessment.status, 'insufficient_independence');
});
