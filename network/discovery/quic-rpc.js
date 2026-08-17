import { verifyPeerRecord } from './peer-discovery.js';
import { verifyDhtRecord } from '../dht/kademlia.js';

export const QUIC_DHT_METHOD_PING = 'dht.ping';
export const QUIC_DISCOVERY_METHOD_FIND_NODE = 'dht.find-node';
export const QUIC_DISCOVERY_METHOD_PUBLISH_PEER = 'dht.peer-publish';
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

function selectedEndpoint(peer) {
  for (const value of peer?.endpoints || []) {
    const endpoint = parseEndpoint(value);
    if (endpoint) return { value, endpoint };
  }
  return null;
}

function peerBinding(peer, endpointValue) {
  return `${Number.isInteger(peer?.sequence) ? peer.sequence : 'na'}:${endpointValue}`;
}

export class QuicDiscoveryRpc {
  constructor({ quicTransport, timeoutMs = 5_000, faults = null } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('DHT RPC timeoutMs must be between 100 and 120000');
    this.quic = quicTransport;
    this.timeoutMs = timeoutMs;
    this.faults = faults;
    this.clients = new Map();
  }

  async client(peer) {
    const selected = selectedEndpoint(peer);
    if (!selected) throw new Error('discovery_peer_has_no_quic_endpoint');
    const binding = peerBinding(peer, selected.value);
    const existing = this.clients.get(peer.nodeId);
    if (existing?.binding === binding) return existing.client;
    if (existing) this.forget(peer.nodeId);
    const client = await this.quic.connect(selected.endpoint);
    this.clients.set(peer.nodeId, { client, binding });
    return client;
  }

  async bounded(peer, operation) {
    let timer = null;
    try {
      this.faults?.assertPeer(peer.nodeId, 'dht-rpc');
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error(`TRUYN_DHT_RPC_TIMEOUT:${peer.nodeId}`);
            error.code = 'TRUYN_DHT_RPC_TIMEOUT';
            reject(error);
          }, this.timeoutMs);
          timer.unref?.();
        })
      ]);
    } catch (error) {
      this.forget(peer.nodeId);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async ping(peer) {
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_PING, null);
      return Boolean(result?.pong);
    });
  }

  async findNode(peer, targetNodeId) {
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      const result = await this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_FIND_NODE, { targetNodeId });
      const records = [];
      for (const record of result?.records || []) {
        if (verifyPeerRecord(record).ok) records.push(record);
      }
      return { records };
    });
  }

  async publishPeer(peer, record) {
    const verification = verifyPeerRecord(record);
    if (!verification.ok) throw new Error(`invalid peer record: ${verification.reason}`);
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      return this.quic.requestControl(client, QUIC_DISCOVERY_METHOD_PUBLISH_PEER, { record });
    });
  }

  async store(peer, record) {
    const verification = verifyDhtRecord(record);
    if (!verification.ok) throw new Error(`invalid DHT record: ${verification.reason}`);
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      return this.quic.requestControl(client, QUIC_DHT_METHOD_STORE, { record });
    });
  }

  async findValue(peer, namespace, key) {
    return this.bounded(peer, async () => {
      const client = await this.client(peer);
      const result = await this.quic.requestControl(client, QUIC_DHT_METHOD_FIND_VALUE, { namespace, key });
      const records = [];
      for (const record of result?.records || []) {
        if (verifyDhtRecord(record).ok) records.push(record);
      }
      return { records };
    });
  }

  forget(nodeId) {
    const existing = this.clients.get(nodeId);
    this.clients.delete(nodeId);
    const client = existing?.client || existing;
    if (!client) return;
    if (typeof this.quic.disconnect === 'function') {
      try {
        const disconnected = this.quic.disconnect(client);
        if (disconnected?.catch) void disconnected.catch(() => {});
      } catch {}
      return;
    }
    if (typeof client.destroy === 'function') {
      try {
        const destroyed = client.destroy({ force: true });
        if (destroyed?.catch) void destroyed.catch(() => {});
      } catch {}
    }
  }
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

    if (method === QUIC_DISCOVERY_METHOD_PUBLISH_PEER) {
      const record = payload?.record;
      const verification = verifyPeerRecord(record);
      if (!verification.ok) return { accepted: false, reason: verification.reason };
      return discovery.ingest(record);
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
