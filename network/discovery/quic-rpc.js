import { verifyPeerRecord } from './peer-discovery.js';
import { verifyDhtRecord } from '../dht/kademlia.js';

export const QUIC_DHT_METHOD_PING = 'dht.ping';
export const QUIC_DISCOVERY_METHOD_FIND_NODE = 'dht.find-node';
export const QUIC_DHT_METHOD_STORE = 'dht.store';
export const QUIC_DHT_METHOD_FIND_VALUE = 'dht.find-value';

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

  async client(peer) {
    const existing = this.clients.get(peer.nodeId);
    if (existing) return existing;
    const endpoint = (peer.endpoints || []).map(parseEndpoint).find(Boolean);
    if (!endpoint) throw new Error('discovery_peer_has_no_quic_endpoint');
    const client = await this.quic.connect(endpoint);
    this.clients.set(peer.nodeId, client);
    return client;
  }

  async ping(peer) {
    const client = await this.client(peer);
    const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_PING, null);
    return Boolean(result?.pong);
  }

  async findNode(peer, targetNodeId) {
    const client = await this.client(peer);
    const result = await this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_FIND_NODE, { targetNodeId });
    const records = [];
    for (const record of result?.records || []) {
      if (verifyPeerRecord(record).ok) records.push(record);
    }
    return { records };
  }

  async store(peer, record) {
    const verification = verifyDhtRecord(record);
    if (!verification.ok) throw new Error(`invalid DHT record: ${verification.reason}`);
    const client = await this.client(peer);
    return this.quic.requestControl(client, QUIC_DHT_METHOD_STORE, { record });
  }

  async findValue(peer, namespace, key) {
    const client = await this.client(peer);
    const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_FIND_VALUE, { namespace, key });
    const records = [];
    for (const record of result?.records || []) {
      if (verifyDhtRecord(record).ok) records.push(record);
    }
    return { records };
  }

  forget(nodeId) { this.clients.delete(nodeId); }
}

export function createQuicDiscoveryControlHandler(discovery, { maxRecords = null, recordStore = null } = {}) {
  if (!discovery?.closest || !discovery?.get) throw new Error('peer discovery is required');
  const limit = Number.isInteger(maxRecords) && maxRecords > 0 ? maxRecords : discovery.k;
  return async (method, payload, context) => {
    if (method === QUIC_DHT_METHOD_PING) {
      return { pong: true, nodeId: discovery.identity.nodeId, requesterNodeId: context?.peerNodeId || null };
    }

    if (method === QUIC_DISCOVERY_METHOD_FIND_NODE) {
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
    }

    if (method === QUIC_DHT_METHOD_STORE) {
      if (!recordStore?.put) throw new Error('dht_record_store_unavailable');
      const record = payload?.record;
      const verification = verifyDhtRecord(record);
      if (!verification.ok) throw new Error(`invalid_dht_record:${verification.reason}`);
      const stored = recordStore.put(record);
      if (!stored.accepted) throw new Error(stored.reason || 'dht_store_rejected');
      return { stored: true, recordId: record.recordId };
    }

    if (method === QUIC_DHT_METHOD_FIND_VALUE) {
      if (!recordStore?.get) throw new Error('dht_record_store_unavailable');
      if (typeof payload?.namespace !== 'string' || !payload.namespace || typeof payload?.key !== 'string' || !payload.key) {
        throw new Error('dht namespace and key are required');
      }
      return { records: recordStore.get(payload.namespace, payload.key) };
    }

    throw new Error('unsupported_discovery_control_method');
  };
}
