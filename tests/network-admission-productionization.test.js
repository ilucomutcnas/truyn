import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { BoundedAdmissionQueue } from '../network/admission/bounded-queue.js';
import { TruynQuicTransport } from '../network/transport/quic.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function tick() { return new Promise((resolve) => setImmediate(resolve)); }

test('productionization admission: 350-event burst has explicit accept-or-backpressure accounting with zero silent loss', async () => {
  const queue = new BoundedAdmissionQueue({ maxInFlight: 8, maxQueued: 32 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const attempts = Array.from({ length: 350 }, (_, index) => queue.run(async () => {
    await gate;
    return index;
  }));

  await tick();
  const saturated = queue.snapshot();
  assert.equal(saturated.inFlight, 8);
  assert.equal(saturated.queued, 32);
  assert.equal(saturated.admitted, 40);
  assert.equal(saturated.rejected, 310);
  assert.equal(saturated.admitted + saturated.rejected, 350);

  release();
  const settled = await Promise.allSettled(attempts);
  const fulfilled = settled.filter((item) => item.status === 'fulfilled');
  const rejected = settled.filter((item) => item.status === 'rejected');
  assert.equal(fulfilled.length, 40);
  assert.equal(rejected.length, 310);
  assert.ok(rejected.every((item) => item.reason?.code === 'TRUYN_BACKPRESSURE'));

  const final = queue.snapshot();
  assert.equal(final.inFlight, 0);
  assert.equal(final.queued, 0);
  assert.equal(final.completed, 40);
  assert.equal(final.failed, 0);
  assert.equal(final.admitted + final.rejected, 350);
});

test('productionization admission: inbound QUIC overload rejects excess before handler execution', { timeout: 25_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-inbound-admission-'));
  const tls = await generateTls(root);
  const serverIdentity = createIdentity();
  const clientIdentity = createIdentity();
  const server = new TruynQuicTransport({
    identity: serverIdentity,
    host: '127.0.0.1',
    tls,
    maxInboundInFlight: 1,
    maxInboundQueued: 1
  });
  const client = new TruynQuicTransport({ identity: clientIdentity, host: '127.0.0.1', tls });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let handlerExecutions = 0;
  server.onEnvelope(async () => {
    handlerExecutions += 1;
    await gate;
    return { ok: true };
  });

  try {
    const endpoint = await server.start();
    await client.start();
    const connection = await client.connect({ host: '127.0.0.1', port: endpoint.port });
    const sends = Array.from({ length: 5 }, (_, index) => {
      const envelope = createEnvelope({
        type: 'NEED',
        from: clientIdentity.nodeId,
        to: serverIdentity.nodeId,
        payload: { capability: { name: 'testnet.echo' }, input: { index } },
        privateKeyPem: clientIdentity.privateKeyPem,
        publicKeyPem: clientIdentity.publicKeyPem
      });
      return client.sendEnvelope(connection, envelope);
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    const saturated = server.admissionSnapshot();
    assert.equal(saturated.inFlight, 1);
    assert.equal(saturated.queued, 1);
    assert.equal(saturated.admitted, 2);
    assert.equal(saturated.rejected, 3);
    assert.equal(handlerExecutions, 1, 'queued/excess work must not run early');

    release();
    const settled = await Promise.allSettled(sends);
    assert.equal(settled.filter((item) => item.status === 'fulfilled').length, 2);
    const rejected = settled.filter((item) => item.status === 'rejected');
    assert.equal(rejected.length, 3);
    assert.ok(rejected.every((item) => item.reason?.code === 'TRUYN_BACKPRESSURE'));
    assert.equal(handlerExecutions, 2);

    const final = server.admissionSnapshot();
    assert.equal(final.completed, 2);
    assert.equal(final.rejected, 3);
    assert.equal(final.admitted + final.rejected, 5);
  } finally {
    release?.();
    await Promise.allSettled([client.close(), server.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
