import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function statePath(root, name) { return join(root, `${name}.network-state.json`); }

async function mesh(nodes, records) {
  for (let i = 0; i < nodes.length; i += 1) nodes[i].bootstrap(records.filter((_, j) => j !== i));
  await Promise.all(nodes.map((node) => node.persistState()));
}

test('productionization: routing and DHT state survive crash-style restart and endpoint rotation', { timeout: 45_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-durable-network-'));
  const tls = await generateTls(root);
  const identities = [createIdentity(), createIdentity(), createIdentity(), createIdentity()];
  let nodes = identities.map((identity, i) => new TruynNetworkNode({
    identity, host: '127.0.0.1', tls, statePath: statePath(root, `n${i}`), peerRecordTtlMs: 120_000
  }));
  try {
    const records = await Promise.all(nodes.map((node) => node.start()));
    await mesh(nodes, records);
    const [a, b, c, d] = nodes;

    const record = a.createRecord('productionization', 'durable-key', { value: 'survives-restart' }, { ttlMs: 120_000 });
    const written = await a.replicateRecord(record, { replicationFactor: 3, minAcks: 3 });
    assert.equal(written.acknowledgements, 3);
    await Promise.all(nodes.map((node) => node.persistState()));

    const beforePort = a.quic.port;
    await a.close();
    const restartedA = new TruynNetworkNode({ identity: identities[0], host: '127.0.0.1', tls, statePath: statePath(root, 'n0'), peerRecordTtlMs: 120_000 });
    const newRecordA = await restartedA.start();
    nodes[0] = restartedA;
    assert.ok(restartedA.discovery.get(b.identity.nodeId), 'routing peer B must restore from durable state');
    assert.equal(await restartedA.pingPeer(b.identity.nodeId), true, 'restored route must be operational without re-bootstrap');
    assert.equal(restartedA.recordStore.get('productionization', 'durable-key').length, 1, 'local DHT replica must survive restart');
    assert.ok(newRecordA.sequence > records[0].sequence, 'peer-record sequence must not roll back on restart');
    assert.notEqual(restartedA.quic.port, beforePort, 'test requires endpoint rotation across restart');

    b.bootstrap([newRecordA]);
    c.bootstrap([newRecordA]);
    d.bootstrap([newRecordA]);
    const resolved = await restartedA.findReplicatedValue('productionization', 'durable-key', { fanout: 4 });
    assert.ok(resolved.records.some((item) => item.recordId === record.recordId));
  } finally {
    await Promise.allSettled(nodes.map((node) => node.close()));
    await rm(root, { recursive: true, force: true });
  }
});

test('productionization: DHT repair restores replication after a holder failure and quorum fails closed', { timeout: 45_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-dht-repair-'));
  const tls = await generateTls(root);
  const nodes = Array.from({ length: 5 }, (_, i) => new TruynNetworkNode({
    identity: createIdentity(), host: '127.0.0.1', tls, statePath: statePath(root, `r${i}`), peerRecordTtlMs: 120_000
  }));
  try {
    const records = await Promise.all(nodes.map((node) => node.start()));
    await mesh(nodes, records);
    const [a] = nodes;
    const record = a.createRecord('productionization', 'repair-key', { epoch: 1 }, { ttlMs: 120_000 });
    const first = await a.replicateRecord(record, { replicationFactor: 3, minAcks: 3 });
    assert.equal(first.acknowledgements, 3);

    const remoteHolderId = first.storedAt.find((nodeId) => nodeId !== a.identity.nodeId);
    const failed = nodes.find((node) => node.identity.nodeId === remoteHolderId);
    await failed.close();

    const repaired = await a.repairRecord('productionization', 'repair-key', { replicationFactor: 3, minAcks: 3 });
    assert.equal(repaired.records, 1);
    assert.equal(repaired.repairs[0].acknowledgements, 3);
    assert.equal(repaired.repairs[0].storedAt.includes(remoteHolderId), false, 'repair must replace failed holder with a live peer');

    const isolatedRoot = await mkdtemp(join(tmpdir(), 'truyn-quorum-isolated-'));
    const isolatedTls = await generateTls(isolatedRoot);
    const isolated = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls: isolatedTls, statePath: statePath(isolatedRoot, 'isolated') });
    try {
      await isolated.start();
      const impossible = isolated.createRecord('productionization', 'quorum-key', { value: true });
      await assert.rejects(
        isolated.replicateRecord(impossible, { replicationFactor: 3, minAcks: 2 }),
        (error) => error?.code === 'TRUYN_DHT_WRITE_QUORUM' && error.acknowledgements === 1
      );
    } finally {
      await isolated.close();
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  } finally {
    await Promise.allSettled(nodes.map((node) => node.close()));
    await rm(root, { recursive: true, force: true });
  }
});
