function parseSingleId(output, allowedIds) {
  const text = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.id === 'string' && allowedIds.includes(parsed.id)) return parsed.id;
  } catch {}
  const fenced = text.match(/\{[\s\S]*?"id"\s*:\s*"([^"]+)"[\s\S]*?\}/);
  if (fenced?.[1] && allowedIds.includes(fenced[1])) return fenced[1];
  const bare = text.match(/(?:^|\s)id\s*[=:]\s*([A-Za-z0-9._:-]+)/i);
  if (bare?.[1] && allowedIds.includes(bare[1])) return bare[1];
  const directMatches = allowedIds.filter((id) => text.includes(id));
  return directMatches.length === 1 ? directMatches[0] : null;
}

function parseIdList(output, allowedIds, requiredCount) {
  const text = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  const addUnique = (values) => {
    const result = [];
    for (const value of values || []) {
      if (typeof value === 'string' && allowedIds.includes(value) && !result.includes(value)) result.push(value);
    }
    return result;
  };
  try {
    const parsed = JSON.parse(text);
    const values = Array.isArray(parsed?.ids) ? addUnique(parsed.ids) : [];
    if (values.length >= requiredCount) return values.slice(0, requiredCount);
  } catch {}

  const orderedMatches = allowedIds
    .map((id) => ({ id, index:text.indexOf(id) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.id);
  return orderedMatches.length >= requiredCount ? orderedMatches.slice(0, requiredCount) : null;
}

function normalizedUsage(metadata = {}) {
  const usage = metadata.usage || {};
  const input = usage.promptTokenCount ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.candidatesTokenCount ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
  const total = usage.totalTokenCount ?? usage.total_tokens ?? input + output + (usage.thoughtsTokenCount || 0);
  return { input, output, total };
}

function addUsage(left, right) {
  return {
    input: (left?.input || 0) + (right?.input || 0),
    output: (left?.output || 0) + (right?.output || 0),
    total: (left?.total || 0) + (right?.total || 0)
  };
}

/**
 * Adapts any TRUYN text provider into a semantic candidate reranker.
 *
 * For large candidate sets, shortlistSize > 1 enables a two-stage route:
 *   candidates -> semantic shortlist -> final top-1.
 * The actor still receives only the final verified block.
 */
export function createProviderSemanticReranker({
  provider,
  name = 'provider-semantic-reranker',
  providerOptions = {},
  maxCandidates = 128,
  shortlistSize = 1,
  repairAttempts = 1
} = {}) {
  if (!provider || typeof provider.execute !== 'function') throw new Error('provider semantic reranker requires provider.execute');
  if (!Number.isInteger(repairAttempts) || repairAttempts < 0 || repairAttempts > 2) throw new Error('semantic reranker repairAttempts must be 0..2');
  if (!Number.isInteger(shortlistSize) || shortlistSize < 1 || shortlistSize > 16) throw new Error('semantic reranker shortlistSize must be 1..16');
  const metrics = {
    requests: 0,
    repairs: 0,
    shortlistRequests: 0,
    finalRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requestBodyBytes: 0,
    providerLatencyMs: 0
  };

  const baseInstruction = [
    'You are a multilingual semantic retrieval reranker.',
    'The user query and candidate passages may be in different languages.',
    'Rank by complete semantic meaning and operational applicability, not surface word overlap or language match.',
    'Distinctions such as before/after, below/above, internal/public, primary/recovery, provisional/approved, normal/emergency are decisive.',
    'Candidate ids are opaque routing handles. Copy ids verbatim from supplied candidate objects; never invent, abbreviate, or use placeholders.'
  ].join(' ');

  function recordExecution(execution, { repair = false, stage }) {
    const usage = normalizedUsage(execution.metadata);
    metrics.requests += 1;
    if (repair) metrics.repairs += 1;
    if (stage === 'shortlist') metrics.shortlistRequests += 1;
    if (stage === 'final') metrics.finalRequests += 1;
    metrics.inputTokens += usage.input;
    metrics.outputTokens += usage.output;
    metrics.totalTokens += usage.total;
    metrics.requestBodyBytes += execution.metadata?.providerRequestBodyBytes || 0;
    metrics.providerLatencyMs += execution.metadata?.providerLatencyMs || 0;
    return {
      usage,
      providerRequestBodyBytes: execution.metadata?.providerRequestBodyBytes || 0,
      providerLatencyMs: execution.metadata?.providerLatencyMs || 0
    };
  }

  async function executeSelection({ query, candidatePayload, stage, requiredCount }) {
    const allowedIds = candidatePayload.map((candidate) => candidate.id);
    let combinedUsage = { input:0, output:0, total:0 };
    let combinedRequestBodyBytes = 0;
    let combinedProviderLatencyMs = 0;
    let lastOutput = null;

    for (let attempt = 0; attempt <= repairAttempts; attempt += 1) {
      const repair = attempt > 0;
      const outputContract = stage === 'shortlist'
        ? `Return JSON only, exactly one object: {"ids":["id1","id2",...]}. Return exactly ${requiredCount} distinct ids ordered best-first.`
        : 'Return JSON only, exactly one object: {"id":"existing-candidate-id"}.';
      const repairText = repair
        ? 'The previous answer violated the id/output contract. Re-evaluate from the supplied candidates and obey the contract exactly.'
        : '';
      const task = `${baseInstruction} ${outputContract} ${repairText}\n\nQUERY:\n${query}`;
      const execution = await provider.execute({
        capability:'reasoning.general',
        input:{ task, context:JSON.stringify(candidatePayload) },
        policy:{ providerOptions }
      });
      lastOutput = execution.output;
      const recorded = recordExecution(execution, { repair, stage });
      combinedUsage = addUsage(combinedUsage, recorded.usage);
      combinedRequestBodyBytes += recorded.providerRequestBodyBytes;
      combinedProviderLatencyMs += recorded.providerLatencyMs;

      const selected = stage === 'shortlist'
        ? parseIdList(execution.output, allowedIds, requiredCount)
        : parseSingleId(execution.output, allowedIds);
      if (selected) {
        return {
          selected,
          usage:combinedUsage,
          providerRequestBodyBytes:combinedRequestBodyBytes,
          providerLatencyMs:combinedProviderLatencyMs,
          repairAttemptsUsed:attempt
        };
      }
    }
    const diagnostic = typeof lastOutput === 'string' ? lastOutput.slice(0, 160) : JSON.stringify(lastOutput).slice(0, 160);
    throw new Error(`semantic reranker returned no valid ${stage} selection after repair (${diagnostic})`);
  }

  async function rerank(query, candidates, { topK = 1 } = {}) {
    if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > maxCandidates) {
      throw new Error(`semantic reranker candidates must be 1..${maxCandidates}`);
    }
    if (topK !== 1) throw new Error('provider semantic reranker currently supports topK=1');

    const originalPayload = candidates.map((candidate) => ({ id:candidate.id, text:candidate.text }));
    let finalPayload = originalPayload;
    let shortlistIds = null;
    let totalUsage = { input:0, output:0, total:0 };
    let totalRequestBodyBytes = 0;
    let totalProviderLatencyMs = 0;
    let repairAttemptsUsed = 0;

    if (shortlistSize > 1 && originalPayload.length > shortlistSize) {
      const shortlist = await executeSelection({
        query,
        candidatePayload:originalPayload,
        stage:'shortlist',
        requiredCount:Math.min(shortlistSize, originalPayload.length)
      });
      shortlistIds = shortlist.selected;
      const byId = new Map(originalPayload.map((candidate) => [candidate.id, candidate]));
      finalPayload = shortlistIds.map((id) => byId.get(id));
      totalUsage = addUsage(totalUsage, shortlist.usage);
      totalRequestBodyBytes += shortlist.providerRequestBodyBytes;
      totalProviderLatencyMs += shortlist.providerLatencyMs;
      repairAttemptsUsed += shortlist.repairAttemptsUsed;
    }

    const final = await executeSelection({
      query,
      candidatePayload:finalPayload,
      stage:'final',
      requiredCount:1
    });
    totalUsage = addUsage(totalUsage, final.usage);
    totalRequestBodyBytes += final.providerRequestBodyBytes;
    totalProviderLatencyMs += final.providerLatencyMs;
    repairAttemptsUsed += final.repairAttemptsUsed;

    return {
      id:final.selected,
      metadata:{
        usage:totalUsage,
        providerRequestBodyBytes:totalRequestBodyBytes,
        providerLatencyMs:totalProviderLatencyMs || null,
        repairAttemptsUsed,
        shortlistSize:shortlistIds?.length || 1,
        shortlistIds
      }
    };
  }

  return {
    name,
    rerank,
    stats:() => ({ ...metrics, configuredShortlistSize:shortlistSize })
  };
}
