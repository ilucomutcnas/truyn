import test from 'node:test';
import assert from 'node:assert/strict';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';

function fakeResponse(body = {}) {
  return {
    ok: true,
    status: 200,
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
  assert.equal(result.metadata.thinkingLevel, null);
});

test('Vertex Gemini applies Gemini 3 thinkingLevel provider option without leaking it into prompt policy text', async () => {
  let captured;
  const provider = createVertexGeminiProvider({
    projectId:'project-test',
    location:'global',
    model:'gemini-3-flash-preview',
    accessTokenProvider:async () => 'token-test',
    fetchImpl:async (_url, options) => {
      captured = JSON.parse(options.body);
      return fakeResponse();
    }
  });
  const result = await provider.execute({
    capability:'reasoning.general',
    input:{ task:'Choose one candidate' },
    policy:{ benchmark:'semantic-v2', providerOptions:{ thinkingLevel:'minimal' } }
  });
  assert.equal(captured.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
  const prompt = captured.contents[0].parts[0].text;
  assert.match(prompt, /semantic-v2/);
  assert.doesNotMatch(prompt, /thinkingLevel|providerOptions/);
  assert.equal(result.metadata.thinkingBudget, null);
  assert.equal(result.metadata.thinkingLevel, 'MINIMAL');
});

test('Vertex Gemini forwards structured output options only through generationConfig', async () => {
  let captured;
  const schema = {
    type:'OBJECT',
    properties:{ id:{ type:'STRING' } },
    required:['id']
  };
  const provider = createVertexGeminiProvider({
    projectId:'project-test',
    model:'gemini-3.1-pro-preview',
    accessTokenProvider:async () => 'token-test',
    fetchImpl:async (_url, options) => {
      captured = JSON.parse(options.body);
      return fakeResponse({ candidates:[{ content:{ parts:[{ text:'{"id":"candidate-a"}' }] } }] });
    }
  });
  const result = await provider.execute({
    capability:'reasoning.general',
    input:{ task:'Choose one id', context:'[]' },
    policy:{
      benchmark:'semantic-v2',
      providerOptions:{
        responseMimeType:'application/json',
        responseSchema:schema,
        maxOutputTokens:64,
        temperature:0
      }
    }
  });
  assert.equal(captured.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(captured.generationConfig.responseSchema, schema);
  assert.equal(captured.generationConfig.maxOutputTokens, 64);
  assert.equal(captured.generationConfig.temperature, 0);
  const prompt = captured.contents[0].parts[0].text;
  assert.match(prompt, /semantic-v2/);
  assert.doesNotMatch(prompt, /responseMimeType|responseSchema|maxOutputTokens|providerOptions/);
  assert.equal(result.output, '{"id":"candidate-a"}');
  assert.equal(result.metadata.responseMimeType, 'application/json');
  assert.equal(result.metadata.maxOutputTokens, 64);
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
  assert.equal(result.metadata.thinkingLevel, null);
});

test('Vertex Gemini rejects invalid thinking controls before provider request', async () => {
  const provider = createVertexGeminiProvider({
    projectId: 'project-test',
    accessTokenProvider: async () => 'token-test',
    fetchImpl: async () => { throw new Error('fetch should not run'); }
  });
  await assert.rejects(
    provider.execute({ capability: 'review', input: 'x', policy: { providerOptions: { thinkingBudget: -2 } } }),
    /thinkingBudget must be an integer >= -1/
  );
  await assert.rejects(
    provider.execute({ capability:'review', input:'x', policy:{ providerOptions:{ thinkingLevel:'extreme' } } }),
    /thinkingLevel must be one of MINIMAL, LOW, MEDIUM, HIGH/
  );
  await assert.rejects(
    provider.execute({ capability:'review', input:'x', policy:{ providerOptions:{ thinkingBudget:0, thinkingLevel:'LOW' } } }),
    /thinkingBudget and thinkingLevel cannot be used together/
  );
});

test('Vertex Gemini rejects invalid structured output options before provider request', async () => {
  const provider = createVertexGeminiProvider({
    projectId:'project-test',
    accessTokenProvider:async () => 'token-test',
    fetchImpl:async () => { throw new Error('fetch should not run'); }
  });
  await assert.rejects(
    provider.execute({ capability:'review', input:'x', policy:{ providerOptions:{ responseSchema:[] } } }),
    /responseSchema must be an object/
  );
  await assert.rejects(
    provider.execute({ capability:'review', input:'x', policy:{ providerOptions:{ maxOutputTokens:0 } } }),
    /maxOutputTokens must be an integer/
  );
});
