import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { buildContextDocument } from '../core/context/index.js';
import {
  createDistributedHolderReceipt,
  distributedPartitionForBlockCid
} from '../core/context/distributed-retrieval.js';
import {
  FederatedPlacementResolver,
  PlacementDirectoryPeer,
  createPlacementRecord,
  createPlacementRevocation,
  placementResponsiblePeers,
  publishPlacementDht,
  verifyPlacementRecord
} from '../core/network/placement-discovery.js';
import { selectTrustedReplicaSet } from '../core/context/byzantine-retrieval.js';
import { FederatedByzantineContextCoordinator } from '../node/federated-context.js';

function fixtureDocument() {
  return buildContextDocument(Array.from({ length: 36 }, (_, index) => ({
    id: `item-${index}`,
    text: index === 17
      ? 'The verified Zephyr rendezvous code is amber-nine and this is the only authoritative answer in the corpus.'
      : `Neutral archive item ${index} about routine distributed systems operations.`
  })));
}

function partitionBlocks(document, partitionIndex, partitionCount) {
  return document.blocks.filter((block) => distributedPartitionForBlockCid(block.cid, partitionCount) === partitionIndex);
}

function candidateFor({ identity, block, rootCid, queryHash, partitionIndex, partitionCount }) {
  const candidate = {
    id: block.id,
    cid: block.cid,
    text: block.text,
    bytes: block.bytes,
    localRank: 1
  };
  candidate.receipt = createDistributedHolderReceipt({
    identity,
    rootCid,
    queryHash,
    block: candidate,
    partitionIndex,
    partitionCount,
    localRank: 1
  });
  return candidate;
}

test('signed placement records survive DHT placement, gossip, federation and holder revocation without relay discovery', async () => {
  const document = fixtureDocument();
  const holder = createIdentity();
  const peers = Array.from({ length: 5 }, (_, index) => new PlacementDirectoryPeer({ peerId: `directory-${index}` }));
  const partitionCount = 2;
  const partitionIndex = 0;
  const now = Date.now();
  const record = createPlacementRecord({
    identity: holder,
    rootCid: document.cid,
    partitionIndex,
    partitionCount,
    blockCount: partitionBlocks(document, partitionIndex, partitionCount).length,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    sequence: 1
  });
  assert.equal(verifyPlacementRecord(record, { now }).ok, true);

  const published = publishPlacementDht(record, peers, { replicationFactor: 3, now });
  assert.equal(published.responsiblePeerIds.length, 3);
  peers[0].gossipWith(peers[4], { now });

  const resolver = new FederatedPlacementResolver({
    peers,
    replicationFactor: 5,
    minDirectoryAgreement: 2,
    trustResolver: async (nodeId) => ({ score: nodeId === holder.nodeId ? 0.91 : 0 })
  });
  const offers = await resolver.findOffers(document.cid, { now });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].from, holder.nodeId);
  assert.equal(offers[0].trust.score, 0.91);
  assert.ok(offers[0].payload.metadata.distributedContext.placement.directoryAgreement >= 2);

  const revocation = createPlacementRevocation({ identity: holder, record, revokedAt: new Date(now + 1).toISOString() });
  for (const peer of placementResponsiblePeers(document.cid, peers, { replicationFactor: 3 })) peer.ingestRevocation(revocation);
  for (let index = 0; index < peers.length - 1; index += 1) peers[index].gossipWith(peers[index + 1], { now: now + 2 });
  assert.equal((await resolver.findOffers(document.cid, { now: now + 2 })).length, 0);
});

