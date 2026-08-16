import {
  createDistributedHolderReceipt,
  defaultDistributedCandidateSelector,
  distributedDiscoveryCapability,
  distributedOfferMetadata,
  distributedPayloadBytes,
  distributedPublicResult,
  distributedRequestCapability,
  resolveDistributedCoverage,
  validateHolderPartition,
  verifyDistributedCandidate
} from '../core/context/distributed-retrieval.js';
import { contextQueryHash, retrieveContextBlocks, verifyContextManifest } from '../core/context/index.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeCandidateK(value, fallback = 2) {
  const resolved = value == null ? fallback : value;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 8) throw new Error('distributed candidateK must be 1..8');
  return resolved;
}

export class DistributedContextHolderHost {
  constructor({
    node,
    manifest,
    blocks,
    partitionIndex,
    partitionCount,
    allowedRequesterIds = [],
    candidateK = 2,
    retrieval = retrieveContextBlocks,
    pollIntervalMs = 10
  } = {}) {
    if (!node) throw new Error('distributed holder node is required');
    const manifestVerification = verifyContextManifest(manifest, manifest?.cid);
    if (!manifestVerification.ok) throw new Error(`distributed holder manifest invalid: ${manifestVerification.reason}`);
    if (!Array.isArray(blocks)) throw new Error('distributed holder blocks are required');
    if (!Array.isArray(allowedRequesterIds) || allowedRequesterIds.length === 0) throw new Error('distributed holder requires allowed requester IDs');
    if (typeof retrieval !== 'function') throw new Error('distributed holder retrieval function is required');
    this.node = node;
    this.manifest = structuredClone(manifest);
    this.rootCid = manifest.cid;
    this.blocks = structuredClone(blocks);
    this.partitionIndex = partitionIndex;
    this.partitionCount = partitionCount;
    this.allowedRequesterIds = [...new Set(allowedRequesterIds)];
    this.allowedRequesterSet = new Set(this.allowedRequesterIds);
    this.candidateK = normalizeCandidateK(candidateK);
    this.retrieval = retrieval;
    this.pollIntervalMs = pollIntervalMs;
    this.discoveryCapability = distributedDiscoveryCapability(this.rootCid);
    this.requestCapability = distributedRequestCapability(this.rootCid, this.node.identity.nodeId, partitionIndex);
    this.running = false;
    this.loopPromise = null;
    this.offerIds = [];
    this.metrics = {
      needsReceived:0,
      needsAuthorized:0,
      needsDenied:0,
      candidatesReturned:0,
      receiptsSigned:0
    };
    validateHolderPartition({
      manifest:this.manifest,
      blocks:this.blocks,
      partitionIndex:this.partitionIndex,
      partitionCount:this.partitionCount
    });
  }

  async publish() {
    if (!this.node.sessionToken) await this.node.register({ name:`TRUYN distributed context holder p${this.partitionIndex}` });
    if (this.offerIds.length > 0) return this.offerIds;
    const distributedContext = distributedOfferMetadata({
      rootCid:this.rootCid,
      holderNodeId:this.node.identity.nodeId,
      partitionIndex:this.partitionIndex,
      partitionCount:this.partitionCount,
      requestCapability:this.requestCapability,
      blockCount:this.blocks.length
    });
    const metadata = {
      accessMode:'owner-only',
      allowedRequesterIds:this.allowedRequesterIds,
      distributedContext
    };
    const discovery = await this.node.offer(this.discoveryCapability, metadata);
    const request = await this.node.offer(this.requestCapability, metadata);
    this.offerIds.push(discovery.offerId, request.offerId);
    return this.offerIds;
  }

