import {
  buildContextDocument,
  contextQueryHash,
  retrieveContextBlocks
} from './index.js';

export const CONTEXT_RETRIEVAL_ALGORITHM_V2 = 'truyn-dense-semantic-rerank-v2';
export const SEMANTIC_INDEX_LIFECYCLE_VERSION = 1;

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

function assertIndexStore(indexStore) {
  if (!indexStore) return;
  for (const method of ['loadRoot','saveRoot','removeRoot','loadVectors','saveVectors']) {
    if (typeof indexStore[method] !== 'function') throw new Error(`semantic index store must expose ${method}()`);
  }
}

function indexSnapshot(document, status, extra = {}) {
  return {
    version:SEMANTIC_INDEX_LIFECYCLE_VERSION,
    algorithm:CONTEXT_RETRIEVAL_ALGORITHM_V2,
    status,
    rootCid:document.cid,
    manifestCid:document.manifest.cid,
    blockCount:document.blocks.length,
    ...extra
  };
}

/**
 * Semantic router v2.
 *
 * Legacy/in-memory mode keeps the original lazy indexing behavior for API
 * compatibility. Production mode is enabled by supplying indexStore. In that
 * mode requirePreparedIndex defaults to true: retrieve() never calls the
 * document embedder and fails closed until publishContext()/prepareContext()
 * has produced a durable ready index.
 *
 * Immutable block vectors are keyed only by block CID, not root CID. A new root
 * therefore reuses vectors for unchanged OBJECTs and embeds only genuinely new
 * immutable blocks. Root snapshots are separately keyed by root CID so process
 * restarts can load question + root CID without rebuilding the corpus index.
 */
