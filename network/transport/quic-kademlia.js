import { createLibp2p } from 'libp2p';
import { quic } from '@chainsafe/libp2p-quic';
import { identify } from '@libp2p/identify';
import { kadDHT, passthroughMapper } from '@libp2p/kad-dht';
import { ping } from '@libp2p/ping';
import { multiaddr } from '@multiformats/multiaddr';

export const TRUYN_KAD_PROTOCOL = '/truyn/kad/1.0.0';

export async function createQuicKademliaNode({
  listen = ['/ip4/127.0.0.1/udp/0/quic-v1'],
  announce = [],
  bootstrap = [],
  kBucketSize = 20,
  connectionGater = undefined,
  connectionManager = undefined,
  start = true
} = {}) {
  const addresses = { listen };
  if (Array.isArray(announce) && announce.length > 0) addresses.announce = announce;

  const node = await createLibp2p({
    start: false,
    addresses,
    transports: [quic()],
    ...(connectionGater ? { connectionGater } : {}),
    ...(connectionManager ? { connectionManager } : {}),
    services: {
      identify: identify(),
      ping: ping(),
      dht: kadDHT({
        protocol: TRUYN_KAD_PROTOCOL,
        clientMode: false,
        kBucketSize,
        peerInfoMapper: passthroughMapper,
        allowQueryWithZeroPeers: true
      })
    }
  });

  node.addEventListener('peer:disconnect', (event) => {
    const peerId = event.detail;
    if (!peerId || node.status !== 'started') return;
    void node.services.dht.routingTable.remove(peerId, { signal: AbortSignal.timeout(5_000) }).catch(() => {});
  });

  if (start) await node.start();
  for (const address of bootstrap) {
    const target = typeof address === 'string' ? multiaddr(address) : address;
    await node.dial(target, { signal: AbortSignal.timeout(5_000) });
  }
  return node;
}

export function quicAddresses(node) {
  return node.getMultiaddrs().map((address) => address.toString());
}

export function firstQuicAddress(node) {
  const peer = node.peerId.toString();
  const address = quicAddresses(node).find((value) => value.includes('/quic-v1'));
  if (!address) throw new Error('truyn_quic_listen_address_missing');
  return address.includes('/p2p/') ? address : `${address}/p2p/${peer}`;
}

export async function connectQuicPeers(node, peers) {
  const connected = [];
  for (const peer of peers) {
    const address = typeof peer === 'string' ? multiaddr(peer) : peer;
    const connection = await node.dial(address, { signal: AbortSignal.timeout(5_000) });
    connected.push(connection.remotePeer.toString());
  }
  return connected;
}

export async function refreshKademliaRoutingTable(node, { timeoutMs = 10_000, externalAbort = true } = {}) {
  if (!node?.services?.dht?.refreshRoutingTable) throw new Error('truyn_kademlia_refresh_unavailable');
  const options = externalAbort ? { signal: AbortSignal.timeout(timeoutMs) } : {};
  await node.services.dht.refreshRoutingTable(options);
  return {
    mode: node.services.dht.getMode?.() || null,
    routingTableSize: node.services.dht.routingTable?.size ?? null,
    connectedPeers: node.getPeers().length
  };
}