import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';

export const VERIFICATION_EVENT_LOG_VERSION = 1;
export const VERIFICATION_EVENT_PROTOCOL = 'truyn-verification-event-v1';
export const VERIFICATION_EVENT_TYPES = Object.freeze([
  'CLAIM_ACCEPTED',
  'CHALLENGE_CREATED',
  'VERIFIER_SELECTED',
  'ATTEST_ACCEPTED',
  'ATTEST_REJECTED',
  'VERIFY_ACCEPTED',
  'DISPUTE_OBSERVED',
  'VERIFICATION_COMPLETED'
]);

const ZERO_HASH = `sha256:${'0'.repeat(64)}`;
const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

function requireText(value, label, max = 4096) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  const normalized = value.normalize('NFKC').trim();
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

function normalizeRefs(refs) {
  if (!Array.isArray(refs)) return [];
  if (refs.length > 128) throw new Error('verification evidenceRefs exceed limit');
  return [...new Set(refs.map((value) => requireText(value, 'verification evidence reference', 1024)))].sort();
}

function normalizeData(data) {
  if (data == null) return null;
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('verification event data must be an object');
  const serialized = canonicalize(data);
  if (Buffer.byteLength(serialized) > 64 * 1024) throw new Error('verification event data exceeds limit');
  return JSON.parse(serialized);
}

function unsignedEvent(event) {
  const { eventHash, publicKey, signature, ...unsigned } = event;
  return unsigned;
}

export function verificationWorkflowId({ claimId, coordinatorNodeId, startedAt }) {
  return `truyn:verification:${digest({
    claimId: requireText(claimId, 'claimId', 1024),
    coordinatorNodeId: requireText(coordinatorNodeId, 'coordinatorNodeId', 1024),
    startedAt: new Date(startedAt).toISOString()
  }).slice('sha256:'.length)}`;
}

export function createVerificationEvent({
  identity,
  workflowId,
  claimId,
  sequence,
  previousHash = ZERO_HASH,
  eventType,
  subjectId = null,
  evidenceRefs = [],
  data = null,
  createdAt = new Date().toISOString()
} = {}) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem || nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) {
    throw new Error('verification event signer identity is invalid');
  }
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('verification event sequence must be positive');
  if (!VERIFICATION_EVENT_TYPES.includes(eventType)) throw new Error('verification event type is invalid');
  const unsigned = {
    protocol: VERIFICATION_EVENT_PROTOCOL,
    version: VERIFICATION_EVENT_LOG_VERSION,
    workflowId: requireText(workflowId, 'workflowId', 1024),
    claimId: requireText(claimId, 'claimId', 1024),
    sequence,
    previousHash: requireText(previousHash, 'previousHash', 256),
    eventType,
    subjectId: subjectId == null ? null : requireText(subjectId, 'subjectId', 2048),
    evidenceRefs: normalizeRefs(evidenceRefs),
    data: normalizeData(data),
    signerNodeId: identity.nodeId,
    createdAt: new Date(createdAt).toISOString()
  };
  const eventHash = digest(unsigned);
  return {
    ...unsigned,
    eventHash,
    publicKey: identity.publicKeyPem,
    signature: signValue(unsigned, identity.privateKeyPem)
  };
}