  async handleNeed(event) {
    this.metrics.needsReceived += 1;
    const envelope = event?.envelope;
    if (event?.verification?.ok !== true || envelope?.type !== 'NEED') return false;
    const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
    if (capability !== this.requestCapability) return false;
    const requesterId = envelope.from;
    if (!this.allowedRequesterSet.has(requesterId)) {
      this.metrics.needsDenied += 1;
      await this.node.result(envelope.id, null, {
        distributedContext:true,
        failed:true,
        error:'DISTRIBUTED_CONTEXT_ACCESS_DENIED'
      });
      return true;
    }
    this.metrics.needsAuthorized += 1;
    const input = envelope.payload?.input || {};
    if (input.rootCid !== this.rootCid || typeof input.query !== 'string' || input.query.trim().length < 3) {
      await this.node.result(envelope.id, null, {
        distributedContext:true,
        failed:true,
        error:'DISTRIBUTED_CONTEXT_INVALID_REQUEST'
      });
      return true;
    }
    const queryHash = contextQueryHash(input.query);
    if (input.queryHash !== queryHash) {
      await this.node.result(envelope.id, null, {
        distributedContext:true,
        failed:true,
        error:'DISTRIBUTED_CONTEXT_QUERY_HASH_MISMATCH'
      });
      return true;
    }
    const requestedK = normalizeCandidateK(input.candidateK, this.candidateK);
    const localK = Math.min(requestedK, this.candidateK, Math.max(1, this.blocks.length));
    let retrievedBlocks = [];
    try {
      const retrieved = await this.retrieval(this.blocks, input.query, { topK:localK });
      retrievedBlocks = Array.isArray(retrieved?.blocks) ? retrieved.blocks : [];
    } catch (error) {
      if (String(error?.message || '') !== 'context retrieval produced no relevant blocks') throw error;
    }
    const candidates = retrievedBlocks.map((block, index) => {
      const normalized = {
        id:block.id,
        cid:block.cid,
        text:block.text,
        bytes:block.bytes ?? Buffer.byteLength(block.text || ''),
        score:Number.isFinite(block.score) ? block.score : null,
        localRank:index + 1
      };
      normalized.receipt = createDistributedHolderReceipt({
        identity:this.node.identity,
        rootCid:this.rootCid,
        queryHash,
        block:normalized,
        partitionIndex:this.partitionIndex,
        partitionCount:this.partitionCount,
        localRank:normalized.localRank
      });
      this.metrics.receiptsSigned += 1;
      return normalized;
    });
    this.metrics.candidatesReturned += candidates.length;
    await this.node.result(envelope.id, {
      protocol:'truyn-distributed-context-v1',
      version:1,
      rootCid:this.rootCid,
      queryHash,
      holderNodeId:this.node.identity.nodeId,
      partitionIndex:this.partitionIndex,
      partitionCount:this.partitionCount,
      candidates
    }, {
      distributedContext:true,
      partitionIndex:this.partitionIndex,
      candidateCount:candidates.length
    });
    return true;
  }

  async serveOnce() {
    await this.publish();
    const polled = await this.node.poll();
    let handled = 0;
    for (const event of polled.events || []) if (await this.handleNeed(event)) handled += 1;
    return { handled, events:(polled.events || []).length };
  }

  async start() {
    if (this.running) return;
    await this.publish();
    this.running = true;
    this.loopPromise = (async () => {
      while (this.running) {
        await this.serveOnce();
        if (!this.running) break;
        await delay(this.pollIntervalMs);
      }
    })();
  }

  async stop() {
    this.running = false;
    if (this.loopPromise) {
      try { await this.loopPromise; } catch {}
      this.loopPromise = null;
    }
  }

  stats() {
    return { ...this.metrics };
  }
}

export class DistributedContextCoordinator {
  constructor({
    node,
    manifestResolver,
    candidateSelector = defaultDistributedCandidateSelector,
    candidateKPerPartition = 2,
    resultTimeoutMs = 10_000,
    pollIntervalMs = 5
  } = {}) {
    if (!node) throw new Error('distributed coordinator node is required');
    if (typeof manifestResolver !== 'function') throw new Error('distributed coordinator manifestResolver is required');
    if (typeof candidateSelector !== 'function') throw new Error('distributed coordinator candidateSelector is required');
    this.node = node;
    this.manifestResolver = manifestResolver;
    this.candidateSelector = candidateSelector;
    this.candidateKPerPartition = normalizeCandidateK(candidateKPerPartition);
    this.resultTimeoutMs = resultTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.unmatchedEvents = [];
    this.metrics = {
      retrievals:0,
      discoveryCalls:0,
      holderNeeds:0,
      holderResults:0,
      candidatesReceived:0,
      candidatesVerified:0,
      provenanceFailures:0,
      incompleteCoverageFailures:0
    };
  }

  async register(name = 'TRUYN distributed retrieval coordinator') {
    if (!this.node.sessionToken) return this.node.register({ name });
    return { ok:true, nodeId:this.node.identity.nodeId, alreadyRegistered:true };
  }

  async resolveManifest(rootCid) {
    const manifest = await this.manifestResolver(rootCid);
    const verification = verifyContextManifest(manifest, rootCid);
    if (!verification.ok) throw new Error(`distributed manifest verification failed: ${verification.reason}`);
    return manifest;
  }

  async discover(rootCid, manifest = null) {
    await this.register();
    const resolvedManifest = manifest || await this.resolveManifest(rootCid);
    this.metrics.discoveryCalls += 1;
    const discovery = await this.node.find(distributedDiscoveryCapability(rootCid));
    try {
      return resolveDistributedCoverage(resolvedManifest, discovery.offers || [], rootCid);
    } catch (error) {
      if (error?.code === 'distributed_context_incomplete_coverage') this.metrics.incompleteCoverageFailures += 1;
      throw error;
    }
  }

