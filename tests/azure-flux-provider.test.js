import test from 'node:test';
import assert from 'node:assert/strict';
import { createAzureFluxProvider } from '../adapters/providers/azure-flux.js';

const fakePng = Buffer.from('fake-flux-png');

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, headers: { get: () => 'application/json' }, async json() { return body; } };
}

test('Azure FLUX uses generic image API, downloads HTTPS artifact, and returns ArtifactRef', async () => {
  const calls = [];
  const provider = createAzureFluxProvider({
    endpoint: 'https://example.services.ai.azure.com',
    model: 'flux-test-model',
    apiKey: 'test-only-key',
    artifactStore: { put: async (buffer) => ({ ref: 'artifact://test/flux.png', bytes: buffer.byteLength }) },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/images/generations')) return jsonResponse({ data: [{ url: 'https://artifact.example/flux.png' }] });
      return { ok: true, status: 200, headers: { get: () => 'image/png' }, async arrayBuffer() { return fakePng; } };
    }
  });

  const result = await provider.execute({ input: 'blue circle', policy: {} });
  assert.equal(result.output.type, 'artifact');
  assert.equal(result.output.artifacts[0].ref, 'artifact://test/flux.png');
  assert.equal(result.output.artifacts[0].bytes, fakePng.byteLength);
  assert.equal(result.metadata.modelFamily, 'flux');
  assert.equal(result.metadata.vendor, 'black-forest-labs');
  assert.match(calls[0].url, /\/openai\/v1\/images\/generations\?api-version=preview$/);
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.model, 'flux-test-model');
  assert.equal(request.n, 1);
  assert.equal(request.size, '1024x1024');
});
