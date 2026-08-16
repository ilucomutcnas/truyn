import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { SemanticTruynNode } from '../node/semantic-client.js';
import { createMemorySemanticIndexStore } from '../core/context/semantic-index-store.js';
import { createProductionSemanticIndex } from '../core/context/production-semantic-index.js';

const ACTORS = ['GPT','Gemini','Grok','DeepSeek','Llama','Mistral','Kimi'];
const CAPABILITY = 'context.retrieve.concurrent';
const corpusBlocks = Number(process.env.SEMANTIC_CONCURRENT_BLOCKS || 10_000);
const rootCount = Number(process.env.SEMANTIC_CONCURRENT_ROOTS || 5);
const outputPath = process.env.SEMANTIC_CONCURRENT_OUTPUT || 'semantic-concurrent-load.json';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function latency(values) {
  if (!values.length) return { count:0, minMs:null, p50Ms:null, p95Ms:null, p99Ms:null, maxMs:null, meanMs:null };
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count:values.length,
    minMs:Number(Math.min(...values).toFixed(3)),
    p50Ms:Number(percentile(values, 50).toFixed(3)),
    p95Ms:Number(percentile(values, 95).toFixed(3)),
    p99Ms:Number(percentile(values, 99).toFixed(3)),
    maxMs:Number(Math.max(...values).toFixed(3)),
    meanMs:Number((total / values.length).toFixed(3))
  };
}

function countingEmbedder(ms = 8) {
  const counts = { calls:0, documentCalls:0, documentInputs:0, queryCalls:0, queryInputs:0 };
  const vector = (text) => /alpha/i.test(text) ? [1,0,0] : [0,1,0];
  return {
    counts,
    async embedMany(texts, { taskType } = {}) {
      counts.calls += 1;
      if (taskType === 'RETRIEVAL_DOCUMENT') {
        counts.documentCalls += 1;
        counts.documentInputs += texts.length;
      }
      if (taskType === 'RETRIEVAL_QUERY') {
        counts.queryCalls += 1;
        counts.queryInputs += texts.length;
      }
      await delay(ms);
      return texts.map(vector);
    }
  };
}

function countingReranker(ms = 12) {
  const counts = { calls:0, candidateInputs:0 };
  return {
    name:'concurrent-counting-reranker',
    counts,
    async rerank(_query, candidates) {
      counts.calls += 1;
      counts.candidateInputs += candidates.length;
      await delay(ms);
      return { id:candidates[0].id, metadata:{ benchmark:'concurrent-load' } };
    },
    stats() { return { ...counts }; }
  };
}

function diff(after, before) {
  return Object.fromEntries(Object.keys(after).filter((key) => Number.isFinite(after[key])).map((key) => [key, after[key] - (before[key] || 0)]));
}

function makeRoots() {
  const noise = Array.from({ length:corpusBlocks - 1 }, (_, index) => ({
    id:`noise-${String(index).padStart(6, '0')}`,
    text:`neutral unrelated record ${index} without the requested concept`
  }));
  return Array.from({ length:rootCount }, (_, rootIndex) => ({
    targetId:`alpha-target-root-${rootIndex + 1}`,
    blocks:[
      { id:`alpha-target-root-${rootIndex + 1}`, text:`alpha canonical context for root ${rootIndex + 1}` },
      ...noise
    ]
  }));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, items.length) }, worker));
  return results;
}

const relay = createRelay({ localDevelopmentMode:true });
const relayUrl = await relay.listen({ port:0 });

