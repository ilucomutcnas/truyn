import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createMcpHttpToolProvider, MCP_PROVIDER_PROTOCOL_VERSION } from '../adapters/providers/mcp-http-tool.js';
import { createByokProfile, providerAdapterOptions, validateByokEnvironment } from '../cli/byok-profile.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    async json() { return body; }
  };
}

function pair() {
  return { requester: createIdentity(), provider: createIdentity() };
}

test('custom MCP BYOK profile requires endpoint/tool and keeps bearer value out of persisted profile', () => {
  const { requester, provider } = pair();
  assert.throws(() => createByokProfile({
    provider: 'custom-mcp',
    endpoint: 'https://mcp.example.test/mcp',
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId
  }), /--tool/);

  const profile = createByokProfile({
    provider: 'custom-mcp',
    endpoint: 'https://mcp.example.test/mcp',
    tool: 'research',
    credentialEnv: 'MY_MCP_TOKEN',
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId
  });
  assert.equal(profile.adapterProvider, 'mcp-http-tool');
  assert.equal(profile.authMode, 'bearer');
  assert.equal(profile.credentialEnv, 'MY_MCP_TOKEN');
  assert.equal(JSON.stringify(profile).includes('runtime-mcp-secret'), false);
  assert.equal(validateByokEnvironment(profile, {}).ok, false);
  assert.equal(validateByokEnvironment(profile, { MY_MCP_TOKEN: 'runtime-mcp-secret' }).ok, true);
  assert.deepEqual(providerAdapterOptions(profile, { MY_MCP_TOKEN: 'runtime-mcp-secret' }), {
    capabilities: ['reasoning.general'],
    endpoint: 'https://mcp.example.test/mcp',
    tool: 'research',
    authMode: 'bearer',
    apiKey: 'runtime-mcp-secret'
  });
});

test('custom MCP provider sends stateless 2026-07-28 tools/call request and no secret metadata', async () => {
  let captured;
  const provider = createMcpHttpToolProvider({
    endpoint: 'https://mcp.example.test/mcp',
    tool: 'research',
    authMode: 'bearer',
    apiKey: 'runtime-mcp-secret',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      const sent = JSON.parse(options.body);
      return response({
        jsonrpc: '2.0',
        id: sent.id,
        result: {
          structuredContent: { answer: 42 },
          content: [{ type: 'text', text: '42' }],
          _meta: { usage: { units: 1 } }
        }
      });
    }
  });

  const result = await provider.execute({
    capability: 'reasoning.general',
    input: { q: 'life' },
    policy: { purpose: 'test' }
  });

  assert.equal(captured.url, 'https://mcp.example.test/mcp');
  assert.equal(captured.options.headers['mcp-protocol-version'], MCP_PROVIDER_PROTOCOL_VERSION);
  assert.equal(captured.options.headers['mcp-method'], 'tools/call');
  assert.equal(captured.options.headers['mcp-name'], 'research');
  assert.equal(captured.options.headers.authorization, 'Bearer runtime-mcp-secret');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.method, 'tools/call');
  assert.equal(body.params.name, 'research');
  assert.deepEqual(body.params.arguments, {
    capability: 'reasoning.general',
    input: { q: 'life' },
    policy: { purpose: 'test' }
  });
  assert.equal(body.params._meta['io.modelcontextprotocol/clientInfo'].name, 'truyn-byok-provider');
  assert.deepEqual(result.output, { answer: 42 });
  assert.equal(result.metadata.provider, 'mcp-http');
  assert.equal(result.metadata.tool, 'research');
  assert.deepEqual(result.metadata.usage, { units: 1 });
  assert.equal('endpoint' in result.metadata, false);
  assert.equal(JSON.stringify(result).includes('runtime-mcp-secret'), false);
});

test('custom MCP no-auth omits Authorization and returns text content', async () => {
  let headers;
  const provider = createMcpHttpToolProvider({
    endpoint: 'http://127.0.0.1:8791/mcp',
    tool: 'local_tool',
    authMode: 'none',
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      const sent = JSON.parse(options.body);
      return response({
        jsonrpc: '2.0',
        id: sent.id,
        result: { content: [{ type: 'text', text: 'LOCAL_MCP_OK' }] }
      });
    }
  });
  const result = await provider.execute({ capability: 'local.mcp', input: 'x', policy: {} });
  assert.equal('authorization' in headers, false);
  assert.equal(result.output, 'LOCAL_MCP_OK');
});

test('custom MCP tool errors fail without leaking endpoint/token', async () => {
  const provider = createMcpHttpToolProvider({
    endpoint: 'https://mcp.example.test/mcp',
    tool: 'research',
    authMode: 'bearer',
    apiKey: 'runtime-mcp-secret',
    fetchImpl: async (_url, options) => {
      const sent = JSON.parse(options.body);
      return response({
        jsonrpc: '2.0',
        id: sent.id,
        result: { isError: true, content: [{ type: 'text', text: 'tool refused request' }] }
      });
    }
  });
  await assert.rejects(
    provider.execute({ capability: 'reasoning.general', input: 'x', policy: {} }),
    (error) => error.message === 'tool refused request' && !error.message.includes('runtime-mcp-secret') && !error.message.includes('mcp.example.test')
  );
  assert.throws(() => createMcpHttpToolProvider({ endpoint: 'file:///tmp/mcp', tool: 'x' }), /http or https/);
});
