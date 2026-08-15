import { writeFile } from 'node:fs/promises';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';

const relayUrl = process.env.TRUYN_RELAY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureModel = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_MODEL;
const azureAccessToken = process.env.AZURE_OPENAI_ACCESS_TOKEN;
const gcpProjectId = process.env.GCP_PROJECT_ID;
const gcpLocation = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const gcpAccessToken = process.env.GCP_ACCESS_TOKEN;
const iterations = Number(process.env.BENCHMARK_ITERATIONS || 5);
const warmups = Number(process.env.BENCHMARK_WARMUPS || 1);
const outputPath = process.env.BENCHMARK_OUTPUT || 'cross-cloud-ab.json';

for (const [name, value] of Object.entries({
  TRUYN_RELAY: relayUrl,
  AZURE_OPENAI_ENDPOINT: azureEndpoint,
  AZURE_OPENAI_DEPLOYMENT: azureModel,
  AZURE_OPENAI_ACCESS_TOKEN: azureAccessToken,
  GCP_PROJECT_ID: gcpProjectId,
  GCP_ACCESS_TOKEN: gcpAccessToken
})) {
  if (!value) throw new Error(`${name} is required`);
}
if (!Number.isInteger(iterations) || iterations < 1) throw new Error('BENCHMARK_ITERATIONS must be a positive integer');
if (!Number.isInteger(warmups) || warmups < 0) throw new Error('BENCHMARK_WARMUPS must be a non-negative integer');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const round = (value, digits = 6) => value == null ? null : Number(value.toFixed(digits));

const researchInput = {
  task: 'In one concise sentence, explain what an intelligence network is. End with marker TRUYN_AB_AZURE_OK.'
};
const researchPolicy = {
  purpose: 'cross-cloud-ab-v1',
  expectedProvider: 'azure-openai'
};
const reviewPolicy = {
  purpose: 'cross-cloud-ab-v1',
  expectedProvider: 'vertex-gemini'
};
const makeReviewInput = (candidate) => ({
  task: 'Review the candidate for clarity and factual coherence in no more than two sentences. End with marker TRUYN_AB_GEMINI_OK.',
  candidate
});

