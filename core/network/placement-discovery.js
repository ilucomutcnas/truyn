import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';
import {
  DISTRIBUTED_DISCOVERY_PROTOCOL,
  DISTRIBUTED_RETRIEVAL_VERSION,
  distributedRequestCapability
} from '../context/distributed-retrieval.js';

export const PLACEMENT_PROTOCOL = 'truyn-placement-v1';
export const PLACEMENT_VERSION = 1;
export const PLACEMENT_REVOCATION_PROTOCOL = 'truyn-placement-revoke-v1';

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
const hashHex = (value) => createHash('sha256').update(String(value)).digest('hex');

function requireIdentity(identity, label) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error(`${label} identity is required`);
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error(`${label} identity key mismatch`);
  return identity;
}

function normalizeRootCid(rootCid) {
  if (typeof rootCid !== 'string' || !rootCid.startsWith('truyn:ctx:')) throw new Error('placement root CID is required');
  return rootCid;
}

function normalizePartition(partitionIndex, partitionCount) {
  if (!Number.isInteger(partitionCount) || partitionCount < 1 || partitionCount > 4096) throw new Error('placement partition count must be 1..4096');
  if (!Number.isInteger(partitionIndex) || partitionIndex < 0 || partitionIndex >= partitionCount) throw new Error('placement partition index is invalid');
  return { partitionIndex, partitionCount };
}

