import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createIdentity } from '../core/identity/index.js';
import {
  distributedDiscoveryCapability,
  distributedPartitionForBlockCid
} from '../core/context/distributed-retrieval.js';
import { buildContextDocument } from '../core/context/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { DistributedContextCoordinator, DistributedContextHolderHost } from '../node/distributed-context.js';

const outputPath = process.env.DISTRIBUTED_RETRIEVAL_OUTPUT || 'distributed-semantic-retrieval.json';
const corpusBlocks = Number(process.env.DISTRIBUTED_RETRIEVAL_BLOCKS || 600);
const partitionCount = Number(process.env.DISTRIBUTED_RETRIEVAL_PARTITIONS || 4);
const queryCount = Number(process.env.DISTRIBUTED_RETRIEVAL_QUERIES || 48);
const candidateK = Number(process.env.DISTRIBUTED_RETRIEVAL_CANDIDATE_K || 2);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function latency(values) {
  if (!values.length) return { count:0, minMs:null, p50Ms:null, p95Ms:null, p99Ms:null, maxMs:null, meanMs:null };
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count:values.length,
    minMs:Number(Math.min(...values).toFixed(3)),
    p50Ms:Number(percentile(values, 50).toFixed(3)),
    p95Ms:Number(percentile(values, 95).toFixed(3)),
    p99Ms:Number(percentile(values, 99).toFixed(3)),
    maxMs:Number(Math.max(...values).toFixed(3)),
    meanMs:Number((total / values.length).toFixed(3))
  };
}

function pctReduction(smaller, larger) {
  return larger > 0 ? Number((((larger - smaller) / larger) * 100).toFixed(3)) : null;
}

function makeFixture() {
  if (!Number.isInteger(corpusBlocks) || corpusBlocks < 100) throw new Error('distributed benchmark requires at least 100 blocks');
  if (!Number.isInteger(partitionCount) || partitionCount < 2 || partitionCount > 32) throw new Error('distributed benchmark partitions must be 2..32');
  if (!Number.isInteger(queryCount) || queryCount < 1 || queryCount > Math.min(100, corpusBlocks)) throw new Error('invalid distributed benchmark query count');

  const targetIndexes = Array.from({ length:queryCount }, (_, index) => Math.floor((index + 1) * corpusBlocks / (queryCount + 1)));
  const targetSet = new Set(targetIndexes);
  const targetByQuestion = new Map();
  const blocks = Array.from({ length:corpusBlocks }, (_, index) => {
    const id = `record-${String(index).padStart(5, '0')}`;
    if (targetSet.has(index)) {
      const ordinal = targetIndexes.indexOf(index) + 1;
      const topic = `meadow-${String(ordinal).padStart(3, '0')}-quartz`;
      const answer = `code-${String((ordinal * 7919) % 100000).padStart(5, '0')}`;
      const question = `What is the access phrase for ${topic}?`;
      const text = `The access phrase for ${topic} is ${answer}. This immutable statement is the authoritative distributed context for that topic.`;
      targetByQuestion.set(question, { id, text, index, topic, answer });
      return { id, text };
    }
    return {
      id,
      text:`Neutral archive entry ${index} covers routine telemetry, infrastructure maintenance, ordinary scheduling, and unrelated operational notes.`
    };
  });
  return { document:buildContextDocument(blocks), targetByQuestion };
}

function partitionBlocks(document, partitionIndex) {
  return document.blocks.filter((block) => distributedPartitionForBlockCid(block.cid, partitionCount) === partitionIndex);
}

const { document, targetByQuestion } = makeFixture();
const coordinatorIdentity = createIdentity();
const unauthorizedIdentity = createIdentity();
const holderIdentities = Array.from({ length:partitionCount }, () => createIdentity());
const replicaIdentity = createIdentity();

const relay = createRelay({
  allowedNodeIds:[
    coordinatorIdentity.nodeId,
    unauthorizedIdentity.nodeId,
    ...holderIdentities.map((identity) => identity.nodeId),
    replicaIdentity.nodeId
  ],
  trustedRequesterNodeIds:[coordinatorIdentity.nodeId],
  allowPublicDispatch:true,
  nodeFreshnessMs:60_000,
  maxQueuedEventsPerNode:256
});
const relayUrl = await relay.listen({ port:0 });
const holderHosts = [];

