import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClassD1000BootstrapPlan,
  summarizeClassD1000BootstrapPlan
} from '../benchmarks/scale/class-d-1000-bootstrap.js';
import { xorDistance } from '../network/dht/kademlia.js';

function records(count) {
  return Array.from({ length: count }, (_, index) => ({ nodeId: `truyn:node:scale-${index}` }));
}

function bucketIndex(localNodeId, peerNodeId) {
  const distance = xorDistance(localNodeId, peerNodeId);
  return distance === 0n ? -1 : distance.toString(2).length - 1;
}

test('D-1000 bootstrap plan remains bounded and is never all-to-all', () => {
  const input = records(1000);
  const plan = buildClassD1000BootstrapPlan(input, { seed: 'gate-seed', maxPeersPerNode: 32, peersPerBucket: 2 });
  const summary = summarizeClassD1000BootstrapPlan(plan);

  assert.equal(summary.nodeCount, 1000);
  assert.equal(summary.minPeers, 32);
  assert.equal(summary.maxPeers, 32);
  assert.equal(summary.allToAll, false);
  for (const [nodeId, peers] of plan) {
    assert.equal(peers.length, 32);
    assert.equal(new Set(peers.map((peer) => peer.nodeId)).size, peers.length);
    assert.ok(peers.every((peer) => peer.nodeId !== nodeId));
  }
});

test('D-1000 bootstrap selection is deterministic for a seed', () => {
  const input = records(128);
  const first = buildClassD1000BootstrapPlan(input, { seed: 'same-seed', maxPeersPerNode: 24 });
  const second = buildClassD1000BootstrapPlan(input, { seed: 'same-seed', maxPeersPerNode: 24 });
  for (const record of input) {
    assert.deepEqual(first.get(record.nodeId).map((peer) => peer.nodeId), second.get(record.nodeId).map((peer) => peer.nodeId));
  }
});

test('D-1000 bootstrap plan samples multiple XOR distance buckets', () => {
  const input = records(256);
  const plan = buildClassD1000BootstrapPlan(input, { seed: 'bucket-seed', maxPeersPerNode: 32, peersPerBucket: 2 });
  for (const local of input.slice(0, 32)) {
    const buckets = new Set(plan.get(local.nodeId).map((peer) => bucketIndex(local.nodeId, peer.nodeId)));
    assert.ok(buckets.size >= 4, `expected bucket diversity for ${local.nodeId}, got ${buckets.size}`);
  }
});

test('D-1000 planner rejects duplicate identities', () => {
  assert.throws(
    () => buildClassD1000BootstrapPlan([{ nodeId: 'a' }, { nodeId: 'a' }]),
    /duplicate nodeId/
  );
});
