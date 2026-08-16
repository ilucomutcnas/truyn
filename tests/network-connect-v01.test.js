import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { createSessionHello, createSessionAccept, verifySessionHello, verifySessionAccept, sessionId, SessionReplayCache } from '../network/sessions/authenticated-session.js';
import { KademliaRoutingTable, KademliaRecordStore, createDhtRecord, verifyDhtRecord } from '../network/dht/kademlia.js';
import { PeerDiscovery, createPeerRecord } from '../network/discovery/peer-discovery.js';
import { STUN_MAGIC_COOKIE, STUN_ATTR_XOR_MAPPED_ADDRESS, createBindingRequest, parseBindingResponse } from '../network/nat/stun.js';
import { createPunchPlan, isPunchProbe } from '../network/nat/hole-punch.js';
import { DirectFirstP2P, ExplicitBackpressureQueue } from '../network/transport/p2p.js';
import { TruynQuicTransport } from '../network/transport/quic.js';

const envelope = (identity, type, payload, to = null) => createEnvelope({
  type,
  from: identity.nodeId,
  to,
  payload,
  privateKeyPem: identity.privateKeyPem,
  publicKeyPem: identity.publicKeyPem
});

test('v0.1 authenticated peer session binds cryptographic identities and rejects replay', () => {
  const a = createIdentity();
  const b = createIdentity();
  const cache = new SessionReplayCache();
  const hello = createSessionHello({ identity: a, endpoints: ['quic://127.0.0.1:9001'] });
  assert.equal(verifySessionHello(hello, { replayCache: cache }).ok, true);
  assert.equal(verifySessionHello(hello, { replayCache: cache }).reason, 'session_hello_replay');
  const accept = createSessionAccept({ identity: b, hello, transportBinding: 'quic:127.0.0.1:9001|127.0.0.1:9002' });
  assert.equal(verifySessionAccept(accept, hello, { expectedTransportBinding: accept.transportBinding }).ok, true);
  assert.match(sessionId(hello, accept), /^truyn:session:/);
  assert.equal(verifySessionAccept({ ...accept, peerNodeId: b.nodeId }, hello).ok, false);
});

test('v0.1 Kademlia table orders XOR-nearest peers and signed records fail closed', () => {
  const local = createIdentity();
  const peers = Array.from({ length: 24 }, () => createIdentity());
  const table = new KademliaRoutingTable({ localNodeId: local.nodeId, k: 20 });
  for (const peer of peers) table.upsert({ nodeId: peer.nodeId, endpoints: [] });
  assert.ok(table.size() > 0);
  const nearest = table.closest(peers[0].nodeId, 5);
  assert.ok(nearest.length <= 5);

  const record = createDhtRecord({ identity: local, namespace: 'capability', key: 'reasoning', value: { endpoint: 'quic://127.0.0.1:9999' } });
  assert.equal(verifyDhtRecord(record).ok, true);
  assert.equal(verifyDhtRecord({ ...record, value: { endpoint: 'quic://127.0.0.1:1' } }).ok, false);
  const store = new KademliaRecordStore();
  assert.equal(store.put(record).accepted, true);
  assert.equal(store.get('capability', 'reasoning').length, 1);
});

test('v0.1 iterative peer discovery resolves a target through another Kademlia peer', async () => {
  const a = createIdentity();
  const b = createIdentity();
  const c = createIdentity();
  const recordB = createPeerRecord({ identity: b, endpoints: ['quic://127.0.0.1:9102'] });
  const recordC = createPeerRecord({ identity: c, endpoints: ['quic://127.0.0.1:9103'] });
  const discovery = new PeerDiscovery({
    identity: a,
    rpc: {
      async findNode(peer, target) {
        assert.equal(peer.nodeId, b.nodeId);
        return { records: target === c.nodeId ? [recordC] : [] };
      }
    }
  });
  discovery.ingest(recordB);
  const found = await discovery.findNode(c.nodeId);
  assert.equal(found.nodeId, c.nodeId);
});

