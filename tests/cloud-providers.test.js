import test from 'node:test';
import assert from 'node:assert/strict';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';
import { createProviderAdapter } from '../adapters/providers/index.js';

test('Azure OpenAI provider uses managed identity bearer auth and reports usage', async () => {
  const calls = [];
  const provider = createAzureOpenAIProvider({
    endpoint: 'https://example.openai.azure.com',
    model: 'gpt-test',
    capabilities: ['research'],
    accessTokenProvider: async () => 'azure-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: 'resp_test',
            model: 'gpt-test',
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'azure result' }] }],
            usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 }
          };
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'research', input: 'hello', policy: {} });
  assert.equal(result.output, 'azure result');
  assert.equal(result.metadata.provider, 'azure-openai');
  assert.equal(result.metadata.usage.total_tokens, 16);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.openai.azure.com/openai/v1/responses');
  assert.equal(calls[0].options.headers.authorization, 'Bearer azure-token');
});

test('Azure OpenAI provider uses api-key when explicitly configured', async () => {
  const provider = createAzureOpenAIProvider({
    endpoint: 'https://example.openai.azure.com',
    model: 'gpt-test',
    apiKey: 'secret-test-key',
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers['api-key'], 'secret-test-key');
      assert.equal(options.headers.authorization, undefined);
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: 'ok', model: 'gpt-test', usage: {} };
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'research', input: 'hello', policy: {} });
  assert.equal(result.output, 'ok');
});

test('Vertex Gemini provider calls generateContent and reports token metadata', async () => {
  const calls = [];
  const provider = createVertexGeminiProvider({
    projectId: 'truyn-test-project',
    location: 'us-central1',
    model: 'gemini-test',
    capabilities: ['review'],
    accessTokenProvider: async () => 'gcp-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'x-request-id' ? 'vertex-request' : null },
        async json() {
          return {
            candidates: [{ content: { parts: [{ text: 'gemini result' }] } }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5, totalTokenCount: 16 }
          };
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'review', input: { candidate: 'hello' }, policy: {} });
  assert.equal(result.output, 'gemini result');
  assert.equal(result.metadata.provider, 'vertex-gemini');
  assert.equal(result.metadata.usage.totalTokenCount, 16);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://aiplatform.googleapis.com/v1/projects/truyn-test-project/locations/us-central1/publishers/google/models/gemini-test:generateContent'
  );
  assert.equal(calls[0].options.headers.authorization, 'Bearer gcp-token');
});

test('Vertex Gemini converts non-JSON upstream failures into bounded provider errors', async () => {
  const provider = createVertexGeminiProvider({
    projectId:'truyn-test-project',
    location:'global',
    model:'gemini-test',
    accessTokenProvider:async () => 'gcp-token',
    fetchImpl:async () => ({
      ok:false,
      status:504,
      headers:{ get:() => null },
      async text() { return 'upstream request timeout'; }
    })
  });

  await assert.rejects(
    provider.execute({ capability:'reasoning.general', input:'hello', policy:{} }),
    (error) => {
      assert.equal(error instanceof SyntaxError, false);
      assert.match(error.message, /^Vertex AI HTTP 504: upstream request timeout$/);
      assert.doesNotMatch(error.message, /gcp-token|aiplatform\.googleapis\.com/);
      return true;
    }
  );
});

test('Vertex Gemini rejects a successful non-JSON response explicitly', async () => {
  const provider = createVertexGeminiProvider({
    projectId:'truyn-test-project',
    location:'global',
    model:'gemini-test',
    accessTokenProvider:async () => 'gcp-token',
    fetchImpl:async () => ({
      ok:true,
      status:200,
      headers:{ get:() => null },
      async text() { return 'not-json'; }
    })
  });

  await assert.rejects(
    provider.execute({ capability:'reasoning.general', input:'hello', policy:{} }),
    /Vertex AI HTTP 200: invalid non-JSON response/
  );
});

test('provider factory exposes cloud provider aliases', () => {
  const azure = createProviderAdapter('azure-openai', {
    endpoint: 'https://example.openai.azure.com',
    model: 'gpt-test',
    apiKey: 'x'
  });
  const gemini = createProviderAdapter('gemini', {
    projectId: 'project',
    location: 'global',
    model: 'gemini-test',
    accessTokenProvider: async () => 'x'
  });
  assert.equal(azure.name, 'azure-openai-responses');
  assert.equal(gemini.name, 'vertex-gemini-generate-content');
});
