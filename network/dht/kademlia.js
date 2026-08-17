import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../../core/identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../../core/protocol/index.js';

export const KADEMLIA_PROTOCOL = 'truyn-kademlia-v1';
export const KADEMLIA_ID_BITS = 256;

export const dhtId = (value) => createHash('sha256').update(String(value)).digest('hex');
const asBigInt = (hex) => BigInt(`0x${hex}`);
export const xorDistance = (left, right) => asBigInt(dhtId(left)) ^ asBigInt(dhtId(right));

function bucketIndex(localId, peerId) {
  const distance = xorDistance(localId, peerId);
  if (distance === 0n) return -1;
  return distance.toString(2).length - 1;
}

export class KademliaRoutingTable {
  constructor({ localNodeId, k = 20 } = {}) {
    if (!localNodeId) throw new Error('localNodeId is required');
    if (!Number.isInteger(k) || k < 1) throw new Error('k must be >= 1');
    this.localNodeId = localNodeId;
    this.k = k;
    this.buckets = Array.from({ length: KADEMLIA_ID_BITS }, () => []);
  }

  upsert(peer) {
    if (!peer?.nodeId || peer.nodeId === this.localNodeId) return false;
    const index = bucketIndex(this.localNodeId, peer.nodeId);
    if (index < 0) return false;
    const bucket = this.buckets[index];
    const existing = bucket.findIndex((item) => item.nodeId === peer.nodeId);
    if (existing >= 0) bucket.splice(existing, 1);
    bucket.push({ ...peer, lastSeenAt: peer.lastSeenAt || new Date().toISOString() });
    if (bucket.length > this.k) bucket.shift();
    return true;
  }

  remove(nodeId) {
    const index = bucketIndex(this.localNodeId, nodeId);
    if (index < 0) return false;
    const before = this.buckets[index].length;
    this.buckets[index] = this.buckets[index].filter((item) => item.nodeId !== nodeId);
    return this.buckets[index].length !== before;
  }

  closest(target, count = this.k) {
    return this.buckets.flat()
      .sort((a, b) => {
        const da = xorDistance(a.nodeId, target);
        const db = xorDistance(b.nodeId, target);
        return da < db ? -1 : da > db ? 1 : a.nodeId.localeCompare(b.nodeId);
      })
      .slice(0, Math.max(0, count))
      .map((peer) => ({ ...peer }));
  }

  size() { return this.buckets.reduce((sum, bucket) => sum + bucket.length, 0); }
}

function assertIdentity(identity) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('DHT publisher identity is required');
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('DHT publisher identity mismatch');
}

export function createDhtRecord({ identity, namespace, key, value, sequence = 1, ttlMs = 300_000, issuedAt = new Date().toISOString() } = {}) {
  assertIdentity(identity);
  if (!namespace || !key) throw new Error('DHT namespace and key are required');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('DHT sequence must be >= 1');
  if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new Error('DHT ttlMs must be >= 1');
  const expiresAt = new Date(Date.parse(issuedAt) + ttlMs).toISOString();
  const body = {
    protocol: KADEMLIA_PROTOCOL,
    namespace,
    key,
    keyHash: dhtId(`${namespace}:${key}`),
    value,
    valueDigest: `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`,
    publisherNodeId: identity.nodeId,
    sequence,
    issuedAt,
    expiresAt
  };
  const recordId = `truyn:dht:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
  const signed = { recordId, ...body };
  return { ...signed, publicKey: identity.publicKeyPem, signature: signValue(signed, identity.privateKeyPem) };
}

export function verifyDhtRecord(record, { now = Date.now(), allowExpired = false } = {}) {
  try {
    if (!record?.recordId || record.protocol !== KADEMLIA_PROTOCOL || !record.publicKey || !record.signature) return { ok: false, reason: 'dht_record_missing' };
    if (nodeIdFromPublicKey(record.publicKey) !== record.publisherNodeId) return { ok: false, reason: 'dht_publisher_key_mismatch' };
    if (record.keyHash !== dhtId(`${record.namespace}:${record.key}`)) return { ok: false, reason: 'dht_key_hash_mismatch' };
    const valueDigest = `sha256:${createHash('sha256').update(canonicalize(record.value)).digest('hex')}`;
    if (valueDigest !== record.valueDigest) return { ok: false, reason: 'dht_value_digest_mismatch' };
    const { publicKey, signature, ...signed } = record;
    const { recordId, ...body } = signed;
    const expectedId = `truyn:dht:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
    if (record.recordId !== expectedId) return { ok: false, reason: 'dht_record_id_mismatch' };
    if (!verifyValue(signed, signature, publicKey)) return { ok: false, reason: 'dht_record_signature' };
    const issued = Date.parse(record.issuedAt);
    const expires = Date.parse(record.expiresAt);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) return { ok: false, reason: 'dht_record_time' };
    if (!allowExpired && now >= expires) return { ok: false, reason: 'dht_record_expired' };
    return { ok: true, recordId: record.recordId };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export class KademliaRecordStore {
  constructor() { this.records = new Map(); }

  put(record, options = {}) {
    const verification = verifyDhtRecord(record, options);
    if (!verification.ok) return { accepted: false, reason: verification.reason };
    const key = `${record.namespace}:${record.key}:${record.publisherNodeId}`;
    const existing = this.records.get(key);
    if (existing && existing.sequence > record.sequence) return { accepted: false, reason: 'dht_older_sequence' };
    if (existing && existing.sequence === record.sequence && existing.recordId !== record.recordId) return { accepted: false, reason: 'dht_equivocation' };
    this.records.set(key, structuredClone(record));
    return { accepted: true, recordId: record.recordId };
  }

  get(namespace, key, { now = Date.now() } = {}) {
    return [...this.records.values()]
      .filter((record) => record.namespace === namespace && record.key === key && verifyDhtRecord(record, { now }).ok)
      .sort((a, b) => b.sequence - a.sequence || a.publisherNodeId.localeCompare(b.publisherNodeId))
      .map((record) => structuredClone(record));
  }

  sweep({ now = Date.now() } = {}) {
    let removed = 0;
    for (const [key, record] of this.records) {
      if (!verifyDhtRecord(record, { now }).ok) { this.records.delete(key); removed += 1; }
    }
    return removed;
  }
}
