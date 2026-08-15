import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';

const relayUrl = process.env.TRUYN_RELAY;
if (!relayUrl) throw new Error('TRUYN_RELAY is required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

function normalizeUsage(metadata = {}) {
  const usage = metadata.usage || {};
  if (metadata.provider === 'azure-openai') {
    return {
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      totalTokens: usage.total_tokens ?? null
    };
  }
  if (metadata.provider === 'vertex-gemini') {
    return {
      inputTokens: usage.promptTokenCount ?? null,
      outputTokens: usage.candidatesTokenCount ?? null,
      totalTokens: usage.totalTokenCount ?? null
    };
  }
  return { inputTokens: null, outputTokens: null, totalTokens: null };
}

async function waitForOffer(node, capability, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = await node.find(capability);
    if (found.offers?.length) {
      return {
        discoveryLatencyMs: Date.now() - startedAt,
        offer: found.offers[0],
        offers: found.offers
      };
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for OFFER ${capability}`);
}

async function sendNeed(node, capability, input, policy = {}) {
  await node.register();
  const envelope = node.envelope('NEED', {
    capability: { name: capability },
    input,
    policy
  });
  const needBytes = bytes(envelope);
  const startedAt = Date.now();
  const response = await fetch(`${node.relayUrl}/v1/needs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${node.sessionToken}`
    },
    body: JSON.stringify({ envelope })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `TRUYN NEED HTTP ${response.status}`);
  return { envelope, needBytes, startedAt, response: body };
}

async function waitForResult(node, requestId, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const polled = await node.poll();
    const event = polled.events.find((candidate) =>
      candidate.kind === 'RESULT' && candidate.envelope?.payload?.requestId === requestId
    );
    if (event) return event;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for RESULT ${requestId}`);
}

async function transact(node, capability, input, policy) {
  const discovery = await waitForOffer(node, capability);
  const sent = await sendNeed(node, capability, input, policy);
  const resultEvent = await waitForResult(node, sent.response.requestId);
  const metadata = resultEvent.envelope?.payload?.metadata || {};
  const output = resultEvent.envelope?.payload?.output;
  const resultEnvelopeBytes = bytes(resultEvent.envelope);
  const signatureVerified = resultEvent.verification?.ok === true;

  if (!signatureVerified) throw new Error(`${capability} RESULT signature verification failed`);
  if (metadata.failed) throw new Error(`${capability} provider failed: ${metadata.error || 'unknown error'}`);

  return {
    capability,
    providerNodeId: resultEvent.envelope.from,
    providerOfferNodeId: discovery.offer.nodeId,
    providerAdapter: discovery.offer.metadata?.adapter || metadata.adapter || null,
    signatureVerified,
    trustability: sent.response.trustability ?? null,
    requestId: sent.response.requestId,
    discoveryLatencyMs: discovery.discoveryLatencyMs,
    endToEndLatencyMs: Date.now() - sent.startedAt,
    providerLatencyMs: metadata.providerLatencyMs ?? metadata.latencyMs ?? null,
    usage: normalizeUsage(metadata),
    providerMetadata: metadata,
    needEnvelopeBytes: sent.needBytes,
    resultEnvelopeBytes,
    truynWireBytes: sent.needBytes + resultEnvelopeBytes,
    output
  };
}

const chainStartedAt = Date.now();
const requester = new TruynNode({
  relayUrl,
  identity: createIdentity()
});
await requester.register({ name: 'cross-cloud-proof-requester' });

const azure = await transact(requester, 'research', {
  task: 'In one concise sentence, explain what an intelligence network is. End with marker TRUYN_AZURE_CHAIN_OK.'
}, {
  purpose: 'cross-cloud-proof',
  expectedProvider: 'azure-openai'
});

const gemini = await transact(requester, 'review', {
  task: 'Review the candidate for clarity and factual coherence in no more than two sentences. End with marker TRUYN_GEMINI_CHAIN_OK.',
  candidate: azure.output,
  provenance: {
    upstreamProviderNodeId: azure.providerNodeId,
    upstreamRequestId: azure.requestId,
    upstreamSignatureVerified: azure.signatureVerified
  }
}, {
  purpose: 'cross-cloud-proof',
  expectedProvider: 'vertex-gemini'
});

if (!String(azure.output).includes('TRUYN_AZURE_CHAIN_OK')) {
  throw new Error(`Azure marker missing: ${azure.output}`);
}
if (!String(gemini.output).includes('TRUYN_GEMINI_CHAIN_OK')) {
  throw new Error(`Gemini marker missing: ${gemini.output}`);
}
if (azure.providerNodeId === gemini.providerNodeId) {
  throw new Error('Cross-cloud proof requires distinct provider node identities');
}

const report = {
  proof: 'TRUYN cross-cloud AI chain',
  status: 'success',
  relayUrl,
  requesterNodeId: requester.identity.nodeId,
  providersDistinct: true,
  chainLatencyMs: Date.now() - chainStartedAt,
  azure,
  gemini,
  aggregate: {
    providerInputTokens: [azure, gemini].reduce((sum, item) => sum + (item.usage.inputTokens || 0), 0),
    providerOutputTokens: [azure, gemini].reduce((sum, item) => sum + (item.usage.outputTokens || 0), 0),
    providerTotalTokens: [azure, gemini].reduce((sum, item) => sum + (item.usage.totalTokens || 0), 0),
    truynWireBytes: azure.truynWireBytes + gemini.truynWireBytes
  },
  claims: {
    tokenReductionPercent: null,
    costDifferencePercent: null,
    latencyDifferencePercent: null,
    reason: 'No equivalent non-TRUYN baseline was executed in this proof; comparative claims are intentionally omitted.'
  }
};

const outputPath = process.env.TRUYN_PROOF_OUTPUT;
if (outputPath) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(report, null, 2));
