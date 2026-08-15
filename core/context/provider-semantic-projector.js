function normalizedUsage(metadata = {}) {
  const usage = metadata.usage || {};
  const input = usage.promptTokenCount ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const thoughts = usage.thoughtsTokenCount ?? usage.reasoning_tokens ?? 0;
  const visibleOutput = usage.candidatesTokenCount ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
  const output = visibleOutput + thoughts;
  const total = usage.totalTokenCount ?? usage.total_tokens ?? input + output;
  return { input, output, total };
}

function uniqueTexts(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

function parseProjection(output, languageCodes) {
  const text = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  try {
    const parsed = JSON.parse(text);
    const variants = parsed?.variants && typeof parsed.variants === 'object' ? parsed.variants : null;
    if (!variants) return null;
    const projected = languageCodes.map((code) => variants[code]).filter((value) => typeof value === 'string' && value.trim());
    return projected.length === languageCodes.length ? uniqueTexts(projected) : null;
  } catch {
    return null;
  }
}

/**
 * Builds language-parallel semantic query projections without seeing corpus
 * blocks or candidate ids. This keeps query expansion independent from ground
 * truth while giving the dense router same-language semantic views.
 */
export function createProviderSemanticProjector({
  provider,
  name = 'provider-semantic-projector',
  languages = [
    { code:'en', label:'English' },
    { code:'zh', label:'Simplified Chinese' },
    { code:'tr', label:'Turkish' }
  ],
  providerOptions = {},
  repairAttempts = 1
} = {}) {
  if (!provider || typeof provider.execute !== 'function') throw new Error('semantic projector requires provider.execute');
  if (!Array.isArray(languages) || languages.length < 2 || languages.length > 8) throw new Error('semantic projector languages must contain 2..8 entries');
  if (!Number.isInteger(repairAttempts) || repairAttempts < 0 || repairAttempts > 2) throw new Error('semantic projector repairAttempts must be 0..2');
  const languageCodes = languages.map((item) => item.code);
  if (new Set(languageCodes).size !== languageCodes.length || languageCodes.some((code) => typeof code !== 'string' || !code)) {
    throw new Error('semantic projector language codes must be unique non-empty strings');
  }
  const metrics = {
    requests:0,
    repairs:0,
    inputTokens:0,
    outputTokens:0,
    totalTokens:0,
    requestBodyBytes:0,
    providerLatencyMs:0
  };

  async function project(query) {
    if (typeof query !== 'string' || query.trim().length < 3) throw new Error('semantic projector query is required');
    const languageContract = languages.map(({ code, label }) => `"${code}":"<${label} equivalent>"`).join(',');
    let usage = { input:0, output:0, total:0 };
    let requestBodyBytes = 0;
    let providerLatencyMs = 0;

    for (let attempt = 0; attempt <= repairAttempts; attempt += 1) {
      const repair = attempt > 0;
      const task = [
        'Project the user query into semantically equivalent multilingual retrieval queries.',
        'Preserve every domain constraint, action, negation, temporal condition, threshold, approval state, location, and exception exactly.',
        'Do not answer the query. Do not add facts. Do not omit distinctions.',
        `Return JSON only, exactly: {"variants":{${languageContract}}}.`,
        repair ? 'The previous output violated the JSON/language contract. Return all required variants exactly.' : null,
        `QUERY:\n${query}`
      ].filter(Boolean).join(' ');
      const execution = await provider.execute({
        capability:'reasoning.general',
        input:{ task },
        policy:{ providerOptions }
      });
      const current = normalizedUsage(execution.metadata);
      usage = {
        input:usage.input + current.input,
        output:usage.output + current.output,
        total:usage.total + current.total
      };
      requestBodyBytes += execution.metadata?.providerRequestBodyBytes || 0;
      providerLatencyMs += execution.metadata?.providerLatencyMs || 0;
      metrics.requests += 1;
      if (repair) metrics.repairs += 1;
      metrics.inputTokens += current.input;
      metrics.outputTokens += current.output;
      metrics.totalTokens += current.total;
      metrics.requestBodyBytes += execution.metadata?.providerRequestBodyBytes || 0;
      metrics.providerLatencyMs += execution.metadata?.providerLatencyMs || 0;

      const variants = parseProjection(execution.output, languageCodes);
      if (variants) {
        return {
          variants:uniqueTexts([query, ...variants]),
          metadata:{
            usage,
            providerRequestBodyBytes:requestBodyBytes,
            providerLatencyMs:providerLatencyMs || null,
            repairAttemptsUsed:attempt,
            languages:languageCodes
          }
        };
      }
    }
    throw new Error('semantic projector returned no valid multilingual projection after repair');
  }

  return {
    name,
    project,
    stats:() => ({ ...metrics, languages:[...languageCodes] })
  };
}
