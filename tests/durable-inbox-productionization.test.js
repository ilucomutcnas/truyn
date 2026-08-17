import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { DurableAcceptedWorkInbox } from '../network/admission/durable-inbox.js';
import { TruynNetworkNode } from '../network/runtime.js';
import { TruynQuicTransport } from '../network/transport/quic.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

test('durable accepted-work inbox recovers pending work after process-state loss and replays completed results idempotently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-durable-inbox-'));
  const path = join(root, 'accepted-work.json');
  const identity = createIdentity();
  const envelope = createEnvelope({
    type: 'NEED',
    from: identity.nodeId,
    to: 'truyn:node:test-target',
    payload: { capability: { name: 'testnet.echo' }, input: { proof: 'survives-crash' } },
    id: 'durable-crash-proof-1',
    privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem
  });

  try {
    const beforeCrash = new DurableAcceptedWorkInbox({ filePath: path });
    await beforeCrash.accept(envelope, { peerNodeId: identity.nodeId, transport: 'quic' });
    assert.equal(beforeCrash.snapshot().pending, 1);
    assert.equal((await stat(path)).mode & 0o777, 0o600);

    const afterRestart = new DurableAcceptedWorkInbox({ filePath: path });
    await afterRestart.load();
    assert.equal(afterRestart.snapshot().pending, 1);
    let executions = 0;
    const recovered = await afterRestart.recover(async (message, context) => {
      executions += 1;
      assert.equal(message.id, envelope.id);
      assert.equal(context.recovered, true);
      return { ok: true, recovered: true };
    });
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].ok, true);
    assert.equal(executions, 1);
    assert.equal(afterRestart.snapshot().completed, 1);

    const result = await afterRestart.run(envelope, { peerNodeId: identity.nodeId, transport: 'quic' }, async () => {
      executions += 1;
      return { ok: false };
    });
    assert.deepEqual(result, { ok: true, recovered: true });
    assert.equal(executions, 1, 'completed duplicate must not execute the handler twice');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('network runtime persists a completed inbound envelope and returns the same result after restart without re-execution', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-durable-runtime-'));
  const tls = await generateTls(root);
  const serverIdentity = createIdentity();
  const clientIdentity = createIdentity();
  const workInboxPath = join(root, 'work-inbox.json');
  const statePath = join(root, 'network-state.json');
  let firstExecutions = 0;
  let secondExecutions = 0;
  let server = new TruynNetworkNode({
    identity: serverIdentity,
    host: '127.0.0.1',
    tls,
    statePath,
    workInboxPath
  });
  const client = new TruynQuicTransport({ identity: clientIdentity, host: '127.0.0.1', tls });
  server.onEnvelope(async () => {
    firstExecutions += 1;
    return { ok: true, execution: firstExecutions };
  });

  try {
    const firstRecord = await server.start();
    await client.start();
    let connection = await client.connect({ host: '127.0.0.1', port: Number(new URL(firstRecord.endpoints[0]).port) });
    const envelope = createEnvelope({
      type: 'NEED',
      from: clientIdentity.nodeId,
      to: serverIdentity.nodeId,
      payload: { capability: { name: 'testnet.echo' }, input: { idempotent: true } },
      id: 'runtime-durable-idempotency-1',
      privateKeyPem: clientIdentity.privateKeyPem,
      publicKeyPem: clientIdentity.publicKeyPem
    });
    const first = await client.sendEnvelope(connection, envelope);
    assert.deepEqual(first, { ok: true, execution: 1 });
    assert.equal(firstExecutions, 1);
    await server.close();

    server = new TruynNetworkNode({
      identity: serverIdentity,
      host: '127.0.0.1',
      tls,
      statePath,
      workInboxPath
    });
    server.onEnvelope(async () => {
      secondExecutions += 1;
      return { ok: false, execution: secondExecutions };
    });
    const secondRecord = await server.start();
    connection = await client.connect({ host: '127.0.0.1', port: Number(new URL(secondRecord.endpoints[0]).port) });
    const second = await client.sendEnvelope(connection, envelope);
    assert.deepEqual(second, { ok: true, execution: 1 });
    assert.equal(secondExecutions, 0, 'completed envelope must replay its durable result after restart');
    assert.equal(server.acceptedWorkSnapshot().completed, 1);
    assert.equal(server.acceptedWorkSnapshot().pending, 0);
  } finally {
    await Promise.allSettled([server.close(), client.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
