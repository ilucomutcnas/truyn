import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfidenceGatedSemanticReranker } from '../core/context/confidence-gated-semantic-reranker.js';

function provider(alias, seenLengths) {
  return {
    async execute(request) {
      const payload = JSON.parse(request.input.context);
      if (seenLengths) seenLengths.push(payload.length);
      return {
        output:JSON.stringify({ id:alias }),
        metadata:{ usage:{ promptTokenCount:1, candidatesTokenCount:1, totalTokenCount:2 } }
      };
    }
  };
}

const makeCandidates = (n) => Array.from({ length:n }, (_, index) => ({ id:`real-${index}`, text:`passage ${index}` }));

test('tiered fallback chooses the smallest configured dense prefix containing both cheap selections', async () => {
  const verifierLengths = [];
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:provider('c1'),
    flashProvider:provider('c3'),
    verifierProvider:provider('c2', verifierLengths),
    cheapCandidateK:24,
    confidenceDenseRankMax:13,
    maxCandidates:52,
    verifierCandidateTiers:[4,8,16,52]
  });
  const result = await reranker.rerank('query', makeCandidates(52));
  assert.equal(result.id, 'real-2');
  assert.equal(result.metadata.verifierCandidateK, 4);
  assert.deepEqual(verifierLengths, [4]);
  assert.deepEqual(reranker.stats().verifierTierCounts, { 4:1 });
});

test('tiered fallback expands to the final fail-closed tier for deep cheap selections', async () => {
  const verifierLengths = [];
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:provider('cn'),
    flashProvider:provider('cm'),
    verifierProvider:provider('c1', verifierLengths),
    cheapCandidateK:24,
    confidenceDenseRankMax:13,
    maxCandidates:52,
    verifierCandidateTiers:[4,8,16,52]
  });
  const result = await reranker.rerank('query', makeCandidates(52));
  assert.equal(result.id, 'real-1');
  assert.equal(result.metadata.verifierCandidateK, 52);
  assert.deepEqual(verifierLengths, [52]);
  assert.deepEqual(reranker.stats().verifierTierCounts, { 52:1 });
});
