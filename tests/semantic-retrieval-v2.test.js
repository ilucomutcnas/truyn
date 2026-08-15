import test from 'node:test';
import assert from 'node:assert/strict';
import { createSemanticContextRouterV2, CONTEXT_RETRIEVAL_ALGORITHM_V2 } from '../core/context/semantic-router-v2.js';
import { contextQueryHash, verifyContextSelection } from '../core/context/index.js';

function mockEmbedder() {
  const vectors = new Map([
    ['aircraft maintenance rule before handoff', [1,0,0]],
    ['payment clearing rule after handoff', [0,1,0]],
    ['飞机保养流程在移交前适用哪个规则？', [1,0,0]],
    ['uluslararası fon mutabakatı devir sonrası hangi kurala tabidir?', [0,1,0]],
    ['cold chain quarantine', [0,0,1]],
    ['temperature-controlled delivery suspect lot isolation', [0,0,1]]
  ]);
  return {
    async embedMany(texts) {
      return texts.map((text) => vectors.get(text) || [0.01,0.01,0.01]);
    }
  };
}

test('semantic router v2 resolves cross-language and synonym-only meaning while preserving CID provenance', async () => {
  const router = createSemanticContextRouterV2({ embedder:mockEmbedder(), lexicalTieBreakWeight:0 });
  const context = router.putContext([
    { id:'block-a', text:'aircraft maintenance rule before handoff' },
    { id:'block-b', text:'payment clearing rule after handoff' },
    { id:'block-c', text:'cold chain quarantine' }
  ]);

  const chinese = '飞机保养流程在移交前适用哪个规则？';
  const chineseResult = await router.retrieve(context.cid, chinese, { topK:1 });
  assert.equal(chineseResult.retrieval.algorithm, CONTEXT_RETRIEVAL_ALGORITHM_V2);
  assert.equal(chineseResult.retrieval.queryHash, contextQueryHash(chinese));
  assert.equal(chineseResult.retrieval.rootCid, context.cid);
  assert.equal(chineseResult.retrieval.manifestCid, context.cid);
  assert.equal(chineseResult.blocks[0].id, 'block-a');
  assert.equal(chineseResult.retrieval.selected[0].cid, chineseResult.blocks[0].cid);
  assert.equal(chineseResult.retrieval.selected[0].rank, 1);
  assert.equal(verifyContextSelection(router.manifest(context.cid), chineseResult.blocks, context.cid).ok, true);

  const turkish = 'uluslararası fon mutabakatı devir sonrası hangi kurala tabidir?';
  const turkishResult = await router.retrieve(context.cid, turkish, { topK:1 });
  assert.equal(turkishResult.blocks[0].id, 'block-b');

  const synonymOnly = 'temperature-controlled delivery suspect lot isolation';
  const synonymResult = await router.retrieve(context.cid, synonymOnly, { topK:1 });
  assert.equal(synonymResult.blocks[0].id, 'block-c');
});

test('semantic router v2 caches document vectors by immutable block CID', async () => {
  let embeddedDocumentInputs = 0;
  const embedder = {
    async embedMany(texts, { taskType } = {}) {
      if (taskType === 'RETRIEVAL_DOCUMENT') embeddedDocumentInputs += texts.length;
      return texts.map((text) => text.includes('alpha') ? [1,0] : [0,1]);
    }
  };
  const router = createSemanticContextRouterV2({ embedder, lexicalTieBreakWeight:0 });
  const context = router.putContext([
    { id:'alpha', text:'alpha context' },
    { id:'beta', text:'beta context' }
  ]);
  await router.retrieve(context.cid, 'alpha question', { topK:1 });
  await router.retrieve(context.cid, 'beta question', { topK:1 });
  assert.equal(embeddedDocumentInputs, 2);
  assert.equal(router.stats().cachedBlockVectors, 2);
  assert.equal(router.stats().cachedQueryVectors, 2);
});
