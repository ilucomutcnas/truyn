import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildContextDocument } from '../core/context/index.js';
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

test('identical production retrieval reuses the result cache without another query embedding', async () => {
  await withTempStore(async (directory) => {
    const embedder = countingEmbedder();
    const index = createProductionSemanticIndex({ directory, embedder });
    const published = await index.publishContext([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' }
    ]);

    const first = await index.retrieve(published.cid, 'alpha question');
    const queryInputsAfterFirst = embedder.counts.queryInputs;
    assert.ok(queryInputsAfterFirst > 0);
    const second = await index.retrieve(published.cid, 'alpha question');

    assert.equal(second.blocks[0].id, first.blocks[0].id);
    assert.equal(embedder.counts.queryInputs, queryInputsAfterFirst);
    assert.equal(index.stats().lifecycle.resultCacheHits, 1);
  });
});

test('interrupted preparing root resumes explicitly and then cold-loads without re-embedding', async () => {
  await withTempStore(async (directory) => {
    const store = createFileSemanticIndexStore({ directory });
    const document = buildContextDocument([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' }
    ]);
    await store.saveRoot({
      ...document,
      metadata:{ recoveryFixture:true },
      createdAt:new Date().toISOString(),
      index:{ status:'preparing', rootCid:document.cid, manifestCid:document.manifest.cid }
    });

    const recoveringEmbedder = countingEmbedder();
    const recovering = createSemanticContextRouterV2({
      embedder:recoveringEmbedder,
      indexStore:createFileSemanticIndexStore({ directory }),
      lexicalTieBreakWeight:0
    });
    await assert.rejects(
      recovering.retrieve(document.cid, 'alpha question'),
      (error) => error?.code === 'semantic_index_not_ready'
    );
    assert.equal(recoveringEmbedder.counts.documentInputs, 0);

    const recovered = await recovering.prepareContext(document.cid);
    assert.equal(recovered.index.status, 'ready');
    assert.equal(recovered.index.embeddedBlockVectors, 2);
    assert.equal(recoveringEmbedder.counts.documentInputs, 2);

    const restartedEmbedder = countingEmbedder();
    const restarted = createProductionSemanticIndex({ directory, embedder:restartedEmbedder });
    const result = await restarted.retrieve(document.cid, 'beta question');
    assert.equal(result.blocks[0].id, 'beta');
    assert.equal(restartedEmbedder.counts.documentInputs, 0);
  });
});

test('publishDelta creates a new root and embeds only new immutable block CIDs', async () => {
  await withTempStore(async (directory) => {
    const embedder = countingEmbedder();
    const index = createProductionSemanticIndex({ directory, embedder });

    const first = await index.publishContext([
      { id:'alpha', text:'alpha durable object' },
      { id:'beta', text:'beta durable object' }
    ]);
    assert.equal(embedder.counts.documentInputs, 2);

    const second = await index.publishDelta(first.cid, [
      { op:'upsert', id:'gamma', text:'gamma durable object' }
    ]);
    assert.notEqual(second.cid, first.cid);
    assert.equal(second.parentCid, first.cid);
    assert.equal(second.reusedParentRoot, true);
    assert.equal(second.index.embeddedBlockVectors, 1);
    assert.equal(second.index.reusedBlockVectors, 2);
    assert.equal(embedder.counts.documentInputs, 3);

    const oldResult = await index.retrieve(first.cid, 'beta question');
    const newResult = await index.retrieve(second.cid, 'gamma question');
    assert.equal(oldResult.blocks[0].id, 'beta');
    assert.equal(newResult.blocks[0].id, 'gamma');
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
