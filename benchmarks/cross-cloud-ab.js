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
const pacingMs = Number(process.env.BENCHMARK_PACING_MS || 30000);
const maxRateLimitRetries = Number(process.env.BENCHMARK_RATE_LIMIT_MAX_RETRIES || 4);
const relayReadRetryDelayMs = Number(process.env.BENCHMARK_RELAY_READ_RETRY_MS || 3000);
const outputPath = process.env.BENCHMARK_OUTPUT || 'cross-cloud-ab.json';

const optimizationBaseline = Object.freeze({
  protocolOverheadBytes: Number(process.env.TRUYN_BASELINE_PROTOCOL_BYTES || 4143.4),
  orchestrationOverheadMs: Number(process.env.TRUYN_BASELINE_ORCHESTRATION_MS || 1491.2),
  requiredImprovementFactor: Number(process.env.TRUYN_REQUIRED_IMPROVEMENT_FACTOR || 8)
});

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
if (!Number.isFinite(pacingMs) || pacingMs < 0) throw new Error('BENCHMARK_PACING_MS must be a non-negative number');
if (!Number.isInteger(maxRateLimitRetries) || maxRateLimitRetries < 0) throw new Error('BENCHMARK_RATE_LIMIT_MAX_RETRIES must be a non-negative integer');
if (!Number.isFinite(relayReadRetryDelayMs) || relayReadRetryDelayMs < 0) throw new Error('BENCHMARK_RELAY_READ_RETRY_MS must be a non-negative number');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, digits = 6) => value == null ? null : Number(value.toFixed(digits));

const researchInput = {
  task: 'In one concise sentence, explain what an intelligence network is. End with marker TRUYN_AB_AZURE_OK.'
};
const researchPolicy = {
  purpose: 'cross-cloud-ab-v2-compact-hot-path',
  expectedProvider: 'azure-openai'
};
const reviewPolicy = {
  purpose: 'cross-cloud-ab-v2-compact-hot-path',
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
      protocolOverheadBytes: 0,
      truynPayloadBytes: 0,
      measuredApplicationBodyBytes: providerBodyBytes,
      estimatedCost: costForProviders(azure, gemini)
    }
  };
}

function isRetriableNetworkError(error) {
  const text = `${error?.message || error} ${error?.cause?.code || ''}`;
  return /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|socket/i.test(text);
}

