import { distributedContentCommitment, distributedReceiptDigest } from './distributed-retrieval.js';

function trustScore(holder) {
  const value = Number(holder?.trust?.score ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function freshnessScore(holder, now = Date.now()) {
  const issuedAt = new Date(holder?.offer?.payload?.metadata?.distributedContext?.placement?.issuedAt || 0).getTime();
  const expiresAt = new Date(holder?.offer?.payload?.metadata?.distributedContext?.placement?.expiresAt || 0).getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) return 0;
  if (now >= expiresAt) return 0;
  const total = expiresAt - issuedAt;
  return Math.max(0, Math.min(1, (expiresAt - now) / total));
}

function directoryAgreement(holder) {
  const value = Number(holder?.offer?.payload?.metadata?.distributedContext?.placement?.directoryAgreement || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function failureDomain(holder) {
  return holder?.offer?.payload?.metadata?.distributedContext?.placement?.failureDomainCommitment || null;
}

export function holderOperationalTrust(holder, { now = Date.now() } = {}) {
  const node = trustScore(holder);
  const freshness = freshnessScore(holder, now);
  const directory = Math.min(1, directoryAgreement(holder) / 3);
  const score = 0.65 * node + 0.20 * freshness + 0.15 * directory;
  return {
    score: Number(score.toFixed(6)),
    nodeTrust: Number(node.toFixed(6)),
    placementFreshness: Number(freshness.toFixed(6)),
    directoryAgreement: directoryAgreement(holder)
  };
}

export function selectTrustedReplicaSet(holders, {
  replicaReads = 3,
  quorum = 2,
  now = Date.now(),
  requireFailureDomainDiversity = true
} = {}) {
  if (!Array.isArray(holders) || holders.length === 0) throw new Error('replica holders are required');
  if (!Number.isInteger(replicaReads) || replicaReads < 1 || replicaReads > 16) throw new Error('replicaReads must be 1..16');
  if (!Number.isInteger(quorum) || quorum < 1 || quorum > replicaReads) throw new Error('quorum must be 1..replicaReads');
  if (holders.length < quorum) {
    const error = new Error('distributed_context_replica_quorum_unavailable');
    error.code = 'distributed_context_replica_quorum_unavailable';
    throw error;
  }

  const ranked = [...holders].sort((left, right) => {
    const l = holderOperationalTrust(left, { now }).score;
    const r = holderOperationalTrust(right, { now }).score;
    return r - l || left.nodeId.localeCompare(right.nodeId);
  });

  const selected = [];
  const usedDomains = new Set();
  if (requireFailureDomainDiversity) {
    for (const holder of ranked) {
      const domain = failureDomain(holder);
      if (domain && usedDomains.has(domain)) continue;
      selected.push(holder);
      if (domain) usedDomains.add(domain);
      if (selected.length >= replicaReads) break;
    }
  }
  if (selected.length < replicaReads) {
    for (const holder of ranked) {
      if (selected.includes(holder)) continue;
      selected.push(holder);
      if (selected.length >= replicaReads) break;
    }
  }

  if (selected.length < quorum) {
    const error = new Error('distributed_context_replica_quorum_unavailable');
    error.code = 'distributed_context_replica_quorum_unavailable';
    throw error;
  }
  return selected;
}

export function buildCandidateQuorum(verifiedCandidates, { quorum = 2 } = {}) {
  if (!Array.isArray(verifiedCandidates)) throw new Error('verified candidates must be an array');
  if (!Number.isInteger(quorum) || quorum < 1 || quorum > 16) throw new Error('candidate quorum must be 1..16');
  const groups = new Map();
  for (const candidate of verifiedCandidates) {
    if (!candidate?.cid || !candidate?.holderNodeId || !Number.isInteger(candidate?.partitionIndex)) continue;
    const key = `${candidate.partitionIndex}|${candidate.cid}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const byHolder = groups.get(key);
    if (!byHolder.has(candidate.holderNodeId)) byHolder.set(candidate.holderNodeId, candidate);
  }

  const quorumCandidates = [];
  for (const byHolder of groups.values()) {
    if (byHolder.size < quorum) continue;
    const supporters = [...byHolder.values()].sort((left, right) => {
      const l = Number(left?.holderTrust?.score ?? 0);
      const r = Number(right?.holderTrust?.score ?? 0);
      return r - l || left.holderNodeId.localeCompare(right.holderNodeId);
    });
    const primary = supporters[0];
    quorumCandidates.push({
      ...primary,
      quorum: {
        required: quorum,
        observed: supporters.length,
        holderNodeIds: supporters.map((item) => item.holderNodeId).sort(),
        holderReceiptDigests: supporters.map((item) => distributedReceiptDigest(item.receipt)).sort(),
        contentCommitment: distributedContentCommitment(primary.cid)
      }
    });
  }
  return quorumCandidates;
}

export function assertPartitionQuorumCoverage(partitionCount, quorumCandidates) {
  const covered = new Set((quorumCandidates || []).map((candidate) => candidate.partitionIndex));
  const missing = [];
  for (let index = 0; index < partitionCount; index += 1) if (!covered.has(index)) missing.push(index);
  if (missing.length > 0) {
    const error = new Error('distributed_context_byzantine_quorum_incomplete');
    error.code = 'distributed_context_byzantine_quorum_incomplete';
    error.missingPartitions = missing;
    throw error;
  }
  return { ok: true, coveredPartitions: covered.size };
}
