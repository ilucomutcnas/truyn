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


export const CONTEXT_RETRIEVAL_ALGORITHM = 'truyn-hybrid-bm25-chargram-v1';

const RETRIEVAL_STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','how','in','is','it','of','on','or','that','the','this','to','was','were','what','when','where','which','who','with'
]);

export function normalizeContextQuery(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function stemRetrievalToken(token) {
  if (token.length <= 4) return token;
  for (const suffix of ['ization','ational','fulness','ousness','iveness','tional','ments','ment','ation','ingly','edly','ing','ies','ied','ed','es','s']) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      if (suffix === 'ies' || suffix === 'ied') return `${token.slice(0, -suffix.length)}y`;
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function retrievalTerms(value) {
  const normalized = normalizeContextQuery(value);
  if (!normalized) return [];
  return normalized.split(/\s+/)
    .filter((token) => token.length > 1 && !RETRIEVAL_STOP_WORDS.has(token))
    .map(stemRetrievalToken);
}

function charTrigrams(value) {
  const padded = `  ${value} `;
  const grams = new Set();
  for (let i = 0; i + 3 <= padded.length; i += 1) grams.add(padded.slice(i, i + 3));
  return grams;
}

function trigramDice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = charTrigrams(a);
  const right = charTrigrams(b);
  let overlap = 0;
  for (const gram of left) if (right.has(gram)) overlap += 1;
  return (2 * overlap) / Math.max(1, left.size + right.size);
}

export function contextQueryHash(query) {
  const normalized = normalizeContextQuery(query);
  if (!normalized) throw new Error('context retrieval query is required');
  return `sha256:${hashHex(canonicalize({ v: 1, q: normalized }))}`;
}

export function retrieveContextBlocks(blocks, query, { topK = 1 } = {}) {
  const normalizedBlocks = normalizeContextBlocks(blocks).map((block) => ({
    ...block,
    cid: block.cid || contextBlockCid(block.id, block.text),
    bytes: block.bytes || Buffer.byteLength(block.text)
  }));
  const normalizedQuery = normalizeContextQuery(query);
  const queryTerms = retrievalTerms(query);
  if (!normalizedQuery || queryTerms.length === 0) throw new Error('context retrieval query is required');
  if (!Number.isInteger(topK) || topK < 1 || topK > 8) throw new Error('context retrieval topK must be between 1 and 8');

  const docs = normalizedBlocks.map((block) => {
    const terms = retrievalTerms(`${block.id} ${block.text}`);
    const tf = new Map();
    for (const term of terms) tf.set(term, (tf.get(term) || 0) + 1);
    return { block, terms, tf, uniqueTerms: new Set(terms) };
  });
  const documentCount = docs.length;
  const avgLength = docs.reduce((sum, doc) => sum + doc.terms.length, 0) / Math.max(1, documentCount);
  const df = new Map();
  for (const doc of docs) for (const term of doc.uniqueTerms) df.set(term, (df.get(term) || 0) + 1);

  const uniqueQueryTerms = [...new Set(queryTerms)];
  const idf = (term) => Math.log(1 + (documentCount - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
  const k1 = 1.2;
  const b = 0.75;
  const scored = docs.map((doc) => {
    let bm25 = 0;
    let fuzzy = 0;
    let matched = 0;
    for (const term of uniqueQueryTerms) {
      const tf = doc.tf.get(term) || 0;
      if (tf > 0) {
        matched += 1;
        bm25 += idf(term) * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.terms.length / Math.max(1, avgLength)))));
        continue;
      }
      let best = 0;
      for (const candidate of doc.uniqueTerms) {
        best = Math.max(best, trigramDice(term, candidate));
        if (best >= 0.95) break;
      }
      if (best >= 0.72) {
        matched += best >= 0.82 ? 1 : 0.5;
        fuzzy += best * Math.max(0.1, idf(term)) * 0.35;
      }
    }
    const coverage = matched / uniqueQueryTerms.length;
    const compactText = normalizeContextQuery(doc.block.text);
    const phraseBonus = compactText.includes(normalizedQuery) ? 2 : 0;
    const score = bm25 + fuzzy + coverage * 2 + phraseBonus;
    return { ...doc.block, score: Number(score.toFixed(9)), coverage: Number(coverage.toFixed(6)) };
  }).sort((left, right) => right.score - left.score || right.coverage - left.coverage || left.id.localeCompare(right.id));

  const selected = scored.slice(0, topK);
  if (selected.length === 0 || selected[0].score <= 0) throw new Error('context retrieval produced no relevant blocks');
  return {
    algorithm: CONTEXT_RETRIEVAL_ALGORITHM,
    queryHash: contextQueryHash(query),
    topK,
    corpusBlocks: normalizedBlocks.length,
    blocks: selected
  };
}
