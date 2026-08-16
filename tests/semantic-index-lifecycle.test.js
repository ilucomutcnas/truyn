import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSemanticContextRouterV2 } from '../core/context/semantic-router-v2.js';
import { createFileSemanticIndexStore, createMemorySemanticIndexStore } from '../core/context/semantic-index-store.js';
import { createProductionSemanticIndex } from '../core/context/production-semantic-index.js';

function countingEmbedder() {
  const counts = { documentInputs:0, queryInputs:0, calls:0 };
  const vector = (text) => {
    if (/alpha/i.test(text)) return [1,0,0];
    if (/beta/i.test(text)) return [0,1,0];
    if (/gamma/i.test(text)) return [0,0,1];
    return [0.1,0.1,0.1];
  };
  return {
    counts,
    async embedMany(texts, { taskType } = {}) {
      counts.calls += 1;
      if (taskType === 'RETRIEVAL_DOCUMENT') counts.documentInputs += texts.length;
      if (taskType === 'RETRIEVAL_QUERY') counts.queryInputs += texts.length;
      return texts.map(vector);
    }
  };
}

async function withTempStore(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'truyn-semantic-index-'));
  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive:true, force:true });
  }
}

test('production mode never lazily embeds an unprepared root during retrieve', async () => {
  const embedder = countingEmbedder();
  const router = createSemanticContextRouterV2({
    embedder,
    indexStore:createMemorySemanticIndexStore(),
    lexicalTieBreakWeight:0
  });
  const context = router.putContext([{ id:'alpha', text:'alpha durable object' }]);

  await assert.rejects(
    router.retrieve(context.cid, 'alpha question'),
    (error) => error?.code === 'semantic_index_not_ready'
  );
  assert.equal(embedder.counts.documentInputs, 0);

  const prepared = await router.prepareContext(context.cid);
  assert.equal(prepared.index.status, 'ready');
  assert.equal(prepared.index.embeddedBlockVectors, 1);
  assert.equal(embedder.counts.documentInputs, 1);

  const result = await router.retrieve(context.cid, 'alpha question');
  assert.equal(result.blocks[0].id, 'alpha');
  assert.equal(embedder.counts.documentInputs, 1);
  assert.equal(result.retrieval.indexPrepared, true);
});

test('durable root and block vectors survive process-style router restart without document re-embedding', async () => {
  await withTempStore(async (directory) => {
    const firstEmbedder = countingEmbedder();
    const firstRouter = createSemanticContextRouterV2({
      embedder:firstEmbedder,
      indexStore:createFileSemanticIndexStore({ directory }),
      lexicalTieBreakWeight:0
    });
    const published = await firstRouter.publishContext([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' }
    ]);
    assert.equal(firstEmbedder.counts.documentInputs, 2);
    assert.equal(published.index.status, 'ready');
    assert.equal(published.index.durable, true);

    const secondEmbedder = countingEmbedder();
    const secondRouter = createSemanticContextRouterV2({
      embedder:secondEmbedder,
      indexStore:createFileSemanticIndexStore({ directory }),
      lexicalTieBreakWeight:0
    });

    const warmed = await secondRouter.warmContext(published.cid);
    assert.equal(warmed.blockVectors, 2);
    assert.equal(warmed.embeddedBlockVectors, 0);
    assert.equal(secondEmbedder.counts.documentInputs, 0);

    const result = await secondRouter.retrieve(published.cid, 'beta question');
    assert.equal(result.blocks[0].id, 'beta');
    assert.equal(secondEmbedder.counts.documentInputs, 0);
    assert.equal(secondRouter.stats().lifecycle.rootStoreLoads, 1);
    assert.equal(secondRouter.stats().lifecycle.persistedVectorLoads, 2);
  });
});

test('production factory cold-loads a ready root directly from durable storage', async () => {
  await withTempStore(async (directory) => {
    const firstEmbedder = countingEmbedder();
    const first = createProductionSemanticIndex({ directory, embedder:firstEmbedder });
    const published = await first.publishContext([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' }
    ]);
    assert.equal(firstEmbedder.counts.documentInputs, 2);
    assert.equal(first.stats().productionIndexMode, true);
    assert.equal(first.stats().requirePreparedIndex, true);

    const secondEmbedder = countingEmbedder();
    const second = createProductionSemanticIndex({ directory, embedder:secondEmbedder });
    const manifest = await second.loadManifest(published.cid);
    assert.equal(manifest.cid, published.cid);

    const result = await second.retrieve(published.cid, 'alpha question');
    assert.equal(result.blocks[0].id, 'alpha');
    assert.equal(secondEmbedder.counts.documentInputs, 0);
    assert.equal(second.stats().lifecycle.rootStoreLoads, 1);
    assert.equal(second.stats().lifecycle.persistedVectorLoads, 2);
  });
});

test('new root embeds only new immutable block CIDs and reuses unchanged vectors', async () => {
  await withTempStore(async (directory) => {
    const embedder = countingEmbedder();
    const router = createSemanticContextRouterV2({
      embedder,
      indexStore:createFileSemanticIndexStore({ directory }),
      lexicalTieBreakWeight:0
    });

    const first = await router.publishContext([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' }
    ]);
    assert.equal(embedder.counts.documentInputs, 2);

    const second = await router.publishContext([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' },
      { id:'gamma', text:'gamma durable object' }
    ]);
    assert.notEqual(second.cid, first.cid);
    assert.equal(second.index.embeddedBlockVectors, 1);
    assert.equal(second.index.reusedBlockVectors, 2);
    assert.equal(embedder.counts.documentInputs, 3);

    const result = await router.retrieve(second.cid, 'gamma question');
    assert.equal(result.blocks[0].id, 'gamma');
    assert.equal(embedder.counts.documentInputs, 3);
  });
});

test('concurrent preparation of one root is single-flight and embeds each immutable block once', async () => {
  const embedder = countingEmbedder();
  const router = createSemanticContextRouterV2({
    embedder,
    indexStore:createMemorySemanticIndexStore(),
    lexicalTieBreakWeight:0
  });
  const context = router.putContext([
    { id:'alpha', text:'alpha durable object' },
    { id:'beta', text:'beta durable object' },
    { id:'gamma', text:'gamma durable object' }
  ]);

  const results = await Promise.all([
    router.prepareContext(context.cid),
    router.prepareContext(context.cid),
    router.prepareContext(context.cid)
  ]);
  assert.equal(results.every((item) => item.index.status === 'ready'), true);
  assert.equal(embedder.counts.documentInputs, 3);
  assert.equal(router.stats().lifecycle.preparedContexts, 1);
  assert.equal(router.stats().blockVectorFlights, 0);
});

test('root cache invalidation never deletes reusable immutable block vectors', async () => {
  await withTempStore(async (directory) => {
    const embedder = countingEmbedder();
    const router = createSemanticContextRouterV2({
      embedder,
      indexStore:createFileSemanticIndexStore({ directory }),
      lexicalTieBreakWeight:0
    });
    const published = await router.publishContext([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' }
    ]);
    await router.retrieve(published.cid, 'alpha question');
    assert.equal(router.stats().cachedResults, 1);

    const invalidated = await router.invalidateContext(published.cid);
    assert.equal(invalidated.immutableBlockVectorsPreserved, true);
    assert.equal(invalidated.evictedResults, 1);
    assert.equal(router.stats().cachedBlockVectors, 2);

    const warmed = await router.warmContext(published.cid);
    assert.equal(warmed.embeddedBlockVectors, 0);
    assert.equal(embedder.counts.documentInputs, 2);
  });
});