test('Trustability-aware replica selection prefers stronger holders while preserving failure-domain diversity', () => {
  const holders = [
    { nodeId: 'a', trust: { score: 0.99 }, offer: { payload: { metadata: { distributedContext: { placement: { failureDomainCommitment: 'zone-a' } } } } } },
    { nodeId: 'b', trust: { score: 0.95 }, offer: { payload: { metadata: { distributedContext: { placement: { failureDomainCommitment: 'zone-a' } } } } },
    { nodeId: 'c', trust: { score: 0.80 }, offer: { payload: { metadata: { distributedContext: { placement: { failureDomainCommitment: 'zone-b' } } } } },
    { nodeId: 'd', trust: { score: 0.70 }, offer: { payload: { metadata: { distributedContext: { placement: { failureDomainCommitment: 'zone-c' } } } } }
  ];
  const selected = selectTrustedReplicaSet(holders, { replicaReads: 3, quorum: 2, requireFailureDomainDiversity: true });
  assert.deepEqual(selected.map((item) => item.nodeId), ['a', 'c', 'd']);
});

test('federated Byzantine retrieval tolerates one malicious replica and reaches 2-of-3 candidate quorum without relay discovery', async () => {
  const document = fixtureDocument();
  const partitionCount = 2;
  const replicasPerPartition = 3;
  const peers = Array.from({ length: 5 }, (_, index) => new PlacementDirectoryPeer({ peerId: `directory-${index}` }));
  const holderState = new Map();
  const now = Date.now();
  const targetBlock = document.blocks.find((block) => block.id === 'item-17');
  const targetPartition = distributedPartitionForBlockCid(targetBlock.cid, partitionCount);

  for (let partitionIndex = 0; partitionIndex < partitionCount; partitionIndex += 1) {
    for (let replica = 0; replica < replicasPerPartition; replica += 1) {
      const identity = createIdentity();
      const blocks = partitionBlocks(document, partitionIndex, partitionCount);
      holderState.set(identity.nodeId, { identity, blocks, partitionIndex, malicious: partitionIndex === targetPartition && replica === 0 });
      const record = createPlacementRecord({
        identity,
        rootCid: document.cid,
        partitionIndex,
        partitionCount,
        blockCount: blocks.length,
        sequence: 1,
        failureDomainCommitment: `p${partitionIndex}-r${replica}`,
        issuedAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 120_000).toISOString()
      });
      publishPlacementDht(record, peers, { replicationFactor: 5, now });
    }
  }

  const trustByHolder = new Map([...holderState.entries()].map(([nodeId, state]) => [nodeId, state.malicious ? 0.99 : 0.9]));
  const placementResolver = new FederatedPlacementResolver({
    peers,
    replicationFactor: 5,
    minDirectoryAgreement: 3,
    trustResolver: async (nodeId) => ({ score: trustByHolder.get(nodeId) || 0 })
  });

  const holderRequester = async (holder, input) => {
    const state = holderState.get(holder.nodeId);
    let block;
    if (state.partitionIndex === targetPartition && !state.malicious) block = targetBlock;
    else if (state.partitionIndex === targetPartition && state.malicious) block = state.blocks.find((item) => item.cid !== targetBlock.cid) || state.blocks[0];
    else block = state.blocks[0];
    const candidate = candidateFor({
      identity: state.identity,
      block,
      rootCid: input.rootCid,
      queryHash: input.queryHash,
      partitionIndex: state.partitionIndex,
      partitionCount
    });
    return {
      providerNodeId: holder.nodeId,
      output: {
        protocol: 'truyn-distributed-context-v1',
        version: 1,
        rootCid: input.rootCid,
        queryHash: input.queryHash,
        holderNodeId: holder.nodeId,
        partitionIndex: state.partitionIndex,
        partitionCount,
        candidates: [candidate]
      }
    };
  };

  const coordinator = new FederatedByzantineContextCoordinator({
    manifestResolver: async (rootCid) => rootCid === document.cid ? structuredClone(document.manifest) : null,
    placementResolver,
    holderRequester,
    replicaReads: 3,
    quorum: 2,
    candidateKPerPartition: 1
  });
  const result = await coordinator.retrieveForAgent({
    question: 'What is the Zephyr rendezvous code?',
    rootCid: document.cid
  });

  assert.equal(result.context, targetBlock.text);
  assert.equal(result.provenance.verified, true);
  assert.equal(result.provenance.discovery, 'dht-gossip-federation');
  assert.equal(result.provenance.byzantine.quorum, 2);
  assert.equal(result.provenance.byzantine.replicaReads, 3);
  assert.equal(result.provenance.byzantine.selected[0].quorumObserved, 2);
  assert.equal(result.provenance.queriedHolders, partitionCount * replicasPerPartition);
  assert.equal(JSON.stringify(result).includes('truyn:ctxb:'), false);
  assert.equal(JSON.stringify(result).includes('item-17'), false);
});