function normalizeIso(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid`);
  return date.toISOString();
}

export function placementKey(rootCid, partitionIndex, holderNodeId) {
  return `${normalizeRootCid(rootCid)}|${partitionIndex}|${holderNodeId}`;
}

export function createPlacementRecord({
  identity,
  rootCid,
  partitionIndex,
  partitionCount,
  blockCount,
  sequence = 1,
  issuedAt = new Date().toISOString(),
  expiresAt = new Date(Date.now() + 5 * 60_000).toISOString(),
  failureDomainCommitment = null
} = {}) {
  const holder = requireIdentity(identity, 'placement holder');
  const root = normalizeRootCid(rootCid);
  normalizePartition(partitionIndex, partitionCount);
  if (!Number.isInteger(blockCount) || blockCount < 0) throw new Error('placement blockCount must be a non-negative integer');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('placement sequence must be >= 1');
  const issued = normalizeIso(issuedAt, 'placement issuedAt');
  const expires = normalizeIso(expiresAt, 'placement expiresAt');
  if (new Date(expires).getTime() <= new Date(issued).getTime()) throw new Error('placement expiresAt must be after issuedAt');
  const requestCapability = distributedRequestCapability(root, holder.nodeId, partitionIndex);
  const body = {
    protocol: PLACEMENT_PROTOCOL,
    version: PLACEMENT_VERSION,
    rootCid: root,
    holderNodeId: holder.nodeId,
    partitionIndex,
    partitionCount,
    blockCount,
    requestCapability,
    sequence,
    failureDomainCommitment: typeof failureDomainCommitment === 'string' && failureDomainCommitment.trim()
      ? failureDomainCommitment.trim()
      : null
  };
  const recordId = `truyn:placement:${digest(body).slice('sha256:'.length)}`;
  const signed = { recordId, body, issuedAt: issued, expiresAt: expires };
  return {
    ...signed,
    publicKey: holder.publicKeyPem,
    signature: signValue(signed, holder.privateKeyPem)
  };
}

export function verifyPlacementRecord(record, { now = Date.now(), allowExpired = false } = {}) {
  try {
    if (!record?.recordId || !record?.body || !record?.issuedAt || !record?.expiresAt || !record?.publicKey || !record?.signature) {
      return { ok: false, reason: 'placement_missing_required_field' };
    }
    const body = record.body;
    if (body.protocol !== PLACEMENT_PROTOCOL || body.version !== PLACEMENT_VERSION) return { ok: false, reason: 'placement_protocol_mismatch' };
    normalizeRootCid(body.rootCid);
    normalizePartition(body.partitionIndex, body.partitionCount);
    if (!Number.isInteger(body.blockCount) || body.blockCount < 0) return { ok: false, reason: 'placement_block_count_invalid' };
    if (!Number.isInteger(body.sequence) || body.sequence < 1) return { ok: false, reason: 'placement_sequence_invalid' };
    if (body.requestCapability !== distributedRequestCapability(body.rootCid, body.holderNodeId, body.partitionIndex)) {
      return { ok: false, reason: 'placement_request_capability_mismatch' };
    }
    if (nodeIdFromPublicKey(record.publicKey) !== body.holderNodeId) return { ok: false, reason: 'placement_holder_key_mismatch' };
    const expectedId = `truyn:placement:${digest(body).slice('sha256:'.length)}`;
    if (expectedId !== record.recordId) return { ok: false, reason: 'placement_content_id_mismatch' };
    const issued = new Date(record.issuedAt).getTime();
    const expires = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) return { ok: false, reason: 'placement_time_invalid' };
    if (!allowExpired && now >= expires) return { ok: false, reason: 'placement_expired' };
    const signed = { recordId: record.recordId, body: record.body, issuedAt: record.issuedAt, expiresAt: record.expiresAt };
    if (!verifyValue(signed, record.signature, record.publicKey)) return { ok: false, reason: 'placement_signature_invalid' };
    return { ok: true, recordId: record.recordId, expiresAtMs: expires };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function createPlacementRevocation({
  identity,
  record,
  sequence = null,
  reasonDigest = null,
  revokedAt = new Date().toISOString()
} = {}) {
  const holder = requireIdentity(identity, 'placement revoker');
  const verification = verifyPlacementRecord(record, { allowExpired: true });
  if (!verification.ok) throw new Error(`cannot revoke invalid placement: ${verification.reason}`);
  if (record.body.holderNodeId !== holder.nodeId) throw new Error('placement revocation must be signed by holder');
  const body = {
    protocol: PLACEMENT_REVOCATION_PROTOCOL,
    version: PLACEMENT_VERSION,
    recordId: record.recordId,
    rootCid: record.body.rootCid,
    holderNodeId: holder.nodeId,
    partitionIndex: record.body.partitionIndex,
    sequence: Number.isInteger(sequence) ? sequence : record.body.sequence,
    reasonDigest: typeof reasonDigest === 'string' && reasonDigest.trim() ? reasonDigest.trim() : null
  };
  const revocationId = `truyn:placement-revoke:${digest(body).slice('sha256:'.length)}`;
  const signed = { revocationId, body, revokedAt: normalizeIso(revokedAt, 'placement revokedAt') };
  return {
    ...signed,
    publicKey: holder.publicKeyPem,
    signature: signValue(signed, holder.privateKeyPem)
  };
}

export function verifyPlacementRevocation(revocation) {
  try {
    if (!revocation?.revocationId || !revocation?.body || !revocation?.revokedAt || !revocation?.publicKey || !revocation?.signature) {
      return { ok: false, reason: 'placement_revocation_missing_required_field' };
    }
    const body = revocation.body;
    if (body.protocol !== PLACEMENT_REVOCATION_PROTOCOL || body.version !== PLACEMENT_VERSION) return { ok: false, reason: 'placement_revocation_protocol_mismatch' };
    if (nodeIdFromPublicKey(revocation.publicKey) !== body.holderNodeId) return { ok: false, reason: 'placement_revocation_holder_key_mismatch' };
    const expectedId = `truyn:placement-revoke:${digest(body).slice('sha256:'.length)}`;
    if (expectedId !== revocation.revocationId) return { ok: false, reason: 'placement_revocation_content_id_mismatch' };
    const signed = { revocationId: revocation.revocationId, body, revokedAt: revocation.revokedAt };
    return verifyValue(signed, revocation.signature, revocation.publicKey)
      ? { ok: true, revocationId: revocation.revocationId }
      : { ok: false, reason: 'placement_revocation_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export class PlacementDirectoryPeer {
  constructor({ peerId } = {}) {
    if (typeof peerId !== 'string' || !peerId.trim()) throw new Error('placement directory peerId is required');
    this.peerId = peerId.trim();
    this.records = new Map();
    this.revocations = new Map();
  }

  ingestRecord(record, { now = Date.now() } = {}) {
    const verification = verifyPlacementRecord(record, { now });
    if (!verification.ok) return { accepted: false, reason: verification.reason };
    const key = placementKey(record.body.rootCid, record.body.partitionIndex, record.body.holderNodeId);
    const existing = this.records.get(key);
    if (existing && existing.body.sequence > record.body.sequence) return { accepted: false, reason: 'placement_older_sequence' };
    if (existing && existing.body.sequence === record.body.sequence && existing.recordId !== record.recordId) {
      return { accepted: false, reason: 'placement_equivocation_same_sequence' };
    }
    this.records.set(key, structuredClone(record));
    return { accepted: true, recordId: record.recordId };
  }

  ingestRevocation(revocation) {
    const verification = verifyPlacementRevocation(revocation);
    if (!verification.ok) return { accepted: false, reason: verification.reason };
    const key = placementKey(revocation.body.rootCid, revocation.body.partitionIndex, revocation.body.holderNodeId);
    const existing = this.revocations.get(key);
    if (!existing || existing.body.sequence <= revocation.body.sequence) this.revocations.set(key, structuredClone(revocation));
    return { accepted: true, revocationId: revocation.revocationId };
  }

  find(rootCid, { now = Date.now() } = {}) {
    normalizeRootCid(rootCid);
    const output = [];
    for (const [key, record] of this.records.entries()) {
      if (record.body.rootCid !== rootCid) continue;
      const verification = verifyPlacementRecord(record, { now });
      if (!verification.ok) continue;
      const revocation = this.revocations.get(key);
      if (revocation && revocation.body.sequence >= record.body.sequence) continue;
      output.push(structuredClone(record));
    }
    return output.sort((left, right) => left.body.partitionIndex - right.body.partitionIndex || left.body.holderNodeId.localeCompare(right.body.holderNodeId));
  }

  exportState() {
    return {
      records: [...this.records.values()].map((item) => structuredClone(item)),
      revocations: [...this.revocations.values()].map((item) => structuredClone(item))
    };
  }

  importState(state, { now = Date.now() } = {}) {
    let acceptedRecords = 0;
    let acceptedRevocations = 0;
    for (const record of state?.records || []) if (this.ingestRecord(record, { now }).accepted) acceptedRecords += 1;
    for (const revocation of state?.revocations || []) if (this.ingestRevocation(revocation).accepted) acceptedRevocations += 1;
    return { acceptedRecords, acceptedRevocations };
  }

  gossipWith(peer, { now = Date.now() } = {}) {
    if (!(peer instanceof PlacementDirectoryPeer)) throw new Error('placement gossip peer is invalid');
    const mine = this.exportState();
    const theirs = peer.exportState();
    const left = this.importState(theirs, { now });
    const right = peer.importState(mine, { now });
    return { left, right };
  }
}

export function placementResponsiblePeers(rootCid, peers, { replicationFactor = 3 } = {}) {
  normalizeRootCid(rootCid);
  if (!Array.isArray(peers) || peers.length === 0) throw new Error('placement peers are required');
  if (!Number.isInteger(replicationFactor) || replicationFactor < 1) throw new Error('placement replicationFactor must be >= 1');
  return [...peers]
    .sort((left, right) => {
      const l = hashHex(`${rootCid}|${left.peerId}`);
      const r = hashHex(`${rootCid}|${right.peerId}`);
      return r.localeCompare(l) || left.peerId.localeCompare(right.peerId);
    })
    .slice(0, Math.min(replicationFactor, peers.length));
}

export function publishPlacementDht(record, peers, { replicationFactor = 3, now = Date.now() } = {}) {
  const verification = verifyPlacementRecord(record, { now });
  if (!verification.ok) throw new Error(`invalid placement record: ${verification.reason}`);
  const responsible = placementResponsiblePeers(record.body.rootCid, peers, { replicationFactor });
  const results = responsible.map((peer) => ({ peerId: peer.peerId, ...peer.ingestRecord(record, { now }) }));
  return { responsiblePeerIds: responsible.map((peer) => peer.peerId), results };
}

export class FederatedPlacementResolver {
  constructor({ peers = [], minDirectoryAgreement = 1, trustResolver = null, replicationFactor = 3 } = {}) {
    if (!Array.isArray(peers) || peers.length === 0) throw new Error('federated placement resolver requires peers');
    if (!Number.isInteger(minDirectoryAgreement) || minDirectoryAgreement < 1) throw new Error('minDirectoryAgreement must be >= 1');
    this.peers = peers;
    this.minDirectoryAgreement = minDirectoryAgreement;
    this.trustResolver = typeof trustResolver === 'function' ? trustResolver : null;
    this.replicationFactor = replicationFactor;
  }

  async findRecords(rootCid, { now = Date.now() } = {}) {
    const responsible = placementResponsiblePeers(rootCid, this.peers, { replicationFactor: this.replicationFactor });
    const sightings = new Map();
    for (const peer of responsible) {
      const records = await peer.find(rootCid, { now });
      for (const record of records) {
        const verification = verifyPlacementRecord(record, { now });
        if (!verification.ok) continue;
        if (!sightings.has(record.recordId)) sightings.set(record.recordId, { record, peers: new Set() });
        sightings.get(record.recordId).peers.add(peer.peerId);
      }
    }
    return [...sightings.values()]
      .filter((entry) => entry.peers.size >= this.minDirectoryAgreement)
      .map((entry) => ({ record: structuredClone(entry.record), directoryAgreement: entry.peers.size, directoryPeerIds: [...entry.peers].sort() }));
  }

  async findOffers(rootCid, options = {}) {
    const records = await this.findRecords(rootCid, options);
    const offers = [];
    for (const entry of records) {
      const record = entry.record;
      const trust = this.trustResolver ? await this.trustResolver(record.body.holderNodeId) : null;
      offers.push({
        from: record.body.holderNodeId,
        publicKey: record.publicKey,
        trust: trust || null,
        payload: {
          metadata: {
            distributedContext: {
              protocol: DISTRIBUTED_DISCOVERY_PROTOCOL,
              version: DISTRIBUTED_RETRIEVAL_VERSION,
              role: 'context-partition-holder',
              rootCid: record.body.rootCid,
              holderNodeId: record.body.holderNodeId,
              partitionIndex: record.body.partitionIndex,
              partitionCount: record.body.partitionCount,
              requestCapability: record.body.requestCapability,
              blockCount: record.body.blockCount,
              placement: {
                recordId: record.recordId,
                issuedAt: record.issuedAt,
                expiresAt: record.expiresAt,
                directoryAgreement: entry.directoryAgreement,
                directoryPeerIds: entry.directoryPeerIds,
                failureDomainCommitment: record.body.failureDomainCommitment
              }
            }
          }
        }
      });
    }
    return offers;
  }
}
