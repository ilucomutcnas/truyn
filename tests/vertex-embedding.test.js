import test from 'node:test';
import assert from 'node:assert/strict';
import { createVertexEmbeddingClient } from '../adapters/providers/vertex-embedding.js';

test('Vertex embedding executes Gemini single-input batches with bounded concurrency and preserves order', async () => {
  let active = 0;
  let peak = 0;
  const seen = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    const content = body.instances[0].content;
    seen.push(content);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return {
      ok:true,
      status:200,
      async text() {
        return JSON.stringify({ predictions:[{ embeddings:{ values:[Number(content.slice(1)), 1] } }] });
      }
    };
  };
  const client = createVertexEmbeddingClient({
    projectId:'project-test',
    model:'gemini-embedding-001',
    endpoint:'https://example.invalid',
    accessTokenProvider:async () => 'token',
    batchConcurrency:4,
    fetchImpl
  });
  const vectors = await client.embedMany(['q0','q1','q2','q3','q4','q5','q6','q7']);
  assert.deepEqual(vectors.map((vector) => vector[0]), [0,1,2,3,4,5,6,7]);
  assert.ok(peak > 1, `expected concurrent requests, peak=${peak}`);
  assert.ok(peak <= 4, `expected bounded concurrency <=4, peak=${peak}`);
  assert.equal(seen.length, 8);
  assert.equal(client.stats().requests, 8);
  assert.equal(client.stats().inputs, 8);
  assert.equal(client.stats().effectiveBatchSize, 1);
  assert.equal(client.stats().batchConcurrency, 4);
});

test('Vertex embedding rejects unsafe batch concurrency', () => {
  assert.throws(() => createVertexEmbeddingClient({
    projectId:'project-test',
    batchConcurrency:17,
    accessTokenProvider:async () => 'token'
  }), /batchConcurrency must be 1\.\.16/);
});