export function verifyVerificationEvent(event, { expectedWorkflowId = null, expectedClaimId = null } = {}) {
  try {
    if (!event?.protocol || !event?.workflowId || !event?.claimId || !event?.sequence || !event?.previousHash || !event?.eventType || !event?.signerNodeId || !event?.createdAt || !event?.eventHash || !event?.publicKey || !event?.signature) {
      return { ok: false, reason: 'verification_event_missing_field' };
    }
    if (event.protocol !== VERIFICATION_EVENT_PROTOCOL || event.version !== VERIFICATION_EVENT_LOG_VERSION) return { ok: false, reason: 'verification_event_protocol_mismatch' };
    if (!VERIFICATION_EVENT_TYPES.includes(event.eventType)) return { ok: false, reason: 'verification_event_type_invalid' };
    if (expectedWorkflowId && event.workflowId !== expectedWorkflowId) return { ok: false, reason: 'verification_event_workflow_mismatch' };
    if (expectedClaimId && event.claimId !== expectedClaimId) return { ok: false, reason: 'verification_event_claim_mismatch' };
    if (nodeIdFromPublicKey(event.publicKey) !== event.signerNodeId) return { ok: false, reason: 'verification_event_signer_key_mismatch' };
    const normalized = {
      protocol: VERIFICATION_EVENT_PROTOCOL,
      version: VERIFICATION_EVENT_LOG_VERSION,
      workflowId: requireText(event.workflowId, 'workflowId', 1024),
      claimId: requireText(event.claimId, 'claimId', 1024),
      sequence: event.sequence,
      previousHash: requireText(event.previousHash, 'previousHash', 256),
      eventType: event.eventType,
      subjectId: event.subjectId == null ? null : requireText(event.subjectId, 'subjectId', 2048),
      evidenceRefs: normalizeRefs(event.evidenceRefs),
      data: normalizeData(event.data),
      signerNodeId: event.signerNodeId,
      createdAt: new Date(event.createdAt).toISOString()
    };
    if (canonicalize(normalized) !== canonicalize(unsignedEvent(event))) return { ok: false, reason: 'verification_event_not_canonical' };
    if (digest(normalized) !== event.eventHash) return { ok: false, reason: 'verification_event_hash_mismatch' };
    return verifyValue(normalized, event.signature, event.publicKey)
      ? { ok: true, eventHash: event.eventHash, sequence: event.sequence }
      : { ok: false, reason: 'verification_event_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export class DurableVerificationEventLog {
  constructor({ directory, workflowId, claimId } = {}) {
    if (!directory) throw new Error('verification event log directory is required');
    this.directory = directory;
    this.workflowId = requireText(workflowId, 'workflowId', 1024);
    this.claimId = requireText(claimId, 'claimId', 1024);
    this.filePath = path.join(directory, `${digest({ workflowId: this.workflowId }).slice('sha256:'.length)}.jsonl`);
    this._entries = [];
    this._opened = false;
  }

  async open() {
    if (this._opened) return this;
    await mkdir(this.directory, { recursive: true });
    let content = '';
    try { content = await readFile(this.filePath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (content.trim()) {
      const entries = content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      await this.ingest(entries, { persist: false });
    }
    this._opened = true;
    return this;
  }

  entries({ fromSequence = 1 } = {}) {
    return this._entries.filter((entry) => entry.sequence >= fromSequence).map((entry) => structuredClone(entry));
  }

  head() {
    const last = this._entries.at(-1);
    return {
      protocol: 'truyn-verification-log-head-v1',
      version: VERIFICATION_EVENT_LOG_VERSION,
      workflowId: this.workflowId,
      claimId: this.claimId,
      sequence: last?.sequence || 0,
      headHash: last?.eventHash || ZERO_HASH
    };
  }

  async append({ identity, eventType, subjectId = null, evidenceRefs = [], data = null, createdAt = new Date().toISOString() } = {}) {
    if (!this._opened) await this.open();
    const previous = this._entries.at(-1);
    const event = createVerificationEvent({
      identity,
      workflowId: this.workflowId,
      claimId: this.claimId,
      sequence: (previous?.sequence || 0) + 1,
      previousHash: previous?.eventHash || ZERO_HASH,
      eventType,
      subjectId,
      evidenceRefs,
      data,
      createdAt
    });
    await this.ingest([event]);
    return structuredClone(event);
  }

  async ingest(entries, { persist = true } = {}) {
    if (!Array.isArray(entries)) throw new Error('verification events must be an array');
    for (const event of entries) {
      const check = verifyVerificationEvent(event, { expectedWorkflowId: this.workflowId, expectedClaimId: this.claimId });
      if (!check.ok) throw new Error(check.reason);
      const existing = this._entries[event.sequence - 1];
      if (existing) {
        if (existing.eventHash !== event.eventHash) {
          const error = new Error('verification_event_fork_detected');
          error.code = 'verification_event_fork_detected';
          error.sequence = event.sequence;
          throw error;
        }
        continue;
      }
      const previous = this._entries.at(-1);
      if (event.sequence !== (previous?.sequence || 0) + 1 || event.previousHash !== (previous?.eventHash || ZERO_HASH)) {
        throw new Error('verification_event_gap_or_chain_mismatch');
      }
      this._entries.push(structuredClone(event));
      if (persist) await this.#persist(event);
    }
    return this.head();
  }

  async #persist(event) {
    await mkdir(this.directory, { recursive: true });
    const handle = await open(this.filePath, 'a');
    try {
      await handle.write(`${JSON.stringify(event)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
