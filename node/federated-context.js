import { contextQueryHash, verifyContextManifest } from '../core/context/index.js';
import {
  defaultDistributedCandidateSelector,
  distributedPayloadBytes,
  distributedPublicResult,
  expectedManifestPartition,
  verifyDistributedCandidate
} from '../core/context/distributed-retrieval.js';
import {
  buildCandidateQuorum,
  holderOperationalTrust,
  selectTrustedReplicaSet
} from '../core/context/byzantine-retrieval.js';

function parsePlacementOffer(offer, rootCid, manifest) {
  const metadata = offer?.payload?.metadata?.distributedContext;
  if (!metadata || metadata.rootCid !== rootCid || metadata.holderNodeId !== offer.from) return null;
  if (!Number.isInteger(metadata.partitionCount) || metadata.partitionCount < 1 || metadata.partitionCount > 4096) return null;
  if (!Number.isInteger(metadata.partitionIndex) || metadata.partitionIndex < 0 || metadata.partitionIndex >= metadata.partitionCount) return null;
  const expectedCount = expectedManifestPartition(manifest, metadata.partitionIndex, metadata.partitionCount).length;
  if (metadata.blockCount !== expectedCount) return null;
  return {
    nodeId: offer.from,
    publicKey: offer.publicKey,
    trust: offer.trust || null,
    partitionIndex: metadata.partitionIndex,
    partitionCount: metadata.partitionCount,
    requestCapability: metadata.requestCapability,
    blockCount: metadata.blockCount,
    offer
  };
}

function groupPlacementCoverage(manifest, offers, rootCid) {
  const holders = (offers || []).map((offer) => parsePlacementOffer(offer, rootCid, manifest)).filter(Boolean);
  if (holders.length === 0) {
    const error = new Error('distributed_context_no_federated_holders');
    error.code = 'distributed_context_no_federated_holders';
    throw error;
  }
  const counts = [...new Set(holders.map((holder) => holder.partitionCount))];
  if (counts.length !== 1) throw new Error('distributed_context_partition_contract_mismatch');
  const partitionCount = counts[0];
  const byPartition = new Map();
  for (const holder of holders) {
    if (!byPartition.has(holder.partitionIndex)) byPartition.set(holder.partitionIndex, []);
    byPartition.get(holder.partitionIndex).push(holder);
  }
  const missing = [];
  for (let index = 0; index < partitionCount; index += 1) if (!byPartition.has(index)) missing.push(index);
  if (missing.length > 0) {
    const error = new Error('distributed_context_incomplete_federated_coverage');
    error.code = 'distributed_context_incomplete_federated_coverage';
    error.missingPartitions = missing;
    throw error;
  }
  return { holders, partitionCount, byPartition };
}

export class FederatedByzantineContextCoordinator {
  constructor({
    manifestResolver,
    placementResolver,
    holderRequester,
    candidateSelector = defaultDistributedCandidateSelector,
    candidateKPerPartition = 2,
    replicaReads = 3,
    quorum = 2,
    now = () => Date.now()
  } = {}) {
    if (typeof manifestResolver !== 'function') throw new Error('federated coordinator manifestResolver is required');
    if (!placementResolver || typeof placementResolver.findOffers !== 'function') throw new Error('federated coordinator placementResolver is required');
    if (typeof holderRequester !== 'function') throw new Error('federated coordinator holderRequester is required');
    if (typeof candidateSelector !== 'function') throw new Error('federated coordinator candidateSelector is required');
    if (!Number.isInteger(candidateKPerPartition) || candidateKPerPartition < 1 || candidateKPerPartition > 8) throw new Error('candidateKPerPartition must be 1..8');
    if (!Number.isInteger(replicaReads) || replicaReads < 1 || replicaReads > 16) throw new Error('replicaReads must be 1..16');
    if (!Number.isInteger(quorum) || quorum < 1 || quorum > replicaReads) throw new Error('quorum must be 1..replicaReads');
    this.manifestResolver = manifestResolver;
    this.placementResolver = placementResolver;
    this.holderRequester = holderRequester;
    this.candidateSelector = candidateSelector;
    this.candidateKPerPartition = candidateKPerPartition;
    this.replicaReads = replicaReads;
    this.quorum = quorum;
    this.now = now;
    this.metrics = {
      retrievals: 0,
      discoveryCalls: 0,
      placementOffers: 0,
      holderRequests: 0,
      holderResponses: 0,
      holderFailures: 0,
      responseQuorumFailures: 0,
      candidatesReceived: 0,
      candidatesVerified: 0,
      candidateQuorumRejected: 0
    };
  }

  async resolveManifest(rootCid) {
    const manifest = await this.manifestResolver(rootCid);
    const verification = verifyContextManifest(manifest, rootCid);
    if (!verification.ok) throw new Error(`federated manifest verification failed: ${verification.reason}`);
    return manifest;
  }

  async discover(rootCid, manifest) {
    this.metrics.discoveryCalls += 1;
    const offers = await this.placementResolver.findOffers(rootCid, { now: this.now() });
    this.metrics.placementOffers += offers.length;
    const coverage = groupPlacementCoverage(manifest, offers, rootCid);
    const selectedByPartition = new Map();
    for (let index = 0; index < coverage.partitionCount; index += 1) {
      selectedByPartition.set(index, selectTrustedReplicaSet(coverage.byPartition.get(index), {
        replicaReads: this.replicaReads,
        quorum: this.quorum,
        now: this.now()
      }));
    }
    return { ...coverage, selectedByPartition };
  }

