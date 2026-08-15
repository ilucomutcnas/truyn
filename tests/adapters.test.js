import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';
import { createMcpHandler, createMcpHttpServer, MCP_MODERN_VERSION } from '../adapters/mcp/server.js';

async function fixture() {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  const requester = new TruynNode({ relayUrl, identity: createIdentity() });
  const provider = new TruynNode({ relayUrl, identity: createIdentity() });
  await requester.register({ name: 'requester' });
  return { relay, relayUrl, requester, provider };
}

test('AdapterHost executes a signed NEED and returns RESULT', async (t) => {
  const { relay, requester, provider } = await fixture();
  t.after(() => relay.close());
  const adapter = createFunctionAdapter({
    name: 'uppercase-provider',
    capabilities: ['uppercase'],
    execute: async ({ input }) => ({ output: String(input).toUpperCase(), metadata: { engine: 'test' } })
  });
  const host = new TruynAdapterHost({ node: provider, adapter });
  await host.publishCapabilities();
  const need = await requester.need('uppercase', 'hello truyn');
  assert.equal(typeof need.needId, 'string');
  const handled = await host.runOnce();
  assert.equal(handled.handled, 1);
  const events = await requester.poll();
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].kind, 'RESULT');
  assert.equal(events.events[0].verification.ok, true);
  assert.equal(events.events[0].envelope.payload.output, 'HELLO TRUYN');
  assert.equal(events.events[0].envelope.payload.metadata.engine, 'test');
});

test('MCP handler supports modern discovery, legacy initialize and TRUYN tools', async (t) => {
  const { relay, requester } = await fixture();
  t.after(() => relay.close());
  const handle = createMcpHandler({ node: requester });
  const discover = await handle({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: {} } });
  assert.ok(discover.result.supportedVersions.includes(MCP_MODERN_VERSION));
  const initialize = await handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  assert.equal(initialize.result.protocolVersion, '2025-11-25');
  const list = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
  assert.ok(list.result.tools.some((tool) => tool.name === 'truyn_need'));
  const identity = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'truyn_identity', arguments: {} } });
  assert.equal(identity.result.structuredContent.nodeId, requester.identity.nodeId);
});

test('HTTP adapter exposes local agent bridge', async (t) => {
  const { relay, relayUrl, requester } = await fixture();
  const localNode = new TruynNode({ relayUrl, identity: createIdentity() });
  const bridge = createHttpAdapterServer({ node: localNode });
  const bridgeUrl = await bridge.listen({ port: 0 });
  t.after(async () => { await bridge.close(); await relay.close(); });
  const offerResponse = await fetch(`${bridgeUrl}/v1/offer`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability: 'http-capability' })
  });
  assert.equal(offerResponse.status, 200);
  const found = await requester.find('http-capability');
  assert.equal(found.offers.length, 1);
  assert.equal(found.offers[0].from, localNode.identity.nodeId);
});

test('MCP Streamable HTTP validates modern routing headers and executes tools', async (t) => {
  const { relay, requester } = await fixture();
  const mcp = createMcpHttpServer({ node: requester });
  const mcpUrl = await mcp.listen({ port: 0 });
  t.after(async () => { await mcp.close(); await relay.close(); });
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_MODERN_VERSION,
      'mcp-method': 'tools/call',
      'mcp-name': 'truyn_identity'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'a', method: 'tools/call', params: { name: 'truyn_identity', arguments: {}, _meta: {} } })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.structuredContent.nodeId, requester.identity.nodeId);
});
