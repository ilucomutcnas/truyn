import test from 'node:test';
import assert from 'node:assert/strict';
import { createAzureFoundryProvider } from '../adapters/providers/azure-foundry.js';
import { artifactFromBase64 } from '../adapters/providers/common/artifacts.js';

test('Azure Foundry adapter uses OpenAI v1 chat completions and normalizes telemetry', async () => {
  const calls = [];
  const provider = createAzureFoundryProvider({
    endpoint: 'https://example.services.ai.azure.com',
    deployment: 'DeepSeek-V3.2',
    vendor: 'deepseek',
    family: 'deepseek',
    apiKey: null,
    accessTokenProvider: async () => 'azure-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'request-1' },
        async json() {
          return {
            id: 'chatcmpl-1',
            model: 'DeepSeek-V3.2',
            choices: [{ message: { content: 'TRUYN_TEXT_OK' } }],
            usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 }
          };
        }
      };
    }
  });

  const result = await provider.execute({ capability: 'reasoning.general', input: 'ping', policy: {} });
  assert.equal(result.output, 'TRUYN_TEXT_OK');
  assert.equal(result.metadata.provider, 'azure-foundry');
  assert.equal(result.metadata.vendor, 'deepseek');
  assert.equal(result.metadata.modelFamily, 'deepseek');
  assert.equal(result.metadata.usage.total_tokens, 15);
  assert.equal(calls[0].url, 'https://example.services.ai.azure.com/openai/v1/chat/completions');
  assert.equal(calls[0].options.headers.authorization, 'Bearer azure-token');
});

test('artifact helper hashes generated binary without embedding it in normalized result', () => {
  const artifact = artifactFromBase64(Buffer.from('fake-image').toString('base64'), {
    mediaType: 'image/png',
    provenance: { cloud: 'test', family: 'image-test' }
  });
  assert.equal(artifact.mediaType, 'image/png');
  assert.equal(artifact.bytes, 10);
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal('data' in artifact, false);
  assert.equal('base64' in artifact, false);
});
