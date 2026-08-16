import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfidenceGatedSemanticReranker } from '../core/context/confidence-gated-semantic-reranker.js';

function sequenceProvider(aliases, seen = []) {
  let index = 0;
  return {
    async execute(request) {
      const payload = JSON.parse(request.input.context);
      seen.push(payload.map((item) => item.text));
      const alias = aliases[Math.min(index++, aliases.length - 1)];
      return {
        output:JSON.stringify({ id:alias }),
        metadata:{
          usage:{ promptTokenCount:1, candidatesTokenCount:1, totalTokenCount:2 },
          providerRequestBodyBytes:10,
          providerLatencyMs:1
        }
      };
    }
  };
}

const candidates = Array.from({ length:4 }, (_, index) => ({ id:`real-${index}`, text:`passage ${index}` }));

test('rank-2 cheap agreement is accepted only when reversed-order recheck resolves to the same original passage', async () => {
  const liteSeen = [];
  const flashSeen = [];
  const verifierSeen = [];
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:sequenceProvider(['c1','c2'], liteSeen),
    flashProvider:sequenceProvider(['c1','c2'], flashSeen),
    verifierProvider:sequenceProvider(['c0'], verifierSeen),
    cheapCandidateK:4,
    confidenceDenseRankMax:3,
    maxCandidates:4,
    verifierCandidateTiers:[4],
    stabilityRecheckDenseRanks:[2]
  });

  const result = await reranker.rerank('query', candidates);
  assert.equal(result.id, 'real-1');
  assert.equal(result.metadata.routeMode, 'cheap_stable');
  assert.equal(result.metadata.stabilityChecked, true);
  assert.equal(result.metadata.stabilityPassed, true);
  assert.deepEqual(liteSeen[1], ['passage 3','passage 2','passage 1','passage 0']);
  assert.deepEqual(flashSeen[1], ['passage 3','passage 2','passage 1','passage 0']);
  assert.equal(verifierSeen.length, 0);
  assert.equal(reranker.stats().stabilityRechecks, 1);
  assert.equal(reranker.stats().stabilityFailures, 0);
});

test('unstable rank-2 cheap agreement fails closed to verifier', async () => {
  const verifierSeen = [];
  const reranker = createConfidenceGatedSemanticReranker({
    liteProvider:sequenceProvider(['c1','c2']),
    flashProvider:sequenceProvider(['c1','c3']),
    verifierProvider:sequenceProvider(['c1'], verifierSeen),
    cheapCandidateK:4,
    confidenceDenseRankMax:3,
    maxCandidates:4,
    verifierCandidateTiers:[4],
    stabilityRecheckDenseRanks:[2]
  });

  const result = await reranker.rerank('query', candidates);
  assert.equal(result.id, 'real-1');
  assert.equal(result.metadata.routeMode, 'stability_verifier_fallback');
  assert.equal(result.metadata.stabilityChecked, true);
  assert.equal(result.metadata.stabilityPassed, false);
  assert.equal(result.metadata.verifierCandidateK, 4);
  assert.equal(verifierSeen.length, 1);
  assert.equal(reranker.stats().stabilityRechecks, 1);
  assert.equal(reranker.stats().stabilityFailures, 1);
  assert.equal(reranker.stats().verifierFallbacks, 1);
});