try {
  for (let partitionIndex = 0; partitionIndex < partitionCount; partitionIndex += 1) {
    const node = new TruynNode({ relayUrl, identity:holderIdentities[partitionIndex] });
    const host = new DistributedContextHolderHost({
      node,
      manifest:document.manifest,
      blocks:partitionBlocks(document, partitionIndex),
      partitionIndex,
      partitionCount,
      allowedRequesterIds:[coordinatorIdentity.nodeId],
      candidateK,
      pollIntervalMs:2
    });
    await host.start();
    holderHosts.push(host);
  }

  // Replica proves that placement is not identity: two independently signed nodes
  // may serve the same immutable partition without changing the root CID.
  const replicaHost = new DistributedContextHolderHost({
    node:new TruynNode({ relayUrl, identity:replicaIdentity }),
    manifest:document.manifest,
    blocks:partitionBlocks(document, 0),
    partitionIndex:0,
    partitionCount,
    allowedRequesterIds:[coordinatorIdentity.nodeId],
    candidateK,
    pollIntervalMs:2
  });
  await replicaHost.start();
  holderHosts.push(replicaHost);

  const coordinatorNode = new TruynNode({ relayUrl, identity:coordinatorIdentity });
  const coordinator = new DistributedContextCoordinator({
    node:coordinatorNode,
    manifestResolver:async (rootCid) => rootCid === document.cid ? structuredClone(document.manifest) : null,
    candidateKPerPartition:candidateK,
    resultTimeoutMs:10_000,
    pollIntervalMs:2
  });
  await coordinator.register();

  const discovery = await coordinator.discover(document.cid);
  if (discovery.partitionCount !== partitionCount) throw new Error('distributed benchmark discovery partition mismatch');
  if (discovery.authorizedHolderOffers !== partitionCount + 1) throw new Error('distributed benchmark replica discovery mismatch');
  if (discovery.replicas !== 1) throw new Error('distributed benchmark replica count mismatch');

  const unauthorizedNode = new TruynNode({ relayUrl, identity:unauthorizedIdentity });
  await unauthorizedNode.register({ name:'distributed benchmark unauthorized requester' });
  const holderStatsBeforeUnauthorized = holderHosts.map((host) => host.stats());
  const unauthorizedDiscovery = await unauthorizedNode.find(distributedDiscoveryCapability(document.cid));
  if (unauthorizedDiscovery.offers.length !== 0) throw new Error('unauthorized requester discovered private distributed holders');
  await assertNoUnauthorizedRoute(unauthorizedNode, holderHosts[0], document.cid, [...targetByQuestion.keys()][0]);
  await delay(20);
  const holderStatsAfterUnauthorized = holderHosts.map((host) => host.stats());
  const unauthorizedHolderWork = holderStatsAfterUnauthorized.reduce((sum, stats, index) =>
    sum + (stats.needsReceived - holderStatsBeforeUnauthorized[index].needsReceived), 0);

  const samples = [];
  const latencies = [];
  let correct = 0;
  let provenanceVerified = 0;
  let minimalContext = 0;
  let leakageFree = 0;
  let totalNetworkBytes = 0;
  let totalNetworkCandidates = 0;

  for (const [question, expected] of targetByQuestion) {
    const requesterInput = { question, rootCid:document.cid };
    const requesterJson = JSON.stringify(requesterInput);
    if (requesterJson.includes(expected.id) || requesterJson.includes('truyn:ctxb:') || requesterJson.includes('"ids"')) {
      throw new Error('distributed benchmark requester input leaked routing identifiers');
    }

    const startedAt = performance.now();
    const result = await coordinator.retrieveForAgent(requesterInput, { topK:1 });
    const elapsedMs = performance.now() - startedAt;
    latencies.push(elapsedMs);

    const isCorrect = result.context === expected.text;
    const isProvenance = result.provenance?.verified === true && result.provenance.rootCid === document.cid;
    const isMinimal = typeof result.context === 'string' && result.context === expected.text && !result.context.includes('\n\n');
    const publicJson = JSON.stringify(result);
    const noLeak = !publicJson.includes(expected.id)
      && !publicJson.includes('truyn:ctxb:')
      && !publicJson.includes('"blockId"')
      && !publicJson.includes('"blockCid"')
      && !publicJson.includes('"ids"');

    if (isCorrect) correct += 1;
    if (isProvenance) provenanceVerified += 1;
    if (isMinimal) minimalContext += 1;
    if (noLeak) leakageFree += 1;
    totalNetworkBytes += result.provenance.networkBytes;
    totalNetworkCandidates += result.provenance.networkCandidateCount;

    samples.push({
      question,
      expectedTopic:expected.topic,
      expectedAnswer:expected.answer,
      targetPartition:distributedPartitionForBlockCid(document.blocks.find((block) => block.id === expected.id).cid, partitionCount),
      correct:isCorrect,
      provenanceVerified:isProvenance,
      minimalContext:isMinimal,
      noBlockIdLeakage:noLeak,
      queriedHolders:result.provenance.queriedHolders,
      networkCandidates:result.provenance.networkCandidateCount,
      networkBytes:result.provenance.networkBytes,
      latencyMs:Number(elapsedMs.toFixed(3)),
      selectedProof:result.provenance.selected
    });
  }

  const fullCorpusTransferPerQuery = document.serializedBytes;
  const fullCorpusTransferTotal = fullCorpusTransferPerQuery * queryCount;
  const retrievalAccuracy = correct / queryCount;
  const provenanceRate = provenanceVerified / queryCount;
  const minimalContextRate = minimalContext / queryCount;
  const leakageFreeRate = leakageFree / queryCount;
  const avgCandidates = totalNetworkCandidates / queryCount;
  const networkReduction = pctReduction(totalNetworkBytes, fullCorpusTransferTotal);
  const finalHolderStats = holderHosts.map((host) => ({
    nodeId:host.node.identity.nodeId,
    partitionIndex:host.partitionIndex,
    ...host.stats()
  }));
  const coordinatorStats = coordinator.stats();

  const gates = {
    agentInputQuestionRootCidOnly:true,
    completeAuthorizedCoverage:discovery.partitionCount === partitionCount && discovery.selectedHolders.length === partitionCount,
    replicaDiscovered:discovery.replicas === 1,
    retrievalAccuracy100:retrievalAccuracy === 1,
    provenance100:provenanceRate === 1,
    minimalContext100:minimalContextRate === 1,
    noBlockIdLeakage100:leakageFreeRate === 1,
    unauthorizedDiscoveryZero:unauthorizedDiscovery.offers.length === 0,
    authorizationBeforeHolderWork:unauthorizedHolderWork === 0,
    allQueriesHitEveryPartition:coordinatorStats.holderNeeds === queryCount * partitionCount && coordinatorStats.holderResults === queryCount * partitionCount,
    provenanceFailuresZero:coordinatorStats.provenanceFailures === 0,
    networkPayloadSmallerThanFullCorpus:totalNetworkBytes < fullCorpusTransferTotal
  };

  const report = {
    benchmark:'TRUYN Distributed Semantic Retrieval Primitive v1',
    generatedAt:new Date().toISOString(),
    methodology:{
      semanticQualityScope:'deterministic network/distribution proof; does not replace the live-provider Semantic Retrieval v2 quality benchmark',
      requesterContract:'agent supplies exactly question + rootCid',
      placement:'immutable root split by deterministic block-CID partition across independent signed holder nodes; partition 0 has one extra replica',
      discovery:'root-specific signed OFFER discovery filtered by provider authorization',
      holderRetrieval:'bounded local candidate retrieval; no full-corpus transfer to coordinator',
      provenance:'RESULT signature + manifest membership/CID recomputation + partition verification + holder-signed receipt',
      publicProof:'root/query/holder/commitment/receipt digest; raw block IDs and block CIDs are not returned to the agent'
    },
    corpus:{
      rootCid:document.cid,
      blocks:document.blocks.length,
      contentBytes:document.contentBytes,
      serializedBytes:document.serializedBytes,
      partitions:partitionCount,
      holderNodes:holderHosts.length,
      replicas:1,
      queries:queryCount,
      candidateKPerPartition:candidateK
    },
    discovery:{
      authorizedHolderOffers:discovery.authorizedHolderOffers,
      selectedHolders:discovery.selectedHolders.length,
      replicas:discovery.replicas,
      unauthorizedHolderOffers:unauthorizedDiscovery.offers.length
    },
    results:{
      correct,
      retrievalAccuracy:Number(retrievalAccuracy.toFixed(6)),
      provenanceVerified,
      provenanceRate:Number(provenanceRate.toFixed(6)),
      minimalContext,
      minimalContextRate:Number(minimalContextRate.toFixed(6)),
      leakageFree,
      leakageFreeRate:Number(leakageFreeRate.toFixed(6)),
      unauthorizedHolderWork,
      totalHolderNeeds:coordinatorStats.holderNeeds,
      totalHolderResults:coordinatorStats.holderResults,
      verifiedCandidates:coordinatorStats.candidatesVerified,
      provenanceFailures:coordinatorStats.provenanceFailures,
      totalNetworkCandidates,
      averageNetworkCandidates:Number(avgCandidates.toFixed(3)),
      totalNetworkBytes,
      fullCorpusTransferPerQuery,
      fullCorpusTransferTotal,
      networkPayloadReductionPct:networkReduction,
      latency:latency(latencies)
    },
    coordinatorStats,
    holderStats:finalHolderStats,
    gates,
    samples,
    passed:Object.values(gates).every(Boolean)
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    benchmark:report.benchmark,
    corpus:report.corpus,
    discovery:report.discovery,
    results:report.results,
    gates:report.gates,
    passed:report.passed
  }, null, 2));
  if (!report.passed) process.exitCode = 2;
} finally {
  await Promise.all(holderHosts.map((host) => host.stop()));
  await relay.close();
}

async function assertNoUnauthorizedRoute(node, holderHost, rootCid, question) {
  try {
    await node.need(holderHost.requestCapability, {
      rootCid,
      query:question,
      queryHash:'sha256:unauthorized-probe',
      candidateK:1
    });
  } catch (error) {
    if (error?.message === 'no_matching_provider') return;
    throw error;
  }
  throw new Error('unauthorized distributed NEED unexpectedly routed to holder');
}