try {
  const store = createMemorySemanticIndexStore();
  const producerEmbedder = countingEmbedder(0);
  const producer = createProductionSemanticIndex({ embedder:producerEmbedder, indexStore:store, singleFlight:true });
  const rootFixtures = makeRoots();
  for (const fixture of rootFixtures) {
    const published = await producer.publishContext(fixture.blocks, { benchmark:'concurrent-load' });
    fixture.cid = published.cid;
  }

  const consumerEmbedder = countingEmbedder();
  const reranker = countingReranker();
  const semanticIndex = createProductionSemanticIndex({
    embedder:consumerEmbedder,
    reranker,
    indexStore:store,
    singleFlight:true
  });

  const semanticProvider = new SemanticTruynNode({ relayUrl, semanticRouter:semanticIndex.router });
  await semanticProvider.register({ name:'TRUYN Semantic Retrieval Gate' });
  await semanticProvider.offer(CAPABILITY, { benchmark:true, concurrent:true });

  const actors = [];
  for (const name of ACTORS) {
    const node = new TruynNode({ relayUrl });
    await node.register({ name });
    actors.push({ name, node });
  }

  const targetByRoot = new Map(rootFixtures.map((fixture) => [fixture.cid, fixture.targetId]));

  async function runBurst({ name, question, roots, repetitionsPerActorPerRoot }) {
    const requests = [];
    for (const actor of actors) {
      for (const root of roots) {
        for (let repeat = 0; repeat < repetitionsPerActorPerRoot; repeat += 1) {
          requests.push({ actor, root, input:{ question, rootCid:root.cid } });
        }
      }
    }

    const expectedUniqueRetrievals = roots.length;
    const beforeEmbed = { ...consumerEmbedder.counts };
    const beforeRerank = { ...reranker.counts };
    const beforeConcurrency = { ...semanticIndex.stats().concurrency };
    const startedAt = performance.now();

    const dispatchStartedAt = performance.now();
    const assignments = await Promise.all(requests.map(async (request) => {
      const keys = Object.keys(request.input).sort();
      if (keys.join(',') !== 'question,rootCid') throw new Error('agent input contract violated');
      const visible = JSON.stringify(request.input);
      if (/alpha-target-root-|noise-\d+/i.test(visible) || visible.includes('"ids"')) throw new Error('block ID leaked into NEED input');
      const assigned = await request.actor.node.need(CAPABILITY, request.input, { expectedProvider:'TRUYN Semantic Retrieval Gate' });
      if (assigned.provider !== semanticProvider.identity.nodeId) throw new Error('NEED routed to unexpected provider');
      return assigned;
    }));
    const dispatchMs = performance.now() - dispatchStartedAt;

    const polled = await semanticProvider.poll();
    if (polled.events.length !== requests.length) throw new Error(`provider received ${polled.events.length}/${requests.length} NEEDs`);

    const retrievalLatencies = [];
    const processed = await Promise.all(polled.events.map(async (event) => {
      if (event.kind !== 'NEED' || event.verification?.ok !== true) throw new Error('invalid NEED event');
      const input = event.envelope.payload?.input || {};
      const expectedId = targetByRoot.get(input.rootCid);
      if (!expectedId) throw new Error('unknown root CID in NEED');
      const t0 = performance.now();
      const selected = await semanticProvider.retrieveContext(input.rootCid, input.question, { topK:1 });
      retrievalLatencies.push(performance.now() - t0);
      if (!selected.provenanceVerified) throw new Error('provenance verification failed');
      if (selected.blocks.length !== 1) throw new Error('minimal context violated');
      if (selected.blocks[0].id !== expectedId) throw new Error('wrong semantic block selected');
      return { event, selected };
    }));

    await mapLimit(processed, 32, async ({ event, selected }) => {
      const output = {
        context:selected.blocks[0].text,
        provenanceVerified:true
      };
      const visible = JSON.stringify(output);
      if (/alpha-target-root-|noise-\d+/i.test(visible) || visible.includes('"ids"')) throw new Error('block ID leaked into RESULT output');
      await semanticProvider.result(event.envelope.id, output, {
        provenanceVerified:true,
        minimalContext:true
      });
    });

    let delivered = 0;
    const byActor = {};
    for (const actor of actors) {
      const events = await actor.node.poll();
      const valid = events.events.filter((event) => event.kind === 'RESULT' && event.verification?.ok === true);
      byActor[actor.name] = valid.length;
      delivered += valid.length;
    }

    const elapsedMs = performance.now() - startedAt;
    const embedDelta = diff(consumerEmbedder.counts, beforeEmbed);
    const rerankDelta = diff(reranker.counts, beforeRerank);
    const afterConcurrency = semanticIndex.stats().concurrency;
    const concurrencyDelta = diff(afterConcurrency, beforeConcurrency);
    const duplicatePaidWork = Math.max(0, embedDelta.queryCalls - 1) + Math.max(0, rerankDelta.calls - expectedUniqueRetrievals);
    const gates = {
      allNeedAssigned:assignments.length === requests.length,
      allNeedDelivered:delivered === requests.length,
      provenance100:processed.every((item) => item.selected.provenanceVerified),
      minimalContext100:processed.every((item) => item.selected.blocks.length === 1),
      noBlockIdLeakage100:true,
      noDocumentReembedding:embedDelta.documentInputs === 0,
      oneQueryEmbedding:embedDelta.queryCalls === 1 && embedDelta.queryInputs === 1,
      oneRerankPerUniqueRootQuery:rerankDelta.calls === expectedUniqueRetrievals,
      noDuplicatePaidSemanticWork:duplicatePaidWork === 0,
      retrievalSingleFlightExact:concurrencyDelta.retrievalFlightLeaders === expectedUniqueRetrievals && concurrencyDelta.retrievalFlightFollowers === requests.length - expectedUniqueRetrievals
    };
    const passed = Object.values(gates).every(Boolean);

    return {
      name,
      question,
      roots:roots.length,
      needs:requests.length,
      actorFamilies:ACTORS,
      repetitionsPerActorPerRoot,
      uniqueSemanticRetrievals:expectedUniqueRetrievals,
      byActor,
      dispatchMs:Number(dispatchMs.toFixed(3)),
      totalMs:Number(elapsedMs.toFixed(3)),
      retrievalLatency:latency(retrievalLatencies),
      embedderDelta:embedDelta,
      rerankerDelta:rerankDelta,
      concurrencyDelta,
      duplicatePaidSemanticWork:duplicatePaidWork,
      gates,
      passed
    };
  }

  const scenarios = [];
  scenarios.push(await runBurst({
    name:'70 simultaneous NEEDs / one root CID / one question',
    question:'alpha concurrent single root question',
    roots:[rootFixtures[0]],
    repetitionsPerActorPerRoot:10
  }));
  scenarios.push(await runBurst({
    name:'350 simultaneous NEEDs / five root CIDs / one shared question',
    question:'alpha concurrent multi root question',
    roots:rootFixtures,
    repetitionsPerActorPerRoot:10
  }));

  const report = {
    benchmark:'TRUYN Concurrent Load / Multi-Agent Semantic Retrieval Gate',
    generatedAt:new Date().toISOString(),
    actorFamilies:ACTORS,
    corpusBlocksPerRoot:corpusBlocks,
    roots:rootFixtures.length,
    rootSharing:'all roots share the same immutable noise blocks and differ only in one target block',
    requesterContract:'signed NEED input contains exactly question + rootCid; no block ID/candidate list/ids[]',
    dedupContract:'same rootCid + question + topK shares one complete semantic retrieval; same question across roots shares query-cache population while each distinct root candidate set is reranked once',
    providerBoundary:'deterministic delayed embedder/reranker instrument paid-call multiplicity; this benchmark tests concurrency/dedup mechanics, not live model semantic quality',
    producerDocumentEmbeddings:producerEmbedder.counts.documentInputs,
    consumerDocumentEmbeddings:consumerEmbedder.counts.documentInputs,
    scenarios,
    finalConcurrencyStats:semanticIndex.stats().concurrency,
    passed:scenarios.every((scenario) => scenario.passed)
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 2;
} finally {
  await relay.close();
}
