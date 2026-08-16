import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProductionSemanticIndex } from '../core/context/production-semantic-index.js';

function countingEmbedder() {
  const counts = { documentInputs:0, queryInputs:0 };
  const vector = (text) => {
    const match = String(text).match(/asset-(\d+)/i);
    const value = Number(match?.[1] || 0);
    return [1, (value % 17) / 17, (value % 31) / 31, (value % 47) / 47];
  };
  return {
    counts,
    async embedMany(texts, { taskType } = {}) {
      if (taskType === 'RETRIEVAL_DOCUMENT') counts.documentInputs += texts.length;
      if (taskType === 'RETRIEVAL_QUERY') counts.queryInputs += texts.length;
      return texts.map(vector);
    }
  };
}

async function withTempStore(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'truyn-sharded-semantic-'));
  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive:true, force:true });
  }
}

test('sharded semantic store persists many immutable vectors in bounded shard files', async () => {
  await withTempStore(async (directory) => {
    const embedder = countingEmbedder();
    const index = createProductionSemanticIndex({
      directory,
      embedder,
      storeKind:'sharded-file',
      shardPrefixLength:1,
      candidateK:8
    });
    const blocks = Array.from({ length:128 }, (_, index) => ({
      id:`record-${String(index).padStart(3, '0')}`,
      text:`asset-${index} canonical semantic object`
    }));
    const published = await index.publishContext(blocks);
    assert.equal(published.index.status, 'ready');
    assert.equal(embedder.counts.documentInputs, 128);
    const shardFiles = await readdir(path.join(directory, 'vector-shards'));
    assert.ok(shardFiles.length > 0);
    assert.ok(shardFiles.length <= 16);
    assert.ok(shardFiles.length < blocks.length);
    assert.equal(index.indexStore.stats().kind, 'sharded-file');
    assert.equal(index.indexStore.stats().vectorWrites, 128);
  });
});

test('sharded production index cold-loads and incrementally reuses immutable vectors', async () => {
  await withTempStore(async (directory) => {
    const firstEmbedder = countingEmbedder();
    const first = createProductionSemanticIndex({
      directory,
      embedder:firstEmbedder,
      storeKind:'sharded-file',
      shardPrefixLength:1,
      candidateK:8
    });
    const root = await first.publishContext([
      { id:'a', text:'asset-11 canonical alpha object' },
      { id:'b', text:'asset-22 canonical beta object' },
      { id:'c', text:'asset-33 canonical gamma object' }
    ]);
    assert.equal(firstEmbedder.counts.documentInputs, 3);

    const coldEmbedder = countingEmbedder();
    const cold = createProductionSemanticIndex({
      directory,
      embedder:coldEmbedder,
      storeKind:'sharded-file',
      shardPrefixLength:1,
      candidateK:8
    });
    const result = await cold.retrieve(root.cid, 'What applies to asset-22?');
    assert.equal(result.blocks[0].id, 'b');
    assert.equal(coldEmbedder.counts.documentInputs, 0);
    assert.equal(cold.stats().lifecycle.persistedVectorLoads, 3);

    const child = await cold.publishDelta(root.cid, [
      { op:'upsert', id:'d', text:'asset-44 canonical delta object' }
    ]);
    assert.equal(child.index.embeddedBlockVectors, 1);
    assert.equal(child.index.reusedBlockVectors, 3);
    assert.equal(coldEmbedder.counts.documentInputs, 1);
    assert.equal((await cold.retrieve(root.cid, 'What applies to asset-11?')).blocks[0].id, 'a');
    assert.equal((await cold.retrieve(child.cid, 'What applies to asset-44?')).blocks[0].id, 'd');
  });
});
