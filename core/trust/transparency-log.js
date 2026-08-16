import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';

export const TRANSPARENCY_LOG_VERSION = 2;
export const TRANSPARENCY_ENTRY_PROTOCOL = 'truyn-transparency-entry-v2';
export const TRANSPARENCY_EVENT_TYPES = Object.freeze(['ROOT', 'DELEGATE', 'LIFECYCLE', 'REVOKE', 'ROTATE']);
const ZERO_HASH = 'sha256:' + '0'.repeat(64);
const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

export function transparencyLogId(sourceOwnerId) {
  if (typeof sourceOwnerId !== 'string' || !sourceOwnerId.trim()) throw new Error('sourceOwnerId is required');
  return `truyn:transparency:${digest({ sourceOwnerId: sourceOwnerId.trim() }).slice(7)}`;
}

function unsignedEntry(entry) {
  const { signature, publicKey, entryHash, ...unsigned } = entry;
  return unsigned;
}

export function verifyTransparencyEntry(entry, { expectedLogId = null, expectedSourceOwnerId = null } = {}) {
  try {
    if (!entry?.protocol || !entry?.logId || !entry?.sourceOwnerId || !entry?.sequence || !entry?.eventType || !entry?.signerNodeId || !entry?.publicKey || !entry?.signature || !entry?.entryHash) {
      return { ok: false, reason: 'transparency_entry_missing_field' };
    }
    if (entry.protocol !== TRANSPARENCY_ENTRY_PROTOCOL || entry.version !== TRANSPARENCY_LOG_VERSION) return { ok: false, reason: 'transparency_entry_protocol_mismatch' };
    if (!TRANSPARENCY_EVENT_TYPES.includes(entry.eventType)) return { ok: false, reason: 'transparency_entry_event_type_invalid' };
    if (expectedLogId && entry.logId !== expectedLogId) return { ok: false, reason: 'transparency_entry_log_mismatch' };
    if (expectedSourceOwnerId && entry.sourceOwnerId !== expectedSourceOwnerId) return { ok: false, reason: 'transparency_entry_owner_mismatch' };
    if (nodeIdFromPublicKey(entry.publicKey) !== entry.signerNodeId) return { ok: false, reason: 'transparency_entry_signer_key_mismatch' };
    const unsigned = unsignedEntry(entry);
    if (digest(unsigned) !== entry.entryHash) return { ok: false, reason: 'transparency_entry_hash_mismatch' };
    return verifyValue(unsigned, entry.signature, entry.publicKey) ? { ok: true, entryHash: entry.entryHash } : { ok: false, reason: 'transparency_entry_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export class DurableTransparencyLog {
  constructor({ directory, sourceOwnerId } = {}) {
    if (!directory) throw new Error('transparency log directory is required');
    if (!sourceOwnerId) throw new Error('transparency log sourceOwnerId is required');
    this.directory = directory;
    this.sourceOwnerId = sourceOwnerId;
    this.logId = transparencyLogId(sourceOwnerId);
    this.filePath = path.join(directory, `${this.logId.replaceAll(':', '_')}.jsonl`);
    this._entries = [];
    this._opened = false;
  }

  async open() {
    if (this._opened) return this;
    await mkdir(this.directory, { recursive: true });
    let content = '';
    try { content = await readFile(this.filePath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (content.trim()) {
      const parsed = content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      this._entries = [];
      await this.ingest(parsed, { persist: false });
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
      protocol: 'truyn-transparency-head-v2',
      version: TRANSPARENCY_LOG_VERSION,
      logId: this.logId,
      sourceOwnerId: this.sourceOwnerId,
      sequence: last?.sequence || 0,
      headHash: last?.entryHash || ZERO_HASH,
      revocationStateDigest: this.revocationState().stateDigest
    };
  }

  isRevoked(targetId) {
    return this._entries.some((entry) => entry.eventType === 'REVOKE' && entry.targetId === targetId);
  }

  revocationState(relevantTargetIds = []) {
    const revocations = this._entries
      .filter((entry) => entry.eventType === 'REVOKE')
      .map((entry) => ({ targetId: entry.targetId, entryHash: entry.entryHash, sequence: entry.sequence }))
      .sort((a, b) => a.targetId.localeCompare(b.targetId) || a.sequence - b.sequence);
    const head = this._entries.at(-1);
    const stateDigest = digest({ logId: this.logId, sequence: head?.sequence || 0, revocations });
    return {
      protocol: 'truyn-revocation-state-v2',
      version: TRANSPARENCY_LOG_VERSION,
      logId: this.logId,
      sourceOwnerId: this.sourceOwnerId,
      sequence: head?.sequence || 0,
      headHash: head?.entryHash || ZERO_HASH,
      stateDigest,
      relevant: [...new Set(relevantTargetIds)].sort().map((targetId) => {
        const matching = revocations.filter((entry) => entry.targetId === targetId).at(-1) || null;
        return { targetId, revoked: Boolean(matching), revocationEntryHash: matching?.entryHash || null, revocationSequence: matching?.sequence || null };
      })
    };
  }

  async append({ identity, eventType, targetId = null, payload = null, createdAt = new Date().toISOString() } = {}) {
    if (!this._opened) await this.open();
    if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem || nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('transparency entry signer identity is invalid');
    if (!TRANSPARENCY_EVENT_TYPES.includes(eventType)) throw new Error('transparency event type is invalid');
    if (eventType === 'REVOKE' && (!targetId || typeof targetId !== 'string')) throw new Error('revocation targetId is required');
    const previous = this._entries.at(-1);
    const unsigned = {
      protocol: TRANSPARENCY_ENTRY_PROTOCOL,
      version: TRANSPARENCY_LOG_VERSION,
      logId: this.logId,
      sourceOwnerId: this.sourceOwnerId,
      sequence: (previous?.sequence || 0) + 1,
      previousHash: previous?.entryHash || ZERO_HASH,
      eventType,
      targetId,
      payloadDigest: payload == null ? null : digest(payload),
      payload,
      signerNodeId: identity.nodeId,
      createdAt: new Date(createdAt).toISOString()
    };
    const entryHash = digest(unsigned);
    const entry = { ...unsigned, entryHash, publicKey: identity.publicKeyPem, signature: signValue(unsigned, identity.privateKeyPem) };
    await this.ingest([entry]);
    return structuredClone(entry);
  }

  async ingest(entries, { persist = true } = {}) {
    if (!Array.isArray(entries)) throw new Error('transparency entries must be an array');
    for (const entry of entries) {
      const check = verifyTransparencyEntry(entry, { expectedLogId: this.logId, expectedSourceOwnerId: this.sourceOwnerId });
      if (!check.ok) throw new Error(check.reason);
      const existing = this._entries[entry.sequence - 1];
      if (existing) {
        if (existing.entryHash !== entry.entryHash) {
          const error = new Error('transparency_fork_detected');
          error.code = 'transparency_fork_detected';
          error.sequence = entry.sequence;
          throw error;
        }
        continue;
      }
      const previous = this._entries.at(-1);
      const expectedSequence = (previous?.sequence || 0) + 1;
      const expectedPreviousHash = previous?.entryHash || ZERO_HASH;
      if (entry.sequence !== expectedSequence || entry.previousHash !== expectedPreviousHash) throw new Error('transparency_log_gap_or_chain_mismatch');
      this._entries.push(structuredClone(entry));
      if (persist) await this.#persist(entry);
    }
    return this.head();
  }

  async #persist(entry) {
    await mkdir(this.directory, { recursive: true });
    const handle = await open(this.filePath, 'a');
    try {
      await handle.write(`${JSON.stringify(entry)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
