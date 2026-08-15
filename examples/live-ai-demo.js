import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createOpenAIProvider } from '../adapters/providers/openai.js';
import { createAnthropicProvider } from '../adapters/providers/anthropic.js';

for (const name of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']) {
  if (!process.env[name]) throw new Error(`${name} is required; this demo uses only credentials supplied by the local user`);
}

const relay = createRelay({ localDevelopmentMode: true });
const relayUrl = await relay.listen({ port: 0 });
const requester = new TruynNode({ relayUrl, identity: createIdentity() });
const openaiNode = new TruynNode({ relayUrl, identity: createIdentity() });
const anthropicNode = new TruynNode({ relayUrl, identity: createIdentity() });
await requester.register({ name: 'local-live-demo-orchestrator' });

const openaiHost = new TruynAdapterHost({ node: openaiNode, adapter: createOpenAIProvider({ capabilities: ['research'] }) });
const anthropicHost = new TruynAdapterHost({ node: anthropicNode, adapter: createAnthropicProvider({ capabilities: ['review'] }) });
await openaiHost.publishCapabilities();
await anthropicHost.publishCapabilities();

const task = process.argv.slice(2).join(' ') || 'Explain in three concise points what this TRUYN MVP proves.';
await requester.need('research', task);
await openaiHost.runOnce();
const researchPoll = await requester.poll();
const research = researchPoll.events.find((event) => event.kind === 'RESULT');
if (!research) throw new Error('OpenAI provider did not return a RESULT');

await requester.need('review', {
  originalTask: task,
  candidateResult: research.envelope.payload.output,
  instruction: 'Review factual clarity and return a corrected concise version.'
});
await anthropicHost.runOnce();
const reviewPoll = await requester.poll();
const review = reviewPoll.events.find((event) => event.kind === 'RESULT');
if (!review) throw new Error('Anthropic provider did not return a RESULT');

console.log(JSON.stringify({
  mode: 'local-BYOK-only',
  researchVerified: research.verification.ok,
  reviewVerified: review.verification.ok,
  researchOutput: research.envelope.payload.output,
  reviewOutput: review.envelope.payload.output
}, null, 2));

await relay.close();
