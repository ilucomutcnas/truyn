import { verifyPeerRecord } from './peer-discovery.js';

export const QUIC_DISCOVERY_METHOD_FIND_NODE = 'dht.find-node';

function parseEndpoint(value) {
  if (typeof value !== 'string' || !value.startsWith('quic://')) return null;
  try {
    const url = new URL(value);
    const port = Number(url.port);
    return url.hostname && Number.isInteger(port) && port > 0 && port <= 65535
      ? { host: url.hostname.replace(/^\[|\]$/g, ''), port }
      : null;
  } catch { return null; }
}

export class QuicDiscoveryRpc {
  constructor({ quicTransport } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    this.quic = quicTransport;
    this.clients = new Map();
  }

  async #client(peer) {
    const existing = this.clients.get(peer.nodeId);
    if (existing) return existing;
    const endpoint = (peer.endpoints || []).map(parseEndpoint).find(Boolean);
    if (!endpoint) throw new Error('discovery_peer_has_no_quic_endpoint');
    const client = await this.quic.connect(endpoint);
    this.clients.set(peer.nodeId, client);
    return client;
  }

  async findNode(peer, targetNodeId) {
    const client = await this.#client(peer);
    const result = await this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_FIND_NODE, { targetNodeId });
    const records = [];
    for (const record of result?.records || []) {
      if (verifyPeerRecord(record).ok) records.push(record);
    }
    return { records };
  }

  forget(nodeId) { this.clients.delete(nodeId); }
}

export function createQuicDiscoveryControlHandler(discovery, { maxRecords = null } = {}) {
  if (!discovery?.closest || !discovery?.get) throw new Error('peer discovery is required');
  const limit = Number.isInteger(maxRecords) && maxRecords > 0 ? maxRecords : discovery.k;
  return async (method, payload) => {
    if (method !== QUIC_DISCOVERY_METHOD_FIND_NODE) throw new Error('unsupported_discovery_control_method');
    const targetNodeId = payload?.targetNodeId;
    if (typeof targetNodeId !== 'string' || !targetNodeId) throw new Error('targetNodeId is required');
    const direct = discovery.get(targetNodeId);
    if (direct) return { records: [direct] };
    const records = [];
    for (const peer of discovery.closest(targetNodeId, limit)) {
      const record = discovery.get(peer.nodeId);
      if (record) records.push(record);
    }
    return { records };
  };
}
