import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTestnetNodeService } from '../network/testnet/node-service.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

async function call(service, path, { method = 'GET', body } = {}) {
  const address = service.controlAddress;
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const value = await response.json();
  return { status: response.status, value };
}

test('testnet node service exposes only local orchestration semantics and preserves identity across restart', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-testnet-service-'));
  const tls = await generateTls(root);
  const common = {
    identityPath: join(root, 'identity.json'),
    statePath: join(root, 'network-state.json'),
    tlsKey: tls.key,
    tlsCert: tls.cert,
    quicHost: '127.0.0.1',
    quicPort: 0,
    advertiseHost: '127.0.0.1',
    controlHost: '127.0.0.1',
    controlPort: 0
  };
  let service = await createTestnetNodeService(common);
  try {
    const firstNodeId = service.identity.nodeId;
    const firstRecord = (await call(service, '/record')).value.record;
    const status = await call(service, '/status');
    assert.equal(status.status, 200);
    assert.equal(status.value.nodeId, firstNodeId);
    assert.equal(status.value.faultControlEnabled, false);
    assert.ok(status.value.quicPort > 0);
    const faults = await call(service, '/faults');
    assert.equal(faults.status, 404);
    assert.equal(faults.value.error, 'TRUYN_TESTNET_FAULT_CONTROL_DISABLED');
    const mode = (await stat(common.identityPath)).mode & 0o777;
    assert.equal(mode, 0o600);

    await service.close();
    service = await createTestnetNodeService(common);
    const secondRecord = (await call(service, '/record')).value.record;
    assert.equal(service.identity.nodeId, firstNodeId);
    assert.ok(secondRecord.sequence > firstRecord.sequence);
  } finally {
    await service.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test('three independent testnet node services bootstrap, direct-NEED and replicate without relay', { timeout: 35_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-testnet-services-'));
  const tls = await generateTls(root);
  const services = [];
  try {
    for (let i = 0; i < 3; i += 1) {
      services.push(await createTestnetNodeService({
        identityPath: join(root, `identity-${i}.json`), statePath: join(root, `state-${i}.json`),
        tlsKey: tls.key, tlsCert: tls.cert, quicHost: '127.0.0.1', quicPort: 0,
        advertiseHost: '127.0.0.1', controlHost: '127.0.0.1', controlPort: 0,
        dhtReplicationFactor: 3, dhtWriteQuorum: 3
      }));
    }
    const records = await Promise.all(services.map(async (service) => (await call(service, '/record')).value.record));
    for (let i = 0; i < services.length; i += 1) {
      const boot = await call(services[i], '/bootstrap', { method: 'POST', body: { records: records.filter((_, j) => j !== i) } });
      assert.equal(boot.status, 200);
    }

    const need = await call(services[0], '/need', { method: 'POST', body: { nodeId: services[2].identity.nodeId, input: { proof: 'direct-quic' } } });
    assert.equal(need.status, 200);
    assert.equal(need.value.transport, 'quic-direct');
    assert.deepEqual(need.value.result.echo, { proof: 'direct-quic' });

    const replicated = await call(services[0], '/replicate', { method: 'POST', body: {
      namespace: 'testnet', key: 'service-proof', value: { ok: true }, replicationFactor: 3, minAcks: 3
    } });
    assert.equal(replicated.status, 200);
    assert.equal(replicated.value.result.acknowledgements, 3);

    const found = await call(services[1], '/find?namespace=testnet&key=service-proof&fanout=3');
    assert.equal(found.status, 200);
    assert.ok(found.value.records.some((record) => record.recordId === replicated.value.record.recordId));
  } finally {
    await Promise.allSettled(services.map((service) => service.close()));
    await rm(root, { recursive: true, force: true });
  }
});
