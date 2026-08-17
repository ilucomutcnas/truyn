import { verifyPeerRecord } from './peer-discovery.js';

function asPositiveInteger(value, fallback, label) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

export class PeerRecordLeaseManager {
  constructor({
    discovery,
    rpc,
    getLocalRecord,
    renewLocalRecord,
    ttlMs = 300_000,
    renewBeforeMs = null,
    gossipIntervalMs = null,
    fanout = 8,
    maxRecordsPerPeer = 64,
    now = () => Date.now(),
    random = Math.random
  } = {}) {
    if (!discovery?.snapshot || !discovery?.get) throw new Error('peer discovery is required');
    if (!rpc?.publishPeer) throw new Error('peer publish RPC is required');
    if (typeof getLocalRecord !== 'function' || typeof renewLocalRecord !== 'function') throw new Error('peer record lease callbacks are required');
    this.discovery = discovery;
    this.rpc = rpc;
    this.getLocalRecord = getLocalRecord;
    this.renewLocalRecord = renewLocalRecord;
    this.ttlMs = asPositiveInteger(ttlMs, 300_000, 'ttlMs');
    this.renewBeforeMs = asPositiveInteger(renewBeforeMs, Math.max(1_000, Math.floor(this.ttlMs / 3)), 'renewBeforeMs');
    if (this.renewBeforeMs >= this.ttlMs) throw new Error('renewBeforeMs must be below ttlMs');
    this.gossipIntervalMs = asPositiveInteger(gossipIntervalMs, Math.max(1_000, Math.floor(this.ttlMs / 4)), 'gossipIntervalMs');
    this.fanout = asPositiveInteger(fanout, 8, 'fanout');
    this.maxRecordsPerPeer = asPositiveInteger(maxRecordsPerPeer, 64, 'maxRecordsPerPeer');
    this.now = now;
    this.random = random;
    this.timer = null;
    this.running = false;
    this.inFlight = null;
    this.sent = new Map();
    this.lastRun = null;
  }

  snapshot() {
    return {
      running: this.running,
      ttlMs: this.ttlMs,
      renewBeforeMs: this.renewBeforeMs,
      gossipIntervalMs: this.gossipIntervalMs,
      fanout: this.fanout,
      sentBindings: this.sent.size,
      lastRun: this.lastRun ? structuredClone(this.lastRun) : null
    };
  }

  #shouldRenew(record) {
    if (!record || !verifyPeerRecord(record, { now: this.now(), allowExpired: true }).ok) return true;
    const expiresAt = Date.parse(record.expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt - this.now() <= this.renewBeforeMs;
  }

  #records() {
    const local = this.getLocalRecord();
    const records = [];
    if (local && verifyPeerRecord(local, { now: this.now() }).ok) records.push(local);
    for (const record of this.discovery.snapshot({ now: this.now() })) {
      if (record.nodeId !== local?.nodeId) records.push(record);
    }
    records.sort((a, b) => b.sequence - a.sequence || a.nodeId.localeCompare(b.nodeId));
    return records.slice(0, this.maxRecordsPerPeer);
  }

  #peers() {
    const localNodeId = this.getLocalRecord()?.nodeId;
    return this.discovery.snapshot({ now: this.now() })
      .filter((record) => record.nodeId !== localNodeId)
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId))
      .slice(0, this.fanout);
  }

  #pruneSent(validRecords) {
    const live = new Set(validRecords.map((record) => record.recordId));
    for (const [key, recordId] of this.sent) if (!live.has(recordId)) this.sent.delete(key);
  }

  async runOnce({ forceRenew = false, forceGossip = false } = {}) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      let local = this.getLocalRecord();
      let renewed = false;
      if (forceRenew || this.#shouldRenew(local)) {
        local = await this.renewLocalRecord();
        const verification = verifyPeerRecord(local, { now: this.now() });
        if (!verification.ok) throw new Error(`renewed peer record is invalid: ${verification.reason}`);
        renewed = true;
      }

      const records = this.#records();
      this.#pruneSent(records);
      const peers = this.#peers();
      let attempted = 0;
      let accepted = 0;
      let rejected = 0;
      const failures = [];

      for (const peer of peers) {
        for (const record of records) {
          if (record.nodeId === peer.nodeId) continue;
          const binding = `${peer.nodeId}:${record.recordId}`;
          if (!forceGossip && this.sent.get(binding) === record.recordId) continue;
          attempted += 1;
          try {
            const result = await this.rpc.publishPeer(peer, record);
            if (result?.accepted) {
              accepted += 1;
              this.sent.set(binding, record.recordId);
            } else {
              rejected += 1;
              failures.push({ peerNodeId: peer.nodeId, recordNodeId: record.nodeId, reason: result?.reason || 'peer_publish_rejected' });
            }
          } catch (error) {
            failures.push({ peerNodeId: peer.nodeId, recordNodeId: record.nodeId, reason: error?.code || error?.message || 'peer_publish_failed' });
          }
        }
      }

      this.lastRun = {
        at: new Date(this.now()).toISOString(),
        localSequence: local?.sequence || 0,
        renewed,
        peers: peers.length,
        records: records.length,
        attempted,
        accepted,
        rejected,
        failures: failures.slice(0, 32)
      };
      return structuredClone(this.lastRun);
    })();
    try { return await this.inFlight; }
    finally { this.inFlight = null; }
  }

  #schedule(delay = this.gossipIntervalMs) {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    const jitter = Math.floor(Math.max(1, delay) * 0.1 * this.random());
    this.timer = setTimeout(async () => {
      try { await this.runOnce(); } catch { /* surfaced through snapshot on the next successful run */ }
      this.#schedule();
    }, Math.max(1, delay + jitter));
    this.timer.unref?.();
  }

  start({ immediate = true } = {}) {
    if (this.running) return this;
    this.running = true;
    this.#schedule(immediate ? 1 : this.gossipIntervalMs);
    return this;
  }

  async announce() { return this.runOnce({ forceGossip: true }); }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
