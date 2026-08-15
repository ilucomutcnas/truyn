import test from 'node:test';
import assert from 'node:assert/strict';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';

function fakeResponse(body = {}) {
  return {
    ok: true,
    headers: { get: () => 'request-test' },
    async json() {
      return {
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1, totalTokenCount: 11 },
        ...body
      };
    }
  };
}

test('Vertex Gemini applies signed thinkingBudget provider option without leaking it into prompt policy text', async () => {
  let captured;
  const provider = createVertexGeminiProvider({
    projectId: 'project-test',
    location: 'global',
    model: 'gemini-2.5-flash',
    accessTokenProvider: async () => 'token-test',
    fetchImpl: async (_url, options) => {
      captured = JSON.parse(options.body);
      return fakeResponse();
    }
  });
  const result = await provider.execute({
    capability: 'review',
    input: { task: 'Return exact value' },
    policy: { benchmark: 'semantic', providerOptions: { thinkingBudget: 0 } }
  });
  assert.equal(captured.generationConfig.thinkingConfig.thinkingBudget, 0);
  const prompt = captured.contents[0].parts[0].text;
  assert.match(prompt, /semantic/);
  assert.doesNotMatch(prompt, /thinkingBudget|providerOptions/);
  assert.equal(result.metadata.thinkingBudget, 0);
});

test('Vertex Gemini leaves thinking configuration on provider default when option is absent', async () => {
  let captured;
  const provider = createVertexGeminiProvider({
    projectId: 'project-test',
    accessTokenProvider: async () => 'token-test',
    fetchImpl: async (_url, options) => {
      captured = JSON.parse(options.body);
      return fakeResponse();
    }
  });
  const result = await provider.execute({ capability: 'review', input: 'x', policy: { benchmark: 'default' } });
  assert.equal(captured.generationConfig, undefined);
  assert.equal(result.metadata.thinkingBudget, null);
});

test('Vertex Gemini rejects invalid thinkingBudget before provider request', async () => {
  const provider = createVertexGeminiProvider({
    projectId: 'project-test',
    accessTokenProvider: async () => 'token-test',
    fetchImpl: async () => { throw new Error('fetch should not run'); }
  });
  await assert.rejects(
    provider.execute({ capability: 'review', input: 'x', policy: { providerOptions: { thinkingBudget: -2 } } }),
    /thinkingBudget must be an integer >= -1/
  );
});
