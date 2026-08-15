import {
  buildContextDocument,
  contextQueryHash,
  retrieveContextBlocks
} from './index.js';

export const CONTEXT_RETRIEVAL_ALGORITHM_V2 = 'truyn-dense-semantic-rerank-v2';

const FUSION_STRATEGIES = Object.freeze([
  'max',
  'mean',
  'median',
  'top2_mean',
  'original_weighted',
  'consensus',
  'rrf',
  'borda'
]);

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

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function normalizeRerankedIds(result) {
  if (typeof result === 'string') return [result];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.ids)) return result.ids;
  if (typeof result?.id === 'string') return [result.id];
  return [];
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

function rankMaps(records, variantCount) {
  return Array.from({ length:variantCount }, (_, variantIndex) => {
    const ordered = [...records].sort((left, right) =>
      right.variantScores[variantIndex] - left.variantScores[variantIndex]
      || left.id.localeCompare(right.id)
    );
    return new Map(ordered.map((record, index) => [record.id, index + 1]));
  });
}

function fusionScore(record, strategy, ranks, corpusSize) {
  const values = record.variantScores;
  if (strategy === 'max') return Math.max(...values);
  if (strategy === 'mean') return mean(values);
  if (strategy === 'median') return median(values);
  if (strategy === 'top2_mean') {
    const top = [...values].sort((left, right) => right - left).slice(0, Math.min(2, values.length));
    return mean(top);
  }
  if (strategy === 'original_weighted') {
    if (values.length === 1) return values[0];
    return (0.55 * values[0]) + (0.45 * mean(values.slice(1)));
  }
  if (strategy === 'consensus') return mean(values) - (0.2 * standardDeviation(values));
  if (strategy === 'rrf') {
    return ranks.reduce((total, rankMap) => total + (1 / (60 + rankMap.get(record.id))), 0);
  }
  if (strategy === 'borda') {
    if (corpusSize <= 1) return 1;
    return mean(ranks.map((rankMap) => 1 - ((rankMap.get(record.id) - 1) / (corpusSize - 1))));
  }
  throw new Error(`unsupported semantic fusion strategy: ${strategy}`);
}

