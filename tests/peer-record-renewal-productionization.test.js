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
  const a = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, statePath: join(root, 'a-state.json'), peerRecordTtlMs: 60_000, peerRecordRenewBeforeMs: 58_000 });
  const b = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, statePath: join(root, 'b-state.json'), peerRecordTtlMs: 60_000, peerRecordAutoRenew: false });
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
    await eventually(() => !b.router.connections.has(a.identity.nodeId) && !b.rpc.clients.has(a.identity.nodeId), { message: 'stale_clients_not_invalidated' });
    const afterOriginalExpiry = b.discovery.get(a.identity.nodeId, { now: originalExpiresAt + 1 });
    assert.ok(afterOriginalExpiry, 'newer record must remain valid after the original lease expires');
    assert.ok(afterOriginalExpiry.sequence > recordA.sequence);
    const lifecycle = await eventually(() => {
      const current = a.peerRecordLifecycleSnapshot();
      return current.lastRenewedAt && current.lastSequence > recordA.sequence && current.lastAnnouncement?.delivered >= 1 ? current : null;
    }, { message: 'renewal_lifecycle_not_completed' });
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
  const node = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, statePath, peerRecordTtlMs: 60_000, peerRecordAutoRenew: false });
  try {
    const initial = await node.start();
    const remoteIdentity = createIdentity();
    const remote = createPeerRecord({ identity: remoteIdentity, endpoints: ['quic://127.0.0.1:65530'], ttlMs: 60_000 });
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
  const a = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, peerRecordTtlMs: 60_000, peerRecordAutoRenew: false, peerRecordPublishFanout: 0 });
  const b = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, peerRecordTtlMs: 60_000, peerRecordAutoRenew: false });
  try {
    const [recordA, recordB] = await Promise.all([a.start(), b.start()]);
    a.bootstrap([recordB]);
    b.bootstrap([recordA]);
    const renewed = await a.renewPeerRecord();
    assert.ok(renewed.record.sequence > recordA.sequence);
    assert.equal(renewed.announcement.attempted, 0, 'fanout=0 must model a missed proactive announcement');
    assert.equal(b.discovery.get(a.identity.nodeId)?.sequence, recordA.sequence, 'remote peer must still hold the previous valid record before PING');
    assert.equal(await b.pingPeer(a.identity.nodeId), true);
    const repaired = await eventually(() => {
      const current = b.discovery.get(a.identity.nodeId);
      return current?.sequence > recordA.sequence ? current : null;
    }, { message: 'ping_peer_record_not_ingested' });
    assert.ok(repaired.sequence > recordA.sequence, 'PING response must carry and ingest the current self record');
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

test('productionization: durable restart re-registers before first application traffic and invalidates stale clients', { timeout: 25_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-restart-reregister-'));
  const tls = await generateTls(root);
  const identityA = createIdentity();
  const statePathA = join(root, 'a-state.json');
  let a = new TruynNetworkNode({ identity: identityA, host: '127.0.0.1', tls, statePath: statePathA, peerRecordAutoRenew: false });
  const b = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, statePath: join(root, 'b-state.json'), peerRecordAutoRenew: false });
  try {
    const [recordA, recordB] = await Promise.all([a.start(), b.start()]);
    a.bootstrap([recordB]);
    b.bootstrap([recordA]);
    await a.persistState();
    a.onEnvelope(async (message) => ({ ok: true, type: message.type, phase: 'before-restart' }));

    const directBefore = await b.need(identityA.nodeId, 'restart-proof', { phase: 'before' });
    assert.equal(directBefore.transport, 'quic-direct');
    assert.equal(await b.pingPeer(identityA.nodeId), true);
    assert.equal(b.router.connections.has(identityA.nodeId), true, 'direct cache must be populated before shutdown');
    assert.equal(b.rpc.clients.has(identityA.nodeId), true, 'discovery cache must be populated before shutdown');

    const endpoint = new URL(recordA.endpoints[0]);
    const restartPort = Number(endpoint.port);
    await a.close();

    a = new TruynNetworkNode({ identity: identityA, host: '127.0.0.1', port: restartPort, tls, statePath: statePathA, peerRecordAutoRenew: false });
    const restartedRecord = await a.start();
    assert.ok(restartedRecord.sequence > recordA.sequence, 'restart must advance the durable signed peer-record sequence');

    const registered = await eventually(() => {
      const current = b.discovery.get(identityA.nodeId);
      return current?.sequence === restartedRecord.sequence ? current : null;
    }, { message: 'restart_record_not_proactively_registered' });
    assert.equal(registered.recordId, restartedRecord.recordId);
    await eventually(
      () => !b.router.connections.has(identityA.nodeId) && !b.rpc.clients.has(identityA.nodeId),
      { message: 'new_restart_record_did_not_invalidate_stale_clients' }
    );
    const lifecycle = a.peerRecordLifecycleSnapshot();
    assert.ok(lifecycle.lastAnnouncement?.attempted >= 1, 'restart must attempt control-plane re-registration');
    assert.ok(lifecycle.lastAnnouncement?.delivered >= 1, 'restart must deliver its new signed record to a recovered peer');

    a.onEnvelope(async (message) => ({ ok: true, type: message.type, phase: 'after-restart' }));
    const directAfter = await b.need(identityA.nodeId, 'restart-proof', { phase: 'after' });
    assert.equal(directAfter.transport, 'quic-direct', 'first application request after re-registration must establish a fresh QUIC session');
    assert.equal(directAfter.result.phase, 'after-restart');
    assert.equal(await b.pingPeer(identityA.nodeId), true, 'first discovery request after re-registration must use a fresh QUIC session');
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

test('productionization: durable restart retries only failed peer registrations and cancels pending retry on close', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-restart-retry-'));
  const tls = await generateTls(root);
  const identity = createIdentity();
  const statePath = join(root, 'node-state.json');
  const stableIdentity = createIdentity();
  const flakyIdentity = createIdentity();
  const stable = createPeerRecord({ identity: stableIdentity, endpoints: ['quic://127.0.0.1:65528'], ttlMs: 60_000 });
  const flaky = createPeerRecord({ identity: flakyIdentity, endpoints: ['quic://127.0.0.1:65529'], ttlMs: 60_000 });
  let node = new TruynNetworkNode({ identity, host: '127.0.0.1', tls, statePath, peerRecordAutoRenew: false });
  try {
    await node.start();
    node.bootstrap([stable, flaky]);
    await node.persistState();
    await node.close();

    node = new TruynNetworkNode({ identity, host: '127.0.0.1', tls, statePath, peerRecordAutoRenew: false });
    const attempts = new Map();
    node.rpc.announce = async (peer, record) => {
      const count = (attempts.get(peer.nodeId) || 0) + 1;
      attempts.set(peer.nodeId, count);
      if (peer.nodeId === flakyIdentity.nodeId && count === 1) throw new Error('simulated_peer_temporarily_unavailable');
      return { accepted: true, nodeId: record.nodeId, sequence: record.sequence };
    };
    await node.start();
    const initial = node.peerRecordLifecycleSnapshot().lastAnnouncement;
    assert.equal(initial.attempted, 2);
    assert.equal(initial.delivered, 1);
    assert.equal(initial.failed, 1);
    assert.deepEqual(initial.failedNodeIds, [flakyIdentity.nodeId]);

    const repaired = await eventually(() => {
      const lifecycle = node.peerRecordLifecycleSnapshot();
      return attempts.get(flakyIdentity.nodeId) === 2 && lifecycle.lastAnnouncement?.failed === 0 ? lifecycle.lastAnnouncement : null;
    }, { timeoutMs: 4_000, message: 'failed_peer_not_retried' });
    assert.equal(attempts.get(stableIdentity.nodeId), 1, 'already-delivered peer must not be retried');
    assert.equal(attempts.get(flakyIdentity.nodeId), 2, 'failed peer must receive exactly the first bounded retry');
    assert.equal(repaired.attempted, 1);
    assert.equal(repaired.delivered, 1);
    assert.equal(repaired.failed, 0);

    await node.close();
    node = new TruynNetworkNode({ identity, host: '127.0.0.1', tls, statePath, peerRecordAutoRenew: false });
    let cancelledAttempts = 0;
    node.rpc.announce = async () => {
      cancelledAttempts += 1;
      throw new Error('simulated_peer_still_unavailable');
    };
    await node.start();
    assert.equal(cancelledAttempts, 2, 'restart must make one initial attempt per recovered peer');
    await node.close();
    await sleep(1_200);
    assert.equal(cancelledAttempts, 2, 'close must cancel the pending control-plane retry');
  } finally {
    await node.close();
    await rm(root, { recursive: true, force: true });
  }
});
