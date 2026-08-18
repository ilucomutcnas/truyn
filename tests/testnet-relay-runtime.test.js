import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTestnetRelayService } from '../network/testnet/relay-service.js';
import { createTestnetNodeService } from '../network/testnet/node-service.js';

async function tls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath,
    '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

async function post(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `http_${response.status}`);
  return json;
}

test('testnet node service uses authenticated signed relay fallback when direct discovery is impossible', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-testnet-relay-runtime-'));
  const material = await tls(root);
  const token = 'ephemeral-runtime-test-token';
  const relay = await createTestnetRelayService({ host: '127.0.0.1', token });
  const relayUrl = `http://127.0.0.1:${relay.address.port}`;
  let a;
  let b;
  try {
    a = await createTestnetNodeService({
      identityPath: join(root, 'a-id.json'), statePath: join(root, 'a-state.json'), tlsKey: material.key, tlsCert: material.cert,
      quicHost: '127.0.0.1', quicPort: 0, advertiseHost: '127.0.0.1', controlHost: '127.0.0.1', controlPort: 0,
      relayUrl, relayToken: token, relayPollWaitMs: 200, relayTimeoutMs: 5_000
    });
    b = await createTestnetNodeService({
      identityPath: join(root, 'b-id.json'), statePath: join(root, 'b-state.json'), tlsKey: material.key, tlsCert: material.cert,
      quicHost: '127.0.0.1', quicPort: 0, advertiseHost: '127.0.0.1', controlHost: '127.0.0.1', controlPort: 0,
      relayUrl, relayToken: token, relayPollWaitMs: 200, relayTimeoutMs: 5_000
    });

    const result = await post(`http://127.0.0.1:${a.controlAddress.port}/need`, {
      nodeId: b.identity.nodeId,
      input: { proof: 'runtime-relay' }
    });
    assert.equal(result.transport, 'relay-fallback');
    assert.equal(result.directFailure, 'peer_not_discovered');
    assert.equal(result.result.transport, 'relay');
    assert.equal(result.result.echo.proof, 'runtime-relay');

    const status = await fetch(`http://127.0.0.1:${a.controlAddress.port}/status`).then((response) => response.json());
    assert.equal(status.relayEnabled, true);
  } finally {
    await Promise.allSettled([a?.close(), b?.close(), relay.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

test('testnet node service refuses relay configuration without an explicit token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-testnet-relay-token-'));
  const material = await tls(root);
  try {
    await assert.rejects(
      createTestnetNodeService({
        identityPath: join(root, 'id.json'), statePath: join(root, 'state.json'), tlsKey: material.key, tlsCert: material.cert,
        advertiseHost: '127.0.0.1', relayUrl: 'http://127.0.0.1:9', relayToken: ''
      }),
      /relayToken is required/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
