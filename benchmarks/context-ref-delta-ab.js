import { writeFile } from 'node:fs/promises';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';
import { TruynNode } from '../node/client.js';
import { applyContextDelta, renderContextSelection } from '../core/context/index.js';

const relayUrl = process.env.TRUYN_RELAY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureModel = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_MODEL;
const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
const gcpProjectId = process.env.GCP_PROJECT_ID;
const gcpLocation = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const gcpAccessToken = process.env.GCP_ACCESS_TOKEN;
const iterations = Number(process.env.CONTEXT_BENCHMARK_ITERATIONS || 4);
const pacingMs = Number(process.env.CONTEXT_BENCHMARK_PACING_MS || 60000);
const maxRetries = Number(process.env.CONTEXT_BENCHMARK_RATE_LIMIT_RETRIES || 4);
const outputPath = process.env.CONTEXT_BENCHMARK_OUTPUT || 'context-ref-delta-ab.json';

const gate = Object.freeze({
  inputTokenReductionPercentMin: Number(process.env.CONTEXT_GATE_INPUT_REDUCTION_PCT || 80),
  inferenceCostReductionPercentMin: Number(process.env.CONTEXT_GATE_COST_REDUCTION_PCT || 50),
  contextTransferReductionPercentMin: Number(process.env.CONTEXT_GATE_TRANSFER_REDUCTION_PCT || 70),
  qualityPassPercentMin: Number(process.env.CONTEXT_GATE_QUALITY_PCT || 100)
});

for (const [name, value] of Object.entries({
  TRUYN_RELAY: relayUrl,
  AZURE_OPENAI_ENDPOINT: azureEndpoint,
  AZURE_OPENAI_DEPLOYMENT: azureModel,
  AZURE_OPENAI_API_KEY: azureApiKey,
  GCP_PROJECT_ID: gcpProjectId,
  GCP_ACCESS_TOKEN: gcpAccessToken
})) {
  if (!value) throw new Error(`${name} is required`);
}
if (!Number.isInteger(iterations) || iterations < 1) throw new Error('CONTEXT_BENCHMARK_ITERATIONS must be positive');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bytes = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const round = (value, digits = 6) => value == null ? null : Number(value.toFixed(digits));
const reductionPercent = (baseline, candidate) => baseline > 0 ? round(((baseline - candidate) / baseline) * 100, 3) : null;

function parseRate(name) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const rates = {
  azure: { input: parseRate('AZURE_INPUT_USD_PER_M'), output: parseRate('AZURE_OUTPUT_USD_PER_M') },
  gemini: { input: parseRate('GEMINI_INPUT_USD_PER_M'), output: parseRate('GEMINI_OUTPUT_USD_PER_M') }
};
if ([rates.azure.input, rates.azure.output, rates.gemini.input, rates.gemini.output].some((value) => value == null)) {
  throw new Error('All provider price rates are required');
}

function baseBlock(index) {
  const id = `section-${String(index).padStart(2, '0')}`;
  const filler = Array.from({ length: 8 }, (_, part) =>
    `Reference paragraph ${part + 1} for ${id} describes neutral operational background, archival procedures, dependency boundaries, audit sequencing, and deterministic record-keeping. It intentionally contains no authoritative answer for any other section.`
  ).join(' ');
  return {
    id,
    text: `${filler} AUTHORITATIVE_FACT for ${id}: FACT_VALUE=BASE-${String(index).padStart(2, '0')}-A. Only this FACT_VALUE is authoritative when the task explicitly selects ${id}.`
  };
}

const baseBlocks = Array.from({ length: 48 }, (_, index) => baseBlock(index));
const targetIndexes = [7, 19, 31, 43].slice(0, iterations);
const targetIds = targetIndexes.map((index) => `section-${String(index).padStart(2, '0')}`);
const updatedValues = new Map(targetIndexes.map((index) => [
  `section-${String(index).padStart(2, '0')}`,
  `UPDATED-${String(index).padStart(2, '0')}-TRUYN`
]));
const deltaOps = targetIds.map((id) => {
  const original = baseBlocks.find((block) => block.id === id);
  return {
    op: 'replace',
    id,
    text: original.text.replace(/FACT_VALUE=BASE-[0-9]{2}-A/, `FACT_VALUE=${updatedValues.get(id)}`)
  };
});
const updatedBlocks = applyContextDelta(baseBlocks, deltaOps);
const fullContext = renderContextSelection(updatedBlocks);
const fullContextBytes = bytes(fullContext);

