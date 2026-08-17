import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord } from '../network/discovery/peer-discovery.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function eventually(check, { timeoutMs = 10_000, intervalMs = 25, message = 'condition_not_met' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await sleep(intervalMs);
  }
  assert.fail(`${message}${last ? `:${JSON.stringify(last)}` : ''}`);
}

test('productionization: peer record renews before expiry, disseminates, and invalidates stale outbound clients', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-renewal-'));
  const tls = await generateTls(root);
  const a = new TruynNetworkNode({
    identity: createIdentity(), host: '127.0.0.1', tls, statePath: join(root, 'a-state.json'),
    peerRecordTtlMs: 60_000, peerRecordRenewBeforeMs: 58_000
  });
  const b = new TruynNetworkNode({
    identity: createIdentity(), host: '127.0.0.1', tls, statePath: join(root, 'b-state.json'),
    peerRecordTtlMs: 60_000, peerRecordAutoRenew: false
  });
  try {
    const [recordA, recordB] = await Promise.all([a.start(), b.start()]);
    a.bootstrap([recordB]);
    b.bootstrap([recordA]);
    a.onEnvelope(async (message) => ({ ok: true, type: message.type }));

    await b.need(a.identity.nodeId, 'renewal-proof', { value: 1 });
    assert.equal(await b.pingPeer(a.identity.nodeId), true);
    assert.equal(b.router.connections.has(a.identity.nodeId), true, 'direct client must exist before renewal');
    assert.equal(b.rpc.clients.has(a.identity.nodeId), true, 'DHT RPC client must exist before renewal');

    const originalExpiresAt = Date.parse(recordA.expiresAt);
    const renewedAtB = await eventually(() => {
      const current = b.discovery.get(a.identity.nodeId);
      return current?.sequence > recordA.sequence ? current : null;
    }, { message: 'renewed_record_not_disseminated' });

    assert.ok(Date.parse(renewedAtB.expiresAt) > originalExpiresAt, 'renewal must extend the signed lease');
    await eventually(() => !b.router.connections.has(a.identity.nodeId) && !b.rpc.clients.has(a.identity.nodeId), {
      message: 'stale_clients_not_invalidated'
    });

    const afterOriginalExpiry = b.discovery.get(a.identity.nodeId, { now: originalExpiresAt + 1 });
    assert.ok(afterOriginalExpiry, 'newer record must remain valid after the original lease expires');
    assert.ok(afterOriginalExpiry.sequence > recordA.sequence);

    const lifecycle = a.peerRecordLifecycleSnapshot();
    assert.ok(lifecycle.lastRenewedAt);
    assert.ok(lifecycle.lastSequence > recordA.sequence);
    assert.ok(lifecycle.lastAnnouncement?.delivered >= 1);
    assert.equal(lifecycle.lastError, null);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

test('productionization: renewal persists the new sequence before any peer announcement', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-renewal-order-'));
  const tls = await generateTls(root);
  const statePath = join(root, 'node-state.json');
  const node = new TruynNetworkNode({
    identity: createIdentity(), host: '127.0.0.1', tls, statePath,
    peerRecordTtlMs: 60_000, peerRecordAutoRenew: false
  });
  try {
    const initial = await node.start();
    const remoteIdentity = createIdentity();
    const remote = createPeerRecord({
      identity: remoteIdentity,
      endpoints: ['quic://127.0.0.1:65530'],
      ttlMs: 60_000
    });
    node.bootstrap([remote]);

    let persistedSequenceAtAnnouncement = null;
    node.rpc.announce = async (_peer, record) => {
      const persisted = JSON.parse(await readFile(statePath, 'utf8'));
      persistedSequenceAtAnnouncement = persisted.sequence;
      return { accepted: true, nodeId: record.nodeId, sequence: record.sequence };
    };

    const renewed = await node.renewPeerRecord();
    assert.ok(renewed.record.sequence > initial.sequence);
    assert.equal(persistedSequenceAtAnnouncement, renewed.record.sequence, 'published sequence must already be durable');
    assert.equal(renewed.announcement.delivered, 1);
  } finally {
    await node.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('productionization: PING piggyback repairs a missed proactive renewal announcement', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-renewal-ping-'));
  const tls = await generateTls(root);
  const a = new TruynNetworkNode({
    identity: createIdentity(), host: '127.0.0.1', tls,
    peerRecordTtlMs: 60_000, peerRecordAutoRenew: false, peerRecordPublishFanout: 0
  });
  const b = new TruynNetworkNode({
    identity: createIdentity(), host: '127.0.0.1', tls,
    peerRecordTtlMs: 60_000, peerRecordAutoRenew: false
  });
  try {
    const [recordA, recordB] = await Promise.all([a.start(), b.start()]);
    a.bootstrap([recordB]);
    b.bootstrap([recordA]);

    const renewed = await a.renewPeerRecord();
    assert.ok(renewed.record.sequence > recordA.sequence);
    assert.equal(renewed.announcement.attempted, 0, 'fanout=0 must model a missed proactive announcement');
    assert.equal(b.discovery.get(a.identity.nodeId)?.sequence, recordA.sequence, 'remote peer must still hold the previous valid record before PING');

    assert.equal(await b.pingPeer(a.identity.nodeId), true);
    const repaired = b.discovery.get(a.identity.nodeId);
    assert.ok(repaired?.sequence > recordA.sequence, 'PING response must carry and ingest the current self record');
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
