import {
  buildContextDocument,
  contextQueryHash,
  retrieveContextBlocks
} from './index.js';

export const CONTEXT_RETRIEVAL_ALGORITHM_V2 = 'truyn-dense-semantic-rerank-v2';

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

function normalizeRerankedIds(result) {
  if (typeof result === 'string') return [result];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.ids)) return result.ids;
  if (typeof result?.id === 'string') return [result.id];
  return [];
}

/**
 * Two-stage semantic router:
 *   1. multilingual dense candidate retrieval over immutable content blocks;
 *   2. optional semantic reranker over only the dense candidate set.
 *
 * The manifest/CID chain remains the provenance source of truth. Vector and
 * reranker state are ephemeral indexes and cannot alter a block's identity.
 */
export function createSemanticContextRouterV2({
  embedder,
  reranker = null,
  candidateK = 64,
  lexicalTieBreakWeight = 0
} = {}) {
  if (!embedder || typeof embedder.embedMany !== 'function') {
    throw new Error('semantic router v2 requires embedder.embedMany(texts, options)');
  }
  if (reranker && typeof reranker.rerank !== 'function') throw new Error('semantic reranker must expose rerank(query, candidates, options)');
  if (!Number.isInteger(candidateK) || candidateK < 1 || candidateK > 128) throw new Error('semantic candidateK must be 1..128');

  const documents = new Map();
  const vectorCache = new Map();
  const queryCache = new Map();
  const resultCache = new Map();

  async function indexDocument(document) {
    const missing = document.blocks.filter((block) => !vectorCache.has(block.cid));
    if (missing.length === 0) return;
    const vectors = await embedder.embedMany(missing.map((block) => block.text), { taskType: 'RETRIEVAL_DOCUMENT' });
    assertVectors(vectors, missing.length);
    for (let index = 0; index < missing.length; index += 1) vectorCache.set(missing[index].cid, vectors[index]);
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

    const queryHash = contextQueryHash(query);
    const cacheKey = `${cid}:${queryHash}:${topK}:${candidateK}:${reranker ? 'rerank' : 'dense'}`;
    if (resultCache.has(cacheKey)) return structuredClone(resultCache.get(cacheKey));

    await indexDocument(document);
    const q = await queryVector(query);

    const lexicalBonus = new Map();
    if (lexicalTieBreakWeight > 0) {
      try {
        const lexical = retrieveContextBlocks(document.blocks, query, { topK: Math.min(8, document.blocks.length) });
        lexical.blocks.forEach((block, index) => lexicalBonus.set(block.id, lexicalTieBreakWeight * ((lexical.blocks.length - index) / lexical.blocks.length)));
      } catch {}
    }

    const dense = document.blocks.map((block) => {
      const semanticScore = cosine(q, vectorCache.get(block.cid));
      return {
        id: block.id,
        cid: block.cid,
        text: block.text,
        bytes: block.bytes,
        score: round(semanticScore + (lexicalBonus.get(block.id) || 0)),
        semanticScore: round(semanticScore)
      };
    }).sort((left, right) => right.score - left.score || right.semanticScore - left.semanticScore || left.id.localeCompare(right.id));

    const candidates = dense.slice(0, Math.min(candidateK, dense.length));
    let ordered = candidates;
    let reranked = false;
    let rerankerMetadata = null;
    if (reranker) {
      const rerankResult = await reranker.rerank(query, candidates.map(({ id, text, cid: blockCid, score, semanticScore }, index) => ({
        id,
        cid: blockCid,
        text,
        denseRank: index + 1,
        denseScore: score,
        semanticScore
      })), { topK });
      const ids = normalizeRerankedIds(rerankResult);
      const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const unique = [];
      for (const id of ids) {
        if (!candidateById.has(id)) throw new Error('semantic reranker selected a block outside the dense candidate set');
        if (!unique.includes(id)) unique.push(id);
      }
      if (unique.length < topK) throw new Error('semantic reranker returned too few valid candidates');
      const chosen = unique.map((id) => candidateById.get(id));
      const chosenIds = new Set(unique);
      ordered = [...chosen, ...candidates.filter((candidate) => !chosenIds.has(candidate.id))];
      reranked = true;
      rerankerMetadata = rerankResult?.metadata || null;
    }

    const selected = ordered.slice(0, topK).map((block, index) => ({ ...block, rank: index + 1 }));
    if (selected.length === 0) throw new Error('context retrieval produced no relevant blocks');
    const denseRankById = new Map(candidates.map((candidate, index) => [candidate.id, index + 1]));

    const result = {
      ok: true,
      cid,
      blocks: selected,
      retrieval: {
        version: 2,
        algorithm: CONTEXT_RETRIEVAL_ALGORITHM_V2,
        rootCid: cid,
        manifestCid: document.manifest.cid,
        queryHash,
        topK,
        corpusBlocks: document.blocks.length,
        candidateK: candidates.length,
        reranked,
        reranker: reranker?.name || null,
        rerankerMetadata,
        denseCandidates: candidates.map((candidate, index) => ({
          id: candidate.id,
          cid: candidate.cid,
          rank: index + 1,
          score: candidate.score,
          semanticScore: candidate.semanticScore
        })),
        selected: selected.map(({ id, cid: blockCid, score, semanticScore, rank }) => ({
          id,
          cid: blockCid,
          score,
          semanticScore,
          rank,
          denseRank: denseRankById.get(id) || null
        }))
      }
    };
    resultCache.set(cacheKey, result);
    return structuredClone(result);
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
        cachedQueryVectors: queryCache.size,
        cachedResults: resultCache.size,
        candidateK,
        reranker: reranker?.name || null,
        rerankerStats: typeof reranker?.stats === 'function' ? reranker.stats() : null
      };
    }
  };
}
