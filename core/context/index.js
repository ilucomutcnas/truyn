import { createHash } from 'node:crypto';
import { canonicalize } from '../protocol/index.js';

const hashHex = (value) => createHash('sha256').update(value).digest('hex');
const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value));

export function contextBlockCid(id, text) {
  if (typeof id !== 'string' || !id.length) throw new Error('context block id is required');
  if (typeof text !== 'string') throw new Error(`context block ${id} text must be a string`);
  return `truyn:ctxb:${hashHex(canonicalize([id, text]))}`;
}

export function normalizeContextBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('context blocks must be a non-empty array');
  const seen = new Set();
  const normalized = blocks.map((block) => {
    if (!block || typeof block.id !== 'string' || !block.id.length) throw new Error('context block id is required');
    if (seen.has(block.id)) throw new Error(`duplicate context block id: ${block.id}`);
    if (typeof block.text !== 'string') throw new Error(`context block ${block.id} text must be a string`);
    seen.add(block.id);
    return { id: block.id, text: block.text };
  });
  normalized.sort((a, b) => a.id.localeCompare(b.id));
  return normalized;
}

export function contextCidFromManifest(blockRefs) {
  if (!Array.isArray(blockRefs) || blockRefs.length === 0) throw new Error('context manifest blocks are required');
  const normalizedRefs = blockRefs.map((block) => {
    if (!block || typeof block.id !== 'string' || typeof block.cid !== 'string') throw new Error('invalid context manifest block');
    return { id: block.id, cid: block.cid };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return `truyn:ctx:${hashHex(canonicalize({ v: 1, blocks: normalizedRefs }))}`;
}

export function buildContextDocument(blocks) {
  const normalizedBlocks = normalizeContextBlocks(blocks).map((block) => ({
    ...block,
    cid: contextBlockCid(block.id, block.text),
    bytes: Buffer.byteLength(block.text)
  }));
  const manifestBlocks = normalizedBlocks.map(({ id, cid, bytes }) => ({ id, cid, bytes }));
  const cid = contextCidFromManifest(manifestBlocks);
  return {
    cid,
    blocks: normalizedBlocks,
    manifest: { version: 1, cid, blocks: manifestBlocks },
    contentBytes: normalizedBlocks.reduce((sum, block) => sum + block.bytes, 0),
    serializedBytes: jsonBytes(normalizedBlocks.map(({ id, text }) => ({ id, text })))
  };
}

export function applyContextDelta(blocks, ops) {
  const map = new Map(normalizeContextBlocks(blocks).map((block) => [block.id, { id: block.id, text: block.text }]));
  if (!Array.isArray(ops) || ops.length === 0) throw new Error('context delta ops must be a non-empty array');
  for (const op of ops) {
    if (!op || typeof op.op !== 'string' || typeof op.id !== 'string' || !op.id.length) throw new Error('invalid context delta op');
    if (op.op === 'delete') {
      if (!map.has(op.id)) throw new Error(`context block not found: ${op.id}`);
      map.delete(op.id);
      continue;
    }
    if (op.op !== 'replace' && op.op !== 'upsert') throw new Error(`unsupported context delta op: ${op.op}`);
    if (typeof op.text !== 'string') throw new Error(`context delta ${op.op} requires text`);
    if (op.op === 'replace' && !map.has(op.id)) throw new Error(`context block not found: ${op.id}`);
    map.set(op.id, { id: op.id, text: op.text });
  }
  return normalizeContextBlocks([...map.values()]);
}

export function verifyContextManifest(manifest, expectedCid = manifest?.cid) {
  try {
    if (!manifest || manifest.version !== 1 || !expectedCid) return { ok: false, reason: 'invalid_context_manifest' };
    const cid = contextCidFromManifest(manifest.blocks);
    return cid === expectedCid && manifest.cid === expectedCid
      ? { ok: true, cid }
      : { ok: false, reason: 'context_manifest_cid_mismatch' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function verifyContextSelection(manifest, blocks, expectedCid = manifest?.cid) {
  const manifestVerification = verifyContextManifest(manifest, expectedCid);
  if (!manifestVerification.ok) return manifestVerification;
  const allowed = new Map(manifest.blocks.map((block) => [block.id, block.cid]));
  for (const block of blocks || []) {
    if (!allowed.has(block.id)) return { ok: false, reason: 'context_block_not_in_manifest', blockId: block.id };
    const cid = contextBlockCid(block.id, block.text);
    if (cid !== block.cid || cid !== allowed.get(block.id)) return { ok: false, reason: 'context_block_cid_mismatch', blockId: block.id };
  }
  return { ok: true };
}

export function renderContextSelection(blocks) {
  return (blocks || []).map((block) => `[${block.id}]\n${block.text}`).join('\n\n');
}