  async retrieve(rootCid, question, { topK = 1 } = {}) {
    if (typeof question !== 'string' || question.trim().length < 3) throw new Error('federated retrieval question is required');
    if (!Number.isInteger(topK) || topK < 1 || topK > 8) throw new Error('federated retrieval topK must be 1..8');
    this.metrics.retrievals += 1;
    const manifest = await this.resolveManifest(rootCid);
    const coverage = await this.discover(rootCid, manifest);
    const queryHash = contextQueryHash(question);
    const verifiedCandidates = [];
    const successfulResponses = new Map();
    let networkBytes = 0;
    let queriedHolders = 0;

    for (const [partitionIndex, holders] of coverage.selectedByPartition.entries()) {
      successfulResponses.set(partitionIndex, 0);
      const responses = await Promise.all(holders.map(async (holder) => {
        const input = { rootCid, query: question, queryHash, candidateK: this.candidateKPerPartition };
        this.metrics.holderRequests += 1;
        queriedHolders += 1;
        networkBytes += distributedPayloadBytes(input);
        try {
          const response = await this.holderRequester(holder, input);
          return { holder, response };
        } catch (error) {
          this.metrics.holderFailures += 1;
          return { holder, error };
        }
      }));

      for (const { holder, response, error } of responses) {
        if (error || !response) continue;
        const output = response.output || response;
        networkBytes += Number.isFinite(response.networkBytes) ? response.networkBytes : distributedPayloadBytes(output);
        if (response.providerNodeId && response.providerNodeId !== holder.nodeId) continue;
        if (output.rootCid !== rootCid || output.queryHash !== queryHash || output.holderNodeId !== holder.nodeId) continue;
        if (output.partitionIndex !== holder.partitionIndex || output.partitionCount !== holder.partitionCount) continue;
        successfulResponses.set(partitionIndex, successfulResponses.get(partitionIndex) + 1);
        this.metrics.holderResponses += 1;
        const candidates = Array.isArray(output.candidates) ? output.candidates : [];
        this.metrics.candidatesReceived += candidates.length;
        for (const candidate of candidates) {
          const verification = verifyDistributedCandidate({
            manifest,
            rootCid,
            queryHash,
            holder,
            candidate,
            publicKeyPem: holder.publicKey
          });
          if (!verification.ok) continue;
          this.metrics.candidatesVerified += 1;
          verifiedCandidates.push({
            ...candidate,
            holderNodeId: holder.nodeId,
            partitionIndex: holder.partitionIndex,
            holderTrust: holderOperationalTrust(holder, { now: this.now() })
          });
        }
      }
    }

    for (let index = 0; index < coverage.partitionCount; index += 1) {
      if ((successfulResponses.get(index) || 0) < this.quorum) {
        this.metrics.responseQuorumFailures += 1;
        const error = new Error('distributed_context_response_quorum_failed');
        error.code = 'distributed_context_response_quorum_failed';
        error.partitionIndex = index;
        throw error;
      }
    }

    const quorumCandidates = buildCandidateQuorum(verifiedCandidates, { quorum: this.quorum });
    this.metrics.candidateQuorumRejected += Math.max(0, verifiedCandidates.length - quorumCandidates.length);
    if (quorumCandidates.length === 0) {
      const error = new Error('distributed_context_no_byzantine_quorum_candidate');
      error.code = 'distributed_context_no_byzantine_quorum_candidate';
      throw error;
    }

    const selected = await this.candidateSelector(question, quorumCandidates, { topK, rootCid, manifest });
    if (!Array.isArray(selected) || selected.length < topK) throw new Error('federated candidate selector returned too few candidates');
    const byCid = new Map(quorumCandidates.map((candidate) => [candidate.cid, candidate]));
    const normalized = [];
    for (const item of selected.slice(0, topK)) {
      const candidate = typeof item === 'string' ? quorumCandidates.find((value) => value.id === item || value.cid === item) : item;
      if (!candidate || !byCid.has(candidate.cid)) throw new Error('federated selector selected a non-quorum candidate');
      normalized.push(byCid.get(candidate.cid));
    }

    const selectedHolders = [...coverage.selectedByPartition.values()].flat();
    const result = distributedPublicResult({
      rootCid,
      query: question,
      selected: normalized,
      coverage: {
        partitionCount: coverage.partitionCount,
        authorizedHolderOffers: coverage.holders.length,
        selectedHolders
      },
      candidateCount: quorumCandidates.length,
      networkBytes
    });
    result.provenance.discovery = 'dht-gossip-federation';
    result.provenance.byzantine = {
      replicaReads: this.replicaReads,
      quorum: this.quorum,
      queriedHolders,
      successfulResponses: [...successfulResponses.entries()].map(([partitionIndex, count]) => ({ partitionIndex, count })),
      selected: normalized.map((candidate) => ({
        contentCommitment: candidate.quorum.contentCommitment,
        quorumObserved: candidate.quorum.observed,
        holderNodeIds: candidate.quorum.holderNodeIds,
        holderReceiptDigests: candidate.quorum.holderReceiptDigests
      }))
    };
    result.provenance.queriedHolders = queriedHolders;
    return result;
  }

  async retrieveForAgent(input, options = {}) {
    const keys = Object.keys(input || {}).sort();
    if (keys.join(',') !== 'question,rootCid') throw new Error('federated agent input must contain exactly question + rootCid');
    return this.retrieve(input.rootCid, input.question, options);
  }

  stats() {
    return { ...this.metrics };
  }
}