const relayNetworkRetries = [];
async function relayRead(label, operation) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetriableNetworkError(error) || attempt >= 9) throw error;
      const delayMs = relayReadRetryDelayMs * Math.min(attempt + 1, 5);
      relayNetworkRetries.push({ label, retry: attempt + 1, delayMs, error: String(error?.message || error), cause: error?.cause?.code || null });
      console.error(`${label}: transient relay bootstrap read failure; retry ${attempt + 1}/9 after ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
}

const requester = new TruynNode({ relayUrl, identity: createIdentity() });
const routeCache = new Map();

async function prepareTruynHotPath(timeoutMs = 180_000) {
  await requester.register({ name: 'cross-cloud-ab-v2-requester' });
  const capabilities = ['research', 'review'];
  const startedAt = Date.now();
  for (const capability of capabilities) {
    while (Date.now() - startedAt < timeoutMs) {
      const found = await relayRead(`bootstrap-find-${capability}`, () => requester.find(capability));
      const fastOffers = (found.offers || []).filter((offer) => offer.payload?.metadata?.fastPath === true);
      if (fastOffers.length > 0) {
        routeCache.set(capability, fastOffers);
        break;
      }
      await sleep(1_000);
    }
    if (!routeCache.has(capability)) throw new Error(`Timed out waiting for fast-path OFFER ${capability}`);
  }
  const researchProvider = routeCache.get('research')[0].from;
  const reviewProvider = routeCache.get('review')[0].from;
  if (researchProvider === reviewProvider) throw new Error('TRUYN benchmark requires distinct Azure and Gemini provider identities');
  console.error(`TRUYN compact hot path ready: research=${researchProvider}; review=${reviewProvider}`);
}

async function truynTransact(capability, input, policy) {
  const cachedOffers = routeCache.get(capability) || [];
  const result = await requester.compactNeed(capability, input, policy, { waitMs: 120_000 });
  if (result.verification?.ok !== true) throw new Error(`${capability} compact RESULT signature verification failed`);
  if (!cachedOffers.some((offer) => offer.from === result.provider)) {
    throw new Error(`${capability} RESULT provider is outside the preflight route cache`);
  }
  if (result.metadata?.failed) throw new Error(`${capability} provider failed: ${result.metadata.error || 'unknown error'}`);

  const matchedOffer = cachedOffers.find((offer) => offer.from === result.provider);
  return {
    output: result.output,
    metadata: result.metadata,
    providerNodeId: result.provider,
    offersSeen: cachedOffers.length,
    signatureVerified: true,
    matchTrustability: matchedOffer?.trust || null,
    resultTrustability: result.trust || null,
    needFrameBytes: result.needFrameBytes,
    resultFrameBytes: result.resultFrameBytes,
    protocolOverheadBytes: result.protocolOverheadBytes,
    truynPayloadBytes: result.truynPayloadBytes
  };
}

async function truynChain() {
  const startedAt = Date.now();
  const azureTx = await truynTransact('research', researchInput, researchPolicy);
  if (!String(azureTx.output).includes('TRUYN_AB_AZURE_OK')) throw new Error(`TRUYN Azure marker missing: ${azureTx.output}`);
  const geminiTx = await truynTransact('review', makeReviewInput(azureTx.output), reviewPolicy);
  if (!String(geminiTx.output).includes('TRUYN_AB_GEMINI_OK')) throw new Error(`TRUYN Gemini marker missing: ${geminiTx.output}`);
  if (azureTx.providerNodeId === geminiTx.providerNodeId) throw new Error('TRUYN benchmark requires distinct Azure and Gemini provider identities');

  const azure = summarizeProvider(azureTx, 'azure');
  const gemini = summarizeProvider(geminiTx, 'gemini');
  const providerBodyBytes = (azure.providerBodyBytes || 0) + (gemini.providerBodyBytes || 0);
  const protocolOverheadBytes = azureTx.protocolOverheadBytes + geminiTx.protocolOverheadBytes;
  const truynPayloadBytes = azureTx.truynPayloadBytes + geminiTx.truynPayloadBytes;
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
      protocolOverheadBytes,
      truynPayloadBytes,
      measuredApplicationBodyBytes: providerBodyBytes + protocolOverheadBytes + truynPayloadBytes,
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
function stats(samples, selector, digits = 3) {
  const values = samples.map(selector).filter((value) => Number.isFinite(value));
  if (!values.length) return { mean: null, median: null, min: null, max: null };
  return {
    mean: round(mean(values), digits),
    median: round(median(values), digits),
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
    protocolOverheadBytes: stats(samples, (sample) => sample.aggregate.protocolOverheadBytes),
    truynPayloadBytes: stats(samples, (sample) => sample.aggregate.truynPayloadBytes),
    measuredApplicationBodyBytes: stats(samples, (sample) => sample.aggregate.measuredApplicationBodyBytes),
    estimatedCostUsd: stats(samples, (sample) => sample.aggregate.estimatedCost?.totalUsd, 9)
  };
}
function reductionPercent(baseline, candidate) {
  if (!Number.isFinite(baseline) || baseline === 0 || !Number.isFinite(candidate)) return null;
  return round(((baseline - candidate) / baseline) * 100, 3);
}
function improvementFactor(baseline, candidate) {
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate) || candidate <= 0) return null;
  return round(baseline / candidate, 3);
}

function isRateLimitError(error) {
  return /rate limit|too many requests|\b429\b|exceeded rate limit/i.test(String(error?.message || error));
}

const rateLimitRetries = [];
async function withRateLimitRetry(label, fn) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= maxRateLimitRetries) throw error;
      const delayMs = pacingMs * (attempt + 1);
      rateLimitRetries.push({ label, retry: attempt + 1, delayMs, error: String(error.message || error) });
      console.error(`${label}: provider rate limit; retry ${attempt + 1}/${maxRateLimitRetries} after ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
}

const totalArmCalls = (warmups + iterations) * 2;
let completedArmCalls = 0;
async function runArm(label, fn) {
  const result = await withRateLimitRetry(label, fn);
  completedArmCalls += 1;
  if (completedArmCalls < totalArmCalls && pacingMs > 0) {
    console.error(`${label}: pacing ${pacingMs}ms before next arm`);
    await sleep(pacingMs);
  }
  return result;
}

await prepareTruynHotPath();
console.error(`Warm-up pairs: ${warmups}; measured pairs: ${iterations}; pacing: ${pacingMs}ms; max rate-limit retries: ${maxRateLimitRetries}`);
for (let i = 0; i < warmups; i += 1) {
  await runArm(`warmup-${i + 1}-direct`, directChain);
  await runArm(`warmup-${i + 1}-truyn`, truynChain);
}

