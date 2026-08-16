import { applyContextDelta } from './index.js';
import { createFileSemanticIndexStore } from './semantic-index-store.js';
import { createShardedFileSemanticIndexStore } from './sharded-semantic-index-store.js';
import { createSemanticContextRouterV2 } from './semantic-router-v2.js';

/**
 * Production composition for the Semantic Retrieval Gate index lifecycle.
 *
 * This factory is deliberately provider-neutral. The caller must supply an
 * already-authorized embedder/reranker owned by the runtime that pays for it.
 * Creating a public TRUYN relay must never implicitly create access to an
 * owner-funded semantic provider.
 */
export function createProductionSemanticIndex({
  directory,
  embedder,
  reranker = null,
  queryProjector = null,
  candidateK = 64,
  lexicalTieBreakWeight = 0,
  fusionStrategy = 'max',
  diagnosticFusion = false,
  storeKind = 'file',
  indexStore = null,
  shardPrefixLength = 2,
  ioConcurrency = 16
} = {}) {
  if (!embedder || typeof embedder.embedMany !== 'function') {
    throw new Error('production semantic index requires an authorized embedder');
  }
  let resolvedIndexStore = indexStore;
  if (!resolvedIndexStore) {
    if (storeKind === 'file') resolvedIndexStore = createFileSemanticIndexStore({ directory });
    else if (storeKind === 'sharded-file') resolvedIndexStore = createShardedFileSemanticIndexStore({ directory, shardPrefixLength, ioConcurrency });
    else throw new Error('production semantic index storeKind must be file or sharded-file');
  }
  const router = createSemanticContextRouterV2({
    embedder,
    reranker,
    queryProjector,
    candidateK,
    lexicalTieBreakWeight,
    fusionStrategy,
    diagnosticFusion,
    indexStore:resolvedIndexStore,
    requirePreparedIndex:true
  });

  async function publishDelta(parentCid, ops, metadata = {}) {
    const parent = await resolvedIndexStore.loadRoot(parentCid);
    if (!parent) throw new Error('context_not_found');
    if (parent.index?.status !== 'ready') {
      const error = new Error('semantic_index_not_ready');
      error.code = 'semantic_index_not_ready';
      throw error;
    }
    const blocks = applyContextDelta(parent.blocks, ops);
    const child = await router.publishContext(blocks, {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      parentCid
    });
    return {
      ...child,
      parentCid,
      reusedParentRoot:true
    };
  }

  return {
    router,
    indexStore:resolvedIndexStore,
    publishContext:(blocks, metadata) => router.publishContext(blocks, metadata),
    publishDelta,
    prepareContext:(cid) => router.prepareContext(cid),
    warmContext:(cid) => router.warmContext(cid),
    warmContexts:(cids) => router.warmContexts(cids),
    invalidateContext:(cid, options) => router.invalidateContext(cid, options),
    loadManifest:(cid) => router.loadManifest(cid),
    retrieve:(cid, query, options) => router.retrieve(cid, query, options),
    stats:() => router.stats()
  };
}
