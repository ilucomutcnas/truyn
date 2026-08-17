import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { TruynQuicTransport } from '../network/transport/quic.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

test('productionization QUIC session binding survives wildcard-local versus routed-peer address views', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-quic-binding-'));
  const tls = await generateTls(root);
  const serverIdentity = createIdentity();
  const clientIdentity = createIdentity();
  const server = new TruynQuicTransport({ identity: serverIdentity, host: '127.0.0.1', tls });
  const client = new TruynQuicTransport({ identity: clientIdentity, host: '0.0.0.0', tls });
  server.onEnvelope(async (envelope, context) => ({ ok: true, transport: context.transport, type: envelope.type }));
  try {
    const serverEndpoint = await server.start();
    await client.start();
    const connection = await client.connect({ host: '127.0.0.1', port: serverEndpoint.port });
    const envelope = createEnvelope({
      type: 'NEED',
      from: clientIdentity.nodeId,
      to: serverIdentity.nodeId,
      payload: { capability: { name: 'testnet.echo' }, input: { wildcard: true } },
      privateKeyPem: clientIdentity.privateKeyPem,
      publicKeyPem: clientIdentity.publicKeyPem
    });
    const result = await client.sendEnvelope(connection, envelope);
    assert.deepEqual(result, { ok: true, transport: 'quic', type: 'NEED' });
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
