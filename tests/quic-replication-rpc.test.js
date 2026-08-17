import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createSourceOwnerCertificate } from '../core/trust/source-owner-pki.js';
import { DurableTransparencyLog } from '../core/trust/transparency-log.js';
import { createQuicKademliaNode, firstQuicAddress } from '../network/transport/quic-kademlia.js';
import { ReplicatedTransparencyService } from '../network/replication/transparency-replication.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventually(operation, { timeoutMs = 15_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  throw lastError || new Error('eventually_timeout');
}

test('focused QUIC/Kad transparency RPC discovers remote replica before direct signed-log sync', { timeout: 45_000 }, async (t) => {
  const dirA = await mkdtemp(path.join(os.tmpdir(), 'truyn-quic-rpc-a-'));
  const dirB = await mkdtemp(path.join(os.tmpdir(), 'truyn-quic-rpc-b-'));
  let a;
  let b;
  t.after(async () => {
    await Promise.allSettled([a?.stop(), b?.stop()]);
    await Promise.allSettled([rm(dirA, { recursive: true, force: true }), rm(dirB, { recursive: true, force: true })]);
  });

  a = await createQuicKademliaNode();
  b = await createQuicKademliaNode({ bootstrap: [firstQuicAddress(a)] });
  const owner = createIdentity();
  const root = createSourceOwnerCertificate({ identity: owner });
  const logA = await new DurableTransparencyLog({ directory: dirA, sourceOwnerId: root.body.sourceOwnerId }).open();
  const logB = await new DurableTransparencyLog({ directory: dirB, sourceOwnerId: root.body.sourceOwnerId }).open();
  await logA.append({ identity: owner, eventType: 'ROOT', targetId: root.certificateId, payload: { certificateId: root.certificateId } });

  const serviceA = new ReplicatedTransparencyService({ node: a, log: logA, routingTimeoutMs: 5_000 });
  const serviceB = new ReplicatedTransparencyService({ node: b, log: logB, routingTimeoutMs: 5_000 });
  await serviceA.start();
  await serviceB.start();

  const providers = await eventually(async () => {
    const peers = await serviceA.discoverReplicaPeers({ timeoutMs: 3_000 });
    return peers.length > 0 ? peers : null;
  });
  console.log(`# TRUYN_QUIC_RPC ${JSON.stringify({ stage: 'providers', count: providers.length })}`);
  assert.ok(providers.some((peerId) => peerId.toString() === b.peerId.toString()), 'Kademlia must return the remote replica provider');

  let sync;
  try {
    sync = await serviceA.syncWithPeer(b.peerId, { timeoutMs: 5_000 });
  } catch (error) {
    throw new Error(`direct_transparency_rpc_failed:${error.code || error.name}:${error.message}`, { cause: error });
  }
  console.log(`# TRUYN_QUIC_RPC ${JSON.stringify({ stage: 'sync', direction: sync.direction, sequence: sync.head.sequence })}`);
  assert.equal(sync.direction, 'push');
  assert.deepEqual(logB.head(), logA.head());
});
