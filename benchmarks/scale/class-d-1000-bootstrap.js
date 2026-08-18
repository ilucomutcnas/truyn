import { createHash } from 'node:crypto';
import { xorDistance } from '../../network/dht/kademlia.js';

function bitIndex(distance) {
  if (distance === 0n) return -1;
  return distance.toString(2).length - 1;
}

function score(seed, localNodeId, peerNodeId) {
  return createHash('sha256').update(`${seed}:${localNodeId}:${peerNodeId}`).digest('hex');
}

/**
 * Build a bounded Kademlia-aware bootstrap set for each real node.
 * This deliberately avoids all-to-all preloading: non-bootstrap targets must
 * be resolved through iterative FIND_NODE RPCs at runtime.
 */
export function buildClassD1000BootstrapPlan(records, {
  seed = 'truyn-class-d-1000',
  maxPeersPerNode = 32,
  peersPerBucket = 2
} = {}) {
  if (!Array.isArray(records) || records.length < 2) throw new Error('at least two peer records are required');
  if (!Number.isInteger(maxPeersPerNode) || maxPeersPerNode < 1) throw new Error('maxPeersPerNode must be >= 1');
  if (!Number.isInteger(peersPerBucket) || peersPerBucket < 1) throw new Error('peersPerBucket must be >= 1');

  const unique = new Set();
  for (const record of records) {
    if (!record?.nodeId) throw new Error('every record requires nodeId');
    if (unique.has(record.nodeId)) throw new Error(`duplicate nodeId: ${record.nodeId}`);
    unique.add(record.nodeId);
  }

  const plan = new Map();
  for (const local of records) {
    const buckets = new Map();
    for (const peer of records) {
      if (peer.nodeId === local.nodeId) continue;
      const bucket = bitIndex(xorDistance(local.nodeId, peer.nodeId));
      const items = buckets.get(bucket) || [];
      items.push(peer);
      buckets.set(bucket, items);
    }

    const selected = [];
    const selectedIds = new Set();
    const orderedBuckets = [...buckets.keys()].sort((a, b) => a - b);
    for (const bucket of orderedBuckets) {
      const candidates = buckets.get(bucket)
        .slice()
        .sort((a, b) => score(seed, local.nodeId, a.nodeId).localeCompare(score(seed, local.nodeId, b.nodeId)));
      for (const peer of candidates.slice(0, peersPerBucket)) {
        if (selected.length >= maxPeersPerNode) break;
        selected.push(peer);
        selectedIds.add(peer.nodeId);
      }
      if (selected.length >= maxPeersPerNode) break;
    }

    if (selected.length < maxPeersPerNode) {
      const remaining = records
        .filter((peer) => peer.nodeId !== local.nodeId && !selectedIds.has(peer.nodeId))
        .sort((a, b) => score(`${seed}:fill`, local.nodeId, a.nodeId).localeCompare(score(`${seed}:fill`, local.nodeId, b.nodeId)));
      for (const peer of remaining) {
        if (selected.length >= maxPeersPerNode) break;
        selected.push(peer);
        selectedIds.add(peer.nodeId);
      }
    }

    plan.set(local.nodeId, selected);
  }
  return plan;
}

export function summarizeClassD1000BootstrapPlan(plan) {
  const sizes = [...plan.values()].map((peers) => peers.length);
  return {
    nodeCount: plan.size,
    minPeers: sizes.length ? Math.min(...sizes) : 0,
    maxPeers: sizes.length ? Math.max(...sizes) : 0,
    meanPeers: sizes.length ? sizes.reduce((sum, value) => sum + value, 0) / sizes.length : 0,
    allToAll: sizes.length > 0 && sizes.every((size) => size === plan.size - 1)
  };
}
