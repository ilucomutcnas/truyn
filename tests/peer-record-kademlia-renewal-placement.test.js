import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord } from '../network/discovery/peer-discovery.js';
import { TruynNetworkNode } from '../network/runtime.js';

test('peer-record renewal uses Kademlia-nearest routing peers instead of a global lexicographic fanout', async () => {
  const identity = createIdentity();
  const node = new TruynNetworkNode({
    identity,
    tls: { key: 'test-key', cert: 'test-cert' },
    k: 3,
    peerRecordAutoRenew: false,
    peerRecordPublishFanout: 3
  });

  node.started = true;
  node.localPeerRecord = createPeerRecord({
    identity,
    endpoints: ['quic://127.0.0.1:4500'],
    ttlMs: 60_000
  });

  const peers = [0, 1, 2, 3, 4].map((index) => {
    const peerIdentity = createIdentity();
    return createPeerRecord({
      identity: peerIdentity,
      endpoints: [`quic://127.0.0.1:${4510 + index}`],
      ttlMs: 60_000
    });
  });
  const nearest = [peers[4], peers[2], peers[1]];

  node.discovery.snapshot = () => {
    throw new Error('legacy_snapshot_fanout_must_not_be_used');
  };
  node.discovery.closest = (targetNodeId, count) => {
    assert.equal(targetNodeId, identity.nodeId, 'renewal placement key must be the renewed record nodeId');
    assert.equal(count, 3, 'renewal placement must preserve configured fanout');
    return nearest;
  };

  const announced = [];
  node.rpc.announce = async (peer, record) => {
    announced.push(peer.nodeId);
    assert.equal(record.nodeId, identity.nodeId);
    return { accepted: true };
  };

  const result = await node.announcePeerRecord(node.localPeerRecord);
  assert.deepEqual(announced, nearest.map((peer) => peer.nodeId));
  assert.equal(result.attempted, 3);
  assert.equal(result.delivered, 3);
  assert.equal(result.failed, 0);
});
