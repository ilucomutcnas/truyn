import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderSemanticProjector } from '../core/context/provider-semantic-projector.js';
import { createSemanticContextRouterV2 } from '../core/context/semantic-router-v2.js';

function metadata() {
  return {
    usage:{ promptTokenCount:20, candidatesTokenCount:12, totalTokenCount:32 },
    providerRequestBodyBytes:250,
    providerLatencyMs:14
  };
}

test('provider semantic projector emits all configured language variants and tracks usage', async () => {
  const provider = {
    async execute(request) {
      assert.equal(request.capability, 'reasoning.general');
      assert.ok(request.input.task.includes('Do not answer the query'));
      return {
        output:JSON.stringify({ variants:{ en:'after approval', zh:'正式批准后', tr:'resmi onaydan sonra' } }),
        metadata:metadata()
      };
    }
  };
  const projector = createProviderSemanticProjector({ provider });
  const result = await projector.project('resmi onaydan sonra');
  assert.deepEqual(result.variants, ['resmi onaydan sonra','after approval','正式批准后']);
  assert.deepEqual(result.metadata.usage, { input:20, output:12, total:32 });
  assert.equal(projector.stats().requests, 1);
  assert.equal(projector.stats().formatFailures, 0);
  assert.deepEqual(projector.stats().languages, ['en','zh','tr']);
});

test('provider semantic projector accepts fenced JSON, top-level language fields and safe language aliases', async () => {
  const outputs = [
    '```json\n{"variants":{"English":"after approval","Simplified Chinese":"正式批准后","Turkish":"resmi onaydan sonra"}}\n```',
    'Projection:\n{"en":"after approval","Chinese":"正式批准后","tr":"resmi onaydan sonra"}\nDone.',
    JSON.stringify({ queries:[
      { language:'English', text:'after approval' },
      { language:'zh-Hans', query:'正式批准后' },
      { language:'Turkish', value:'resmi onaydan sonra' }
    ] })
  ];

  for (const output of outputs) {
    const projector = createProviderSemanticProjector({
      provider:{ async execute() { return { output, metadata:metadata() }; } },
      repairAttempts:0
    });
    const result = await projector.project('resmi onaydan sonra');
    assert.deepEqual(result.variants, ['resmi onaydan sonra','after approval','正式批准后']);
    assert.equal(projector.stats().formatFailures, 0);
  }
});

test('provider semantic projector still rejects incomplete language projections and counts the format failure', async () => {
  const projector = createProviderSemanticProjector({
    provider:{
      async execute() {
        return {
          output:'```json\n{"variants":{"en":"after approval","tr":"resmi onaydan sonra"}}\n```',
          metadata:metadata()
        };
      }
    },
    repairAttempts:0
  });
  await assert.rejects(projector.project('resmi onaydan sonra'), /no valid multilingual projection/);
  assert.equal(projector.stats().formatFailures, 1);
});

test('semantic router scores each block against all projected query variants while preserving original query hash provenance', async () => {
  const vectorByText = new Map([
    ['Türkçe özgün soru', [0,1]],
    ['english projection', [1,0]],
    ['中文投影', [0.8,0.2]],
    ['target chinese block', [1,0]],
    ['distractor block', [0.1,0.99]]
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

test('semantic fusion can resist one spurious projection and exposes local fusion diagnostics', async () => {
  const vectorByText = new Map([
    ['original query', [1,0]],
    ['projection one', [0,1]],
    ['projection two', [0,1]],
    ['distractor block', [1,0]],
    ['target block', [0.2,0.98]]
  ]);
  const embedder = {
    async embedMany(texts) { return texts.map((text) => vectorByText.get(text)); }
  };
  const queryProjector = {
    name:'fusion-projector',
    async project() { return { variants:['projection one','projection two'], metadata:null }; }
  };
  const router = createSemanticContextRouterV2({
    embedder,
    queryProjector,
    candidateK:2,
    fusionStrategy:'mean',
    diagnosticFusion:true
  });
  const context = router.putContext([
    { id:'a-distractor', text:'distractor block' },
    { id:'z-target', text:'target block' }
  ]);
  const result = await router.retrieve(context.cid, 'original query');
  assert.equal(result.blocks[0].id, 'z-target');
  assert.equal(result.retrieval.fusionStrategy, 'mean');
  assert.equal(result.retrieval.fusionDiagnostics.topByStrategy.max[0].id, 'a-distractor');
  assert.equal(result.retrieval.fusionDiagnostics.topByStrategy.mean[0].id, 'z-target');
  assert.equal(result.retrieval.fusionDiagnostics.topByStrategy.consensus[0].id, 'z-target');
  assert.equal(result.retrieval.fusionDiagnostics.topByStrategy.borda[0].id, 'z-target');
});
