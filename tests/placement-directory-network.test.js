import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createIdentity } from '../core/identity/index.js';
import { buildContextDocument } from '../core/context/index.js';
import {
  FederatedPlacementResolver,
  PlacementDirectoryPeer,
  createPlacementRecord,
  createPlacementRevocation
} from '../core/network/placement-discovery.js';
import {
  HttpPlacementDirectoryClient,
  createPlacementDirectoryServer,
  publishPlacementAcrossDirectories,
  revokePlacementAcrossDirectories
} from '../node/placement-directory.js';

async function startDirectory(peerId, now) {
  const peer = new PlacementDirectoryPeer({ peerId });
  const server = createPlacementDirectoryServer({ peer, now: () => now });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const client = new HttpPlacementDirectoryClient({ peerId, baseUrl: `http://127.0.0.1:${address.port}` });
  return { peer, server, client };
}

test('federated placement discovery operates across independent HTTP directory nodes without relay lookup', async (t) => {
  const now = Date.now();
  const directories = [];
  for (let index = 0; index < 4; index += 1) directories.push(await startDirectory(`http-directory-${index}`, now));
  t.after(async () => {
    await Promise.all(directories.map(({ server }) => new Promise((resolve) => server.close(resolve))));
  });

  const document = buildContextDocument([{ id: 'only', text: 'Federated directory network transport proof.' }]);
  const holder = createIdentity();
  const record = createPlacementRecord({
    identity: holder,
    rootCid: document.cid,
    partitionIndex: 0,
    partitionCount: 1,
    blockCount: 1,
    sequence: 1,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    failureDomainCommitment: 'network-zone-a'
  });

  const publish = await publishPlacementAcrossDirectories(record, directories.map((item) => item.client), { replicationFactor: 3 });
  assert.equal(publish.accepted, 3);
  assert.equal(publish.failed, 0);

  const resolver = new FederatedPlacementResolver({
    peers: directories.map((item) => item.client),
    replicationFactor: 4,
    minDirectoryAgreement: 2,
    trustResolver: async () => ({ score: 0.88 })
  });
  const offers = await resolver.findOffers(document.cid, { now });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].from, holder.nodeId);
  assert.ok(offers[0].payload.metadata.distributedContext.placement.directoryAgreement >= 2);

  const revocation = createPlacementRevocation({ identity: holder, record, revokedAt: new Date(now + 1).toISOString() });
  const revoke = await revokePlacementAcrossDirectories(revocation, directories.map((item) => item.client), { replicationFactor: 3 });
  assert.equal(revoke.accepted, 3);

  const responsibleIds = new Set(revoke.responsiblePeerIds);
  const source = directories.find((item) => responsibleIds.has(item.client.peerId)).peer;
  for (const directory of directories) source.gossipWith(directory.peer, { now: now + 2 });
  assert.equal((await resolver.findOffers(document.cid, { now: now + 2 })).length, 0);
});