function parseRate(name) {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const rates = {
  currency: 'USD',
  unit: 'per_1m_tokens',
  azure: {
    input: parseRate('AZURE_INPUT_USD_PER_M'),
    output: parseRate('AZURE_OUTPUT_USD_PER_M'),
    source: process.env.AZURE_PRICE_SOURCE || null
  },
  gemini: {
    input: parseRate('GEMINI_INPUT_USD_PER_M'),
    output: parseRate('GEMINI_OUTPUT_USD_PER_M'),
    source: process.env.GEMINI_PRICE_SOURCE || null
  }
};

function normalizeAzureUsage(metadata = {}) {
  const usage = metadata.usage || {};
  return {
    inputTokens: usage.input_tokens ?? 0,
    visibleOutputTokens: usage.output_tokens ?? 0,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    billableOutputTokens: usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? ((usage.input_tokens || 0) + (usage.output_tokens || 0))
  };
}

function normalizeGeminiUsage(metadata = {}) {
  const usage = metadata.usage || {};
  const inputTokens = usage.promptTokenCount ?? 0;
  const visibleOutputTokens = usage.candidatesTokenCount ?? 0;
  const reasoningTokens = usage.thoughtsTokenCount ?? 0;
  const totalTokens = usage.totalTokenCount ?? (inputTokens + visibleOutputTokens + reasoningTokens);
  return {
    inputTokens,
    visibleOutputTokens,
    reasoningTokens,
    billableOutputTokens: Math.max(0, totalTokens - inputTokens),
    totalTokens
  };
}

function summarizeProvider(result, provider) {
  const metadata = result.metadata || {};
  const usage = provider === 'azure' ? normalizeAzureUsage(metadata) : normalizeGeminiUsage(metadata);
  return {
    provider: metadata.provider || null,
    model: metadata.model || null,
    providerLatencyMs: metadata.providerLatencyMs ?? null,
    providerRequestBodyBytes: metadata.providerRequestBodyBytes ?? null,
    providerResponseBodyBytes: metadata.providerResponseBodyBytes ?? null,
    providerBodyBytes: metadata.providerBodyBytes ?? null,
    usage,
    output: result.output
  };
}

function costForProviders(azure, gemini) {
  if ([rates.azure.input, rates.azure.output, rates.gemini.input, rates.gemini.output].some((value) => value == null)) return null;
  const azureCost = (azure.usage.inputTokens * rates.azure.input + azure.usage.billableOutputTokens * rates.azure.output) / 1_000_000;
  const geminiCost = (gemini.usage.inputTokens * rates.gemini.input + gemini.usage.billableOutputTokens * rates.gemini.output) / 1_000_000;
  return {
    azureUsd: round(azureCost, 9),
    geminiUsd: round(geminiCost, 9),
    totalUsd: round(azureCost + geminiCost, 9)
  };
}

const directAzure = createAzureOpenAIProvider({
  endpoint: azureEndpoint,
  model: azureModel,
  accessTokenProvider: async () => azureAccessToken
});
const directGemini = createVertexGeminiProvider({
  projectId: gcpProjectId,
  location: gcpLocation,
  model: geminiModel,
  accessTokenProvider: async () => gcpAccessToken
});

async function directChain() {
  const startedAt = Date.now();
  const azureRaw = await directAzure.execute({ capability: 'research', input: researchInput, policy: researchPolicy });
  if (!String(azureRaw.output).includes('TRUYN_AB_AZURE_OK')) throw new Error(`Direct Azure marker missing: ${azureRaw.output}`);
  const geminiRaw = await directGemini.execute({ capability: 'review', input: makeReviewInput(azureRaw.output), policy: reviewPolicy });
  if (!String(geminiRaw.output).includes('TRUYN_AB_GEMINI_OK')) throw new Error(`Direct Gemini marker missing: ${geminiRaw.output}`);

  const azure = summarizeProvider(azureRaw, 'azure');
  const gemini = summarizeProvider(geminiRaw, 'gemini');
  const providerBodyBytes = (azure.providerBodyBytes || 0) + (gemini.providerBodyBytes || 0);
  const providerLatencyMs = (azure.providerLatencyMs || 0) + (gemini.providerLatencyMs || 0);
  const endToEndLatencyMs = Date.now() - startedAt;
  return {
    mode: 'direct',
    endToEndLatencyMs,
    providerLatencyMs,
    orchestrationOverheadMs: endToEndLatencyMs - providerLatencyMs,
    azure,
    gemini,
    aggregate: {
      providerInputTokens: azure.usage.inputTokens + gemini.usage.inputTokens,
      providerVisibleOutputTokens: azure.usage.visibleOutputTokens + gemini.usage.visibleOutputTokens,
      providerReasoningTokens: azure.usage.reasoningTokens + gemini.usage.reasoningTokens,
      providerBillableOutputTokens: azure.usage.billableOutputTokens + gemini.usage.billableOutputTokens,
      providerTotalTokens: azure.usage.totalTokens + gemini.usage.totalTokens,
      providerBodyBytes,
      protocolEnvelopeBytes: 0,
      measuredApplicationBodyBytes: providerBodyBytes,
      estimatedCost: costForProviders(azure, gemini)
    }
  };
}

async function waitForOffer(node, capability, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = await node.find(capability);
    if (found.offers?.length) return found.offers;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for OFFER ${capability}`);
}

async function truynTransact(node, capability, input, policy) {
  const offers = await waitForOffer(node, capability);
  const needEnvelope = node.envelope('NEED', {
    capability: { name: capability },
    input,
    policy
  });
  const needEnvelopeBytes = bytes(needEnvelope);
  const response = await fetch(`${node.relayUrl}/v1/needs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${node.sessionToken}`
    },
    body: JSON.stringify({ envelope: needEnvelope })
  });
  const matched = await response.json();
  if (!response.ok) throw new Error(matched.error || `TRUYN NEED HTTP ${response.status}`);
  if (!matched.needId || !matched.provider) throw new Error('TRUYN relay did not return matched need/provider');

  let resultEvent = null;
  const resultStartedAt = Date.now();
  while (Date.now() - resultStartedAt < 120000) {
    const polled = await node.poll();
    resultEvent = polled.events.find((event) => event.kind === 'RESULT' && event.envelope?.payload?.requestId === matched.needId) || null;
    if (resultEvent) break;
    await sleep(250);
  }
  if (!resultEvent) throw new Error(`Timed out waiting for RESULT ${matched.needId}`);
  if (resultEvent.verification?.ok !== true) throw new Error(`${capability} RESULT signature verification failed`);
  if (resultEvent.envelope.from !== matched.provider) throw new Error(`${capability} RESULT provider does not match relay-selected provider`);
  const metadata = resultEvent.envelope.payload?.metadata || {};
  if (metadata.failed) throw new Error(`${capability} provider failed: ${metadata.error || 'unknown error'}`);

  return {
    output: resultEvent.envelope.payload?.output,
    metadata,
    providerNodeId: matched.provider,
    offersSeen: offers.length,
    signatureVerified: true,
    matchTrustability: matched.providerTrust || null,
    resultTrustability: resultEvent.trust || null,
    needEnvelopeBytes,
    resultEnvelopeBytes: bytes(resultEvent.envelope)
  };
}

async function truynChain() {
  const startedAt = Date.now();
  const requester = new TruynNode({ relayUrl, identity: createIdentity() });
  await requester.register({ name: 'cross-cloud-ab-requester' });

  const azureTx = await truynTransact(requester, 'research', researchInput, researchPolicy);
  if (!String(azureTx.output).includes('TRUYN_AB_AZURE_OK')) throw new Error(`TRUYN Azure marker missing: ${azureTx.output}`);
  const geminiTx = await truynTransact(requester, 'review', makeReviewInput(azureTx.output), reviewPolicy);
  if (!String(geminiTx.output).includes('TRUYN_AB_GEMINI_OK')) throw new Error(`TRUYN Gemini marker missing: ${geminiTx.output}`);
  if (azureTx.providerNodeId === geminiTx.providerNodeId) throw new Error('TRUYN benchmark requires distinct Azure and Gemini provider identities');

  const azure = summarizeProvider(azureTx, 'azure');
  const gemini = summarizeProvider(geminiTx, 'gemini');
  const providerBodyBytes = (azure.providerBodyBytes || 0) + (gemini.providerBodyBytes || 0);
  const protocolEnvelopeBytes = azureTx.needEnvelopeBytes + azureTx.resultEnvelopeBytes + geminiTx.needEnvelopeBytes + geminiTx.resultEnvelopeBytes;
  const providerLatencyMs = (azure.providerLatencyMs || 0) + (gemini.providerLatencyMs || 0);
  const endToEndLatencyMs = Date.now() - startedAt;

  return {
    mode: 'truyn',
    requesterNodeId: requester.identity.nodeId,
    providerNodeIds: { azure: azureTx.providerNodeId, gemini: geminiTx.providerNodeId },
    signaturesVerified: { azure: azureTx.signatureVerified, gemini: geminiTx.signatureVerified },
    trustability: {
      azureMatch: azureTx.matchTrustability,
      azureResult: azureTx.resultTrustability,
      geminiMatch: geminiTx.matchTrustability,
      geminiResult: geminiTx.resultTrustability
    },
    endToEndLatencyMs,
    providerLatencyMs,
    orchestrationOverheadMs: endToEndLatencyMs - providerLatencyMs,
    azure,
    gemini,
    aggregate: {
      providerInputTokens: azure.usage.inputTokens + gemini.usage.inputTokens,
      providerVisibleOutputTokens: azure.usage.visibleOutputTokens + gemini.usage.visibleOutputTokens,
      providerReasoningTokens: azure.usage.reasoningTokens + gemini.usage.reasoningTokens,
      providerBillableOutputTokens: azure.usage.billableOutputTokens + gemini.usage.billableOutputTokens,
      providerTotalTokens: azure.usage.totalTokens + gemini.usage.totalTokens,
      providerBodyBytes,
      protocolEnvelopeBytes,
      measuredApplicationBodyBytes: providerBodyBytes + protocolEnvelopeBytes,
      estimatedCost: costForProviders(azure, gemini)
    }
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function stats(samples, selector) {
  const values = samples.map(selector).filter((value) => Number.isFinite(value));
  if (!values.length) return { mean: null, median: null, min: null, max: null };
  return {
    mean: round(mean(values), 3),
    median: round(median(values), 3),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}
function aggregateMode(samples) {
  return {
    runs: samples.length,
    latencyMs: stats(samples, (sample) => sample.endToEndLatencyMs),
    providerLatencyMs: stats(samples, (sample) => sample.providerLatencyMs),
    orchestrationOverheadMs: stats(samples, (sample) => sample.orchestrationOverheadMs),
    providerInputTokens: stats(samples, (sample) => sample.aggregate.providerInputTokens),
    providerBillableOutputTokens: stats(samples, (sample) => sample.aggregate.providerBillableOutputTokens),
    providerTotalTokens: stats(samples, (sample) => sample.aggregate.providerTotalTokens),
    providerBodyBytes: stats(samples, (sample) => sample.aggregate.providerBodyBytes),
    protocolEnvelopeBytes: stats(samples, (sample) => sample.aggregate.protocolEnvelopeBytes),
    measuredApplicationBodyBytes: stats(samples, (sample) => sample.aggregate.measuredApplicationBodyBytes),
    estimatedCostUsd: stats(samples, (sample) => sample.aggregate.estimatedCost?.totalUsd)
  };
}
function reductionPercent(baseline, candidate) {
  if (!Number.isFinite(baseline) || baseline === 0 || !Number.isFinite(candidate)) return null;
  return round(((baseline - candidate) / baseline) * 100, 3);
}

console.error(`Warm-up pairs: ${warmups}; measured pairs: ${iterations}`);
for (let i = 0; i < warmups; i += 1) {
  await directChain();
  await truynChain();
}

const directSamples = [];
const truynSamples = [];
for (let i = 0; i < iterations; i += 1) {
  if (i % 2 === 0) {
    directSamples.push(await directChain());
    truynSamples.push(await truynChain());
  } else {
    truynSamples.push(await truynChain());
    directSamples.push(await directChain());
  }
  console.error(`Measured pair ${i + 1}/${iterations} complete`);
}

const direct = aggregateMode(directSamples);
const truyn = aggregateMode(truynSamples);
const directCost = direct.estimatedCostUsd.mean;
const truynCost = truyn.estimatedCostUsd.mean;

const report = {
  benchmark: 'TRUYN cross-cloud A/B v1',
  status: 'success',
  generatedAt: new Date().toISOString(),
  methodology: {
    baseline: 'Direct GitHub runner -> Azure OpenAI -> Vertex Gemini, no TRUYN relay/envelopes.',
    candidate: 'GitHub requester -> TRUYN relay -> Azure provider -> signed RESULT -> TRUYN relay -> Gemini provider -> signed RESULT.',
    sameModels: { azure: azureModel, gemini: geminiModel },
    sameTaskAndAdapterPrompt: true,
    alternatingOrder: true,
    warmups,
    measuredPairs: iterations,
    byteMetric: 'Measured JSON application-body bytes only. Direct = provider request/response bodies. TRUYN = the same provider bodies plus signed NEED/RESULT envelope bodies. HTTP/TLS headers, polling, registration, OFFER discovery, TCP/IP and CDN framing are intentionally excluded.',
    costMetric: 'Estimated variable model inference cost from measured billable tokens and the price snapshot embedded by the workflow; infrastructure fixed costs are excluded.'
  },
  relayUrl,
  pricing: rates,
  aggregate: { direct, truyn },
  claims: {
    tokenReductionPercent: reductionPercent(direct.providerTotalTokens.mean, truyn.providerTotalTokens.mean),
    billableOutputTokenReductionPercent: reductionPercent(direct.providerBillableOutputTokens.mean, truyn.providerBillableOutputTokens.mean),
    costReductionPercent: reductionPercent(directCost, truynCost),
    latencyReductionPercent: reductionPercent(direct.latencyMs.mean, truyn.latencyMs.mean),
    providerLatencyReductionPercent: reductionPercent(direct.providerLatencyMs.mean, truyn.providerLatencyMs.mean),
    measuredApplicationBytesReductionPercent: reductionPercent(direct.measuredApplicationBodyBytes.mean, truyn.measuredApplicationBodyBytes.mean),
    providerBodyBytesReductionPercent: reductionPercent(direct.providerBodyBytes.mean, truyn.providerBodyBytes.mean),
    signConvention: 'Positive means TRUYN used less/faster/cheaper than the direct baseline; negative means TRUYN used more/slower/costlier.'
  },
  samples: { direct: directSamples, truyn: truynSamples }
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  benchmark: report.benchmark,
  status: report.status,
  relayUrl,
  measuredPairs: iterations,
  direct: report.aggregate.direct,
  truyn: report.aggregate.truyn,
  claims: report.claims,
  pricing: report.pricing
}, null, 2));
