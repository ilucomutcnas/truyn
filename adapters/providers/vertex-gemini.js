function extractText(response) {
  const parts = [];
  for (const candidate of response.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('\n');
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

export function createVertexGeminiProvider({
  projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_LOCATION || 'global',
  model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  endpoint = process.env.VERTEX_API_ENDPOINT || 'https://aiplatform.googleapis.com',
  capabilities = ['review'],
  accessTokenProvider = googleMetadataAccessToken,
  fetchImpl = fetch
} = {}) {
  if (!projectId) throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required');
  if (!location) throw new Error('GCP_REGION or GOOGLE_CLOUD_LOCATION is required');
  if (!model) throw new Error('GEMINI_MODEL is required');

  return {
    name: 'vertex-gemini-generate-content',
    version: '1',
    capabilities,
    async execute({ capability, input, policy }) {
      const startedAt = Date.now();
      const prompt = [
        `You are a TRUYN provider for capability: ${capability}.`,
        'Return only the useful task result. Do not describe TRUYN internals unless asked.',
        `Task input: ${typeof input === 'string' ? input : JSON.stringify(input)}`,
        Object.keys(policy || {}).length ? `Request policy: ${JSON.stringify(policy)}` : null
      ].filter(Boolean).join('\n\n');

      const token = await accessTokenProvider({ fetchImpl });
      const modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/v1/${modelPath}:generateContent`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `Vertex AI HTTP ${response.status}`);

      return {
        output: extractText(body),
        metadata: {
          provider: 'vertex-gemini',
          model,
          providerRequestId: response.headers?.get?.('x-request-id') || null,
          providerLatencyMs: Date.now() - startedAt,
          usage: body.usageMetadata || null
        }
      };
    }
  };
}
