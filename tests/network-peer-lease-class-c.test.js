import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { PeerDiscovery, createPeerRecord, verifyPeerRecord } from '../network/discovery/peer-discovery.js';
import { PeerRecordLeaseManager } from '../network/discovery/peer-record-lease.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls() {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-class-c-quic-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { dir, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Class C peer lease renews signed records and gossip converges across two hops while rejecting equivocation', async () => {
  const identities = [createIdentity(), createIdentity(), createIdentity()];
  let now = Date.now();
  const ttlMs = 6_000;
  const records = identities.map((identity, index) => createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${4600 + index}`],
    sequence: 1,
    ttlMs,
    issuedAt: new Date(now - 5_000).toISOString()
  }));
  const discoveries = identities.map((identity) => new PeerDiscovery({ identity }));
  discoveries[0].ingest(records[1], { now });
  discoveries[1].ingest(records[0], { now });
  discoveries[1].ingest(records[2], { now });
  discoveries[2].ingest(records[1], { now });

  const local = [...records];
  const rpcFor = () => ({
    async publishPeer(peer, record) {
      const index = identities.findIndex((identity) => identity.nodeId === peer.nodeId);
      if (index < 0) throw new Error('unknown peer');
      return discoveries[index].ingest(record, { now });
    }
  });
  const managers = identities.map((identity, index) => new PeerRecordLeaseManager({
    discovery: discoveries[index],
    rpc: rpcFor(),
    getLocalRecord: () => local[index],
    renewLocalRecord: () => {
      local[index] = createPeerRecord({
        identity,
        endpoints: local[index].endpoints,
        sequence: local[index].sequence + 1,
        ttlMs,
        issuedAt: new Date(now).toISOString()
      });
      return local[index];
    },
    ttlMs,
    renewBeforeMs: 2_000,
    gossipIntervalMs: 1_000,
    now: () => now,
    random: () => 0
  }));

  const aRun = await managers[0].runOnce();
  assert.equal(aRun.renewed, true);
  assert.equal(local[0].sequence, 2);
  assert.equal(verifyPeerRecord(local[0], { now }).ok, true);
  assert.equal(discoveries[1].get(identities[0].nodeId, { now }).sequence, 2);

  await managers[1].runOnce({ forceGossip: true });
  const atC = discoveries[2].get(identities[0].nodeId, { now });
  assert.equal(atC.sequence, 2);
  assert.equal(atC.recordId, local[0].recordId);

  const equivocation = createPeerRecord({
    identity: identities[0],
    endpoints: ['quic://127.0.0.1:9999'],
    sequence: 2,
    ttlMs,
    issuedAt: local[0].issuedAt
  });
  const rejected = discoveries[2].ingest(equivocation, { now });
  assert.deepEqual(rejected, { accepted: false, reason: 'peer_record_equivocation' });
});

test('Class C runtime autonomously renews a short peer lease and disseminates the new sequence over real QUIC', { timeout: 20_000 }, async () => {
  const tls = await generateTls();
  const a = new TruynNetworkNode({ host: '127.0.0.1', tls, peerRecordTtlMs: 3_000 });
  const b = new TruynNetworkNode({ host: '127.0.0.1', tls, peerRecordTtlMs: 3_000 });
  try {
    const [recordA, recordB] = await Promise.all([a.start(), b.start()]);
    a.bootstrap([recordB]);
    b.bootstrap([recordA]);
    const firstSequence = recordA.sequence;

    const deadline = Date.now() + 9_000;
    let observed = null;
    while (Date.now() < deadline) {
      const candidate = b.discovery.get(a.identity.nodeId);
      if (candidate && candidate.sequence > firstSequence) { observed = candidate; break; }
      await sleep(250);
    }

    assert.ok(a.localPeerRecord.sequence > firstSequence, 'local lease should renew before expiry');
    assert.ok(observed, 'renewed signed peer record should reach the remote peer');
    assert.equal(observed.sequence, a.localPeerRecord.sequence);
    assert.equal(verifyPeerRecord(observed).ok, true);
    assert.equal(a.peerLeaseSnapshot().running, true);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(tls.dir, { recursive: true, force: true });
  }
});