function azureUsage(metadata = {}) {
  const usage = metadata.usage || {};
  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    total: usage.total_tokens || ((usage.input_tokens || 0) + (usage.output_tokens || 0))
  };
}

function geminiUsage(metadata = {}) {
  const usage = metadata.usage || {};
  const input = usage.promptTokenCount || 0;
  const total = usage.totalTokenCount || 0;
  return {
    input,
    output: Math.max(0, total - input),
    total: total || input + (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0)
  };
}

function inferenceCost(azure, gemini) {
  return ((azure.input * rates.azure.input + azure.output * rates.azure.output) +
    (gemini.input * rates.gemini.input + gemini.output * rates.gemini.output)) / 1_000_000;
}

function isRateLimit(error) {
  return error?.status === 429 || /rate limit|too many requests|resource exhausted/i.test(error?.message || '');
}

const retryEvents = [];
async function withRetry(label, fn) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimit(error) || attempt >= maxRetries) throw error;
      retryEvents.push({ label, retry: attempt + 1, delayMs: pacingMs, error: error.message });
      console.error(`${label}: rate limited; retry ${attempt + 1}/${maxRetries} after ${pacingMs}ms`);
      await sleep(pacingMs);
    }
  }
}

const directAzure = createAzureOpenAIProvider({ endpoint: azureEndpoint, model: azureModel, apiKey: azureApiKey });
const directGemini = createVertexGeminiProvider({
  projectId: gcpProjectId,
  location: gcpLocation,
  model: geminiModel,
  accessTokenProvider: async () => gcpAccessToken
});

function taskFor(id) {
  return `Use only the authoritative FACT_VALUE for ${id}. Return one concise line containing that FACT_VALUE and no FACT_VALUE from any other section.`;
}

async function directRun(id) {
  const expected = updatedValues.get(id);
  const research = await directAzure.execute({
    capability: 'research',
    input: { task: taskFor(id), context: fullContext },
    policy: { benchmark: 'context-ref-delta-economic-gate', selectedBlock: id }
  });
  if (!String(research.output).includes(expected)) throw new Error(`Direct Azure quality failure for ${id}: ${research.output}`);
  const review = await directGemini.execute({
    capability: 'review',
    input: {
      task: `Verify the candidate against the authoritative FACT_VALUE for ${id}. Return one concise line containing the correct FACT_VALUE.`,
      candidate: research.output,
      context: fullContext
    },
    policy: { benchmark: 'context-ref-delta-economic-gate', selectedBlock: id }
  });
  if (!String(review.output).includes(expected)) throw new Error(`Direct Gemini quality failure for ${id}: ${review.output}`);
  const azure = azureUsage(research.metadata);
  const gemini = geminiUsage(review.metadata);
  return {
    id,
    qualityPass: true,
    azure,
    gemini,
    providerInputTokens: azure.input + gemini.input,
    providerTotalTokens: azure.total + gemini.total,
    inferenceCostUsd: inferenceCost(azure, gemini),
    providerRequestBodyBytes: (research.metadata.providerRequestBodyBytes || 0) + (review.metadata.providerRequestBodyBytes || 0),
    repeatedContextBytes: fullContextBytes * 2,
    outputs: { research: research.output, review: review.output }
  };
}

const requester = new TruynNode({ relayUrl });

async function fetchRelayChainTrace(chainId) {
  const traceUrl = `${relayUrl}/v1/fast/chains/${encodeURIComponent(chainId)}/trace`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(traceUrl, {
      headers: { authorization: `Bearer ${requester.sessionToken}` }
    });
    const body = await response.json();
    if (response.ok) return body.trace;
    if (response.status !== 409) throw new Error(body.error || `Trace HTTP ${response.status}`);
    await sleep(10);
  }
  throw new Error('Timed out waiting for relay chain trace flush');
}

await requester.register({ name: 'context-economic-benchmark-requester' });
const researchOffers = await requester.find('research');
const reviewOffers = await requester.find('review');
const researchProvider = researchOffers.offers?.[0]?.from;
const reviewProvider = reviewOffers.offers?.[0]?.from;
if (!researchProvider || !reviewProvider) throw new Error('TRUYN research/review providers are required');
await requester.ensureFastSocket();

