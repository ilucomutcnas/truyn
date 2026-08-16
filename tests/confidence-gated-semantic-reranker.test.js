import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfidenceGatedSemanticReranker } from '../core/context/confidence-gated-semantic-reranker.js';

function providerReturning(alias, calls, key) {
  return {
    async execute(request) {
      calls[key] = (calls[key] || 0) + 1;
      const payload = JSON.parse(request.input.context);
      assert.ok(payload.every((item) => /^c[0-9a-z]+$/.test(item.id)));
      assert.doesNotMatch(request.input.context, /semantic-record-|candidate-real-/);
      return {
        output:JSON.stringify({ id:alias }),
        metadata:{
          usage:{ promptTokenCount:10, candidatesTokenCount:2, totalTokenCount:12 },
          providerRequestBodyBytes:100,
          providerLatencyMs:5
        }
      };
    }
  };
}

const candidates = (n = 16) => Array.from({ length:n }, (_, i) => ({
  id:`candidate-real-${i}`,
  text:`passage ${i}`
}));

const withoutStability = { stabilityRecheckDenseRanks:null };

test('accepts independent cheap agreement only inside dense confidence rank', async () => {
  const calls = {};
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:providerReturning('c1', calls, 'lite'),
    flashProvider:providerReturning('c1', calls, 'flash'),
    verifierProvider:providerReturning('c0', calls, 'verifier'),
    cheapCandidateK:16,
    confidenceDenseRankMax:12,
    maxCandidates:16,
    ...withoutStability
  });
  const result = await reranker.rerank('query', candidates());
  assert.equal(result.id, 'candidate-real-1');
  assert.equal(result.metadata.routeMode, 'cheap_confident');
  assert.equal(result.metadata.agreedDenseRank, 2);
  assert.equal(calls.verifier || 0, 0);
  assert.equal(reranker.stats().cheapAccepted, 1);
});

test('falls back to strong verifier when cheap judges disagree', async () => {
  const calls = {};
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:providerReturning('c1', calls, 'lite'),
    flashProvider:providerReturning('c2', calls, 'flash'),
    verifierProvider:providerReturning('c4', calls, 'verifier'),
    cheapCandidateK:16,
    confidenceDenseRankMax:12,
    maxCandidates:16,
    ...withoutStability
  });
  const result = await reranker.rerank('query', candidates());
  assert.equal(result.id, 'candidate-real-4');
  assert.equal(result.metadata.routeMode, 'verifier_fallback');
  assert.equal(result.metadata.cheapAgreement, false);
  assert.equal(calls.verifier, 1);
  assert.equal(reranker.stats().cheapDisagreements, 1);
});

test('falls back when cheap consensus is beyond dense confidence boundary', async () => {
  const calls = {};
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:providerReturning('cc', calls, 'lite'),
    flashProvider:providerReturning('cc', calls, 'flash'),
    verifierProvider:providerReturning('c9', calls, 'verifier'),
    cheapCandidateK:16,
    confidenceDenseRankMax:12,
    maxCandidates:16,
    ...withoutStability
  });
  const result = await reranker.rerank('query', candidates());
  assert.equal(result.id, 'candidate-real-9');
  assert.equal(result.metadata.routeMode, 'verifier_fallback');
  assert.equal(result.metadata.cheapAgreement, true);
  assert.equal(result.metadata.agreedDenseRank, 13);
  assert.equal(calls.verifier, 1);
  assert.equal(reranker.stats().lowDenseConfidence, 1);
});

test('aggregates usage and keeps real routing identifiers out of every provider call', async () => {
  const visible = [];
  const make = (alias) => ({
    async execute(request) {
      visible.push(`${request.input.task}\n${request.input.context}`);
      return { output:JSON.stringify({ id:alias }), metadata:{ usage:{ promptTokenCount:7, candidatesTokenCount:3, totalTokenCount:10 }, providerRequestBodyBytes:50, providerLatencyMs:4 } };
    }
  });
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:make('c0'),
    flashProvider:make('c1'),
    verifierProvider:make('c2'),
    cheapCandidateK:4,
    confidenceDenseRankMax:2,
    maxCandidates:4,
    ...withoutStability
  });
  const result = await reranker.rerank('query', [
    { id:'semantic-record-private-a', text:'a' },
    { id:'semantic-record-private-b', text:'b' },
    { id:'semantic-record-private-c', text:'c' },
    { id:'semantic-record-private-d', text:'d' }
  ]);
  assert.equal(result.id, 'semantic-record-private-c');
  assert.deepEqual(result.metadata.usage, { input:21, output:9, total:30 });
  assert.equal(result.metadata.providerRequestBodyBytes, 150);
  assert.equal(result.metadata.providerLatencyMs, 12);
  assert.equal(visible.length, 3);
  for (const text of visible) assert.doesNotMatch(text, /semantic-record-private/);
});
