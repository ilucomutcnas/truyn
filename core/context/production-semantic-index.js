import { createFileSemanticIndexStore } from './semantic-index-store.js';
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
  diagnosticFusion = false
} = {}) {
  if (!embedder || typeof embedder.embedMany !== 'function') {
    throw new Error('production semantic index requires an authorized embedder');
  }
  const indexStore = createFileSemanticIndexStore({ directory });
  const router = createSemanticContextRouterV2({
    embedder,
    reranker,
    queryProjector,
    candidateK,
    lexicalTieBreakWeight,
    fusionStrategy,
    diagnosticFusion,
    indexStore,
    requirePreparedIndex:true
  });

  return {
    router,
    indexStore,
    publishContext:(blocks, metadata) => router.publishContext(blocks, metadata),
    prepareContext:(cid) => router.prepareContext(cid),
    warmContext:(cid) => router.warmContext(cid),
    warmContexts:(cids) => router.warmContexts(cids),
    invalidateContext:(cid, options) => router.invalidateContext(cid, options),
    loadManifest:(cid) => router.loadManifest(cid),
    retrieve:(cid, query, options) => router.retrieve(cid, query, options),
    stats:() => router.stats()
  };
}