  async waitForHolderResults(assignments) {
    const pending = new Map(assignments.map((assignment) => [assignment.needId, assignment]));
    const results = new Map();
    const deadline = Date.now() + this.resultTimeoutMs;
    while (pending.size > 0 && Date.now() < deadline) {
      const polled = await this.node.poll();
      for (const event of polled.events || []) {
        const requestId = event?.envelope?.payload?.requestId;
        if (event?.kind !== 'RESULT' || !pending.has(requestId)) {
          this.unmatchedEvents.push(event);
          continue;
        }
        const assignment = pending.get(requestId);
        if (event.verification?.ok !== true) throw new Error('distributed holder RESULT signature verification failed');
        if (event.envelope.from !== assignment.holder.nodeId) throw new Error('distributed holder RESULT provider mismatch');
        results.set(requestId, event);
        pending.delete(requestId);
      }
      if (pending.size > 0) await delay(this.pollIntervalMs);
    }
    if (pending.size > 0) {
      const error = new Error('distributed_context_result_timeout');
      error.code = 'distributed_context_result_timeout';
      error.pendingHolders = [...pending.values()].map((item) => item.holder.nodeId);
      throw error;
    }
    return results;
  }

  async retrieve(rootCid, question, { topK = 1 } = {}) {
    if (typeof question !== 'string' || question.trim().length < 3) throw new Error('distributed retrieval question is required');
    if (!Number.isInteger(topK) || topK < 1 || topK > 8) throw new Error('distributed retrieval topK must be 1..8');
    await this.register();
    this.metrics.retrievals += 1;
    const manifest = await this.resolveManifest(rootCid);
    const coverage = await this.discover(rootCid, manifest);
    const queryHash = contextQueryHash(question);
    const assignments = await Promise.all(coverage.selectedHolders.map(async (holder) => {
      const input = {
        rootCid,
        query:question,
        queryHash,
        candidateK:this.candidateKPerPartition
      };
      const assigned = await this.node.need(holder.requestCapability, input, {
        distributedContext:true,
        expectedProvider:holder.nodeId
      });
      if (assigned.provider !== holder.nodeId) throw new Error('distributed retrieval routed to unexpected holder');
      this.metrics.holderNeeds += 1;
      return {
        ...assigned,
        holder,
        requestBytes:distributedPayloadBytes(input)
      };
    }));

    const events = await this.waitForHolderResults(assignments);
    const verifiedCandidates = [];
    let networkBytes = assignments.reduce((sum, item) => sum + item.requestBytes, 0);
    for (const assignment of assignments) {
      const event = events.get(assignment.needId);
      const output = event?.envelope?.payload?.output;
      this.metrics.holderResults += 1;
      networkBytes += distributedPayloadBytes(output || null);
      if (!output || output.rootCid !== rootCid || output.queryHash !== queryHash || output.holderNodeId !== assignment.holder.nodeId) {
        throw new Error('distributed holder RESULT payload mismatch');
      }
      if (output.partitionIndex !== assignment.holder.partitionIndex || output.partitionCount !== assignment.holder.partitionCount) {
        throw new Error('distributed holder RESULT partition mismatch');
      }
      const candidates = Array.isArray(output.candidates) ? output.candidates : [];
      this.metrics.candidatesReceived += candidates.length;
      const publicKeyPem = assignment.holder.publicKey || await this.node.resolveIdentity(assignment.holder.nodeId);
      for (const candidate of candidates) {
        const verification = verifyDistributedCandidate({
          manifest,
          rootCid,
          queryHash,
          holder:assignment.holder,
          candidate,
          publicKeyPem
        });
        if (!verification.ok) {
          this.metrics.provenanceFailures += 1;
          const error = new Error(`distributed candidate provenance failed: ${verification.reason}`);
          error.code = verification.reason;
          throw error;
        }
        this.metrics.candidatesVerified += 1;
        verifiedCandidates.push({
          ...candidate,
          holderNodeId:assignment.holder.nodeId,
          partitionIndex:assignment.holder.partitionIndex
        });
      }
    }
    if (verifiedCandidates.length === 0) throw new Error('distributed retrieval produced no verified candidates');

    const selected = await this.candidateSelector(question, verifiedCandidates, { topK, rootCid, manifest });
    if (!Array.isArray(selected) || selected.length < topK) throw new Error('distributed candidate selector returned too few candidates');
    const verifiedByCid = new Map(verifiedCandidates.map((candidate) => [candidate.cid, candidate]));
    const normalizedSelected = [];
    for (const item of selected.slice(0, topK)) {
      const candidate = typeof item === 'string' ? verifiedCandidates.find((value) => value.id === item || value.cid === item) : item;
      if (!candidate || !verifiedByCid.has(candidate.cid)) throw new Error('distributed candidate selector selected an unverified candidate');
      normalizedSelected.push(verifiedByCid.get(candidate.cid));
    }

    return distributedPublicResult({
      rootCid,
      query:question,
      selected:normalizedSelected,
      coverage,
      candidateCount:verifiedCandidates.length,
      networkBytes
    });
  }

  async retrieveForAgent(input, options = {}) {
    const keys = Object.keys(input || {}).sort();
    if (keys.join(',') !== 'question,rootCid') throw new Error('distributed agent input must contain exactly question + rootCid');
    return this.retrieve(input.rootCid, input.question, options);
  }

  drainUnmatchedEvents() {
    const events = this.unmatchedEvents.splice(0);
    return events;
  }

  stats() {
    return { ...this.metrics, unmatchedEvents:this.unmatchedEvents.length };
  }
}
