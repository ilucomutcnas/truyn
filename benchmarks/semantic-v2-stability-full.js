import fs from 'node:fs';
import vm from 'node:vm';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';
import { createVertexEmbeddingClient } from '../adapters/providers/vertex-embedding.js';
import { createConfidenceGatedSemanticReranker } from '../core/context/confidence-gated-semantic-reranker.js';

const corpusSource = process.env.SEMANTIC_V2_CORPUS_SOURCE || '/tmp/semantic-retrieval-v2.js';
const outputPath = process.env.SEMANTIC_V2_OUTPUT || 'semantic-v2-stability-full.json';
const sourceSha = process.env.SEMANTIC_V2_SOURCE_SHA || null;
const projectId = process.env.GCP_PROJECT_ID;
const endpoint = process.env.VERTEX_API_ENDPOINT;
const accessToken = process.env.GCP_ACCESS_TOKEN;
const budget = Number(process.env.ROUTING_COST_BUDGET_USD_PER_QUERY || 0.00395);
if (!projectId || !endpoint || !accessToken) throw new Error('GCP_PROJECT_ID, VERTEX_API_ENDPOINT and GCP_ACCESS_TOKEN are required');

const source = fs.readFileSync(corpusSource, 'utf8');
const start = source.indexOf('const domains = [');
const end = source.indexOf('const fullContext =');
if (start < 0 || end < 0) throw new Error('immutable corpus markers missing');
const box = {};
vm.createContext(box);
vm.runInContext(`const corpusSize=600,retrievalCaseCount=360;${source.slice(start, end)};globalThis.__d={records,blocks,retrievalCases};`, box);
const { records, blocks, retrievalCases } = box.__d;

const accessTokenProvider = async () => accessToken;
const makeProvider = (model) => createVertexGeminiProvider({
  projectId,
  location:'global',
  model,
  endpoint,
  accessTokenProvider,
  capabilities:['reasoning.general'],
  requestTimeoutMs:180000
});

const privacy = { providerCalls:0, leakedCalls:0 };
const guard = (provider) => ({
  async execute(request) {
    privacy.providerCalls += 1;
    const visible = JSON.stringify(request.input || {});
    if (/semantic-record-\d+/i.test(visible) || visible.includes('"ids"')) {
      privacy.leakedCalls += 1;
      throw new Error('TRUYN block routing identifier leaked to semantic judge');
    }
    return provider.execute(request);
  }
});

const schema = { type:'OBJECT', properties:{ id:{ type:'STRING' } }, required:['id'] };
const reranker = createConfidenceGatedSemanticReranker({
  liteProvider:guard(makeProvider(process.env.LITE_MODEL || 'gemini-3.1-flash-lite')),
  flashProvider:guard(makeProvider(process.env.FLASH_MODEL || 'gemini-3-flash-preview')),
  verifierProvider:guard(makeProvider(process.env.PRO_VERIFIER_MODEL || 'gemini-3.1-pro-preview')),
  cheapCandidateK:24,
  confidenceDenseRankMax:15,
  maxCandidates:64,
  verifierCandidateTiers:null,
  stabilityRecheckDenseRanks:[2],
  liteProviderOptions:{ thinkingLevel:'MINIMAL', temperature:0, maxOutputTokens:512, responseMimeType:'application/json', responseSchema:schema },
  flashProviderOptions:{ thinkingLevel:'MINIMAL', temperature:0, maxOutputTokens:512, responseMimeType:'application/json', responseSchema:schema },
  verifierProviderOptions:{ temperature:0, maxOutputTokens:1024, responseMimeType:'application/json', responseSchema:schema },
  repairAttempts:1
});

const embedding = createVertexEmbeddingClient({
  projectId,
  location:'us-central1',
  model:process.env.VERTEX_EMBEDDING_MODEL || 'gemini-embedding-001',
  endpoint,
  accessTokenProvider,
  batchSize:1,
  outputDimensionality:Number(process.env.VERTEX_EMBEDDING_DIMENSIONS || 768),
  maxRetries:10
});

const norm = (v) => Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
function cosine(left, right) {
  let dot = 0;
  for (let i = 0; i < left.length; i += 1) dot += left[i] * right[i];
  const denominator = norm(left) * norm(right);
  return denominator ? dot / denominator : 0;
}
async function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, items.length) }, worker));
  return output;
}