function fusionDiagnostics(records, strategies, ranks, corpusSize, lexicalBonus, limit = 8) {
  const topByStrategy = {};
  for (const strategy of strategies) {
    const ordered = records.map((record) => ({
      id:record.id,
      score:fusionScore(record, strategy, ranks, corpusSize) + (lexicalBonus.get(record.id) || 0)
    })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    topByStrategy[strategy] = ordered.slice(0, Math.min(limit, ordered.length)).map((item, index) => ({
      id:item.id,
      rank:index + 1,
      score:round(item.score)
    }));
  }
  return { topByStrategy };
}

/**
 * Semantic router v2:
 *   1. optional multilingual query projection without corpus visibility;
 *   2. dense candidate retrieval over immutable content blocks;
 *   3. robust multi-projection score fusion;
 *   4. optional semantic reranker over only the fused dense candidate set.
 *
 * The manifest/CID chain and the hash of the ORIGINAL requester query remain
 * the provenance source of truth. Projection/vector/reranker state is an
 * ephemeral index and cannot alter a block's immutable identity.
 */
export function createSemanticContextRouterV2({
  embedder,
  reranker = null,
  queryProjector = null,
  candidateK = 64,
  lexicalTieBreakWeight = 0,
  fusionStrategy = 'max',
  diagnosticFusion = false
} = {}) {
  if (!embedder || typeof embedder.embedMany !== 'function') {
    throw new Error('semantic router v2 requires embedder.embedMany(texts, options)');
  }
  if (reranker && typeof reranker.rerank !== 'function') throw new Error('semantic reranker must expose rerank(query, candidates, options)');
  if (queryProjector && typeof queryProjector.project !== 'function') throw new Error('semantic query projector must expose project(query)');
  if (!Number.isInteger(candidateK) || candidateK < 1 || candidateK > 128) throw new Error('semantic candidateK must be 1..128');
  if (!FUSION_STRATEGIES.includes(fusionStrategy)) throw new Error(`semantic fusionStrategy must be one of: ${FUSION_STRATEGIES.join(', ')}`);

  const documents = new Map();
  const vectorCache = new Map();
  const queryVectorCache = new Map();
  const projectionCache = new Map();
  const resultCache = new Map();

  async function indexDocument(document) {
    const missing = document.blocks.filter((block) => !vectorCache.has(block.cid));
    if (missing.length === 0) return;
    const vectors = await embedder.embedMany(missing.map((block) => block.text), { taskType: 'RETRIEVAL_DOCUMENT' });
    assertVectors(vectors, missing.length);
    for (let index = 0; index < missing.length; index += 1) vectorCache.set(missing[index].cid, vectors[index]);
  }

  async function projectQuery(query) {
    const originalHash = contextQueryHash(query);
    if (projectionCache.has(originalHash)) return projectionCache.get(originalHash);
    const projection = queryProjector
      ? await queryProjector.project(query)
      : { variants:[query], metadata:null };
    const variants = uniqueStrings([query, ...(projection?.variants || [])]);
    if (variants.length === 0) throw new Error('semantic query projection produced no usable variants');
    const normalized = {
      variants,
      rerankerQuery:variants.map((text, index) => `SEMANTIC_QUERY_VARIANT_${index + 1}: ${text}`).join('\n'),
      metadata:projection?.metadata || null
    };
    projectionCache.set(originalHash, normalized);
    return normalized;
  }

  async function queryVectors(texts) {
    const missing = uniqueStrings(texts).filter((text) => !queryVectorCache.has(contextQueryHash(text)));
    if (missing.length > 0) {
      const vectors = await embedder.embedMany(missing, { taskType:'RETRIEVAL_QUERY' });
      assertVectors(vectors, missing.length);
      for (let index = 0; index < missing.length; index += 1) queryVectorCache.set(contextQueryHash(missing[index]), vectors[index]);
    }
    return texts.map((text) => queryVectorCache.get(contextQueryHash(text)));
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
    const cacheKey = `${cid}:${queryHash}:${topK}:${candidateK}:${fusionStrategy}:${diagnosticFusion ? 'diag' : 'plain'}:${queryProjector ? queryProjector.name || 'project' : 'raw'}:${reranker ? 'rerank' : 'dense'}`;
    if (resultCache.has(cacheKey)) return structuredClone(resultCache.get(cacheKey));

    await indexDocument(document);
    const projection = await projectQuery(query);
    const qVectors = await queryVectors(projection.variants);

    const lexicalBonus = new Map();
    if (lexicalTieBreakWeight > 0) {
      try {
        const lexical = retrieveContextBlocks(document.blocks, query, { topK: Math.min(8, document.blocks.length) });
        lexical.blocks.forEach((block, index) => lexicalBonus.set(block.id, lexicalTieBreakWeight * ((lexical.blocks.length - index) / lexical.blocks.length)));
      } catch {}
    }

    const records = document.blocks.map((block) => {
      const blockVector = vectorCache.get(block.cid);
      const variantScores = qVectors.map((q) => cosine(q, blockVector));
      const maxScore = Math.max(...variantScores);
      return {
        id:block.id,
        cid:block.cid,
        text:block.text,
        bytes:block.bytes,
        variantScores,
        bestProjectionIndex:variantScores.indexOf(maxScore)
      };
    });

    const strategies = diagnosticFusion ? FUSION_STRATEGIES : [fusionStrategy];
    const needsRanks = strategies.some((strategy) => strategy === 'rrf' || strategy === 'borda');
    const ranks = needsRanks ? rankMaps(records, qVectors.length) : [];
    const dense = records.map((record) => {
      const semanticScore = fusionScore(record, fusionStrategy, ranks, records.length);
      return {
        id:record.id,
        cid:record.cid,
        text:record.text,
        bytes:record.bytes,
        score:round(semanticScore + (lexicalBonus.get(record.id) || 0)),
        semanticScore:round(semanticScore),
        bestProjectionIndex:record.bestProjectionIndex
      };
    }).sort((left, right) => right.score - left.score || right.semanticScore - left.semanticScore || left.id.localeCompare(right.id));

    const diagnostics = diagnosticFusion
      ? fusionDiagnostics(records, FUSION_STRATEGIES, ranks, records.length, lexicalBonus)
      : null;
    const candidates = dense.slice(0, Math.min(candidateK, dense.length));
    let ordered = candidates;
    let reranked = false;
    let rerankerMetadata = null;
    if (reranker) {
      const rerankResult = await reranker.rerank(projection.rerankerQuery, candidates.map(({ id, text, cid: blockCid, score, semanticScore, bestProjectionIndex }, index) => ({
        id,
        cid:blockCid,
        text,
        denseRank:index + 1,
        denseScore:score,
        semanticScore,
        bestProjectionIndex
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

    const selected = ordered.slice(0, topK).map((block, index) => ({ ...block, rank:index + 1 }));
    if (selected.length === 0) throw new Error('context retrieval produced no relevant blocks');
    const denseRankById = new Map(candidates.map((candidate, index) => [candidate.id, index + 1]));

    const result = {
      ok:true,
      cid,
      blocks:selected,
      retrieval:{
        version:2,
        algorithm:CONTEXT_RETRIEVAL_ALGORITHM_V2,
        rootCid:cid,
        manifestCid:document.manifest.cid,
        queryHash,
        topK,
        corpusBlocks:document.blocks.length,
        candidateK:candidates.length,
        queryProjected:Boolean(queryProjector),
        queryProjector:queryProjector?.name || null,
        queryProjectionCount:projection.variants.length,
        projectorMetadata:projection.metadata,
        fusionStrategy,
        fusionDiagnostics:diagnostics,
        reranked,
        reranker:reranker?.name || null,
        rerankerMetadata,
        denseCandidates:candidates.map((candidate, index) => ({
          id:candidate.id,
          cid:candidate.cid,
          rank:index + 1,
          score:candidate.score,
          semanticScore:candidate.semanticScore,
          bestProjectionIndex:candidate.bestProjectionIndex
        })),
        selected:selected.map(({ id, cid:blockCid, score, semanticScore, rank, bestProjectionIndex }) => ({
          id,
          cid:blockCid,
          score,
          semanticScore,
          rank,
          denseRank:denseRankById.get(id) || null,
          bestProjectionIndex
        }))
      }
    };
    resultCache.set(cacheKey, result);
    return structuredClone(result);
  }

  return {
    algorithm:CONTEXT_RETRIEVAL_ALGORITHM_V2,
    putContext,
    manifest,
    retrieve,
    stats() {
      return {
        contexts:documents.size,
        cachedBlockVectors:vectorCache.size,
        cachedQueryVectors:queryVectorCache.size,
        cachedQueryProjections:projectionCache.size,
        cachedResults:resultCache.size,
        candidateK,
        fusionStrategy,
        diagnosticFusion,
        queryProjector:queryProjector?.name || null,
        queryProjectorStats:typeof queryProjector?.stats === 'function' ? queryProjector.stats() : null,
        reranker:reranker?.name || null,
        rerankerStats:typeof reranker?.stats === 'function' ? reranker.stats() : null
      };
    }
  };
}
