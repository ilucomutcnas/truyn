import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';

function measure(value) {
  const json = JSON.stringify(value);
  return {
    bytes: Buffer.byteLength(json),
    characters: json.length,
    words: json.trim() ? json.trim().split(/\s+/).length : 0,
    approximateTokens: Math.ceil(json.length / 4),
    tokenMethod: 'chars/4 estimate; not provider billing tokens'
  };
}

const identity = createIdentity();
const task = 'Analyze the supplied company data and identify the three most material risks.';
const repeatedContext = {
  systemPrompt: 'You are an analyst. Preserve all prior context. Repeat relevant instructions and source notes before handing work to the next agent.',
  conversation: Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `${task} Context segment ${index + 1}: ${'background '.repeat(40)}` })),
  instructions: task,
  previousOutputs: Array.from({ length: 3 }, (_, index) => `Draft ${index + 1}: ${'analysis '.repeat(80)}`)
};
const truynNeed = createEnvelope({
  type: 'NEED',
  from: identity.nodeId,
  publicKeyPem: identity.publicKeyPem,
  privateKeyPem: identity.privateKeyPem,
  payload: { capability: { name: 'risk-analysis' }, input: { task, objectRefs: ['sha256:example-company-data'] }, policy: { purpose: 'demo-benchmark' } }
});

const baseline = measure(repeatedContext);
const structured = measure(truynNeed);
console.log(JSON.stringify({
  benchmark: 'MVP handoff serialization size',
  status: 'structural measurement only',
  warning: 'approximateTokens is not a provider token count and must not be published as a measured inference-cost claim',
  baseline,
  truyn: structured,
  byteReduction: Number((1 - structured.bytes / baseline.bytes).toFixed(4))
}, null, 2));
