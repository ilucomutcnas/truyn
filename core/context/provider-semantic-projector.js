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

function extractFirstJsonObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const LANGUAGE_ALIASES = {
  en:new Set(['en','english']),
  zh:new Set(['zh','zh_cn','zh_hans','chinese','simplified_chinese','simplifiedchinese']),
  tr:new Set(['tr','turkish'])
};

function lookupVariant(source, code) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const aliases = LANGUAGE_ALIASES[code] || new Set([normalizeKey(code)]);
  for (const [key, value] of Object.entries(source)) {
    if (!aliases.has(normalizeKey(key))) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function objectFromArray(values) {
  if (!Array.isArray(values)) return null;
  const result = {};
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') continue;
    const key = entry.code ?? entry.language ?? entry.lang;
    const value = entry.text ?? entry.query ?? entry.value;
    if (typeof key === 'string' && typeof value === 'string' && value.trim()) result[key] = value.trim();
  }
  return Object.keys(result).length ? result : null;
}

function parseProjection(output, languageCodes) {
  const text = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  const candidates = uniqueTexts([
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    extractFirstJsonObject(text)
  ]);

  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    const rawVariants = parsed?.variants ?? parsed?.queries ?? parsed?.translations ?? parsed;
    const variants = Array.isArray(rawVariants) ? objectFromArray(rawVariants) : rawVariants;
    if (!variants || typeof variants !== 'object') continue;

    const projected = languageCodes.map((code) => lookupVariant(variants, code));
    if (projected.every((value) => typeof value === 'string' && value.trim())) return projected;
  }
  return null;
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
    formatFailures:0,
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
        `Return JSON only, with no markdown or commentary, exactly: {"variants":{${languageContract}}}.`,
        repair ? 'The previous output violated the JSON/language contract. Return all required variants exactly and nothing else.' : null,
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
      metrics.formatFailures += 1;
    }
    throw new Error('semantic projector returned no valid multilingual projection after repair');
  }

  return {
    name,
    project,
    stats:() => ({ ...metrics, languages:[...languageCodes] })
  };
}
