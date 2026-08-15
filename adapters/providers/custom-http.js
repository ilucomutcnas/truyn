function normalizeEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new Error('CUSTOM_HTTP_ENDPOINT must be an absolute URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('CUSTOM_HTTP_ENDPOINT must use http or https');
  }
  return parsed.toString();
}

export function createCustomHttpProvider({
  endpoint = process.env.CUSTOM_HTTP_ENDPOINT,
  apiKey = process.env.CUSTOM_HTTP_API_KEY,
  authMode = apiKey ? 'bearer' : 'none',
  capabilities = ['reasoning.general'],
  fetchImpl = fetch
} = {}) {
  if (!endpoint) throw new Error('CUSTOM_HTTP_ENDPOINT is required');
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!['none', 'bearer'].includes(authMode)) throw new Error(`Unsupported custom HTTP auth mode: ${authMode}`);
  if (authMode === 'bearer' && !apiKey) throw new Error('CUSTOM_HTTP_API_KEY is required for bearer auth');

  return {
    name: 'custom-http-json',
    version: '1',
    capabilities,
    async execute({ capability, input, policy }) {
      const startedAt = Date.now();
      const headers = { 'content-type': 'application/json', accept: 'application/json, text/plain' };
      if (authMode === 'bearer') headers.authorization = `Bearer ${apiKey}`;

      const response = await fetchImpl(normalizedEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ capability, input, policy: policy || {} })
      });
      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
      let body;
      if (contentType.includes('application/json')) body = await response.json();
      else body = await response.text();

      if (!response.ok) {
        const message = body && typeof body === 'object'
          ? body.error?.message || body.error || body.message
          : body;
        throw new Error(message ? String(message).slice(0, 500) : `Custom HTTP ${response.status}`);
      }

      const output = body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'output')
        ? body.output
        : body;
      const remoteMetadata = body && typeof body === 'object' && body.metadata && typeof body.metadata === 'object'
        ? body.metadata
        : {};

      return {
        output,
        metadata: {
          provider: 'custom-http',
          providerRequestId: body && typeof body === 'object' ? body.requestId || body.id || null : null,
          providerLatencyMs: Date.now() - startedAt,
          usage: remoteMetadata.usage || null
        }
      };
    }
  };
}