const baseContext = await requester.putContext(baseBlocks, { readers: [researchProvider, reviewProvider], metadata: { benchmark: 'context-economic-gate-base' } });
const updatedContext = await requester.deltaContext(baseContext.cid, deltaOps, { readers: [researchProvider, reviewProvider], metadata: { benchmark: 'context-economic-gate-updated' } });
const setupTransferBytes = baseContext.transferBytes + updatedContext.transferBytes;

async function truynRun(id) {
  const expected = updatedValues.get(id);
  const ref = { $context: { cid: updatedContext.cid, ids: [id] } };
  const chain = await requester.compactChain([
    {
      capability: 'research',
      input: { task: taskFor(id), context: ref },
      policy: { benchmark: 'context-ref-delta-economic-gate', selectedBlock: id }
    },
    {
      capability: 'review',
      inputTemplate: {
        task: `Verify the candidate against the authoritative FACT_VALUE for ${id}. Return one concise line containing the correct FACT_VALUE.`,
        candidate: { $previous: 'output' },
        context: ref
      },
      policy: { benchmark: 'context-ref-delta-economic-gate', selectedBlock: id }
    }
  ]);
  if (chain.requesterTransport !== 'websocket') throw new Error(`TRUYN requester transport fallback: ${chain.requesterTransport}`);
  const trace = await fetchRelayChainTrace(chain.chainId);
  if (JSON.stringify(trace.stageTransport) !== JSON.stringify(['socket', 'socket'])) {
    throw new Error(`TRUYN provider transport fallback: ${JSON.stringify(trace.stageTransport)}`);
  }
  const research = chain.results?.[0]?.payload;
  const review = chain.results?.[1]?.payload;
  if (!String(research?.output).includes(expected)) throw new Error(`TRUYN Azure quality failure for ${id}: ${research?.output}`);
  if (!String(review?.output).includes(expected)) throw new Error(`TRUYN Gemini quality failure for ${id}: ${review?.output}`);
  const azure = azureUsage(research.metadata);
  const gemini = geminiUsage(review.metadata);
  const resolverTransferBytes = (research.metadata?.contextResolution?.contextTransferBytes || 0) +
    (review.metadata?.contextResolution?.contextTransferBytes || 0);
  const contextRefBytes = bytes(ref) * 2;
  return {
    id,
    qualityPass: true,
    azure,
    gemini,
    providerInputTokens: azure.input + gemini.input,
    providerTotalTokens: azure.total + gemini.total,
    inferenceCostUsd: inferenceCost(azure, gemini),
    providerRequestBodyBytes: (research.metadata?.providerRequestBodyBytes || 0) + (review.metadata?.providerRequestBodyBytes || 0),
    resolverTransferBytes,
    contextRefBytes,
    contextTransferBytes: resolverTransferBytes + contextRefBytes,
    selectedContentBytes: (research.metadata?.contextResolution?.selectedContentBytes || 0) +
      (review.metadata?.contextResolution?.selectedContentBytes || 0),
    protocolOverheadBytes: chain.protocolOverheadBytes,
    outputs: { research: research.output, review: review.output }
  };
}

const directSamples = [];
const truynSamples = [];
for (let i = 0; i < targetIds.length; i += 1) {
  const id = targetIds[i];
  if (i % 2 === 0) {
    directSamples.push(await withRetry(`pair-${i + 1}-direct`, () => directRun(id)));
    await sleep(pacingMs);
    truynSamples.push(await withRetry(`pair-${i + 1}-truyn`, () => truynRun(id)));
  } else {
    truynSamples.push(await withRetry(`pair-${i + 1}-truyn`, () => truynRun(id)));
    await sleep(pacingMs);
    directSamples.push(await withRetry(`pair-${i + 1}-direct`, () => directRun(id)));
  }
  if (i + 1 < targetIds.length) await sleep(pacingMs);
  console.error(`Context measured pair ${i + 1}/${targetIds.length} complete`);
}
requester.closeFastSocket();