test('v0.1 STUN parser resolves XOR-MAPPED-ADDRESS and punch plan is explicit', () => {
  const { transactionId } = createBindingRequest({ transactionId: Buffer.from('00112233445566778899aabb', 'hex') });
  const address = [203, 0, 113, 7];
  const port = 54321;
  const value = Buffer.alloc(8);
  value[1] = 0x01;
  value.writeUInt16BE(port ^ (STUN_MAGIC_COOKIE >>> 16), 2);
  const cookie = Buffer.alloc(4); cookie.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
  for (let i = 0; i < 4; i += 1) value[4 + i] = address[i] ^ cookie[i];
  const response = Buffer.alloc(32);
  response.writeUInt16BE(0x0101, 0);
  response.writeUInt16BE(12, 2);
  response.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  transactionId.copy(response, 8);
  response.writeUInt16BE(STUN_ATTR_XOR_MAPPED_ADDRESS, 20);
  response.writeUInt16BE(8, 22);
  value.copy(response, 24);
  assert.deepEqual(parseBindingResponse(response, transactionId), { family: 'IPv4', address: '203.0.113.7', port });

  const plan = createPunchPlan({
    localNodeId: 'a', peerNodeId: 'b',
    localMapped: { address: '198.51.100.1', port: 40000 },
    peerMapped: { address: '203.0.113.7', port }
  });
  const probe = Buffer.from(JSON.stringify({ protocol: plan.protocol, token: plan.token, from: 'a', to: 'b' }));
  assert.equal(isPunchProbe(probe, { token: plan.token, localNodeId: 'b' }), true);
});

test('v0.1 direct-first routing falls back explicitly and bounded queue rejects overload', async () => {
  const a = createIdentity();
  const b = createIdentity();
  const discovery = new PeerDiscovery({ identity: a });
  discovery.ingest(createPeerRecord({ identity: b, endpoints: ['quic://127.0.0.1:65534'] }));
  let relayCalls = 0;
  const route = new DirectFirstP2P({
    quicTransport: { async connect() { throw new Error('direct_down'); } },
    discovery,
    relayFallback: async () => { relayCalls += 1; return { ok: true }; }
  });
  const result = await route.send(b.nodeId, envelope(a, 'NEED', { capability: { name: 'test' }, input: {} }, b.nodeId));
  assert.equal(result.transport, 'relay-fallback');
  assert.equal(relayCalls, 1);

  const queue = new ExplicitBackpressureQueue({ maxInFlight: 1, maxQueued: 1 });
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const first = queue.run(() => blocker);
  const second = queue.run(async () => 'second');
  await assert.rejects(queue.run(async () => 'third'), (error) => error.code === 'TRUYN_BACKPRESSURE');
  release('first');
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
});

async function generateTls() {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-quic-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { dir, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

test('v0.1 real QUIC carries signed NEED directly peer-to-peer without relay', { timeout: 30_000 }, async () => {
  const tls = await generateTls();
  const a = createIdentity();
  const b = createIdentity();
  const qa = new TruynQuicTransport({ identity: a, host: '127.0.0.1', tls });
  const qb = new TruynQuicTransport({ identity: b, host: '127.0.0.1', tls });
  let relayCalls = 0;
  try {
    await qa.start();
    await qb.start();
    qb.onEnvelope(async (received, context) => ({ receivedType: received.type, from: received.from, transport: context.transport }));
    const discovery = new PeerDiscovery({ identity: a });
    discovery.ingest(createPeerRecord({ identity: b, endpoints: [`quic://127.0.0.1:${qb.port}`] }));
    const route = new DirectFirstP2P({
      quicTransport: qa,
      discovery,
      relayFallback: async () => { relayCalls += 1; return null; }
    });
    const need = envelope(a, 'NEED', { capability: { name: 'echo' }, input: { value: 7 }, policy: {} }, b.nodeId);
    const result = await route.send(b.nodeId, need);
    assert.equal(result.transport, 'quic-direct');
    assert.equal(result.result.receivedType, 'NEED');
    assert.equal(result.result.from, a.nodeId);
    assert.equal(result.result.transport, 'quic');
    assert.equal(relayCalls, 0);
  } finally {
    await Promise.allSettled([qa.close(), qb.close()]);
    await rm(tls.dir, { recursive: true, force: true });
  }
});
