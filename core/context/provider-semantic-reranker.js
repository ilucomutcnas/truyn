function parseSelectedId(output, allowedIds) {
  const text = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  const directMatches = allowedIds.filter((id) => text.includes(id));
  if (directMatches.length === 1) return directMatches[0];
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.id === 'string' && allowedIds.includes(parsed.id)) return parsed.id;
  } catch {}
  const fenced = text.match(/\{[\s\S]*?"id"\s*:\s*"([^"]+)"[\s\S]*?\}/);
  if (fenced?.[1] && allowedIds.includes(fenced[1])) return fenced[1];
  const bare = text.match(/(?:^|\s)id\s*[=:]\s*([A-Za-z0-9._:-]+)/i);
  if (bare?.[1] && allowedIds.includes(bare[1])) return bare[1];
  return null;
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
 * Candidate identifiers are internal routing handles only; the selected block
 * is still verified against the immutable context manifest before materialize.
 */
export function createProviderSemanticReranker({
  provider,
  name = 'provider-semantic-reranker',
  providerOptions = {},
  maxCandidates = 128,
  repairAttempts = 1
} = {}) {
  if (!provider || typeof provider.execute !== 'function') throw new Error('provider semantic reranker requires provider.execute');
  if (!Number.isInteger(repairAttempts) || repairAttempts < 0 || repairAttempts > 2) throw new Error('semantic reranker repairAttempts must be 0..2');
  const metrics = {
    requests: 0,
    repairs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requestBodyBytes: 0,
    providerLatencyMs: 0
  };

  async function rerank(query, candidates, { topK = 1 } = {}) {
    if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > maxCandidates) {
      throw new Error(`semantic reranker candidates must be 1..${maxCandidates}`);
    }
    if (topK !== 1) throw new Error('provider semantic reranker currently supports topK=1');

    const candidatePayload = candidates.map((candidate) => ({ id: candidate.id, text: candidate.text }));
    const allowedIds = candidatePayload.map((candidate) => candidate.id);
    const instruction = [
      'You are the final semantic retrieval reranker.',
      'The user query and candidate passages may be in different languages.',
      'Choose the single candidate whose complete meaning and operational conditions best answer the query.',
      'Treat distinctions such as before/after, below/above, internal/public, primary/recovery, provisional/approved as decisive.',
      'Do not prefer a passage merely because it uses the same language or shares more surface words.',
      'The id value MUST be copied verbatim from one of the supplied candidate objects.',
      'Never return an example, placeholder, invented id, or explanatory prose.',
      'Return exactly one JSON object with one key named id.'
    ].join(' ');

    let combinedUsage = { input:0, output:0, total:0 };
    let combinedRequestBodyBytes = 0;
    let combinedProviderLatencyMs = 0;
    let lastOutput = null;

    for (let attempt = 0; attempt <= repairAttempts; attempt += 1) {
      const repair = attempt > 0;
      const task = repair
        ? `${instruction}\nThe previous answer was invalid because its id was not one of the allowed candidates. Re-evaluate the QUERY and copy exactly one existing candidate id.\n\nQUERY:\n${query}`
        : `${instruction}\n\nQUERY:\n${query}`;
      const execution = await provider.execute({
        capability: 'reasoning.general',
        input: {
          task,
          context: JSON.stringify(candidatePayload)
        },
        policy: { providerOptions }
      });
      lastOutput = execution.output;
      const usage = normalizedUsage(execution.metadata);
      combinedUsage = addUsage(combinedUsage, usage);
      combinedRequestBodyBytes += execution.metadata?.providerRequestBodyBytes || 0;
      combinedProviderLatencyMs += execution.metadata?.providerLatencyMs || 0;

      metrics.requests += 1;
      if (repair) metrics.repairs += 1;
      metrics.inputTokens += usage.input;
      metrics.outputTokens += usage.output;
      metrics.totalTokens += usage.total;
      metrics.requestBodyBytes += execution.metadata?.providerRequestBodyBytes || 0;
      metrics.providerLatencyMs += execution.metadata?.providerLatencyMs || 0;

      const id = parseSelectedId(execution.output, allowedIds);
      if (id) {
        return {
          id,
          metadata: {
            usage: combinedUsage,
            providerRequestBodyBytes: combinedRequestBodyBytes,
            providerLatencyMs: combinedProviderLatencyMs || null,
            repairAttemptsUsed: attempt
          }
        };
      }
    }

    const diagnostic = typeof lastOutput === 'string' ? lastOutput.slice(0, 160) : JSON.stringify(lastOutput).slice(0, 160);
    throw new Error(`semantic reranker returned no allowed candidate id after repair (${diagnostic})`);
  }

  return {
    name,
    rerank,
    stats: () => ({ ...metrics })
  };
}
