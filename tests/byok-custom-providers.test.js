import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createOpenAIProvider } from '../adapters/providers/openai.js';
import { createCustomHttpProvider } from '../adapters/providers/custom-http.js';
import { createProviderAdapter } from '../adapters/providers/index.js';
import { createByokProfile, providerAdapterOptions, validateByokEnvironment } from '../cli/byok-profile.js';

function jsonResponse(body, { status = 200, contentType = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    async json() { return body; },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); }
  };
}

function ids() {
  return { requester: createIdentity(), provider: createIdentity() };
}

test('local BYOK profile maps to OpenAI-compatible transport with no authentication', () => {
  const { requester, provider } = ids();
  const profile = createByokProfile({
    provider: 'local',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'local-model',
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId
  });

  assert.equal(profile.adapterProvider, 'openai');
  assert.equal(profile.authMode, 'none');
  assert.equal(profile.credentialEnv, null);
  assert.equal(validateByokEnvironment(profile, {}).ok, true);
  assert.deepEqual(providerAdapterOptions(profile, {}), {
    capabilities: ['reasoning.general'],
    apiKey: undefined,
    model: 'local-model',
    baseUrl: 'http://127.0.0.1:11434',
    allowNoAuth: true
  });
});

test('OpenAI-compatible provider omits Authorization only when no-auth is explicitly allowed', async () => {
  let captured;
  const provider = createOpenAIProvider({
    apiKey: null,
    allowNoAuth: true,
    model: 'local-model',
    baseUrl: 'http://127.0.0.1:9999',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return jsonResponse({ id: 'local-1', model: 'local-model', output_text: 'LOCAL_OK', usage: null });
    }
  });

  const result = await provider.execute({ capability: 'reasoning.general', input: 'hello', policy: {} });
  assert.equal(result.output, 'LOCAL_OK');
  assert.equal(captured.url, 'http://127.0.0.1:9999/v1/responses');
  assert.equal('authorization' in captured.options.headers, false);
  assert.throws(() => createOpenAIProvider({ apiKey: null, model: 'x' }), /OPENAI_API_KEY is required/);
});

test('custom HTTP BYOK profile is no-auth by default and bearer only when credential env is explicit', () => {
  const { requester, provider } = ids();
  const noAuth = createByokProfile({
    provider: 'custom-http',
    endpoint: 'http://127.0.0.1:9000/agent',
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId
  });
  assert.equal(noAuth.authMode, 'none');
  assert.equal(noAuth.credentialEnv, null);
  assert.equal(validateByokEnvironment(noAuth, {}).ok, true);

  const bearer = createByokProfile({
    provider: 'custom-http',
    endpoint: 'https://agent.example.test/v1/execute',
    credentialEnv: 'MY_AGENT_TOKEN',
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId
  });
  assert.equal(bearer.authMode, 'bearer');
  assert.equal(bearer.credentialEnv, 'MY_AGENT_TOKEN');
  assert.equal(validateByokEnvironment(bearer, {}).ok, false);
  assert.equal(validateByokEnvironment(bearer, { MY_AGENT_TOKEN: 'runtime-secret' }).ok, true);
  assert.equal(JSON.stringify(bearer).includes('runtime-secret'), false);
  assert.deepEqual(providerAdapterOptions(bearer, { MY_AGENT_TOKEN: 'runtime-secret' }), {
    capabilities: ['reasoning.general'],
    endpoint: 'https://agent.example.test/v1/execute',
    authMode: 'bearer',
    apiKey: 'runtime-secret'
  });
});

test('custom HTTP adapter posts normalized request and never exposes endpoint in result metadata', async () => {
  let captured;
  const provider = createCustomHttpProvider({
    endpoint: 'https://agent.example.test/v1/execute',
    authMode: 'bearer',
    apiKey: 'runtime-secret',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return jsonResponse({ output: { answer: 42 }, requestId: 'req-1', metadata: { usage: { units: 1 }, ignored: 'x' } });
    }
  });

  const result = await provider.execute({ capability: 'reasoning.general', input: { q: 'life' }, policy: { purpose: 'test' } });
  assert.equal(captured.options.headers.authorization, 'Bearer runtime-secret');
  assert.deepEqual(JSON.parse(captured.options.body), {
    capability: 'reasoning.general',
    input: { q: 'life' },
    policy: { purpose: 'test' }
  });
  assert.deepEqual(result.output, { answer: 42 });
  assert.equal(result.metadata.provider, 'custom-http');
  assert.equal(result.metadata.providerRequestId, 'req-1');
  assert.deepEqual(result.metadata.usage, { units: 1 });
  assert.equal('endpoint' in result.metadata, false);
  assert.equal(JSON.stringify(result).includes('runtime-secret'), false);
});

test('custom HTTP no-auth omits Authorization and validates endpoint protocol', async () => {
  let headers;
  const provider = createProviderAdapter('custom-http', {
    endpoint: 'http://127.0.0.1:8123/run',
    authMode: 'none',
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return jsonResponse('OK', { contentType: 'text/plain' });
    }
  });
  const result = await provider.execute({ capability: 'local.tool', input: 'x', policy: {} });
  assert.equal(result.output, 'OK');
  assert.equal('authorization' in headers, false);
  assert.throws(() => createCustomHttpProvider({ endpoint: 'file:///tmp/agent' }), /http or https/);
});
