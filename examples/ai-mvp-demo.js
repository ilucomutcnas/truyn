import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createMcpHandler } from '../adapters/mcp/server.js';

const relay = createRelay();
const relayUrl = await relay.listen({ port: 0 });
const orchestrator = new TruynNode({ relayUrl, identity: createIdentity() });
const researcherNode = new TruynNode({ relayUrl, identity: createIdentity() });
const reviewerNode = new TruynNode({ relayUrl, identity: createIdentity() });

await orchestrator.register({ name: 'mcp-orchestrator' });
const mcp = createMcpHandler({ node: orchestrator });

const researcher = new TruynAdapterHost({
  node: researcherNode,
  adapter: createFunctionAdapter({
    name: 'demo-research-agent', capabilities: ['research'],
    execute: async ({ input }) => ({ output: `research:${input}`, metadata: { demoAgent: 'researcher' } })
  })
});
const reviewer = new TruynAdapterHost({
  node: reviewerNode,
  adapter: createFunctionAdapter({
    name: 'demo-review-agent', capabilities: ['review'],
    execute: async ({ input }) => ({ output: `reviewed:${input}`, metadata: { demoAgent: 'reviewer' } })
  })
});

await researcher.publishCapabilities();
await reviewer.publishCapabilities();

const find = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'truyn_find', arguments: { capability: 'research' } } });
const need = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'truyn_need', arguments: { capability: 'research', input: 'analyze TRUYN MVP' } } });
await researcher.runOnce();
const researchResult = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'truyn_poll', arguments: {} } });
const researchEvent = researchResult.result.structuredContent.events.find((event) => event.kind === 'RESULT');

await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'truyn_need', arguments: { capability: 'review', input: researchEvent.envelope.payload.output } } });
await reviewer.runOnce();
const reviewResult = await mcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'truyn_poll', arguments: {} } });
const reviewEvent = reviewResult.result.structuredContent.events.find((event) => event.kind === 'RESULT');

console.log(JSON.stringify({
  relayUrl,
  orchestrator: orchestrator.identity.nodeId,
  researchProvidersFound: find.result.structuredContent.offers.length,
  firstNeed: need.result.structuredContent,
  research: { output: researchEvent.envelope.payload.output, verified: researchEvent.verification.ok, trust: researchEvent.trust },
  review: { output: reviewEvent.envelope.payload.output, verified: reviewEvent.verification.ok, trust: reviewEvent.trust },
  status: 'TRUYN AI interoperability demo complete'
}, null, 2));

await relay.close();
