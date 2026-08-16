import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySemanticIndexStore } from '../core/context/semantic-index-store.js';
import { createProductionSemanticIndex } from '../core/context/production-semantic-index.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function delayedCountingEmbedder(ms = 15) {
  const counts = { calls:0, documentCalls:0, documentInputs:0, queryCalls:0, queryInputs:0 };
  const token = (text) => {
    if (/alpha/i.test(text)) return [1,0,0,0];
    if (/beta/i.test(text)) return [0,1,0,0];
    if (/gamma/i.test(text)) return [0,0,1,0];
    return [0,0,0,1];
  };
  return {
    counts,
    async embedMany(texts, { taskType } = {}) {
      counts.calls += 1;
      if (taskType === 'RETRIEVAL_DOCUMENT') {
        counts.documentCalls += 1;
        counts.documentInputs += texts.length;
      }
      if (taskType === 'RETRIEVAL_QUERY') {
        counts.queryCalls += 1;
        counts.queryInputs += texts.length;
      }
      await delay(ms);
      return texts.map(token);
    }
  };
}

function delayedCountingReranker(ms = 20) {
  const counts = { calls:0, candidateInputs:0 };
  return {
    name:'delayed-counting-reranker',
    counts,
    async rerank(_query, candidates) {
      counts.calls += 1;
      counts.candidateInputs += candidates.length;
      await delay(ms);
      return { id:candidates[0].id, metadata:{ deterministic:true } };
    },
    stats() { return { ...counts }; }
  };
}

async function preparedStore() {
  const store = createMemorySemanticIndexStore();
  const producerEmbedder = delayedCountingEmbedder(0);
  const producer = createProductionSemanticIndex({
    embedder:producerEmbedder,
    indexStore:store,
    singleFlight:true
  });
  const first = await producer.publishContext([
    { id:'alpha', text:'alpha primary record' },
    { id:'beta', text:'beta primary record' },
    { id:'shared', text:'shared neutral record' }
  ]);
  const second = await producer.publishContext([
    { id:'alpha-2', text:'alpha alternate root record' },
    { id:'gamma', text:'gamma primary record' },
    { id:'shared', text:'shared neutral record' }
  ]);
  return { store, first, second, producerEmbedder };
}

test('100 simultaneous identical retrievals share one cold root load, query embedding and reranker call', async () => {
  const { store, first } = await preparedStore();
  const embedder = delayedCountingEmbedder();
  const reranker = delayedCountingReranker();
  const consumer = createProductionSemanticIndex({
    embedder,
    reranker,
    indexStore:store,
    singleFlight:true
  });

  const results = await Promise.all(Array.from({ length:100 }, () =>
    consumer.retrieve(first.cid, 'alpha question', { topK:1 })
  ));

  assert.equal(results.length, 100);
  assert.equal(results.every((result) => result.blocks[0].id === 'alpha'), true);
  assert.equal(embedder.counts.documentInputs, 0, 'prepared index must never be rebuilt');
  assert.equal(embedder.counts.queryCalls, 1, 'identical query embedding must be paid once');
  assert.equal(embedder.counts.queryInputs, 1);
  assert.equal(reranker.counts.calls, 1, 'identical same-root rerank must be paid once');

  const stats = consumer.stats();
  assert.equal(stats.concurrency.retrievalRequests, 100);
  assert.equal(stats.concurrency.retrievalFlightLeaders, 1);
  assert.equal(stats.concurrency.retrievalFlightFollowers, 99);
  assert.equal(stats.concurrency.rootWarmLeaders, 1);
  assert.equal(stats.concurrency.rootWarmFollowers, 0);
  assert.equal(stats.concurrency.retrievalFlights, 0);
  assert.equal(stats.concurrency.queryLanes, 0);
});

test('same query across multiple roots shares query embedding but reranks once per distinct root', async () => {
  const { store, first, second } = await preparedStore();
  const embedder = delayedCountingEmbedder();
  const reranker = delayedCountingReranker();
  const consumer = createProductionSemanticIndex({ embedder, reranker, indexStore:store, singleFlight:true });

  const requests = [];
  for (let index = 0; index < 70; index += 1) {
    requests.push(consumer.retrieve(index % 2 === 0 ? first.cid : second.cid, 'alpha question', { topK:1 }));
  }
  const results = await Promise.all(requests);

  assert.equal(results.length, 70);
  assert.equal(embedder.counts.documentInputs, 0);
  assert.equal(embedder.counts.queryCalls, 1, 'same question must populate the shared query cache once across roots');
  assert.equal(reranker.counts.calls, 2, 'candidate sets differ, so one paid rerank per root is required');

  const stats = consumer.stats().concurrency;
  assert.equal(stats.retrievalFlightLeaders, 2);
  assert.equal(stats.retrievalFlightFollowers, 68);
  assert.equal(stats.queryLaneLeaders + stats.queryLaneFollowers, 2);
});

test('concurrent unique semantic work is not incorrectly coalesced', async () => {
  const { store, first } = await preparedStore();
  const embedder = delayedCountingEmbedder();
  const reranker = delayedCountingReranker();
  const consumer = createProductionSemanticIndex({ embedder, reranker, indexStore:store, singleFlight:true });

  const queries = ['alpha question', 'beta question', 'gamma question'];
  const results = await Promise.all(queries.flatMap((query) =>
    Array.from({ length:20 }, () => consumer.retrieve(first.cid, query, { topK:1 }))
  ));

  assert.equal(results.length, 60);
  assert.equal(embedder.counts.documentInputs, 0);
  assert.equal(embedder.counts.queryCalls, 3, 'three unique questions require three query embeddings');
  assert.equal(reranker.counts.calls, 3, 'three unique same-root retrievals require three reranks');
  const stats = consumer.stats().concurrency;
  assert.equal(stats.retrievalFlightLeaders, 3);
  assert.equal(stats.retrievalFlightFollowers, 57);
});
