import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import {
  createDistributedHolderReceipt,
  distributedDiscoveryCapability,
  distributedPartitionForBlockCid,
  distributedRequestCapability,
  resolveDistributedCoverage,
  verifyDistributedCandidate
} from '../core/context/distributed-retrieval.js';
import { buildContextDocument, contextQueryHash } from '../core/context/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { DistributedContextCoordinator, DistributedContextHolderHost } from '../node/distributed-context.js';

function fixtureDocument() {
  const blocks = Array.from({ length:90 }, (_, index) => ({
    id:`record-${String(index).padStart(3, '0')}`,
    text:index === 47
      ? 'Orchid protocol rendezvous answer is cobalt-seven and belongs only to this immutable record.'
      : `Unrelated archive record ${index} about neutral infrastructure telemetry and routine operations.`
  }));
  return buildContextDocument(blocks);
}

function partitionBlocks(document, partitionIndex, partitionCount) {
  return document.blocks.filter((block) => distributedPartitionForBlockCid(block.cid, partitionCount) === partitionIndex);
}

function offerFor({ identity, document, partitionIndex, partitionCount, allowedRequesterId }) {
  return {
    from:identity.nodeId,
    publicKey:identity.publicKeyPem,
    payload:{
      metadata:{
        accessMode:'owner-only',
        allowedRequesterIds:[allowedRequesterId],
        distributedContext:{
          protocol:'truyn-distributed-context-v1',
          version:1,
          role:'context-partition-holder',
          rootCid:document.cid,
          holderNodeId:identity.nodeId,
          partitionIndex,
          partitionCount,
          requestCapability:distributedRequestCapability(document.cid, identity.nodeId, partitionIndex),
          blockCount:partitionBlocks(document, partitionIndex, partitionCount).length
        }
      }
    }
  };
}

test('distributed candidate provenance rejects content tampering', () => {
  const document = fixtureDocument();
  const identity = createIdentity();
  const partitionCount = 3;
  const block = document.blocks[47];
  const partitionIndex = distributedPartitionForBlockCid(block.cid, partitionCount);
  const query = 'What is the Orchid protocol rendezvous answer?';
  const queryHash = contextQueryHash(query);
  const candidate = {
    id:block.id,
    cid:block.cid,
    text:block.text,
    bytes:block.bytes,
    localRank:1
  };
  candidate.receipt = createDistributedHolderReceipt({
    identity,
    rootCid:document.cid,
    queryHash,
    block:candidate,
    partitionIndex,
    partitionCount,
    localRank:1
  });
  const holder = { nodeId:identity.nodeId, partitionIndex, partitionCount };
  assert.deepEqual(verifyDistributedCandidate({
    manifest:document.manifest,
    rootCid:document.cid,
    queryHash,
    holder,
    candidate,
    publicKeyPem:identity.publicKeyPem
  }), { ok:true });

  const tampered = structuredClone(candidate);
  tampered.text = `${tampered.text} tampered`;
  assert.equal(verifyDistributedCandidate({
    manifest:document.manifest,
    rootCid:document.cid,
    queryHash,
    holder,
    candidate:tampered,
    publicKeyPem:identity.publicKeyPem
  }).ok, false);
});

test('distributed coverage fails closed when a manifest partition has no authorized holder', () => {
  const document = fixtureDocument();
  const requester = createIdentity();
  const holders = [createIdentity(), createIdentity(), createIdentity()];
  const partitionCount = 3;
  const offers = holders.map((identity, partitionIndex) => offerFor({
    identity,
    document,
    partitionIndex,
    partitionCount,
    allowedRequesterId:requester.nodeId
  }));
  assert.equal(resolveDistributedCoverage(document.manifest, offers, document.cid).partitionCount, 3);
  assert.throws(
    () => resolveDistributedCoverage(document.manifest, offers.slice(0, 2), document.cid),
    (error) => error?.code === 'distributed_context_incomplete_coverage'
  );
});

