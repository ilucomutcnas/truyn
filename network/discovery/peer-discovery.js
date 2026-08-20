import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../../core/identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../../core/protocol/index.js';
import { KademliaRoutingTable, dhtId, xorDistance } from '../dht/kademlia.js';

export const PEER_RECORD_PROTOCOL = 'truyn-peer-record-v1';

function assertIdentity(identity) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('peer identity is required');
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('peer identity mismatch');
}

export function createPeerRecord({ identity, endpoints, sequence = 1, ttlMs = 300_000, capabilities = [], nat = null, issuedAt = new Date().toISOString() } = {}) {
  assertIdentity(identity);
  const normalizedEndpoints = [...new Set((endpoints || []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].sort();
  if (normalizedEndpoints.length === 0) throw new Error('at least one peer endpoint is required');
  const body = {
    protocol: PEER_RECORD_PROTOCOL,
    nodeId: identity.nodeId,
    dhtId: dhtId(identity.nodeId),
    endpoints: normalizedEndpoints,
    capabilities: [...new Set(capabilities.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].sort(),
    nat,
    sequence,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + ttlMs).toISOString()
  };
  const recordId = `truyn:peer:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
  const signed = { recordId, ...body };
  return { ...signed, publicKey: identity.publicKeyPem, signature: signValue(signed, identity.privateKeyPem) };
}

export function verifyPeerRecord(record, { now = Date.now(), allowExpired = false } = {}) {
  try {
    if (!record?.recordId || record.protocol !== PEER_RECORD_PROTOCOL || !record.nodeId || !record.publicKey || !record.signature) return { ok: false, reason: 'peer_record_missing' };
    if (nodeIdFromPublicKey(record.publicKey) !== record.nodeId) return { ok: false, reason: 'peer_record_key_mismatch' };
    if (record.dhtId !== dhtId(record.nodeId)) return { ok: false, reason: 'peer_record_dht_id' };
    if (!Array.isArray(record.endpoints) || record.endpoints.length === 0) return { ok: false, reason: 'peer_record_endpoints' };
    const expires = Date.parse(record.expiresAt);
    if (!Number.isFinite(expires) || (!allowExpired && now >= expires)) return { ok: false, reason: 'peer_record_expired' };
    const { publicKey, signature, ...signed } = record;
    const { recordId, ...body } = signed;
    const expectedId = `truyn:peer:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
    if (expectedId !== recordId) return { ok: false, reason: 'peer_record_id' };
    if (!verifyValue(signed, signature, publicKey)) return { ok: false, reason: 'peer_record_signature' };
    return { ok: true, nodeId: record.nodeId };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export class PeerDiscovery {
  constructor({ identity, k = 20, alpha = 3, rpc = null, onChange = null, onRecordAccepted = null } = {}) {
    assertIdentity(identity);
    this.identity = identity;
    this.k = k;
    this.alpha = alpha;
    this.routing = new KademliaRoutingTable({ localNodeId: identity.nodeId, k });
    this.records = new Map();
    this.rpc = rpc;
    this.onChange = onChange;
    this.onRecordAccepted = typeof onRecordAccepted === 'function' ? onRecordAccepted : null;
  }

  ingest(record, options = {}) {
    const { notify = true, ...verifyOptions } = options;
    const verification = verifyPeerRecord(record, verifyOptions);
    if (!verification.ok) return { accepted: false, reason: verification.reason };
    const existing = this.records.get(record.nodeId);
    if (existing && existing.sequence > record.sequence) return { accepted: false, reason: 'peer_record_older_sequence' };
    if (existing && existing.sequence === record.sequence && existing.recordId !== record.recordId) return { accepted: false, reason: 'peer_record_equivocation' };
    const changed = !existing || existing.recordId !== record.recordId;
    this.records.set(record.nodeId, structuredClone(record));
    this.routing.upsert({ nodeId: record.nodeId, endpoints: record.endpoints, publicKey: record.publicKey, lastSeenAt: new Date().toISOString() });
    if (notify) {
      if (changed) this.onRecordAccepted?.({
        nodeId: record.nodeId,
        previous: existing ? structuredClone(existing) : null,
        record: structuredClone(record)
      });
      this.onChange?.();
    }
    return { accepted: true, nodeId: record.nodeId, updated: Boolean(existing && changed), unchanged: !changed };
  }

  get(nodeId, { now = Date.now() } = {}) {
    const record = this.records.get(nodeId);
    return record && verifyPeerRecord(record, { now }).ok ? structuredClone(record) : null;
  }

  bootstrap(records, options = {}) { return (records || []).map((record) => this.ingest(record, options)); }
  closest(targetNodeId, count = this.k) { return this.routing.closest(targetNodeId, count); }

  snapshot({ now = Date.now() } = {}) {
    return [...this.records.values()].filter((record) => verifyPeerRecord(record, { now }).ok).map((record) => structuredClone(record));
  }

  restore(records = [], options = {}) {
    let accepted = 0;
    for (const record of records) {
      if (this.ingest(record, { ...options, notify: false }).accepted) {
        accepted += 1;
        continue;
      }

      // Durable peer state can legitimately outlive the signed lease while a node is
      // offline. Preserve a previously valid signed record only as a non-authoritative
      // routing hint: get()/snapshot() still reject it as expired, but iterative lookup
      // may contact its old endpoint and accept only fresh signed records returned by a
      // live peer. Tampered/unsigned records never become hints because signature,
      // identity, endpoint and record-id validation still run with allowExpired=true.
      const stale = verifyPeerRecord(record, { allowExpired: true });
      if (!stale.ok || stale.reason) continue;
      const current = verifyPeerRecord(record);
      if (current.ok) continue;
      if (current.reason !== 'peer_record_expired') continue;
      this.routing.upsert({
        nodeId: record.nodeId,
        endpoints: record.endpoints,
        publicKey: record.publicKey,
        lastSeenAt: record.issuedAt || new Date(0).toISOString()
      });
    }
    return accepted;
  }

  sweep({ now = Date.now(), notify = true } = {}) {
    let removed = 0;
    for (const [nodeId, record] of this.records) {
      if (!verifyPeerRecord(record, { now }).ok) {
        this.records.delete(nodeId);
        this.routing.remove(nodeId);
        this.rpc?.forget?.(nodeId);
        removed += 1;
      }
    }
    if (removed && notify) this.onChange?.();
    return removed;
  }

  async findNode(targetNodeId, { maxRounds = 16 } = {}) {
    if (targetNodeId === this.identity.nodeId) return null;
    const local = this.get(targetNodeId);
    if (local) return local;
    if (typeof this.rpc?.findNode !== 'function') return null;

    const queried = new Set();
    let frontier = this.closest(targetNodeId, this.k);
    for (let round = 0; round < maxRounds && frontier.length; round += 1) {
      const batch = frontier.filter((peer) => !queried.has(peer.nodeId)).slice(0, this.alpha);
      if (batch.length === 0) break;
      for (const peer of batch) queried.add(peer.nodeId);
      const responses = await Promise.all(batch.map(async (peer) => {
        try { return await this.rpc.findNode(peer, targetNodeId); } catch { this.rpc?.forget?.(peer.nodeId); return null; }
      }));
      for (const response of responses) {
        for (const record of response?.records || []) this.ingest(record);
        const found = this.get(targetNodeId);
        if (found) return found;
      }
      frontier = this.closest(targetNodeId, this.k)
        .filter((peer) => !queried.has(peer.nodeId))
        .sort((a, b) => {
          const da = xorDistance(a.nodeId, targetNodeId);
          const db = xorDistance(b.nodeId, targetNodeId);
          return da < db ? -1 : da > db ? 1 : a.nodeId.localeCompare(b.nodeId);
        });
    }
    return null;
  }
}