const documentVectors = await mapLimit(blocks, 8, async (block) => (await embedding.embedMany([block.text], { taskType:'RETRIEVAL_DOCUMENT' }))[0]);
const queryVectors = await mapLimit(retrievalCases, 8, async (item) => (await embedding.embedMany([item.question], { taskType:'RETRIEVAL_QUERY' }))[0]);
let completed = 0;
const rows = await mapLimit(retrievalCases, 4, async (item, queryIndex) => {
  const dense64 = blocks
    .map((block, index) => ({ id:block.id, text:block.text, score:cosine(queryVectors[queryIndex], documentVectors[index]) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 64);
  const expectedDenseRank = dense64.findIndex((candidate) => candidate.id === item.id) + 1;
  const result = await reranker.rerank(item.question, dense64);
  const selected = records.find((record) => record.id === result.id);
  completed += 1;
  if (completed % 20 === 0) process.stderr.write(`processed ${completed}/360\n`);
  return {
    caseIndex:item.caseIndex,
    expectedId:item.id,
    selectedId:result.id,
    correct:result.id === item.id,
    category:item.category,
    queryLanguage:item.queryLanguage,
    blockLanguage:item.blockLanguage,
    denseRecall:expectedDenseRank > 0,
    expectedDenseRank:expectedDenseRank || null,
    selectedDenseRank:dense64.findIndex((candidate) => candidate.id === result.id) + 1,
    provenancePass:Boolean(selected?.cid),
    noBlockIdPass:privacy.leakedCalls === 0,
    minimalContextPass:Boolean(selected),
    routeMode:result.metadata.routeMode,
    agreedDenseRank:result.metadata.agreedDenseRank,
    stabilityChecked:result.metadata.stabilityChecked,
    stabilityPassed:result.metadata.stabilityPassed,
    stabilityLiteDenseRank:result.metadata.stabilityLiteDenseRank,
    stabilityFlashDenseRank:result.metadata.stabilityFlashDenseRank,
    verifierCandidateK:result.metadata.verifierCandidateK || null
  };
});

const metricsBy = (field) => Object.fromEntries([...new Set(rows.map((row) => row[field]))].sort().map((value) => {
  const subset = rows.filter((row) => row[field] === value);
  const correct = subset.filter((row) => row.correct).length;
  return [value, { correct, total:subset.length, accuracyPercent:Number((100 * correct / subset.length).toFixed(3)) }];
}));
const stats = reranker.stats();
const rates = { lite:{ input:0.25, output:1.5 }, flash:{ input:0.5, output:3 }, pro:{ input:2, output:12 } };
const costPart = (part, rate) => ((part.inputTokens || 0) * rate.input + (part.outputTokens || 0) * rate.output) / 1_000_000;
const costs = {
  lite:costPart(stats.lite, rates.lite),
  flash:costPart(stats.flash, rates.flash),
  pro:costPart(stats.verifier, rates.pro)
};
const routingCost = costs.lite + costs.flash + costs.pro;
const correct = rows.filter((row) => row.correct).length;
const denseRecall = rows.filter((row) => row.denseRecall).length;
const provenance = rows.filter((row) => row.provenancePass).length;
const minimal = rows.filter((row) => row.minimalContextPass).length;
const noBlockId = privacy.leakedCalls === 0 ? rows.length : 0;
const perLanguage = metricsBy('queryLanguage');
const perCategory = metricsBy('category');
const gate = {
  accuracyPercent:Number((100 * correct / rows.length).toFixed(3)),
  denseRecallPercent:Number((100 * denseRecall / rows.length).toFixed(3)),
  perLanguage,
  perCategory,
  provenancePercent:Number((100 * provenance / rows.length).toFixed(3)),
  noBlockIdPercent:Number((100 * noBlockId / rows.length).toFixed(3)),
  minimalContextPercent:Number((100 * minimal / rows.length).toFixed(3)),
  routingCostBudgetUsdPerQuery:budget,
  routingCostUsdPerQuery:Number((routingCost / rows.length).toFixed(9)),
  accuracyPass:correct / rows.length >= 0.99 && Object.values(perLanguage).every((entry) => entry.accuracyPercent >= 99) && Object.values(perCategory).every((entry) => entry.accuracyPercent >= 99),
  integrityPass:provenance === rows.length && noBlockId === rows.length && minimal === rows.length && denseRecall === rows.length,
  economicPass:routingCost / rows.length <= budget
};
gate.passed = gate.accuracyPass && gate.integrityPass && gate.economicPass;

const report = {
  benchmark:'TRUYN Semantic Retrieval Gate v2 production stability full 360 proof',
  generatedAt:new Date().toISOString(),
  sourceSha,
  methodology:{
    denseCandidateK:64,
    cheapCandidateK:24,
    confidenceDenseRankMax:15,
    verifierCandidateTiers:null,
    stabilityRecheckDenseRanks:[2],
    stabilityRecheckJudge:'gemini-3.1-flash-lite',
    stabilityRecheck:'when both cheap judges agree on dense rank 2, repeat Lite only with reversed candidate order; accept only the same original passage, otherwise fail closed to Gemini 3.1 Pro over dense top 64',
    provenanceDefinition:'provenance validates identity/integrity of the selected immutable block; semantic correctness is measured separately by retrieval accuracy',
    privacy:'provider-bound payload is rejected if a semantic-record block id or ids[] field is present'
  },
  privacy,
  embedding:embedding.stats(),
  rerankerStats:stats,
  ratesUsdPerMillionTokens:rates,
  costsUsd:{ lite:Number(costs.lite.toFixed(9)), flash:Number(costs.flash.toFixed(9)), pro:Number(costs.pro.toFixed(9)), total:Number(routingCost.toFixed(9)) },
  semanticGate:gate,
  rows
};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ semanticGate:gate, privacy, rerankerStats:stats, costsUsd:report.costsUsd }, null, 2));
if (!gate.passed) process.exitCode = 2;
