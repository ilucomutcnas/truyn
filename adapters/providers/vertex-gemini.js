function extractText(response) {
  const parts = [];
  for (const candidate of response.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('\n');
}

function safeBodyExcerpt(value, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function readResponseBody(response) {
  if (typeof response?.text === 'function') {
    const raw = await response.text();
    if (!raw) return { raw:'', json:null };
    try {
      return { raw, json:JSON.parse(raw) };
    } catch {
      return { raw, json:null };
    }
  }
  if (typeof response?.json === 'function') {
    const json = await response.json();
    return { raw:JSON.stringify(json), json };
  }
  return { raw:'', json:null };
}

async function googleMetadataAccessToken({ fetchImpl = fetch } = {}) {
  const host = process.env.GCE_METADATA_HOST || 'metadata.google.internal';
  const response = await fetchImpl(`http://${host}/computeMetadata/v1/instance/service-accounts/default/token`, {
    headers: { 'Metadata-Flavor': 'Google' }
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(body?.error_description || body?.error || `Google metadata HTTP ${response.status}`);
  }
  return body.access_token;
}

function buildGenerationConfig(providerOptions) {
  const config = {};
  const thinkingBudget = providerOptions.thinkingBudget;
  if (thinkingBudget != null) {
    if (!Number.isInteger(thinkingBudget) || thinkingBudget < -1) {
      throw new Error('Vertex Gemini thinkingBudget must be an integer >= -1');
    }
    config.thinkingConfig = { thinkingBudget };
  }

  const responseMimeType = providerOptions.responseMimeType;
  if (responseMimeType != null) {
    if (typeof responseMimeType !== 'string' || responseMimeType.trim().length === 0) {
      throw new Error('Vertex Gemini responseMimeType must be a non-empty string');
    }
    config.responseMimeType = responseMimeType.trim();
  }

  const responseSchema = providerOptions.responseSchema;
  if (responseSchema != null) {
    if (!responseSchema || typeof responseSchema !== 'object' || Array.isArray(responseSchema)) {
      throw new Error('Vertex Gemini responseSchema must be an object');
    }
    config.responseSchema = responseSchema;
  }

  const maxOutputTokens = providerOptions.maxOutputTokens;
  if (maxOutputTokens != null) {
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 65_536) {
      throw new Error('Vertex Gemini maxOutputTokens must be an integer from 1 to 65536');
    }
    config.maxOutputTokens = maxOutputTokens;
  }

  const temperature = providerOptions.temperature;
  if (temperature != null) {
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error('Vertex Gemini temperature must be a number from 0 to 2');
    }
    config.temperature = temperature;
  }

  return Object.keys(config).length ? config : null;
}

export function createVertexGeminiProvider({
  projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_LOCATION || 'global',
  model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  endpoint = process.env.VERTEX_API_ENDPOINT || 'https://aiplatform.googleapis.com',
  capabilities = ['review'],
  accessTokenProvider = googleMetadataAccessToken,
  fetchImpl = fetch,
  requestTimeoutMs = Number(process.env.VERTEX_GEMINI_REQUEST_TIMEOUT_MS || 120_000)
} = {}) {
  if (!projectId) throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required');
  if (!location) throw new Error('GCP_REGION or GOOGLE_CLOUD_LOCATION is required');
  if (!model) throw new Error('GEMINI_MODEL is required');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 600_000) {
    throw new Error('Vertex Gemini requestTimeoutMs must be an integer from 1000 to 600000');
  }

  return {
    name: 'vertex-gemini-generate-content',
    version: '1',
    capabilities,
    async execute({ capability, input, policy }) {
      const startedAt = Date.now();
      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};
      const { providerOptions: _providerOptions, ...taskPolicy } = policy || {};
      const generationConfig = buildGenerationConfig(providerOptions);
      const prompt = [
        `You are a TRUYN provider for capability: ${capability}.`,
        'Return only the useful task result. Do not describe TRUYN internals unless asked.',
        `Task input: ${typeof input === 'string' ? input : JSON.stringify(input)}`,
        Object.keys(taskPolicy).length ? `Request policy: ${JSON.stringify(taskPolicy)}` : null
      ].filter(Boolean).join('\n\n');

      const token = await accessTokenProvider({ fetchImpl });
      const modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
      const requestBody = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(generationConfig ? { generationConfig } : {})
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      let response;
      try {
        response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/v1/${modelPath}:generateContent`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: requestBody,
          signal: controller.signal
        });
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          throw new Error(`Vertex AI request timed out after ${requestTimeoutMs}ms`);
        }
        throw new Error(`Vertex AI network request failed (${error?.name || 'Error'})`);
      } finally {
        clearTimeout(timeout);
      }
      const { raw, json:body } = await readResponseBody(response);
      if (!response.ok) {
        const detail = body?.error?.message || safeBodyExcerpt(raw);
        throw new Error(`Vertex AI HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      if (!body || typeof body !== 'object') {
        throw new Error(`Vertex AI HTTP ${response.status}: invalid non-JSON response${raw ? ` (${safeBodyExcerpt(raw)})` : ''}`);
      }

      const providerRequestBodyBytes = Buffer.byteLength(requestBody);
      const providerResponseBodyBytes = Buffer.byteLength(raw || JSON.stringify(body));

      return {
        output: extractText(body),
        metadata: {
          provider: 'vertex-gemini',
          model,
          providerRequestId: response.headers?.get?.('x-request-id') || null,
          providerLatencyMs: Date.now() - startedAt,
          providerRequestBodyBytes,
          providerResponseBodyBytes,
          providerBodyBytes: providerRequestBodyBytes + providerResponseBodyBytes,
          thinkingBudget: providerOptions.thinkingBudget ?? null,
          responseMimeType: providerOptions.responseMimeType ?? null,
          maxOutputTokens: providerOptions.maxOutputTokens ?? null,
          requestTimeoutMs,
          usage: body.usageMetadata || null
        }
      };
    }
  };
}
