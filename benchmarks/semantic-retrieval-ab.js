import { writeFile } from 'node:fs/promises';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';
import { TruynNode } from '../node/client.js';
import { applyContextDelta, contextQueryHash, renderContextSelection } from '../core/context/index.js';

const relayUrl = process.env.TRUYN_RELAY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureModel = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_MODEL;
const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
const gcpProjectId = process.env.GCP_PROJECT_ID;
const gcpLocation = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const gcpAccessToken = process.env.GCP_ACCESS_TOKEN;
const livePairs = Number(process.env.SEMANTIC_LIVE_PAIRS || 8);
const pacingMs = Number(process.env.SEMANTIC_PACING_MS || 30000);
const maxRetries = Number(process.env.SEMANTIC_RATE_LIMIT_RETRIES || 4);
const outputPath = process.env.SEMANTIC_BENCHMARK_OUTPUT || 'semantic-retrieval-ab.json';

const gate = Object.freeze({
  retrievalAccuracyPercentMin: Number(process.env.SEMANTIC_GATE_RETRIEVAL_ACCURACY_PCT || 99),
  answerAccuracyPercentMin: Number(process.env.SEMANTIC_GATE_ANSWER_ACCURACY_PCT || 99),
  inputTokenReductionPercentMin: Number(process.env.SEMANTIC_GATE_INPUT_REDUCTION_PCT || 90),
  inferenceCostReductionPercentMin: Number(process.env.SEMANTIC_GATE_COST_REDUCTION_PCT || 90),
  provenancePassPercentMin: Number(process.env.SEMANTIC_GATE_PROVENANCE_PCT || 100),
  noBlockIdPassPercentMin: Number(process.env.SEMANTIC_GATE_NO_BLOCK_ID_PCT || 100),
  minimalContextPassPercentMin: Number(process.env.SEMANTIC_GATE_MINIMAL_CONTEXT_PCT || 100)
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
if (!Number.isInteger(livePairs) || livePairs < 1 || livePairs > 12) throw new Error('SEMANTIC_LIVE_PAIRS must be 1..12');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bytes = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const round = (value, digits = 6) => value == null ? null : Number(value.toFixed(digits));
const percent = (part, total) => total > 0 ? round((part / total) * 100, 3) : null;
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

const domains = ['aerospace', 'finance', 'biotech', 'logistics', 'energy', 'media', 'security', 'education'];
const entities = [
  'Aster Observatory', 'Boreal Ledger', 'Cygnus Clinic', 'Dorado Freight', 'Eos Grid', 'Fenix Press',
  'Gaia Vault', 'Helios Academy', 'Ion Telescope', 'Juno Clearing', 'Kepler Lab', 'Lumen Cargo',
  'Mira Reactor', 'Nadir Studio', 'Orion Shield', 'Pavo Institute'
];

function baseBlock(index) {
  const code = String(index).padStart(2, '0');
  const id = `record-${code}`;
  const alias = `${entities[index % entities.length]} ${2100 + index}`;
  const domain = domains[index % domains.length];
  const owner = entities[(index + 5) % entities.length];
  const baseValue = `RESTORE-${code}-BASE-P${(index % 7) + 1}`;
  const filler = Array.from({ length: 7 }, (_, part) =>
    `Reference note ${part + 1} for ${alias} covers ${domain} operating history, audit sequencing, dependency ownership, archival controls, maintenance boundaries, and neutral background. It is not authoritative for any other named entity.`
  ).join(' ');
  return {
    id,
    alias,
    baseValue,
    text: `${filler} CURRENT AUTHORITATIVE service restoration objective for ${alias}: RESTORE_VALUE=${baseValue}. Owner ${owner}. Only this RESTORE_VALUE governs ${alias}.`
  };
}

const baseRecords = Array.from({ length: 48 }, (_, index) => baseBlock(index));
const baseBlocks = baseRecords.map(({ id, text }) => ({ id, text }));
const liveIndexes = [3, 9, 15, 21, 27, 33, 39, 45].slice(0, livePairs);
const liveIds = new Set(liveIndexes.map((index) => baseRecords[index].id));
const currentValues = new Map(baseRecords.map((record, index) => [
  record.id,
  liveIds.has(record.id) ? `RESTORE-${String(index).padStart(2, '0')}-CURRENT-P${(index % 7) + 1}` : record.baseValue
]));
const deltaOps = liveIndexes.map((index) => {
  const record = baseRecords[index];
  return {
    op: 'replace',
    id: record.id,
    text: record.text.replace(record.baseValue, currentValues.get(record.id))
  };
});
const updatedBlocks = applyContextDelta(baseBlocks, deltaOps);
const fullContext = renderContextSelection(updatedBlocks);
const fullContextBytes = bytes(fullContext);

function questionVariants(record) {
  const alias = record.alias;
  const parts = alias.split(' ');
  const typoFirst = parts[0].length > 4 ? `${parts[0].slice(0, 2)}${parts[0][3]}${parts[0][2]}${parts[0].slice(4)}` : parts[0];
  const typoAlias = [typoFirst, ...parts.slice(1)].join(' ');
  return [
    `What is the current authoritative service restoration objective for ${alias}?`,
    `For ${alias}, return the approved recovery-time value that governs service restoration now.`,
    `Which RESTORE_VALUE is authoritative today for ${alias}?`,
    `Give the governing restoration objective for ${typoAlias}; ignore retired or unrelated recovery notes.`
  ];
}

const retrievalCases = baseRecords.flatMap((record) => questionVariants(record).map((question, variant) => ({
  id: record.id,
  alias: record.alias,
  expected: currentValues.get(record.id),
  question,
  variant
})));

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

function taskFor(question) {
  return `${question} Use only the supplied authoritative context. Return exactly one concise line in the form ANSWER=<RESTORE_VALUE>.`;
}

function reviewTaskFor(question) {
  return `${question} Verify the candidate against the supplied authoritative context. Return exactly one concise line in the form ANSWER=<RESTORE_VALUE>.`;
}

const requester = new TruynNode({ relayUrl });

async function fetchRelayChainTrace(chainId) {
  const traceUrl = `${relayUrl}/v1/fast/chains/${encodeURIComponent(chainId)}/trace`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(traceUrl, { headers: { authorization: `Bearer ${requester.sessionToken}` } });
    const body = await response.json();
    if (response.ok) return body.trace;
    if (response.status !== 409) throw new Error(body.error || `Trace HTTP ${response.status}`);
    await sleep(10);
  }
  throw new Error('Timed out waiting for relay chain trace flush');
}

await requester.register({ name: 'semantic-retrieval-gate-requester' });
const researchOffers = await requester.find('research');
const reviewOffers = await requester.find('review');
const researchProvider = researchOffers.offers?.find((offer) => offer.payload?.metadata?.fastPath === true)?.from || researchOffers.offers?.[0]?.from;
const reviewProvider = reviewOffers.offers?.find((offer) => offer.payload?.metadata?.fastPath === true)?.from || reviewOffers.offers?.[0]?.from;
if (!researchProvider || !reviewProvider) throw new Error('TRUYN research/review providers are required');
if (researchProvider === reviewProvider) throw new Error('Semantic gate requires distinct Azure and Gemini providers');

const baseContext = await requester.putContext(baseBlocks, {
  readers: [researchProvider, reviewProvider],
  metadata: { benchmark: 'semantic-retrieval-gate-base' }
});
const updatedContext = await requester.deltaContext(baseContext.cid, deltaOps, {
  readers: [researchProvider, reviewProvider],
  metadata: { benchmark: 'semantic-retrieval-gate-updated' }
});
const setupTransferBytes = baseContext.transferBytes + updatedContext.transferBytes;

const retrievalResults = [];
for (let index = 0; index < retrievalCases.length; index += 1) {
  const item = retrievalCases[index];
  const noBlockId = !item.question.includes(item.id);
  const retrieved = await requester.retrieveContext(updatedContext.cid, item.question, { topK: 1 });
  const top = retrieved.blocks[0];
  const proof = retrieved.retrieval?.selected?.[0];
  const provenancePass = Boolean(
    retrieved.provenanceVerified &&
    retrieved.retrieval?.rootCid === updatedContext.cid &&
    retrieved.retrieval?.manifestCid === updatedContext.cid &&
    retrieved.retrieval?.queryHash === contextQueryHash(item.question) &&
    proof?.id === top?.id &&
    proof?.cid === top?.cid &&
    proof?.rank === 1
  );
  retrievalResults.push({
    expectedId: item.id,
    selectedId: top?.id || null,
    correct: top?.id === item.id,
    noBlockId,
    provenancePass,
    queryHash: retrieved.retrieval?.queryHash || null,
    selectedCid: top?.cid || null,
    score: proof?.score ?? null,
    variant: item.variant
  });
}

const retrievalAccuracy = percent(retrievalResults.filter((item) => item.correct).length, retrievalResults.length);
const retrievalProvenancePercent = percent(retrievalResults.filter((item) => item.provenancePass).length, retrievalResults.length);
const retrievalNoBlockIdPercent = percent(retrievalResults.filter((item) => item.noBlockId).length, retrievalResults.length);
console.error(`Retrieval-only suite complete: ${retrievalResults.length} cases, accuracy=${retrievalAccuracy}%`);

async function directRun(index) {
  const record = baseRecords[index];
  const expected = currentValues.get(record.id);
  const question = questionVariants(record)[index % 4];
  const research = await directAzure.execute({
    capability: 'research',
    input: { task: taskFor(question), context: fullContext },
    policy: { benchmark: 'semantic-retrieval-gate-direct-control' }
  });
  const review = await directGemini.execute({
    capability: 'review',
    input: { task: reviewTaskFor(question), candidate: research.output, context: fullContext },
    policy: { benchmark: 'semantic-retrieval-gate-direct-control', providerOptions: { thinkingBudget: 0 } }
  });
  const azure = azureUsage(research.metadata);
  const gemini = geminiUsage(review.metadata);
  return {
    id: record.id,
    alias: record.alias,
    question,
    expected,
    answerPass: String(research.output).includes(expected) && String(review.output).includes(expected),
    azure,
    gemini,
    providerInputTokens: azure.input + gemini.input,
    providerTotalTokens: azure.total + gemini.total,
    inferenceCostUsd: inferenceCost(azure, gemini),
    providerRequestBodyBytes: (research.metadata?.providerRequestBodyBytes || 0) + (review.metadata?.providerRequestBodyBytes || 0),
    repeatedContextBytes: fullContextBytes * 2,
    outputs: { research: research.output, review: review.output }
  };
}

async function truynRun(index) {
  const record = baseRecords[index];
  const expected = currentValues.get(record.id);
  const question = questionVariants(record)[index % 4];
  const ref = { $context: { cid: updatedContext.cid, query: question, topK: 1 } };
  const stages = [
    {
      capability: 'research',
      input: { task: taskFor(question), context: ref },
      policy: { benchmark: 'semantic-retrieval-gate' }
    },
    {
      capability: 'review',
      inputTemplate: { task: reviewTaskFor(question), candidate: { $previous: 'output' }, context: ref },
      policy: { benchmark: 'semantic-retrieval-gate', providerOptions: { thinkingBudget: 0 } }
    }
  ];
  const serialized = JSON.stringify(stages);
  const noBlockId = !question.includes(record.id) && !serialized.includes(record.id) && !serialized.includes('"ids"');
  requester.closeFastSocket();
  await requester.ensureFastSocket();
  const chain = await requester.compactChain(stages);
  if (chain.requesterTransport !== 'websocket') throw new Error(`TRUYN requester transport fallback: ${chain.requesterTransport}`);
  const trace = await fetchRelayChainTrace(chain.chainId);
  if (JSON.stringify(trace.stageTransport) !== JSON.stringify(['socket', 'socket'])) {
    throw new Error(`TRUYN provider transport fallback: ${JSON.stringify(trace.stageTransport)}`);
  }
  const researchEvent = chain.results?.[0];
  const reviewEvent = chain.results?.[1];
  if (!researchEvent || !reviewEvent) throw new Error('Semantic TRUYN chain did not return both provider stages');
  if (researchEvent.verification?.ok !== true || reviewEvent.verification?.ok !== true) throw new Error('Semantic TRUYN result signature verification failed');
  const research = researchEvent.payload;
  const review = reviewEvent.payload;
  if (research?.metadata?.failed) throw new Error(`Semantic research provider failed: ${research.metadata.error || 'unknown'}`);
  if (review?.metadata?.failed) throw new Error(`Semantic review provider failed: ${review.metadata.error || 'unknown'}`);

  const rContext = research.metadata?.contextResolution || {};
  const vContext = review.metadata?.contextResolution || {};
  const provenancePass = rContext.retrievalQueries === 1 && rContext.provenanceVerifiedRefs === 1 &&
    vContext.retrievalQueries === 1 && vContext.provenanceVerifiedRefs === 1;
  const minimalContextPass = rContext.selectedBlocks === 1 && vContext.selectedBlocks === 1;
  const azure = azureUsage(research.metadata);
  const gemini = geminiUsage(review.metadata);
  const resolverTransferBytes = (rContext.contextTransferBytes || 0) + (vContext.contextTransferBytes || 0);
  const contextRefBytes = bytes(ref) * 2;
  return {
    id: record.id,
    alias: record.alias,
    question,
    expected,
    answerPass: String(research.output).includes(expected) && String(review.output).includes(expected),
    noBlockId,
    provenancePass,
    minimalContextPass,
    signaturesVerified: true,
    azure,
    gemini,
    providerInputTokens: azure.input + gemini.input,
    providerTotalTokens: azure.total + gemini.total,
    inferenceCostUsd: inferenceCost(azure, gemini),
    providerRequestBodyBytes: (research.metadata?.providerRequestBodyBytes || 0) + (review.metadata?.providerRequestBodyBytes || 0),
    contextTransferBytes: resolverTransferBytes + contextRefBytes,
    selectedContentBytes: (rContext.selectedContentBytes || 0) + (vContext.selectedContentBytes || 0),
    protocolOverheadBytes: chain.protocolOverheadBytes,
    outputs: { research: research.output, review: review.output }
  };
}

const directSamples = [];
const truynSamples = [];
for (let pair = 0; pair < liveIndexes.length; pair += 1) {
  const index = liveIndexes[pair];
  if (pair % 2 === 0) {
    directSamples.push(await withRetry(`live-${pair + 1}-direct`, () => directRun(index)));
    await sleep(pacingMs);
    truynSamples.push(await withRetry(`live-${pair + 1}-truyn`, () => truynRun(index)));
  } else {
    truynSamples.push(await withRetry(`live-${pair + 1}-truyn`, () => truynRun(index)));
    await sleep(pacingMs);
    directSamples.push(await withRetry(`live-${pair + 1}-direct`, () => directRun(index)));
  }
  if (pair + 1 < liveIndexes.length) await sleep(pacingMs);
  console.error(`Semantic live pair ${pair + 1}/${liveIndexes.length} complete`);
}
requester.closeFastSocket();

const mean = (items, getter) => items.reduce((sum, item) => sum + getter(item), 0) / Math.max(1, items.length);
const directInputMean = mean(directSamples, (item) => item.providerInputTokens);
const truynInputMean = mean(truynSamples, (item) => item.providerInputTokens);
const directCostMean = mean(directSamples, (item) => item.inferenceCostUsd);
const truynCostMean = mean(truynSamples, (item) => item.inferenceCostUsd);
const directBodyMean = mean(directSamples, (item) => item.providerRequestBodyBytes);
const truynBodyMean = mean(truynSamples, (item) => item.providerRequestBodyBytes);
const answerAccuracy = percent(truynSamples.filter((item) => item.answerPass).length, truynSamples.length);
const directAnswerAccuracy = percent(directSamples.filter((item) => item.answerPass).length, directSamples.length);
const liveProvenancePercent = percent(truynSamples.filter((item) => item.provenancePass).length, truynSamples.length);
const liveNoBlockIdPercent = percent(truynSamples.filter((item) => item.noBlockId).length, truynSamples.length);
const minimalContextPercent = percent(truynSamples.filter((item) => item.minimalContextPass).length, truynSamples.length);
const inputReduction = reductionPercent(directInputMean, truynInputMean);
const costReduction = reductionPercent(directCostMean, truynCostMean);
const providerBodyReduction = reductionPercent(directBodyMean, truynBodyMean);
const directContextTransferBytes = directSamples.reduce((sum, item) => sum + item.repeatedContextBytes, 0);
const truynQueryTransferBytes = truynSamples.reduce((sum, item) => sum + item.contextTransferBytes, 0);
const truynAmortizedTransferBytes = setupTransferBytes + truynQueryTransferBytes;

const semanticGate = {
  thresholds: gate,
  measured: {
    retrievalCases: retrievalResults.length,
    retrievalAccuracyPercent: retrievalAccuracy,
    answerAccuracyPercent: answerAccuracy,
    directControlAnswerAccuracyPercent: directAnswerAccuracy,
    providerInputTokensDirectMean: round(directInputMean, 3),
    providerInputTokensTruynMean: round(truynInputMean, 3),
    inputTokenReductionPercent: inputReduction,
    inferenceCostDirectMeanUsd: round(directCostMean, 9),
    inferenceCostTruynMeanUsd: round(truynCostMean, 9),
    inferenceCostReductionPercent: costReduction,
    providerRequestBodyReductionPercent: providerBodyReduction,
    retrievalProvenancePassPercent: retrievalProvenancePercent,
    liveProvenancePassPercent: liveProvenancePercent,
    noBlockIdPassPercent: Math.min(retrievalNoBlockIdPercent, liveNoBlockIdPercent),
    minimalContextPassPercent: minimalContextPercent,
    directRepeatedContextTransferBytes: directContextTransferBytes,
    truynSetupTransferBytes: setupTransferBytes,
    truynQueryContextTransferBytes: truynQueryTransferBytes,
    truynAmortizedContextTransferBytes: truynAmortizedTransferBytes,
    contextTransferReductionPercent: reductionPercent(directContextTransferBytes, truynAmortizedTransferBytes)
  },
  pass: {
    retrievalAccuracy: retrievalAccuracy >= gate.retrievalAccuracyPercentMin,
    answerAccuracy: answerAccuracy >= gate.answerAccuracyPercentMin,
    directControlAnswerAccuracy: directAnswerAccuracy >= gate.answerAccuracyPercentMin,
    inputTokens: inputReduction >= gate.inputTokenReductionPercentMin,
    inferenceCost: costReduction >= gate.inferenceCostReductionPercentMin,
    provenance: retrievalProvenancePercent >= gate.provenancePassPercentMin && liveProvenancePercent >= gate.provenancePassPercentMin,
    noBlockId: retrievalNoBlockIdPercent >= gate.noBlockIdPassPercentMin && liveNoBlockIdPercent >= gate.noBlockIdPassPercentMin,
    minimalContext: minimalContextPercent >= gate.minimalContextPassPercentMin
  }
};
semanticGate.passed = Object.values(semanticGate.pass).every(Boolean);

const report = {
  benchmark: 'TRUYN Semantic Retrieval Gate A/B',
  status: 'success',
  generatedAt: new Date().toISOString(),
  relayUrl,
  context: {
    baseCid: baseContext.cid,
    updatedCid: updatedContext.cid,
    blocks: updatedBlocks.length,
    fullContextBytes,
    baseTransferBytes: baseContext.transferBytes,
    deltaTransferBytes: updatedContext.transferBytes,
    setupTransferBytes
  },
  semanticGate,
  aggregate: {
    direct: {
      providerInputTokensMean: round(directInputMean, 3),
      inferenceCostUsdMean: round(directCostMean, 9),
      providerRequestBodyBytesMean: round(directBodyMean, 3),
      answerAccuracyPercent: directAnswerAccuracy,
      repeatedContextTransferBytes: directContextTransferBytes
    },
    truyn: {
      providerInputTokensMean: round(truynInputMean, 3),
      inferenceCostUsdMean: round(truynCostMean, 9),
      providerRequestBodyBytesMean: round(truynBodyMean, 3),
      answerAccuracyPercent: answerAccuracy,
      selectedContentBytesMean: round(mean(truynSamples, (item) => item.selectedContentBytes), 3),
      protocolOverheadBytesMean: round(mean(truynSamples, (item) => item.protocolOverheadBytes), 3),
      queryContextTransferBytes: truynQueryTransferBytes,
      amortizedContextTransferBytes: truynAmortizedTransferBytes
    }
  },
  methodology: {
    retrievalAlgorithm: 'truyn-hybrid-bm25-chargram-v1',
    retrievalCases: retrievalResults.length,
    livePairedChains: liveIndexes.length,
    direct: 'Question plus the complete updated corpus is sent to Azure, then the complete updated corpus is sent again to Gemini review.',
    truyn: 'The signed CHAIN contains the question and root context CID only. No block ID or ids array is present. Each provider independently retrieves top-1 context from the root CID, verifies manifest/block CID/query-hash provenance, and materializes only the selected block before inference.',
    provenance: 'Requester-side retrieval suite verifies root CID, manifest CID, normalized question hash, selected block CID and rank. Provider-side live samples must report one retrieval and one verified provenance reference per stage.',
    quality: 'Retrieval correctness is measured independently from model answer correctness. Live answer samples must contain the authoritative current RESTORE_VALUE after a signed delta changed the measured target blocks.',
    models: { azure: azureModel, gemini: geminiModel },
    geminiThinkingBudget: 0,
    thinkingControl: 'Gemini 2.5 Flash thinking is disabled symmetrically in direct and TRUYN review arms because this benchmark is deterministic extraction/verification; retrieval itself remains model-free.',
    pricingSnapshot: rates,
    retryEvents,
    limitations: 'This gate measures TRUYN hybrid lexical/fuzzy retrieval on entity-anchored heterogeneous records. It does not claim embedding-level synonym-only retrieval or general open-domain RAG quality.'
  },
  retrievalResults,
  directSamples,
  truynSamples
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  benchmark: report.benchmark,
  status: report.status,
  context: report.context,
  semanticGate: report.semanticGate,
  aggregate: report.aggregate
}, null, 2));