import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TruynNetworkNode } from '../network/runtime.js';
import { discoverMappedAddress, STUN_MAGIC_COOKIE, STUN_ATTR_XOR_MAPPED_ADDRESS } from '../network/nat/stun.js';
import { punchQuicSocket, isPunchProbe } from '../network/nat/hole-punch.js';

async function generateTls() {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-runtime-quic-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { dir, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function bindUdp(socket, port = 0, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, host, () => {
      socket.off('error', reject);
      resolve(socket.address());
    });
  });
}

function closeUdp(socket) {
  return new Promise((resolve) => socket.close(() => resolve()));
}

function stunBindingSuccess(request, mappedAddress, mappedPort) {
  const transactionId = request.subarray(8, 20);
  const addressBytes = Buffer.from(mappedAddress.split('.').map(Number));
  const cookie = Buffer.alloc(4);
  cookie.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
  const value = Buffer.alloc(8);
  value[1] = 0x01;
  value.writeUInt16BE(mappedPort ^ (STUN_MAGIC_COOKIE >>> 16), 2);
  for (let i = 0; i < 4; i += 1) value[4 + i] = addressBytes[i] ^ cookie[i];
  const response = Buffer.alloc(32);
  response.writeUInt16BE(0x0101, 0);
  response.writeUInt16BE(12, 2);
  response.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  transactionId.copy(response, 8);
  response.writeUInt16BE(STUN_ATTR_XOR_MAPPED_ADDRESS, 20);
  response.writeUInt16BE(8, 22);
  value.copy(response, 24);
  return response;
}

test('v0.1 composed runtime bootstraps, discovers, stores DHT state and routes NEED direct without relay', { timeout: 30_000 }, async () => {
  const tls = await generateTls();
  let relayCalls = 0;
  const relayFallback = async () => { relayCalls += 1; return null; };
  const a = new TruynNetworkNode({ host: '127.0.0.1', tls, relayFallback, capabilities: ['requester'] });
  const b = new TruynNetworkNode({ host: '127.0.0.1', tls, relayFallback, capabilities: ['router'] });
  const c = new TruynNetworkNode({ host: '127.0.0.1', tls, relayFallback, capabilities: ['echo'] });
  try {
    const [recordA, recordB, recordC] = await Promise.all([a.start(), b.start(), c.start()]);
    assert.equal(recordA.nodeId, a.identity.nodeId);
    b.bootstrap([recordC]);
    a.bootstrap([recordB]);

    assert.equal(await a.pingPeer(b.identity.nodeId), true);
    assert.equal(a.discovery.get(c.identity.nodeId), null);
    const discovered = await a.findPeer(c.identity.nodeId);
    assert.equal(discovered.nodeId, c.identity.nodeId);

    c.onEnvelope(async (message, context) => ({ type: message.type, from: message.from, transport: context.transport, input: message.payload.input }));
    const direct = await a.need(c.identity.nodeId, 'echo', { value: 42 });
    assert.equal(direct.transport, 'quic-direct');
    assert.deepEqual(direct.result, { type: 'NEED', from: a.identity.nodeId, transport: 'quic', input: { value: 42 } });

    const capabilityRecord = a.createRecord('capability', 'echo', { providerNodeId: c.identity.nodeId, protocol: 'TRUYN/1' });
    const stored = await a.storeAt(b.identity.nodeId, capabilityRecord);
    assert.equal(stored.stored, true);
    const found = await a.findValueAt(b.identity.nodeId, 'capability', 'echo');
    assert.equal(found.records.length, 1);
    assert.equal(found.records[0].recordId, capabilityRecord.recordId);
    assert.equal(relayCalls, 0);
  } finally {
    await Promise.allSettled([a.close(), b.close(), c.close()]);
    await rm(tls.dir, { recursive: true, force: true });
  }
});

test('v0.1 STUN client performs a real UDP binding exchange', { timeout: 10_000 }, async () => {
  const server = dgram.createSocket('udp4');
  const address = await bindUdp(server);
  server.on('message', (request, rinfo) => {
    const response = stunBindingSuccess(request, '127.0.0.1', rinfo.port);
    server.send(response, rinfo.port, rinfo.address);
  });
  try {
    const mapped = await discoverMappedAddress({ host: '127.0.0.1', port: address.port, timeoutMs: 2_000 });
    assert.equal(mapped.address, '127.0.0.1');
    assert.ok(mapped.port > 0);
  } finally {
    await closeUdp(server);
  }
});

test('v0.1 hole punching sends probes from the same bound UDP socket used by QUIC', { timeout: 15_000 }, async () => {
  const tls = await generateTls();
  const node = new TruynNetworkNode({ host: '127.0.0.1', tls });
  const receiver = dgram.createSocket('udp4');
  const target = await bindUdp(receiver);
  try {
    await node.start();
    const probeP = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('punch_probe_timeout')), 5_000);
      receiver.once('message', (message, rinfo) => { clearTimeout(timer); resolve({ message, rinfo }); });
    });
    const token = 'fixed-test-punch-token';
    const punchP = punchQuicSocket({
      quicTransport: node.quic,
      peerNodeId: 'peer-under-test',
      localMapped: { address: '127.0.0.1', port: node.quic.port },
      peerMapped: { address: '127.0.0.1', port: target.port },
      attempts: 1,
      intervalMs: 20,
      token
    });
    const [{ message, rinfo }, punched] = await Promise.all([probeP, punchP]);
    assert.equal(isPunchProbe(message, { token, localNodeId: 'peer-under-test' }), true);
    assert.equal(rinfo.port, node.quic.port);
    assert.equal(punched.sent, 1);
  } finally {
    await Promise.allSettled([node.close(), closeUdp(receiver)]);
    await rm(tls.dir, { recursive: true, force: true });
  }
});
