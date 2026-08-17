function parseQuicEndpoint(value) {
  if (typeof value !== 'string' || !value.startsWith('quic://')) return null;
  try {
    const url = new URL(value);
    const port = Number(url.port);
    if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
  } catch { return null; }
}

export class ExplicitBackpressureQueue {
  constructor({ maxInFlight = 64, maxQueued = 256 } = {}) {
    this.maxInFlight = maxInFlight;
    this.maxQueued = maxQueued;
    this.inFlight = 0;
    this.queue = [];
  }

  async run(task) {
    if (this.inFlight >= this.maxInFlight) {
      if (this.queue.length >= this.maxQueued) {
        const error = new Error('p2p_backpressure');
        error.code = 'TRUYN_BACKPRESSURE';
        throw error;
      }
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.inFlight += 1;
    try { return await task(); }
    finally {
      this.inFlight -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
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

  async #directClient(peerRecord) {
    const existing = this.connections.get(peerRecord.nodeId);
    if (existing) return existing;
    const endpoint = peerRecord.endpoints.map(parseQuicEndpoint).find(Boolean);
    if (!endpoint) throw new Error('peer_has_no_quic_endpoint');
    const client = await this.quic.connect(endpoint);
    this.connections.set(peerRecord.nodeId, client);
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
          this.connections.delete(peerNodeId);
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

  forget(peerNodeId) { this.connections.delete(peerNodeId); }
}

export { parseQuicEndpoint };
