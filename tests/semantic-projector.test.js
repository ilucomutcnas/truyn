import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderSemanticProjector } from '../core/context/provider-semantic-projector.js';
import { createSemanticContextRouterV2 } from '../core/context/semantic-router-v2.js';

test('provider semantic projector emits all configured language variants and tracks usage', async () => {
  const provider = {
    async execute(request) {
      assert.equal(request.capability, 'reasoning.general');
      assert.ok(request.input.task.includes('Do not answer the query'));
      return {
        output:JSON.stringify({ variants:{ en:'after approval', zh:'正式批准后', tr:'resmi onaydan sonra' } }),
        metadata:{
          usage:{ promptTokenCount:20, candidatesTokenCount:12, totalTokenCount:32 },
          providerRequestBodyBytes:250,
          providerLatencyMs:14
        }
      };
    }
  };
  const projector = createProviderSemanticProjector({ provider });
  const result = await projector.project('resmi onaydan sonra');
  assert.deepEqual(result.variants, ['resmi onaydan sonra','after approval','正式批准后']);
  assert.deepEqual(result.metadata.usage, { input:20, output:12, total:32 });
  assert.equal(projector.stats().requests, 1);
  assert.deepEqual(projector.stats().languages, ['en','zh','tr']);
});

test('semantic router scores each block against all projected query variants while preserving original query hash provenance', async () => {
  const vectorByText = new Map([
    ['Türkçe özgün soru', [0,1]],
    ['english projection', [1,0]],
    ['中文投影', [0.8,0.2]],
    ['target chinese block', [1,0]],
    ['distractor block', [0,1]]
  ]);
  const embedder = {
    async embedMany(texts) {
      return texts.map((text) => vectorByText.get(text));
    }
  };
  const queryProjector = {
    name:'test-projector',
    async project(query) {
      assert.equal(query, 'Türkçe özgün soru');
      return {
        variants:['english projection','中文投影'],
        metadata:{ usage:{ input:3, output:4, total:7 } }
      };
    },
    stats:() => ({ requests:1 })
  };
  const router = createSemanticContextRouterV2({ embedder, queryProjector, candidateK:2 });
  const context = router.putContext([
    { id:'target', text:'target chinese block' },
    { id:'distractor', text:'distractor block' }
  ]);
  const result = await router.retrieve(context.cid, 'Türkçe özgün soru');
  assert.equal(result.blocks[0].id, 'target');
  assert.equal(result.retrieval.queryProjected, true);
  assert.equal(result.retrieval.queryProjectionCount, 3);
  assert.equal(result.retrieval.queryProjector, 'test-projector');
  assert.equal(result.retrieval.queryHash.length > 10, true);
  assert.deepEqual(result.retrieval.projectorMetadata.usage, { input:3, output:4, total:7 });
  assert.equal(router.stats().cachedQueryProjections, 1);
  assert.equal(router.stats().cachedQueryVectors, 3);
});
