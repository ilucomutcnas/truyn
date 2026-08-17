import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord } from '../network/discovery/peer-discovery.js';
import { CoordinatedNatTraversal, peerNatMappedEndpoint } from '../network/nat/traversal.js';
import { DirectFirstP2P } from '../network/transport/p2p.js';

test('Class C signed NAT mapping is normalized from the peer record', () => {
  const identity = createIdentity();
  const record = createPeerRecord({
    identity,
    endpoints: ['quic://10.0.0.9:4433'],
    nat: { reachability: 'punch', mapped: { address: '203.0.113.7', port: 41000 } }
  });
  assert.deepEqual(peerNatMappedEndpoint(record), {
    host: '203.0.113.7', port: 41000, value: 'quic://203.0.113.7:41000'
  });
});

test('Class C NAT traversal coordinates and punches before the only envelope attempt', async () => {
  const local = createIdentity();
  const remote = createIdentity();
  const record = createPeerRecord({
    identity: remote,
    endpoints: ['quic://10.0.0.9:4433'],
    nat: { reachability: 'punch', mapped: { address: '203.0.113.7', port: 41000 } }
  });
  const order = [];
  const socket = {
    async send(_payload, port, address) { order.push(`punch:${address}:${port}`); }
  };
  const quic = {
    identity: local,
    socket,
    async connect(endpoint) { order.push(`connect:${endpoint.host}:${endpoint.port}`); return { connection: {} }; },
    async sendEnvelope(_client, _envelope) { order.push('envelope'); return { ok: true }; },
    async disconnect() { order.push('disconnect'); }
  };
  const natTraversal = new CoordinatedNatTraversal({
    quicTransport: quic,
    localMapped: { address: '198.51.100.8', port: 4433 },
    attempts: 2,
    intervalMs: 20,
    coordinate: async (nodeId, payload) => {
      order.push(`coordinate:${nodeId}`);
      assert.equal(payload.peerMapped.port, 41000);
      return { accepted: true };
    }
  });
  const discovery = { get: (nodeId) => nodeId === remote.nodeId ? record : null, findNode: async () => null };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, natTraversal });
  const result = await router.send(remote.nodeId, { id: 'm1' }, { allowRelayFallback: false });
  assert.equal(result.transport, 'quic-direct');
  assert.equal(result.natTraversal, 'coordinated-punch');
  assert.equal(order[0], `coordinate:${remote.nodeId}`);
  assert.equal(order.filter((item) => item.startsWith('punch:')).length, 2);
  assert.ok(order.indexOf('envelope') > order.findIndex((item) => item.startsWith('connect:')));
  assert.equal(order.filter((item) => item === 'envelope').length, 1);
});

test('Class C NAT coordination failure falls back without attempting the application envelope', async () => {
  const local = createIdentity();
  const remote = createIdentity();
  const record = createPeerRecord({
    identity: remote,
    endpoints: ['quic://10.0.0.9:4433'],
    nat: { reachability: 'punch', mapped: { address: '203.0.113.7', port: 41000 } }
  });
  let envelopes = 0;
  const quic = {
    identity: local,
    socket: { async send() {} },
    async connect() { throw new Error('must_not_connect_before_coordination'); },
    async sendEnvelope() { envelopes += 1; },
    async disconnect() {}
  };
  const natTraversal = new CoordinatedNatTraversal({
    quicTransport: quic,
    localMapped: { address: '198.51.100.8', port: 4433 },
    coordinate: async () => ({ accepted: false })
  });
  const discovery = { get: () => record, findNode: async () => null };
  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    natTraversal,
    relayFallback: async () => ({ ok: true, via: 'relay' })
  });
  const result = await router.send(remote.nodeId, { id: 'm2' });
  assert.equal(result.transport, 'relay-fallback');
  assert.equal(envelopes, 0);
  assert.match(result.directFailure, /nat_traversal_coordination_rejected/);
});
