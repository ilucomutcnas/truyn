import { createLibp2p } from 'libp2p';
import { quic } from '@chainsafe/libp2p-quic';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { ping } from '@libp2p/ping';
import { multiaddr } from '@multiformats/multiaddr';

export const TRUYN_KAD_PROTOCOL = '/truyn/kad/1.0.0';

export async function createQuicKademliaNode({
  listen = ['/ip4/127.0.0.1/udp/0/quic-v1'],
  bootstrap = [],
  kBucketSize = 20,
  start = true
} = {}) {
  const node = await createLibp2p({
    start: false,
    addresses: { listen },
    transports: [quic()],
    services: {
      identify: identify(),
      ping: ping(),
      dht: kadDHT({
        protocol: TRUYN_KAD_PROTOCOL,
        clientMode: false,
        kBucketSize
      })
    }
  });

  if (start) await node.start();
  for (const address of bootstrap) {
    const target = typeof address === 'string' ? multiaddr(address) : address;
    await node.dial(target, { signal: AbortSignal.timeout(5_000) });
  }
  if (bootstrap.length > 0 && typeof node.services?.dht?.bootstrap === 'function') {
    try { await node.services.dht.bootstrap(); } catch {}
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
