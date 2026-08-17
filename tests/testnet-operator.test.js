import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createTestnetNodeService } from '../network/testnet/node-service.js';
import { TestnetNetworkOperator } from '../network/testnet/operator.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

test('signed QUIC operator bootstraps remote peers, drives fault injection and orchestrates direct network work without HTTP control', { timeout: 45_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-testnet-operator-'));
  const tls = await generateTls(root);
  const operatorIdentity = createIdentity();
  const services = [];
  const operator = new TestnetNetworkOperator({ identity: operatorIdentity, tls, dhtRpcTimeoutMs: 1_500 });
  try {
    for (let i = 0; i < 4; i += 1) {
      services.push(await createTestnetNodeService({
        identityPath: join(root, `identity-${i}.json`),
        statePath: join(root, `state-${i}.json`),
        tlsKey: tls.key,
        tlsCert: tls.cert,
        quicHost: '127.0.0.1',
        quicPort: 0,
        advertiseHost: '127.0.0.1',
        controlHost: '127.0.0.1',
        controlPort: 0,
        dhtReplicationFactor: 3,
        dhtWriteQuorum: 3,
        dhtRpcTimeoutMs: 1_500,
        operatorNodeIds: [operatorIdentity.nodeId],
        faultControlEnabled: true
      }));
    }

    const records = services.map((service) => service.node.localPeerRecord);
    await operator.start(records);
    for (const service of services) {
      const response = await operator.bootstrapRemote(service.identity.nodeId, records);
      assert.ok(response.results.filter((item) => item.accepted).length >= 3);
    }

    const status = await operator.status(services[0].identity.nodeId);
    assert.equal(status.nodeId, services[0].identity.nodeId);
    assert.equal(status.operatorCount, 1);
    assert.equal(status.faultControlEnabled, true);
    assert.ok(status.peerCount >= 3);

    const direct = await operator.directNeed(
      services[0].identity.nodeId,
      services[2].identity.nodeId,
      { proof: 'remote-a-to-remote-c' }
    );
    assert.equal(direct.transport, 'quic-direct');
    assert.deepEqual(direct.result.echo, { proof: 'remote-a-to-remote-c' });
    assert.equal(direct.result.transport, 'quic');

    const initialFaults = await operator.faults(services[0].identity.nodeId);
    assert.deepEqual(initialFaults.partitionedPeers, []);
    await operator.partition(services[0].identity.nodeId, services[2].identity.nodeId);
    await assert.rejects(
      operator.directNeed(services[0].identity.nodeId, services[2].identity.nodeId, { proof: 'must-fail-under-partition' }),
      /TRUYN_NETWORK_PARTITION|quic_envelope/i
    );
    const partitioned = await operator.faults(services[0].identity.nodeId);
    assert.ok(partitioned.partitionedPeers.includes(services[2].identity.nodeId));
    await operator.heal(services[0].identity.nodeId, services[2].identity.nodeId);
    const healed = await operator.directNeed(services[0].identity.nodeId, services[2].identity.nodeId, { proof: 'healed' });
    assert.equal(healed.transport, 'quic-direct');

    await operator.relay(services[0].identity.nodeId, { mode: 'down' });
    const relayDownButDirectHealthy = await operator.directNeed(services[0].identity.nodeId, services[1].identity.nodeId, { proof: 'relay-independent' });
    assert.equal(relayDownButDirectHealthy.transport, 'quic-direct');
    await operator.relay(services[0].identity.nodeId, { mode: 'up' });

    const replicated = await operator.replicate(services[0].identity.nodeId, {
      namespace: 'operator-test',
      key: 'replicated',
      value: { proof: true },
      replicationFactor: 3,
      minAcks: 3,
      ttlMs: 120_000
    });
    assert.equal(replicated.result.acknowledgements, 3);

    const found = await operator.find(services[3].identity.nodeId, {
      namespace: 'operator-test',
      key: 'replicated',
      fanout: 4
    });
    assert.ok(found.records.some((record) => record.recordId === replicated.record.recordId));
  } finally {
    await operator.close().catch(() => {});
    await Promise.allSettled(services.map((service) => service.close()));
    await rm(root, { recursive: true, force: true });
  }
});

test('testnet operator commands fail closed for an authenticated but unauthorized node', { timeout: 25_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-testnet-operator-deny-'));
  const tls = await generateTls(root);
  const authorized = createIdentity();
  const service = await createTestnetNodeService({
    identityPath: join(root, 'identity.json'),
    statePath: join(root, 'state.json'),
    tlsKey: tls.key,
    tlsCert: tls.cert,
    quicHost: '127.0.0.1',
    quicPort: 0,
    advertiseHost: '127.0.0.1',
    controlHost: '127.0.0.1',
    controlPort: 0,
    operatorNodeIds: [authorized.nodeId],
    faultControlEnabled: true
  });
  const unauthorized = new TestnetNetworkOperator({ identity: createIdentity(), tls, dhtRpcTimeoutMs: 1_500 });
  try {
    await unauthorized.start([service.node.localPeerRecord]);
    await assert.rejects(
      unauthorized.status(service.identity.nodeId),
      /testnet_operator_denied|stream|QUIC/i
    );
    await assert.rejects(
      unauthorized.partition(service.identity.nodeId, service.identity.nodeId),
      /testnet_operator_denied|stream|QUIC/i
    );
  } finally {
    await unauthorized.close().catch(() => {});
    await service.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
