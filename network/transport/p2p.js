import { BoundedAdmissionQueue } from '../admission/bounded-queue.js';

function parseQuicEndpoint(value) {
  if (typeof value !== 'string' || !value.startsWith('quic://')) return null;
  try {
    const url = new URL(value);
    const port = Number(url.port);
    if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
  } catch { return null; }
}

function selectedQuicEndpoint(peerRecord) {
  for (const value of peerRecord?.endpoints || []) {
    const endpoint = parseQuicEndpoint(value);
    if (endpoint) return { value, endpoint };
  }
  return null;
}

function peerRecordBinding(peerRecord, endpointValue) {
  return `${Number.isInteger(peerRecord?.sequence) ? peerRecord.sequence : 'na'}:${endpointValue}`;
}

export class ExplicitBackpressureQueue extends BoundedAdmissionQueue {
  constructor({ maxInFlight = 64, maxQueued = 256 } = {}) {
    super({ maxInFlight, maxQueued, errorCode: 'TRUYN_BACKPRESSURE', errorMessage: 'p2p_backpressure' });
  }
}

export class DirectFirstP2P {
  constructor({ quicTransport, discovery, relayFallback = null, maxInFlight = 64, maxQueued = 256, faults = null } = {}) {
    if (!quicTransport) throw new Error('quicTransport is required');
    if (!discovery) throw new Error('peer discovery is required');
    this.quic = quicTransport;
    this.discovery = discovery;
    this.relayFallback = relayFallback;
    this.faults = faults;
    this.connections = new Map();
    this.queue = new ExplicitBackpressureQueue({ maxInFlight, maxQueued });
  }

  #watchConnection(peerNodeId, client) {
    const closed = () => {
      const current = this.connections.get(peerNodeId);
      if (current?.client === client) this.connections.delete(peerNodeId);
    };
    if (client?.closedP && typeof client.closedP.then === 'function') {
      void client.closedP.then(closed, closed);
    }
  }

  async #discardConnection(peerNodeId) {
    const existing = this.connections.get(peerNodeId);
    this.connections.delete(peerNodeId);
    if (!existing?.client || typeof this.quic.disconnect !== 'function') return;
    try { await this.quic.disconnect(existing.client); } catch { /* stale connection disposal is best-effort */ }
  }

  async #directClient(peerRecord) {
    const selected = selectedQuicEndpoint(peerRecord);
    if (!selected) throw new Error('peer_has_no_quic_endpoint');
    const binding = peerRecordBinding(peerRecord, selected.value);
    const existing = this.connections.get(peerRecord.nodeId);
    if (existing?.binding === binding) return existing.client;
    if (existing) await this.#discardConnection(peerRecord.nodeId);
    const client = await this.quic.connect(selected.endpoint);
    this.connections.set(peerRecord.nodeId, { client, binding });
    this.#watchConnection(peerRecord.nodeId, client);
    return client;
  }

  async send(peerNodeId, envelope, { allowRelayFallback = true } = {}) {
    return this.queue.run(async () => {
      let record = this.discovery.get(peerNodeId);
      if (!record) record = await this.discovery.findNode(peerNodeId);
      let directError = null;
      if (record) {
        try {
          this.faults?.assertPeer(peerNodeId, 'direct');
          const client = await this.#directClient(record);
          const result = await this.quic.sendEnvelope(client, envelope);
          return { transport: 'quic-direct', result };
        } catch (error) {
          directError = error;
          await this.#discardConnection(peerNodeId);
        }
      } else {
        directError = new Error('peer_not_discovered');
      }
      if (!allowRelayFallback || typeof this.relayFallback !== 'function') throw directError;
      try {
        await this.faults?.beforeRelay(peerNodeId);
      } catch (error) {
        error.directFailure = directError?.message || 'unknown';
        throw error;
      }
      const result = await this.relayFallback(peerNodeId, envelope);
      return { transport: 'relay-fallback', result, directFailure: directError?.message || 'unknown' };
    });
  }

  async forget(peerNodeId) { await this.#discardConnection(peerNodeId); }
  admissionSnapshot() { return this.queue.snapshot(); }
}

export { parseQuicEndpoint };
