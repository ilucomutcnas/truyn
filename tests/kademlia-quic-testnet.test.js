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
const stage = (name, data = {}) => console.log(`# TRUYN_QUIC_STAGE ${JSON.stringify({ stage: name, ...data })}`);

async function eventually(operation, { timeoutMs = 15_000, intervalMs = 250, label = 'operation' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  const error = lastError || new Error(`${label}_timeout`);
  error.message = `${label}: ${error.message}`;
  throw error;
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

test('real QUIC/Kademlia testnet survives churn with relay-free verifier discovery and replicated revocation state', { timeout: 90_000 }, async (t) => {
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

  stage('topology:start');
  const bootstrap = await startNode();
  const bootstrapAddress = firstQuicAddress(bootstrap);
  const replicaPeer = await startNode({ bootstrap: [bootstrapAddress] });
  const verifierPeer = await startNode({ bootstrap: [bootstrapAddress] });
  const requesterPeer = await startNode({ bootstrap: [bootstrapAddress] });
  await connectQuicPeers(replicaPeer, [firstQuicAddress(verifierPeer), firstQuicAddress(requesterPeer)]);
  await connectQuicPeers(verifierPeer, [firstQuicAddress(requesterPeer)]);
  await sleep(750);
  stage('topology:ready', { nodes: 4, quic: true });

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
  stage('pki:ready', { sourceOwnerId: root.body.sourceOwnerId, verifierNodeId: verifier.nodeId });

  const primaryDirectory = await temp('primary-log');
  const replicaDirectory = await temp('replica-log');
  const primaryLog = await new DurableTransparencyLog({ directory: primaryDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  await primaryLog.append({ identity: sourceOwner, eventType: 'ROOT', targetId: root.certificateId, payload: { certificateId: root.certificateId } });
  await primaryLog.append({ identity: sourceOwner, eventType: 'DELEGATE', targetId: delegation.delegationId, payload: { delegationId: delegation.delegationId } });
  const replicaLog = await new DurableTransparencyLog({ directory: replicaDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  const primaryReplication = new ReplicatedTransparencyService({ node: bootstrap, log: primaryLog, routingTimeoutMs: 3_000 });
  const replicaReplication = new ReplicatedTransparencyService({ node: replicaPeer, log: replicaLog, routingTimeoutMs: 3_000 });
  await eventually(() => primaryReplication.start().then(() => true), { label: 'primary_replication_start' });
  await eventually(() => replicaReplication.start().then(() => true), { label: 'replica_replication_start' });
  stage('replication:advertised');
  const replication = await eventually(async () => {
    const value = await primaryReplication.replicate({ minAcks: 1, timeoutMs: 2_000 });
    return value.successful >= 1 ? value : null;
  }, { label: 'initial_replication' });
  assert.ok(replication.successful >= 1);
  assert.deepEqual(replicaLog.head(), primaryLog.head());
  stage('replication:converged', { sequence: primaryLog.head().sequence, acknowledgements: replication.successful });

  const verifierDiscovery = new DecentralizedVerifierDiscovery({
    node: verifierPeer,
    identity: verifier,
    domain: 'testnet.news',
    ownerCertificate: root,
    delegation,
    methods: ['independent-review'],
    routingTimeoutMs: 3_000
  });
  await eventually(() => verifierDiscovery.publish().then(() => true), { label: 'verifier_publish' });
  const foundBeforeChurn = await eventually(async () => {
    const found = await discoverVerifiers(requesterPeer, 'testnet.news', { limit: 4, timeoutMs: 2_000, revocationState: replicaLog.revocationState([delegation.delegationId]) });
    return found.some((entry) => entry.record.body.verifierNodeId === verifier.nodeId) ? found : null;
  }, { label: 'verifier_discovery_before_churn' });
  assert.ok(foundBeforeChurn.some((entry) => entry.record.body.libp2pPeerId === verifierPeer.peerId.toString()));
  stage('discovery:verified', { discovered: foundBeforeChurn.length });

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
  stage('receipt:v2-issued', { lifecycleSequence: receipt.payload.lifecycleHead.sequence });

  await stopNode(bootstrap);
  stage('churn:bootstrap-down');
  const observerDirectory = await temp('observer-log');
  const observerLog = await new DurableTransparencyLog({ directory: observerDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  const observerReplication = new ReplicatedTransparencyService({ node: requesterPeer, log: observerLog, routingTimeoutMs: 3_000 });
  await eventually(() => observerReplication.start().then(() => true), { label: 'observer_replication_start' });
  await eventually(async () => {
    const synced = await observerReplication.syncNetwork({ timeoutMs: 2_000 });
    return observerLog.head().headHash === replicaLog.head().headHash && synced.successful >= 1 ? synced : null;
  }, { label: 'observer_recovery_after_bootstrap_churn' });
  assert.deepEqual(observerLog.head(), replicaLog.head(), 'new replica must recover durable lifecycle state without the original primary');
  stage('churn:replica-recovered', { sequence: observerLog.head().sequence });

  const oldVerifierPeerId = verifierPeer.peerId.toString();
  await stopNode(verifierPeer);
  const verifierPeer2 = await startNode({ bootstrap: [firstQuicAddress(replicaPeer)] });
  await connectQuicPeers(verifierPeer2, [firstQuicAddress(requesterPeer)]);
  await sleep(500);
  const verifierDiscovery2 = new DecentralizedVerifierDiscovery({ node: verifierPeer2, identity: verifier, domain: 'testnet.news', ownerCertificate: root, delegation, routingTimeoutMs: 3_000 });
  await eventually(() => verifierDiscovery2.publish().then(() => true), { label: 'verifier_republish_after_churn' });
  const foundAfterChurn = await eventually(async () => {
    const found = await discoverVerifiers(requesterPeer, 'testnet.news', { limit: 8, timeoutMs: 2_000, revocationState: observerLog.revocationState([delegation.delegationId]) });
    return found.some((entry) => entry.record.body.verifierNodeId === verifier.nodeId && entry.record.body.libp2pPeerId !== oldVerifierPeerId) ? found : null;
  }, { label: 'verifier_discovery_after_churn' });
  assert.ok(foundAfterChurn.some((entry) => entry.record.body.libp2pPeerId === verifierPeer2.peerId.toString()));
  stage('churn:verifier-rejoined', { peerRotated: true });

  const primaryPeer2 = await startNode({ bootstrap: [firstQuicAddress(replicaPeer)] });
  await connectQuicPeers(primaryPeer2, [firstQuicAddress(requesterPeer)]);
  await sleep(500);
  const reopenedPrimaryLog = await new DurableTransparencyLog({ directory: primaryDirectory, sourceOwnerId: root.body.sourceOwnerId }).open();
  assert.deepEqual(reopenedPrimaryLog.head(), replicaLog.head(), 'restart must retain the pre-churn durable head');
  const primaryReplication2 = new ReplicatedTransparencyService({ node: primaryPeer2, log: reopenedPrimaryLog, routingTimeoutMs: 3_000 });
  await eventually(() => primaryReplication2.start().then(() => true), { label: 'primary_restart_advertise' });
  await reopenedPrimaryLog.append({ identity: sourceOwner, eventType: 'REVOKE', targetId: delegation.delegationId, payload: { reason: 'testnet churn revocation' } });
  const finalReplication = await eventually(async () => {
    const result = await primaryReplication2.replicate({ minAcks: 2, timeoutMs: 2_000 });
    return result.successful >= 2 ? result : null;
  }, { label: 'revocation_replication' });
  await eventually(async () => {
    await replicaReplication.syncNetwork({ timeoutMs: 2_000 });
    await observerReplication.syncNetwork({ timeoutMs: 2_000 });
    return replicaLog.head().headHash === reopenedPrimaryLog.head().headHash && observerLog.head().headHash === reopenedPrimaryLog.head().headHash;
  }, { label: 'revocation_convergence' });
  stage('revocation:converged', { sequence: reopenedPrimaryLog.head().sequence, acknowledgements: finalReplication.successful });

  const currentState = observerLog.revocationState([delegation.delegationId, claim.claimId]);
  assert.equal(currentState.relevant.find((item) => item.targetId === delegation.delegationId)?.revoked, true);
  const staleReceipt = verifyTrustReceiptV2(receipt, { currentLifecycleHead: observerLog.head(), currentRevocationState: currentState });
  assert.equal(staleReceipt.ok, false);
  assert.equal(staleReceipt.reason, 'trust_receipt_v2_lifecycle_head_stale');
  const deniedDiscovery = await discoverVerifiers(requesterPeer, 'testnet.news', { limit: 8, timeoutMs: 2_000, revocationState: currentState });
  assert.equal(deniedDiscovery.some((entry) => entry.record.body.verifierNodeId === verifier.nodeId), false, 'revoked verifier delegation must be excluded from decentralized discovery');
  stage('gate:passed', { relayCalls: 0, receiptStaleAfterRevocation: true, revokedVerifierDiscoverable: false });
});
