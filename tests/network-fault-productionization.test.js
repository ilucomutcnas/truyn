import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

async function startMesh(root, count, { relayFallback = null } = {}) {
  const tls = await generateTls(root);
  const nodes = Array.from({ length: count }, (_, i) => new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls,
    statePath: join(root, `fault-${i}.json`),
    peerRecordTtlMs: 120_000,
    dhtRpcTimeoutMs: 1_000,
    relayFallback: i === 0 ? relayFallback : null
  }));
  const records = await Promise.all(nodes.map((node) => node.start()));
  for (let i = 0; i < nodes.length; i += 1) nodes[i].bootstrap(records.filter((_, j) => i !== j));
  return nodes;
}

test('productionization faults: peer partition blocks direct and DHT paths, then heal restores both', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-fault-partition-'));
  const nodes = await startMesh(root, 3);
  try {
    const [a, b] = nodes;
    assert.equal(await a.pingPeer(b.identity.nodeId), true);

    a.partitionPeers(b.identity.nodeId);
    assert.equal(a.faultSnapshot().partitionedPeers.includes(b.identity.nodeId), true);
    await assert.rejects(a.pingPeer(b.identity.nodeId), (error) => error?.code === 'TRUYN_NETWORK_PARTITION');
    await assert.rejects(
      a.need(b.identity.nodeId, 'testnet.echo', { partitioned: true }, {}, { allowRelayFallback: false }),
      (error) => error?.code === 'TRUYN_NETWORK_PARTITION'
    );

    const record = a.createRecord('productionization', 'partition-quorum', { value: 1 }, { ttlMs: 120_000 });
    await assert.rejects(
      a.replicateRecord(record, { replicationFactor: 3, minAcks: 3 }),
      (error) => error?.code === 'TRUYN_DHT_WRITE_QUORUM' && error.acknowledgements === 2 &&
        error.failures?.some((failure) => failure.nodeId === b.identity.nodeId)
    );

    a.healPeers(b.identity.nodeId);
    assert.equal(await a.pingPeer(b.identity.nodeId), true);
    const direct = await a.need(b.identity.nodeId, 'testnet.echo', { healed: true }, {}, { allowRelayFallback: false });
    assert.equal(direct.transport, 'quic-direct');

    const repairedRecord = a.createRecord('productionization', 'healed-quorum', { value: 2 }, { ttlMs: 120_000 });
    const replicated = await a.replicateRecord(repairedRecord, { replicationFactor: 3, minAcks: 3 });
    assert.equal(replicated.acknowledgements, 3);
  } finally {
    await Promise.allSettled(nodes.map((node) => node.close()));
    await rm(root, { recursive: true, force: true });
  }
});

test('productionization faults: relay outage is irrelevant to healthy direct QUIC and degraded fallback is explicit', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-fault-relay-'));
  let relayCalls = 0;
  const relayFallback = async (peerNodeId, envelope) => {
    relayCalls += 1;
    return { ok: true, peerNodeId, type: envelope.type };
  };
  const nodes = await startMesh(root, 2, { relayFallback });
  try {
    const [a, b] = nodes;
    a.setRelayFault({ mode: 'down' });
    const healthyDirect = await a.need(b.identity.nodeId, 'testnet.echo', { direct: true });
    assert.equal(healthyDirect.transport, 'quic-direct');
    assert.equal(relayCalls, 0, 'relay outage must not affect reachable direct peers');

    a.partitionPeers(b.identity.nodeId);
    await assert.rejects(
      a.need(b.identity.nodeId, 'testnet.echo', { fallback: 'down' }),
      (error) => error?.code === 'TRUYN_RELAY_UNAVAILABLE' && error.directFailure?.includes('TRUYN_NETWORK_PARTITION')
    );
    assert.equal(relayCalls, 0, 'down relay must fail before fallback invocation');

    a.setRelayFault({ mode: 'degraded', delayMs: 60 });
    const started = performance.now();
    const degraded = await a.need(b.identity.nodeId, 'testnet.echo', { fallback: 'degraded' });
    const elapsed = performance.now() - started;
    assert.equal(degraded.transport, 'relay-fallback');
    assert.equal(relayCalls, 1);
    assert.ok(elapsed >= 45, `degraded relay delay must be observable; saw ${elapsed.toFixed(0)}ms`);

    a.healPeers(b.identity.nodeId);
    a.setRelayFault({ mode: 'down' });
    const healedDirect = await a.need(b.identity.nodeId, 'testnet.echo', { healed: true });
    assert.equal(healedDirect.transport, 'quic-direct');
    assert.equal(relayCalls, 1, 'healed direct path must stop using fallback again');
  } finally {
    await Promise.allSettled(nodes.map((node) => node.close()));
    await rm(root, { recursive: true, force: true });
  }
});
