import {
  buildContextDocument,
  contextQueryHash,
  retrieveContextBlocks
} from './index.js';

export const CONTEXT_RETRIEVAL_ALGORITHM_V2 = 'truyn-hybrid-multilingual-embedding-v2';

function dot(left, right) {
  let value = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) value += left[index] * right[index];
  return value;
}

function norm(vector) {
  let total = 0;
  for (const value of vector) total += value * value;
  return Math.sqrt(total);
}

function cosine(left, right) {
  const denominator = norm(left) * norm(right);
  return denominator > 0 ? dot(left, right) / denominator : 0;
}

function assertVectors(vectors, expected) {
  if (!Array.isArray(vectors) || vectors.length !== expected) {
    throw new Error(`semantic embedder returned ${Array.isArray(vectors) ? vectors.length : 'invalid'} vectors for ${expected} inputs`);
  }
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
      throw new Error('semantic embedder returned an invalid vector');
    }
  }
}

function round(value, digits = 9) {
  return Number(value.toFixed(digits));
}

/**
 * In-memory semantic context router used by TRUYN retrieval v2.
 *
 * The router keeps the content-addressed manifest as the provenance source of
 * truth. Embeddings are an ephemeral index keyed by immutable block CID; they
 * are never part of, and therefore never weaken, the CID/provenance chain.
 *
 * embedder contract:
 *   embedMany(texts, { taskType }) -> Promise<number[][]>
 */
export function createSemanticContextRouterV2({
  embedder,
  lexicalTieBreakWeight = 0
} = {}) {
  if (!embedder || typeof embedder.embedMany !== 'function') {
    throw new Error('semantic router v2 requires embedder.embedMany(texts, options)');
  }

  const documents = new Map();
  const vectorCache = new Map();
  const queryCache = new Map();

  async function indexDocument(document) {
    const missing = document.blocks.filter((block) => !vectorCache.has(block.cid));
    if (missing.length === 0) return;
    const vectors = await embedder.embedMany(
      missing.map((block) => block.text),
      { taskType: 'RETRIEVAL_DOCUMENT' }
    );
    assertVectors(vectors, missing.length);
    for (let index = 0; index < missing.length; index += 1) {
      vectorCache.set(missing[index].cid, vectors[index]);
    }
  }

  async function queryVector(query) {
    const hash = contextQueryHash(query);
    if (queryCache.has(hash)) return queryCache.get(hash);
    const vectors = await embedder.embedMany([query], { taskType: 'RETRIEVAL_QUERY' });
    assertVectors(vectors, 1);
    queryCache.set(hash, vectors[0]);
    return vectors[0];
  }

  function putContext(blocks, metadata = {}) {
    const document = buildContextDocument(blocks);
    documents.set(document.cid, {
      ...document,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      createdAt: new Date().toISOString()
    });
    return {
      ok: true,
      cid: document.cid,
      manifest: document.manifest,
      contentBytes: document.contentBytes,
      serializedBytes: document.serializedBytes
    };
  }

  function manifest(cid) {
    const document = documents.get(cid);
    if (!document) throw new Error('context_not_found');
    return document.manifest;
  }

  async function retrieve(cid, query, { topK = 1 } = {}) {
    if (typeof query !== 'string' || query.trim().length < 3) throw new Error('context retrieval query is required');
    if (!Number.isInteger(topK) || topK < 1 || topK > 8) throw new Error('context retrieval topK must be between 1 and 8');
    const document = documents.get(cid);
    if (!document) throw new Error('context_not_found');

    await indexDocument(document);
    const q = await queryVector(query);

    const lexicalBonus = new Map();
    if (lexicalTieBreakWeight > 0) {
      try {
        const lexical = retrieveContextBlocks(document.blocks, query, { topK: Math.min(8, document.blocks.length) });
        lexical.blocks.forEach((block, index) => {
          lexicalBonus.set(block.id, lexicalTieBreakWeight * ((lexical.blocks.length - index) / lexical.blocks.length));
        });
      } catch {
        // Synonym-only and cross-language queries are expected to have zero
        // lexical signal. Dense retrieval remains the primary ranker.
      }
    }

    const scored = document.blocks.map((block) => {
      const semanticScore = cosine(q, vectorCache.get(block.cid));
      const score = semanticScore + (lexicalBonus.get(block.id) || 0);
      return {
        id: block.id,
        cid: block.cid,
        text: block.text,
        bytes: block.bytes,
        score: round(score),
        semanticScore: round(semanticScore)
      };
    }).sort((left, right) => right.score - left.score || right.semanticScore - left.semanticScore || left.id.localeCompare(right.id));

    const selected = scored.slice(0, topK).map((block, index) => ({ ...block, rank: index + 1 }));
    if (selected.length === 0) throw new Error('context retrieval produced no relevant blocks');

    return {
      ok: true,
      cid,
      blocks: selected,
      retrieval: {
        version: 2,
        algorithm: CONTEXT_RETRIEVAL_ALGORITHM_V2,
        rootCid: cid,
        manifestCid: document.manifest.cid,
        queryHash: contextQueryHash(query),
        topK,
        corpusBlocks: document.blocks.length,
        selected: selected.map(({ id, cid: blockCid, score, semanticScore, rank }) => ({
          id,
          cid: blockCid,
          score,
          semanticScore,
          rank
        }))
      }
    };
  }

  return {
    algorithm: CONTEXT_RETRIEVAL_ALGORITHM_V2,
    putContext,
    manifest,
    retrieve,
    stats() {
      return {
        contexts: documents.size,
        cachedBlockVectors: vectorCache.size,
        cachedQueryVectors: queryCache.size
      };
    }
  };
}