export function createSemanticContextRouterV2({
  embedder,
  reranker = null,
  queryProjector = null,
  candidateK = 64,
  lexicalTieBreakWeight = 0,
  fusionStrategy = 'max',
  diagnosticFusion = false,
  indexStore = null,
  requirePreparedIndex = null
} = {}) {
  if (!embedder || typeof embedder.embedMany !== 'function') {
    throw new Error('semantic router v2 requires embedder.embedMany(texts, options)');
  }
  if (reranker && typeof reranker.rerank !== 'function') throw new Error('semantic reranker must expose rerank(query, candidates, options)');
  if (queryProjector && typeof queryProjector.project !== 'function') throw new Error('semantic query projector must expose project(query)');
  if (!Number.isInteger(candidateK) || candidateK < 1 || candidateK > 128) throw new Error('semantic candidateK must be 1..128');
  if (!FUSION_STRATEGIES.includes(fusionStrategy)) throw new Error(`semantic fusionStrategy must be one of: ${FUSION_STRATEGIES.join(', ')}`);
  assertIndexStore(indexStore);

  const strictPreparedIndex = requirePreparedIndex == null ? Boolean(indexStore) : Boolean(requirePreparedIndex);
  const documents = new Map();
  const vectorCache = new Map();
  const queryVectorCache = new Map();
  const projectionCache = new Map();
  const resultCache = new Map();
  const indexFlights = new Map();
  const blockVectorFlights = new Map();
  const lifecycleMetrics = {
    volatileContexts:0,
    publishedContexts:0,
    preparedContexts:0,
    warmups:0,
    rootMemoryHits:0,
    rootStoreLoads:0,
    persistedVectorLoads:0,
    documentVectorsEmbedded:0,
    documentVectorsReused:0,
    resultCacheHits:0,
    resultCacheEvictions:0
  };

  function registerDocument(blocks, metadata = {}, existing = null) {
    const document = buildContextDocument(blocks);
    const registered = {
      ...document,
      metadata: metadata && typeof metadata === 'object' ? structuredClone(metadata) : {},
      createdAt:existing?.createdAt || new Date().toISOString(),
      index:existing?.index || null
    };
    documents.set(document.cid, registered);
    return registered;
  }

  function serializeDocument(document, index = document.index || null) {
    return {
      cid:document.cid,
      blocks:document.blocks,
      manifest:document.manifest,
      contentBytes:document.contentBytes,
      serializedBytes:document.serializedBytes,
      metadata:document.metadata || {},
      createdAt:document.createdAt,
      index:index || null
    };
  }

  function contextSummary(document) {
    return {
      ok:true,
      cid:document.cid,
      manifest:document.manifest,
      contentBytes:document.contentBytes,
      serializedBytes:document.serializedBytes,
      index:document.index || null
    };
  }

  function evictResultCache(rootCid) {
    let removed = 0;
    for (const key of resultCache.keys()) {
      if (key.startsWith(`${rootCid}:`)) {
        resultCache.delete(key);
        removed += 1;
      }
    }
    lifecycleMetrics.resultCacheEvictions += removed;
    return removed;
  }

  async function resolveDocument(cid) {
    if (documents.has(cid)) {
      lifecycleMetrics.rootMemoryHits += 1;
      return documents.get(cid);
    }
    if (!indexStore) return null;
    const snapshot = await indexStore.loadRoot(cid);
    if (!snapshot) return null;
    documents.set(cid, snapshot);
    lifecycleMetrics.rootStoreLoads += 1;
    return snapshot;
  }

  async function loadPersistedVectors(blocks) {
    if (!indexStore) return 0;
    const missingCids = blocks.map((block) => block.cid).filter((cid) => !vectorCache.has(cid));
    if (missingCids.length === 0) return 0;
    const persisted = await indexStore.loadVectors(missingCids);
    let loaded = 0;
    for (const [cid, vector] of persisted) {
      assertVectors([vector], 1);
      if (!vectorCache.has(cid)) {
        vectorCache.set(cid, vector);
        loaded += 1;
      }
    }
    lifecycleMetrics.persistedVectorLoads += loaded;
    return loaded;
  }

  async function embedNewBlockVectors(blocks) {
    const waiting = [];
    const fresh = [];
    for (const block of blocks) {
      if (vectorCache.has(block.cid)) continue;
      if (blockVectorFlights.has(block.cid)) waiting.push(blockVectorFlights.get(block.cid));
      else fresh.push(block);
    }

    if (fresh.length > 0) {
      const batch = (async () => {
        const vectors = await embedder.embedMany(fresh.map((block) => block.text), { taskType:'RETRIEVAL_DOCUMENT' });
        assertVectors(vectors, fresh.length);
        const entries = fresh.map((block, index) => ({ cid:block.cid, vector:vectors[index] }));
        if (indexStore) await indexStore.saveVectors(entries);
        entries.forEach(({ cid, vector }) => vectorCache.set(cid, vector));
        lifecycleMetrics.documentVectorsEmbedded += entries.length;
      })();
      for (const block of fresh) {
        const flight = batch.then(() => vectorCache.get(block.cid));
        blockVectorFlights.set(block.cid, flight);
        flight.finally(() => {
          if (blockVectorFlights.get(block.cid) === flight) blockVectorFlights.delete(block.cid);
        });
        waiting.push(flight);
      }
    }
    if (waiting.length > 0) await Promise.all(waiting);
    return fresh.length;
  }

  async function ensureDocumentVectors(document, { allowEmbed }) {
    await loadPersistedVectors(document.blocks);
    const missing = document.blocks.filter((block) => !vectorCache.has(block.cid));
    if (missing.length > 0 && !allowEmbed) {
      const error = new Error('semantic_index_not_ready');
      error.code = 'semantic_index_not_ready';
      error.missingBlockVectors = missing.length;
      throw error;
    }
    const embedded = missing.length > 0 ? await embedNewBlockVectors(missing) : 0;
    const unresolved = document.blocks.filter((block) => !vectorCache.has(block.cid));
    if (unresolved.length > 0) throw new Error('semantic_index_vector_build_incomplete');
    const reused = document.blocks.length - embedded;
    lifecycleMetrics.documentVectorsReused += reused;
    return { embedded, reused };
  }

  async function prepareContext(cid) {
    if (indexFlights.has(cid)) return indexFlights.get(cid);
    const flight = (async () => {
      const document = await resolveDocument(cid);
      if (!document) throw new Error('context_not_found');
      const preparing = indexSnapshot(document, 'preparing', { startedAt:new Date().toISOString() });
      document.index = preparing;
      if (indexStore) await indexStore.saveRoot(serializeDocument(document, preparing));
      const vectors = await ensureDocumentVectors(document, { allowEmbed:true });
      const ready = indexSnapshot(document, 'ready', {
        preparedAt:new Date().toISOString(),
        durable:Boolean(indexStore?.durable),
        embeddedBlockVectors:vectors.embedded,
        reusedBlockVectors:vectors.reused
      });
      document.index = ready;
      if (indexStore) await indexStore.saveRoot(serializeDocument(document, ready));
      evictResultCache(cid);
      lifecycleMetrics.preparedContexts += 1;
      return { ok:true, cid, index:structuredClone(ready) };
    })();
    indexFlights.set(cid, flight);
    try {
      return await flight;
    } finally {
      if (indexFlights.get(cid) === flight) indexFlights.delete(cid);
    }
  }

  function putContext(blocks, metadata = {}) {
    const document = registerDocument(blocks, metadata, documents.get(buildContextDocument(blocks).cid));
    lifecycleMetrics.volatileContexts += 1;
    return contextSummary(document);
  }

  async function publishContext(blocks, metadata = {}) {
    const built = buildContextDocument(blocks);
    const existing = documents.get(built.cid) || (indexStore ? await indexStore.loadRoot(built.cid) : null);
    const document = registerDocument(blocks, metadata, existing);
    const preparing = indexSnapshot(document, 'preparing', { startedAt:new Date().toISOString() });
    document.index = preparing;
    if (indexStore) await indexStore.saveRoot(serializeDocument(document, preparing));
    lifecycleMetrics.publishedContexts += 1;
    const preparation = await prepareContext(document.cid);
    return { ...contextSummary(document), preparation };
  }

  function manifest(cid) {
    const document = documents.get(cid);
    if (!document) throw new Error('context_not_found');
    return document.manifest;
  }

  async function loadManifest(cid) {
    const document = await resolveDocument(cid);
    if (!document) throw new Error('context_not_found');
    return structuredClone(document.manifest);
  }

  async function warmContext(cid) {
    const document = await resolveDocument(cid);
    if (!document) throw new Error('context_not_found');
    if (document.index?.status !== 'ready') {
      const error = new Error('semantic_index_not_ready');
      error.code = 'semantic_index_not_ready';
      throw error;
    }
    const vectors = await ensureDocumentVectors(document, { allowEmbed:false });
    lifecycleMetrics.warmups += 1;
    return {
      ok:true,
      cid,
      blockVectors:document.blocks.length,
      reusedBlockVectors:vectors.reused,
      embeddedBlockVectors:0,
      durable:Boolean(indexStore?.durable),
      index:structuredClone(document.index)
    };
  }

  async function warmContexts(cids) {
    if (!Array.isArray(cids)) throw new Error('semantic warmup root CIDs must be an array');
    return Promise.all(cids.map((cid) => warmContext(cid)));
  }

  async function invalidateContext(cid, { purgePersistentRoot = false } = {}) {
    documents.delete(cid);
    const evictedResults = evictResultCache(cid);
    let persistentRootRemoved = false;
    if (purgePersistentRoot && indexStore) persistentRootRemoved = await indexStore.removeRoot(cid);
    return {
      ok:true,
      cid,
      evictedResults,
      persistentRootRemoved,
      immutableBlockVectorsPreserved:true
    };
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

  async function retrieve(cid, query, { topK = 1 } = {}) {
    if (typeof query !== 'string' || query.trim().length < 3) throw new Error('context retrieval query is required');
    if (!Number.isInteger(topK) || topK < 1 || topK > 8) throw new Error('context retrieval topK must be between 1 and 8');
    const document = await resolveDocument(cid);
    if (!document) throw new Error('context_not_found');

    const queryHash = contextQueryHash(query);
    const cacheKey = `${cid}:${queryHash}:${topK}:${candidateK}:${fusionStrategy}:${diagnosticFusion ? 'diag' : 'plain'}:${queryProjector ? queryProjector.name || 'project' : 'raw'}:${reranker ? 'rerank' : 'dense'}`;
    if (resultCache.has(cacheKey)) {
      lifecycleMetrics.resultCacheHits += 1;
      return structuredClone(resultCache.get(cacheKey));
    }

    if (strictPreparedIndex) {
      if (document.index?.status !== 'ready') {
        const error = new Error('semantic_index_not_ready');
        error.code = 'semantic_index_not_ready';
        throw error;
      }
      await ensureDocumentVectors(document, { allowEmbed:false });
    } else {
      await ensureDocumentVectors(document, { allowEmbed:true });
    }

    const projection = await projectQuery(query);
    const qVectors = await queryVectors(projection.variants);

    const lexicalBonus = new Map();
    if (lexicalTieBreakWeight > 0) {
      try {
        const lexical = retrieveContextBlocks(document.blocks, query, { topK:Math.min(8, document.blocks.length) });
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
      const rerankResult = await reranker.rerank(projection.rerankerQuery, candidates.map(({ id, text, cid:blockCid, score, semanticScore, bestProjectionIndex }, index) => ({
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
        indexLifecycleVersion:SEMANTIC_INDEX_LIFECYCLE_VERSION,
        indexPrepared:document.index?.status === 'ready' || !strictPreparedIndex,
        indexDurable:Boolean(indexStore?.durable),
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
    publishContext,
    prepareContext,
    warmContext,
    warmContexts,
    invalidateContext,
    manifest,
    loadManifest,
    retrieve,
    stats() {
      return {
        contexts:documents.size,
        cachedBlockVectors:vectorCache.size,
        cachedQueryVectors:queryVectorCache.size,
        cachedQueryProjections:projectionCache.size,
        cachedResults:resultCache.size,
        indexFlights:indexFlights.size,
        blockVectorFlights:blockVectorFlights.size,
        productionIndexMode:Boolean(indexStore),
        requirePreparedIndex:strictPreparedIndex,
        indexStore:typeof indexStore?.stats === 'function' ? indexStore.stats() : (indexStore ? { kind:indexStore.kind || 'custom', durable:Boolean(indexStore.durable) } : null),
        lifecycle:{ ...lifecycleMetrics },
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
