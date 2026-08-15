import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderSemanticReranker } from '../core/context/provider-semantic-reranker.js';
import { createSemanticContextRouterV2 } from '../core/context/semantic-router-v2.js';

test('provider semantic reranker returns only a candidate id and tracks usage', async () => {
  const provider = {
    async execute(request) {
      assert.equal(request.capability, 'reasoning.general');
      assert.ok(request.input.context.includes('candidate-b'));
      return {
        output: '{"id":"candidate-b"}',
        metadata: {
          usage: { promptTokenCount: 21, candidatesTokenCount: 5, totalTokenCount: 26 },
          providerRequestBodyBytes: 321,
          providerLatencyMs: 12
        }
      };
    }
  };
  const reranker = createProviderSemanticReranker({ provider });
  const result = await reranker.rerank('which rule applies after approval?', [
    { id:'candidate-a', text:'rule before approval' },
    { id:'candidate-b', text:'rule after approval' }
  ]);
  assert.equal(result.id, 'candidate-b');
  assert.deepEqual(result.metadata.usage, { input:21, output:5, total:26 });
  assert.equal(result.metadata.repairAttemptsUsed, 0);
  assert.equal(reranker.stats().requests, 1);
  assert.equal(reranker.stats().repairs, 0);
});

test('provider semantic reranker repairs placeholder or invented ids and counts both calls', async () => {
  let calls = 0;
  const provider = {
    async execute() {
      calls += 1;
      return calls === 1
        ? {
            output:'{"id":"<candidate id>"}',
            metadata:{
              usage:{ promptTokenCount:10, candidatesTokenCount:3, totalTokenCount:13 },
              providerRequestBodyBytes:100,
              providerLatencyMs:7
            }
          }
        : {
            output:'{"id":"candidate-b"}',
            metadata:{
              usage:{ promptTokenCount:11, candidatesTokenCount:2, totalTokenCount:13 },
              providerRequestBodyBytes:110,
              providerLatencyMs:8
            }
          };
    }
  };
  const reranker = createProviderSemanticReranker({ provider, repairAttempts:1 });
  const result = await reranker.rerank('after approval?', [
    { id:'candidate-a', text:'before approval' },
    { id:'candidate-b', text:'after approval' }
  ]);
  assert.equal(result.id, 'candidate-b');
  assert.equal(result.metadata.repairAttemptsUsed, 1);
  assert.deepEqual(result.metadata.usage, { input:21, output:5, total:26 });
  assert.equal(result.metadata.providerRequestBodyBytes, 210);
  assert.equal(result.metadata.providerLatencyMs, 15);
  assert.equal(reranker.stats().requests, 2);
  assert.equal(reranker.stats().repairs, 1);
});

test('semantic router reranks only dense candidates and preserves selected block provenance', async () => {
  const vectorByText = new Map([
    ['target passage', [1,0]],
    ['near duplicate', [0.99,0.01]],
    ['query', [1,0]]
  ]);
  const embedder = {
    async embedMany(texts) { return texts.map((text) => vectorByText.get(text)); }
  };
  const reranker = {
    name:'test-reranker',
    async rerank(_query, candidates) {
      assert.equal(candidates.length, 2);
      return { id:'target' };
    }
  };
  const router = createSemanticContextRouterV2({ embedder, reranker, candidateK:2 });
  const context = router.putContext([
    { id:'near', text:'near duplicate' },
    { id:'target', text:'target passage' }
  ]);
  const result = await router.retrieve(context.cid, 'query');
  assert.equal(result.blocks[0].id, 'target');
  assert.equal(result.retrieval.reranked, true);
  assert.equal(result.retrieval.reranker, 'test-reranker');
  assert.equal(result.retrieval.selected[0].cid, result.blocks[0].cid);
  assert.equal(result.retrieval.selected[0].rank, 1);
});