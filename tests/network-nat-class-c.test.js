import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord } from '../network/discovery/peer-discovery.js';
import { CoordinatedNatTraversal, peerNatMappedEndpoint } from '../network/nat/traversal.js';
import { TruynNetworkNode } from '../network/runtime.js';
import { DirectFirstP2P } from '../network/transport/p2p.js';

async function generateTls() {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-class-c-nat-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { dir, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

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

test('Class C NAT traversal is wired through the primary network runtime', async () => {
  const tls = await generateTls();
  try {
    const natTraversal = { eligible: () => false, prepare: async () => null };
    const node = new TruynNetworkNode({ tls, natTraversal, peerLeaseEnabled: false });
    assert.equal(node.natTraversal, natTraversal);
    assert.equal(node.router.natTraversal, natTraversal);
  } finally {
    await rm(tls.dir, { recursive: true, force: true });
  }
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
  const socket = { async send(_payload, port, address) { order.push(`punch:${address}:${port}`); } };
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
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, natTraversal, relayFallback: async () => ({ ok: true, via: 'relay' }) });
  const result = await router.send(remote.nodeId, { id: 'm2' });
  assert.equal(result.transport, 'relay-fallback');
  assert.equal(envelopes, 0);
  assert.match(result.directFailure, /nat_traversal_coordination_rejected/);
});