test('root CID discovers authorized holders and retrieves minimal verified context across three TRUYN nodes', async (t) => {
  const document = fixtureDocument();
  const partitionCount = 3;
  const coordinatorIdentity = createIdentity();
  const unauthorizedIdentity = createIdentity();
  const holderIdentities = [createIdentity(), createIdentity(), createIdentity()];
  const relay = createRelay({
    allowedNodeIds:[coordinatorIdentity.nodeId, unauthorizedIdentity.nodeId, ...holderIdentities.map((identity) => identity.nodeId)],
    trustedRequesterNodeIds:[coordinatorIdentity.nodeId, unauthorizedIdentity.nodeId],
    nodeFreshnessMs:30_000
  });
  const relayUrl = await relay.listen({ port:0 });
  t.after(() => relay.close());

  const holderHosts = [];
  for (let partitionIndex = 0; partitionIndex < partitionCount; partitionIndex += 1) {
    const node = new TruynNode({ relayUrl, identity:holderIdentities[partitionIndex] });
    const host = new DistributedContextHolderHost({
      node,
      manifest:document.manifest,
      blocks:partitionBlocks(document, partitionIndex, partitionCount),
      partitionIndex,
      partitionCount,
      allowedRequesterIds:[coordinatorIdentity.nodeId],
      candidateK:2,
      pollIntervalMs:2
    });
    await host.start();
    holderHosts.push(host);
  }
  t.after(async () => Promise.all(holderHosts.map((host) => host.stop())));

  const coordinatorNode = new TruynNode({ relayUrl, identity:coordinatorIdentity });
  const coordinator = new DistributedContextCoordinator({
    node:coordinatorNode,
    manifestResolver:async (rootCid) => rootCid === document.cid ? structuredClone(document.manifest) : null,
    candidateKPerPartition:2,
    resultTimeoutMs:5_000,
    pollIntervalMs:2
  });
  await coordinator.register();

  const input = {
    question:'What is the Orchid protocol rendezvous answer?',
    rootCid:document.cid
  };
  const result = await coordinator.retrieveForAgent(input);
  assert.equal(result.context, document.blocks.find((block) => block.id === 'record-047').text);
  assert.equal(result.provenance.verified, true);
  assert.equal(result.provenance.rootCid, document.cid);
  assert.equal(result.provenance.partitionCount, 3);
  assert.equal(result.provenance.queriedHolders, 3);
  assert.ok(result.provenance.networkCandidateCount >= 1);
  assert.ok(result.provenance.networkCandidateCount <= 6);
  assert.equal(result.provenance.selected.length, 1);

  const publicJson = JSON.stringify(result);
  assert.equal(publicJson.includes('record-047'), false);
  assert.equal(publicJson.includes('truyn:ctxb:'), false);
  assert.equal(publicJson.includes('"blockId"'), false);
  assert.equal(publicJson.includes('"cid"'), false);

  const coordinatorStats = coordinator.stats();
  assert.equal(coordinatorStats.holderNeeds, 3);
  assert.equal(coordinatorStats.holderResults, 3);
  assert.equal(coordinatorStats.provenanceFailures, 0);
  assert.equal(holderHosts.every((host) => host.stats().needsAuthorized === 1), true);

  const unauthorizedNode = new TruynNode({ relayUrl, identity:unauthorizedIdentity });
  await unauthorizedNode.register({ name:'unauthorized distributed requester' });
  const discovery = await unauthorizedNode.find(distributedDiscoveryCapability(document.cid));
  assert.equal(discovery.offers.length, 0);
  await assert.rejects(
    () => unauthorizedNode.need(holderHosts[0].requestCapability, {
      rootCid:document.cid,
      query:input.question,
      queryHash:contextQueryHash(input.question),
      candidateK:2
    }),
    (error) => error?.message === 'no_matching_provider'
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(holderHosts[0].stats().needsDenied, 0, 'relay must deny before the holder sees the unauthorized NEED');
});
