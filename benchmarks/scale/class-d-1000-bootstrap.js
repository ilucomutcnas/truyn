import { createHash } from 'node:crypto';
import { dhtId } from '../../network/dht/kademlia.js';

function bitIndex(distance) {
  if (distance === 0n) return -1;
  return distance.toString(2).length - 1;
}

function deterministicScore(seed, localNodeId, peerNodeId) {
  return createHash('sha256').update(`${seed}:${localNodeId}:${peerNodeId}`).digest('hex');
}

export function buildClassD1000BootstrapPlan(records, {
  seed = 'truyn-class-d-1000',
  maxPeersPerNode = 32,
  peersPerBucket = 2
} = {}) {
  if (!Array.isArray(records) || records.length < 2) throw new Error('at least two peer records are required');
  if (!Number.isInteger(maxPeersPerNode) || maxPeersPerNode < 1) throw new Error('maxPeersPerNode must be >= 1');
  if (!Number.isInteger(peersPerBucket) || peersPerBucket < 1) throw new Error('peersPerBucket must be >= 1');

  const unique = new Set();
  const dhtIds = new Map();
  for (const record of records) {
    if (!record?.nodeId) throw new Error('every record requires nodeId');
    if (unique.has(record.nodeId)) throw new Error(`duplicate nodeId: ${record.nodeId}`);
    unique.add(record.nodeId);
    dhtIds.set(record.nodeId, BigInt(`0x${dhtId(record.nodeId)}`));
  }

  const plan = new Map();
  for (const local of records) {
    const localDhtId = dhtIds.get(local.nodeId);
    const buckets = new Map();
    for (const peer of records) {
      if (peer.nodeId === local.nodeId) continue;
      const bucket = bitIndex(localDhtId ^ dhtIds.get(peer.nodeId));
      const items = buckets.get(bucket) || [];
      items.push({ peer, bucketScore: deterministicScore(seed, local.nodeId, peer.nodeId), fillScore: deterministicScore(`${seed}:fill`, local.nodeId, peer.nodeId) });
      buckets.set(bucket, items);
    }

    const selected = [];
    const selectedIds = new Set();
    for (const bucket of [...buckets.keys()].sort((a, b) => a - b)) {
      const candidates = buckets.get(bucket).slice().sort((a, b) => a.bucketScore.localeCompare(b.bucketScore));
      for (const candidate of candidates.slice(0, peersPerBucket)) {
        if (selected.length >= maxPeersPerNode) break;
        selected.push(candidate.peer);
        selectedIds.add(candidate.peer.nodeId);
      }
      if (selected.length >= maxPeersPerNode) break;
    }

    if (selected.length < maxPeersPerNode) {
      const remaining = [];
      for (const items of buckets.values()) for (const candidate of items) if (!selectedIds.has(candidate.peer.nodeId)) remaining.push(candidate);
      remaining.sort((a, b) => a.fillScore.localeCompare(b.fillScore));
      for (const candidate of remaining) {
        if (selected.length >= maxPeersPerNode) break;
        selected.push(candidate.peer);
        selectedIds.add(candidate.peer.nodeId);
      }
    }
    plan.set(local.nodeId, selected);
  }
  return plan;
}

export function summarizeClassD1000BootstrapPlan(plan) {
  const sizes = [...plan.values()].map((peers) => peers.length);
  return { nodeCount: plan.size, minPeers: sizes.length ? Math.min(...sizes) : 0, maxPeers: sizes.length ? Math.max(...sizes) : 0, meanPeers: sizes.length ? sizes.reduce((sum, value) => sum + value, 0) / sizes.length : 0, allToAll: sizes.length > 0 && sizes.every((size) => size === plan.size - 1) };
}
