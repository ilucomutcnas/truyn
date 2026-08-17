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
  pingEnabled = true,
  start = true
} = {}) {
  const addresses = { listen };
  if (Array.isArray(announce) && announce.length > 0) addresses.announce = announce;

  const services = {
    identify: identify(),
    dht: kadDHT({
      protocol: TRUYN_KAD_PROTOCOL,
      clientMode: false,
      kBucketSize,
      peerInfoMapper: passthroughMapper,
      allowQueryWithZeroPeers: true,
      // Routing-table eviction pings are maintenance traffic. Keep them bounded so
      // a scale test cannot starve application protocol streams on the same QUIC
      // connections while still retaining the Kad liveness signal.
      pingConcurrency: 2,
      pingTimeout: 2_000,
      maxInboundStreams: 64,
      maxOutboundStreams: 64
    })
  };
  if (pingEnabled) {
    services.ping = ping({
      timeout: 2_000,
      maxInboundStreams: 64,
      maxOutboundStreams: 64
    });
  }

  const node = await createLibp2p({
    start: false,
    addresses,
    transports: [quic()],
    ...(connectionGater ? { connectionGater } : {}),
    ...(connectionManager ? { connectionManager } : {}),
    services
  });

  // A transport disconnect is not evidence that a Kademlia peer should be erased.
  // At large sparse scale, QUIC connections naturally churn while the DHT must keep
  // learned routing state so later queries can redial peers by their stored addresses.
  // Explicit fault scenarios already purge peers when semantics require it (hard
  // partition isolation and stale pre-restart PeerIds), while normal liveness and
  // routing-table eviction remain owned by the Kademlia implementation itself.

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