const directSamples = [];
const truynSamples = [];
for (let i = 0; i < iterations; i += 1) {
  if (i % 2 === 0) {
    directSamples.push(await runArm(`pair-${i + 1}-direct`, directChain));
    truynSamples.push(await runArm(`pair-${i + 1}-truyn`, truynChain));
  } else {
    truynSamples.push(await runArm(`pair-${i + 1}-truyn`, truynChain));
    directSamples.push(await runArm(`pair-${i + 1}-direct`, directChain));
  }
  console.error(`Measured pair ${i + 1}/${iterations} complete`);
}

const direct = aggregateMode(directSamples);
const truyn = aggregateMode(truynSamples);
const protocolTarget = optimizationBaseline.protocolOverheadBytes / optimizationBaseline.requiredImprovementFactor;
const orchestrationTarget = optimizationBaseline.orchestrationOverheadMs / optimizationBaseline.requiredImprovementFactor;
const protocolFactor = improvementFactor(optimizationBaseline.protocolOverheadBytes, truyn.protocolOverheadBytes.mean);
const orchestrationFactor = improvementFactor(optimizationBaseline.orchestrationOverheadMs, truyn.orchestrationOverheadMs.mean);
const directCost = direct.estimatedCostUsd.mean;
const truynCost = truyn.estimatedCostUsd.mean;

const optimizationGate = {
  baseline: optimizationBaseline,
  targets: {
    protocolOverheadBytesMax: round(protocolTarget, 3),
    orchestrationOverheadMsMax: round(orchestrationTarget, 3)
  },
  measured: {
    protocolOverheadBytesMean: truyn.protocolOverheadBytes.mean,
    orchestrationOverheadMsMean: truyn.orchestrationOverheadMs.mean
  },
  improvementFactor: {
    protocolOverhead: protocolFactor,
    orchestrationOverhead: orchestrationFactor
  },
  pass: {
    protocolOverhead8x: Number.isFinite(truyn.protocolOverheadBytes.mean) && truyn.protocolOverheadBytes.mean <= protocolTarget,
    orchestrationOverhead8x: Number.isFinite(truyn.orchestrationOverheadMs.mean) && truyn.orchestrationOverheadMs.mean <= orchestrationTarget
  }
};
optimizationGate.passed = optimizationGate.pass.protocolOverhead8x && optimizationGate.pass.orchestrationOverhead8x;

const report = {
  benchmark: 'TRUYN cross-cloud A/B v2 compact hot path',
  status: 'success',
  generatedAt: new Date().toISOString(),
  methodology: {
    baseline: 'Direct GitHub runner -> Azure OpenAI -> Vertex Gemini, no TRUYN relay/envelopes.',
    candidate: 'Persistent registered requester -> session-bound compact signed NEED -> synchronous relay wait -> long-poll provider -> compact signed RESULT; repeated for Azure then Gemini.',
    sameModels: { azure: azureModel, gemini: geminiModel },
    sameTaskAndAdapterPrompt: true,
    alternatingOrder: true,
    bootstrapOutsideMeasuredArm: 'Requester registration, OFFER discovery, provider public-key caching and identity bootstrap happen before warm-up/measured arm timing. This is the steady-state session path; provider inference remains fully measured.',
    compactFrame: 'Each NEED/RESULT hot-path control frame contains only type code, 96-bit request id and Ed25519 signature. Sender identity/public key/protocol version are bound to the authenticated persistent session and are not repeated. Payload remains signed but is detached from the control frame.',
    warmups,
    measuredPairs: iterations,
    pacingMs,
    maxRateLimitRetries,
    rateLimitRetryEvents: rateLimitRetries,
    relayBootstrapNetworkRetryEvents: relayNetworkRetries,
    retryAccounting: 'Rate-limited attempts are not counted as measured samples. Pacing and rate-limit retry sleep occur outside successful-arm latency. Relay read retries apply only to pre-measurement bootstrap discovery and cannot replay provider work.',
    byteMetric: 'protocolOverheadBytes is the exact serialized compact signed control-frame bytes for four messages (two NEED + two RESULT). truynPayloadBytes is reported separately and includes the detached signed TRUYN payloads. measuredApplicationBodyBytes = provider JSON bodies + compact control frames + TRUYN payloads. The v1 field called protocolEnvelopeBytes contained both protocol metadata and payload; v2 separates them so protocol overhead is no longer conflated with application data.',
    costMetric: 'Estimated variable model inference cost from measured billable tokens and the price snapshot embedded by the workflow; infrastructure fixed costs are excluded.'
  },
  relayUrl,
  pricing: rates,
  optimizationGate,
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
  optimizationGate: report.optimizationGate,
  claims: report.claims,
  pricing: report.pricing,
  rateLimitRetries: report.methodology.rateLimitRetryEvents.length,
  relayBootstrapNetworkRetries: report.methodology.relayBootstrapNetworkRetryEvents.length
}, null, 2));