const mean = (items, getter) => items.reduce((sum, item) => sum + getter(item), 0) / items.length;
const directInputMean = mean(directSamples, (item) => item.providerInputTokens);
const truynInputMean = mean(truynSamples, (item) => item.providerInputTokens);
const directCostMean = mean(directSamples, (item) => item.inferenceCostUsd);
const truynCostMean = mean(truynSamples, (item) => item.inferenceCostUsd);
const directContextTransferBytes = directSamples.reduce((sum, item) => sum + item.repeatedContextBytes, 0);
const truynQueryContextTransferBytes = truynSamples.reduce((sum, item) => sum + item.contextTransferBytes, 0);
const truynContextTransferBytes = setupTransferBytes + truynQueryContextTransferBytes;
const inputReduction = reductionPercent(directInputMean, truynInputMean);
const costReduction = reductionPercent(directCostMean, truynCostMean);
const transferReduction = reductionPercent(directContextTransferBytes, truynContextTransferBytes);
const qualityPassPercent = round((truynSamples.filter((item) => item.qualityPass).length / truynSamples.length) * 100, 3);

const economicGate = {
  thresholds: gate,
  measured: {
    providerInputTokensDirectMean: round(directInputMean, 3),
    providerInputTokensTruynMean: round(truynInputMean, 3),
    inputTokenReductionPercent: inputReduction,
    inferenceCostDirectMeanUsd: round(directCostMean, 9),
    inferenceCostTruynMeanUsd: round(truynCostMean, 9),
    inferenceCostReductionPercent: costReduction,
    directRepeatedContextTransferBytes: directContextTransferBytes,
    truynAmortizedContextTransferBytes: truynContextTransferBytes,
    contextTransferReductionPercent: transferReduction,
    qualityPassPercent
  },
  pass: {
    inputTokens: inputReduction >= gate.inputTokenReductionPercentMin,
    inferenceCost: costReduction >= gate.inferenceCostReductionPercentMin,
    contextTransfer: transferReduction >= gate.contextTransferReductionPercentMin,
    quality: qualityPassPercent >= gate.qualityPassPercentMin
  }
};
economicGate.passed = Object.values(economicGate.pass).every(Boolean);

const report = {
  benchmark: 'TRUYN content-addressed context + delta economic A/B',
  status: 'success',
  generatedAt: new Date().toISOString(),
  relayUrl,
  methodology: {
    contextBlocks: updatedBlocks.length,
    fullContextBytes,
    measuredQueries: targetIds.length,
    targetIds,
    direct: 'Each Azure and Gemini request receives the complete updated corpus again.',
    truyn: 'Corpus is uploaded once by content CID, changed blocks are transferred as a signed delta producing a new immutable CID, and each provider resolves only the selected block from the signed $context reference.',
    sameModels: { azure: azureModel, gemini: geminiModel },
    quality: 'Every measured answer must contain the authoritative value from the updated target block; failures abort the benchmark.',
    transport: 'Requester uses persistent canonical relay WebSocket; providers use persistent relay-origin WebSockets.',
    setupAccounting: 'TRUYN context-transfer bytes include the one-time full corpus PUT, signed delta, provider manifest/select responses, and per-query context references. Direct context-transfer bytes count the full updated corpus delivered to both providers on every measured query.',
    retryAccounting: 'Rate-limit sleep is outside successful model usage/cost samples.',
    retryEvents
  },
  context: {
    baseCid: baseContext.cid,
    updatedCid: updatedContext.cid,
    baseTransferBytes: baseContext.transferBytes,
    deltaTransferBytes: updatedContext.transferBytes,
    setupTransferBytes,
    deltaPayloadBytes: updatedContext.deltaBytes,
    fullContextBytes
  },
  pricing: rates,
  economicGate,
  aggregate: {
    direct: {
      providerInputTokensMean: round(directInputMean, 3),
      inferenceCostUsdMean: round(directCostMean, 9),
      repeatedContextTransferBytes: directContextTransferBytes,
      providerRequestBodyBytesMean: round(mean(directSamples, (item) => item.providerRequestBodyBytes), 3)
    },
    truyn: {
      providerInputTokensMean: round(truynInputMean, 3),
      inferenceCostUsdMean: round(truynCostMean, 9),
      amortizedContextTransferBytes: truynContextTransferBytes,
      queryContextTransferBytes: truynQueryContextTransferBytes,
      selectedContentBytesMean: round(mean(truynSamples, (item) => item.selectedContentBytes), 3),
      providerRequestBodyBytesMean: round(mean(truynSamples, (item) => item.providerRequestBodyBytes), 3),
      protocolOverheadBytesMean: round(mean(truynSamples, (item) => item.protocolOverheadBytes), 3)
    }
  },
  samples: { direct: directSamples, truyn: truynSamples }
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ benchmark: report.benchmark, status: report.status, context: report.context, economicGate, aggregate: report.aggregate }, null, 2));
