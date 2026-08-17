import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { TruynNetworkNode } from '../network/runtime.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1']);
  if (run.status !== 0) process.exit(20);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

const root = await mkdtemp(join(tmpdir(), 'truyn-ping-probe-'));
const cert = await tls(root);
const a = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls: cert, peerRecordTtlMs: 1_200, peerRecordRenewBeforeMs: 700, peerRecordPublishFanout: 0 });
const b = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls: cert, peerRecordTtlMs: 5_000, peerRecordAutoRenew: false });
let code = 0;
try {
  const [recordA, recordB] = await Promise.all([a.start(), b.start()]);
  a.bootstrap([recordB]);
  b.bootstrap([recordA]);

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && a.localPeerRecord.sequence <= recordA.sequence) await sleep(25);
  if (a.localPeerRecord.sequence <= recordA.sequence) code = 21;
  else if (b.discovery.get(a.identity.nodeId)?.sequence !== recordA.sequence) code = 22;
  else {
    const pong = await b.pingPeer(a.identity.nodeId);
    if (pong !== true) code = 23;
    else if ((b.discovery.get(a.identity.nodeId)?.sequence || 0) <= recordA.sequence) code = 24;
  }
} catch {
  code = 25;
} finally {
  await Promise.allSettled([a.close(), b.close()]);
  await rm(root, { recursive: true, force: true });
}
process.exit(code);
