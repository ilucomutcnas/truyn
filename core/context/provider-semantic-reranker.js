function parseSelectedId(output) {
  const text = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.id === 'string' && parsed.id) return parsed.id;
  } catch {}
  const fenced = text.match(/\{[\s\S]*?"id"\s*:\s*"([^"]+)"[\s\S]*?\}/);
  if (fenced?.[1]) return fenced[1];
  const bare = text.match(/(?:^|\s)id\s*[=:]\s*([A-Za-z0-9._:-]+)/i);
  if (bare?.[1]) return bare[1];
  throw new Error('semantic reranker returned no parseable candidate id');
}

function normalizedUsage(metadata = {}) {
  const usage = metadata.usage || {};
  const input = usage.promptTokenCount ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.candidatesTokenCount ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
  const total = usage.totalTokenCount ?? usage.total_tokens ?? input + output + (usage.thoughtsTokenCount || 0);
  return { input, output, total };
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
  maxCandidates = 128
} = {}) {
  if (!provider || typeof provider.execute !== 'function') throw new Error('provider semantic reranker requires provider.execute');
  const metrics = {
    requests: 0,
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
    const instruction = [
      'You are the final semantic retrieval reranker.',
      'The user query and candidate passages may be in different languages.',
      'Choose the single candidate whose complete meaning and operational conditions best answer the query.',
      'Treat distinctions such as before/after, below/above, internal/public, primary/recovery, provisional/approved as decisive.',
      'Do not prefer a passage merely because it uses the same language or shares more surface words.',
      'Return JSON only, exactly: {"id":"<candidate id>"}.'
    ].join(' ');

    const execution = await provider.execute({
      capability: 'reasoning.general',
      input: {
        task: `${instruction}\n\nQUERY:\n${query}`,
        context: JSON.stringify(candidatePayload)
      },
      policy: { providerOptions }
    });
    const id = parseSelectedId(execution.output);
    if (!candidatePayload.some((candidate) => candidate.id === id)) {
      throw new Error('semantic reranker selected an id outside its candidate set');
    }
    const usage = normalizedUsage(execution.metadata);
    metrics.requests += 1;
    metrics.inputTokens += usage.input;
    metrics.outputTokens += usage.output;
    metrics.totalTokens += usage.total;
    metrics.requestBodyBytes += execution.metadata?.providerRequestBodyBytes || 0;
    metrics.providerLatencyMs += execution.metadata?.providerLatencyMs || 0;

    return {
      id,
      metadata: {
        usage,
        providerRequestBodyBytes: execution.metadata?.providerRequestBodyBytes || 0,
        providerLatencyMs: execution.metadata?.providerLatencyMs || null
      }
    };
  }

  return {
    name,
    rerank,
    stats: () => ({ ...metrics })
  };
}
