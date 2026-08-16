import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createAttestation, createClaim } from '../core/claims/index.js';
import { createDelegationCertificate, createSourceOwnerCertificate } from '../core/trust/source-owner-pki.js';
import { DurableTransparencyLog } from '../core/trust/transparency-log.js';
import { createTrustReceiptV2, verifyTrustReceiptV2 } from '../core/trust/receipt-v2.js';
import { createQuicKademliaNode, connectQuicPeers, firstQuicAddress } from '../network/transport/quic-kademlia.js';
import { DecentralizedVerifierDiscovery, discoverVerifiers } from '../network/discovery/verifier-dht.js';
import { ReplicatedTransparencyService } from '../network/replication/transparency-replication.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventually(operation, { timeoutMs = 25_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  throw lastError || new Error('eventually_timeout');
}

function makeAttestation(identity, claim, id) {
  return createAttestation({
    identity,
    claim,
    verdict: 'support',
    evidence: [{ kind: 'source', sourceId: `source-${id}` }],
    lineage: { originIds: [`origin-${id}`], publisherIds: [`publisher-${id}`], generatorIds: [] },
    method: 'independent-review'
  });
}

test('real QUIC/Kademlia testnet survives churn with relay-free verifier discovery and replicated revocation state', { timeout: 120_000 }, async (t) => {
  const directories = [];
  const liveNodes = new Set();
  t.after(async () => {
    await Promise.allSettled([...liveNodes].map((node) => node.stop()));
    await Promise.allSettled(directories.map((directory) => rm(directory, { recursive: true, force: true })));
  });
  const temp = async (name) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), `truyn-${name}-`));
    directories.push(directory);
    return directory;
  };
  const startNode = async (options = {}) => {
    const node = await createQuicKademliaNode(options);
    liveNodes.add(node);
    return node;
  };
  const stopNode = async (node) => {
    if (!node) return;
    await node.stop();
    liveNodes.delete(node);
  };

  const bootstrap = await startNode();
  const bootstrapAddress = firstQuicAddress(bootstrap);
  const replicaPeer = await startNode({ bootstrap: [bootstrapAddress] });
  const verifierPeer = await startNode({ bootstrap: [bootstrapAddress] });
  const requesterPeer = await startNode({ bootstrap: [bootstrapAddress] });
  await connectQuicPeers(replicaPeer, [firstQuicAddress(verifierPeer), firstQuicAddress(requesterPeer)]);
  await connectQuicPeers(verifierPeer, [firstQuicAddress(requesterPeer)]);
  await sleep(500);

  const sourceOwner = createIdentity();
  const verifier = createIdentity();
  const issuer = createIdentity();
  const attesterA = createIdentity();
  const attesterB = createIdentity();
  const root = createSourceOwnerCertificate({ identity: sourceOwner, sourceNamespaces: ['testnet/*'] });
  const delegation = createDelegationCertificate({
    ownerIdentity: sourceOwner,
    ownerCertificate: root,
    delegateIdentity: verifier,
    delegationScopes: ['trust.verify'],
    sourceNamespaces: ['testnet/*']
  });

  const primaryDirectory = await temp('primary-log');
  const replicaDirectory = await temp('replica-log');
  const primaryLog = await new DurableTransparencyLog({ directory: primaryDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  await primaryLog.append({ identity: sourceOwner, eventType: 'ROOT', targetId: root.certificateId, payload: { certificateId: root.certificateId } });
  await primaryLog.append({ identity: sourceOwner, eventType: 'DELEGATE', targetId: delegation.delegationId, payload: { delegationId: delegation.delegationId } });
  const replicaLog = await new DurableTransparencyLog({ directory: replicaDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  const primaryReplication = new ReplicatedTransparencyService({ node: bootstrap, log: primaryLog });
  const replicaReplication = new ReplicatedTransparencyService({ node: replicaPeer, log: replicaLog });
  await primaryReplication.start();
  await replicaReplication.start();
  const replication = await eventually(async () => {
    const value = await primaryReplication.replicate({ minAcks: 1, timeoutMs: 3_000 });
    return value.successful >= 1 ? value : null;
  });
  assert.ok(replication.successful >= 1);
  assert.deepEqual(replicaLog.head(), primaryLog.head());

  const verifierDiscovery = new DecentralizedVerifierDiscovery({
    node: verifierPeer,
    identity: verifier,
    domain: 'testnet.news',
    ownerCertificate: root,
    delegation,
    methods: ['independent-review']
  });
  await eventually(() => verifierDiscovery.publish());
  const foundBeforeChurn = await eventually(async () => {
    const found = await discoverVerifiers(requesterPeer, 'testnet.news', { limit: 4, timeoutMs: 3_000, revocationState: replicaLog.revocationState([delegation.delegationId]) });
    return found.some((entry) => entry.record.body.verifierNodeId === verifier.nodeId) ? found : null;
  });
  assert.ok(foundBeforeChurn.some((entry) => entry.record.body.libp2pPeerId === verifierPeer.peerId.toString()));

  const claim = createClaim({ identity: issuer, domain: 'testnet.news', statement: 'The QUIC/Kademlia trust testnet is carrying signed verifier state.' });
  const attestations = [makeAttestation(attesterA, claim, 'a'), makeAttestation(attesterB, claim, 'b')];
  const committedState = replicaLog.revocationState([delegation.delegationId, claim.claimId]);
  const receipt = createTrustReceiptV2({
    identity: verifier,
    claim,
    attestations,
    ownerCertificate: root,
    delegation,
    lifecycleHead: replicaLog.head(),
    revocationState: committedState
  });
  assert.equal(verifyTrustReceiptV2(receipt, { currentLifecycleHead: replicaLog.head(), currentRevocationState: committedState }).ok, true);

  // Churn event 1: remove the original bootstrap/log-primary. Remaining peers are already directly connected.
  await stopNode(bootstrap);
  const observerDirectory = await temp('observer-log');
  const observerLog = await new DurableTransparencyLog({ directory: observerDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  const observerReplication = new ReplicatedTransparencyService({ node: requesterPeer, log: observerLog });
  await observerReplication.start();
  await eventually(async () => {
    const synced = await observerReplication.syncNetwork({ timeoutMs: 3_000 });
    return observerLog.head().headHash === replicaLog.head().headHash && synced.successful >= 1 ? synced : null;
  });
  assert.deepEqual(observerLog.head(), replicaLog.head(), 'new replica must recover durable lifecycle state without the original primary');

  // Churn event 2: verifier transport identity disappears and rejoins with a new QUIC peer ID but the same delegated TRUYN verifier key.
  const oldVerifierPeerId = verifierPeer.peerId.toString();
  await stopNode(verifierPeer);
  const verifierPeer2 = await startNode({ bootstrap: [firstQuicAddress(replicaPeer)] });
  await connectQuicPeers(verifierPeer2, [firstQuicAddress(requesterPeer)]);
  const verifierDiscovery2 = new DecentralizedVerifierDiscovery({ node: verifierPeer2, identity: verifier, domain: 'testnet.news', ownerCertificate: root, delegation });
  await eventually(() => verifierDiscovery2.publish());
  const foundAfterChurn = await eventually(async () => {
    const found = await discoverVerifiers(requesterPeer, 'testnet.news', { limit: 8, timeoutMs: 3_000, revocationState: observerLog.revocationState([delegation.delegationId]) });
    return found.some((entry) => entry.record.body.verifierNodeId === verifier.nodeId && entry.record.body.libp2pPeerId !== oldVerifierPeerId) ? found : null;
  });
  assert.ok(foundAfterChurn.some((entry) => entry.record.body.libp2pPeerId === verifierPeer2.peerId.toString()));

  // Restart the durable primary from disk, append a revocation, and replicate the new head to two live replicas.
  const primaryPeer2 = await startNode({ bootstrap: [firstQuicAddress(replicaPeer)] });
  await connectQuicPeers(primaryPeer2, [firstQuicAddress(requesterPeer)]);
  const reopenedPrimaryLog = await new DurableTransparencyLog({ directory: primaryDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  assert.deepEqual(reopenedPrimaryLog.head(), replicaLog.head(), 'restart must retain the pre-churn durable head');
  const primaryReplication2 = new ReplicatedTransparencyService({ node: primaryPeer2, log: reopenedPrimaryLog });
  await primaryReplication2.start();
  await reopenedPrimaryLog.append({ identity: sourceOwner, eventType: 'REVOKE', targetId: delegation.delegationId, payload: { reason: 'testnet churn revocation' } });
  await eventually(async () => {
    const result = await primaryReplication2.replicate({ minAcks: 2, timeoutMs: 3_000 });
    return result.successful >= 2 ? result : null;
  });
  await eventually(async () => {
    await replicaReplication.syncNetwork({ timeoutMs: 3_000 });
    await observerReplication.syncNetwork({ timeoutMs: 3_000 });
    return replicaLog.head().headHash === reopenedPrimaryLog.head().headHash && observerLog.head().headHash === reopenedPrimaryLog.head().headHash;
  });

  const currentState = observerLog.revocationState([delegation.delegationId, claim.claimId]);
  assert.equal(currentState.relevant.find((item) => item.targetId === delegation.delegationId)?.revoked, true);
  const staleReceipt = verifyTrustReceiptV2(receipt, { currentLifecycleHead: observerLog.head(), currentRevocationState: currentState });
  assert.equal(staleReceipt.ok, false);
  assert.equal(staleReceipt.reason, 'trust_receipt_v2_lifecycle_head_stale');
  const deniedDiscovery = await discoverVerifiers(requesterPeer, 'testnet.news', { limit: 8, timeoutMs: 3_000, revocationState: currentState });
  assert.equal(deniedDiscovery.some((entry) => entry.record.body.verifierNodeId === verifier.nodeId), false, 'revoked verifier delegation must be excluded from decentralized discovery');
});
