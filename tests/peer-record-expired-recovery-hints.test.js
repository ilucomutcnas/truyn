import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord, PeerDiscovery } from '../network/discovery/peer-discovery.js';
import { TruynNetworkNode } from '../network/runtime.js';

function expiredRecord(identity, endpoint, sequence = 1) {
  return createPeerRecord({
    identity,
    endpoints: [endpoint],
    sequence,
    ttlMs: 1_000,
    issuedAt: new Date(Date.now() - 60_000).toISOString()
  });
}

test('expired durable peer records are non-authoritative routing hints that can recover fresh signed state', async () => {
  const local = createIdentity();
  const hintIdentity = createIdentity();
  const targetIdentity = createIdentity();
  const staleHint = expiredRecord(hintIdentity, 'quic://127.0.0.1:4401');
  const freshTarget = createPeerRecord({
    identity: targetIdentity,
    endpoints: ['quic://127.0.0.1:4402'],
    sequence: 7,
    ttlMs: 60_000
  });

  let queriedHint = null;
  const discovery = new PeerDiscovery({
    identity: local,
    rpc: {
      async findNode(peer, targetNodeId) {
        queriedHint = peer;
        assert.equal(targetNodeId, targetIdentity.nodeId);
        return { records: [freshTarget] };
      },
      forget() {}
    }
  });

  assert.equal(discovery.restore([staleHint]), 0, 'expired lease must not be restored as an accepted record');
  assert.equal(discovery.get(hintIdentity.nodeId), null, 'expired lease must stay non-authoritative');
  assert.equal(discovery.snapshot().some((record) => record.nodeId === hintIdentity.nodeId), false);
  assert.equal(discovery.closest(targetIdentity.nodeId).some((peer) => peer.nodeId === hintIdentity.nodeId), true, 'cryptographically valid expired state may survive only as a routing hint');

  const recovered = await discovery.findNode(targetIdentity.nodeId);
  assert.equal(queriedHint?.nodeId, hintIdentity.nodeId, 'iterative lookup should use the stale endpoint only as a recovery hint');
  assert.equal(recovered?.nodeId, targetIdentity.nodeId);
  assert.equal(recovered?.sequence, freshTarget.sequence);
  assert.equal(discovery.get(targetIdentity.nodeId)?.recordId, freshTarget.recordId, 'only the fresh signed record becomes authoritative');
});

test('graceful durable state preserves expired signed records only as restart recovery hints', () => {
  const local = createIdentity();
  const peer = createIdentity();
  const stale = expiredRecord(peer, 'quic://127.0.0.1:4420');
  const node = new TruynNetworkNode({
    identity: local,
    tls: { key: 'test-key', cert: 'test-cert' },
    peerRecordAutoRenew: false
  });

  assert.equal(node.discovery.restore([stale]), 0);
  assert.equal(node.discovery.get(peer.nodeId), null, 'expired record must not become live authority');
  assert.equal(node.discovery.snapshot().some((record) => record.nodeId === peer.nodeId), false, 'live snapshot must exclude expired records');
  assert.equal(node.discovery.durableSnapshot().some((record) => record.recordId === stale.recordId), true, 'durable snapshot must preserve signed recovery hint');
  assert.equal(node.snapshotState().peerRecords.some((record) => record.recordId === stale.recordId), true, 'runtime persisted state must retain restart hint');
});

test('tampered expired durable peer records never become recovery hints or durable state', () => {
  const local = createIdentity();
  const peer = createIdentity();
  const stale = expiredRecord(peer, 'quic://127.0.0.1:4410');
  const tampered = { ...stale, endpoints: ['quic://127.0.0.1:9999'] };
  const discovery = new PeerDiscovery({ identity: local });

  assert.equal(discovery.restore([tampered]), 0);
  assert.equal(discovery.get(peer.nodeId), null);
  assert.equal(discovery.closest(peer.nodeId).some((entry) => entry.nodeId === peer.nodeId), false, 'invalid signature/id state must not influence routing recovery');
  assert.equal(discovery.durableSnapshot().some((record) => record.nodeId === peer.nodeId), false, 'invalid signed state must not survive durable snapshot');
});
