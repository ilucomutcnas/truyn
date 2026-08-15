const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.CLAUDE_VERTEX_LOCATION || 'global';
const model = process.env.CLAUDE_VERTEX_MODEL || 'claude-sonnet-4-6';

if (!projectId) throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required');

async function metadataAccessToken() {
  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`metadata token request failed: HTTP ${response.status}`);
  }
  return body.access_token;
}

const accessToken = await metadataAccessToken();
const base = location === 'global'
  ? 'https://aiplatform.googleapis.com'
  : `https://${location}-aiplatform.googleapis.com`;
const endpoint = `${base}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/anthropic/models/${encodeURIComponent(model)}:rawPredict`;

const startedAt = Date.now();
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json; charset=utf-8'
  },
  body: JSON.stringify({
    anthropic_version: 'vertex-2023-10-16',
    max_tokens: 32,
    stream: false,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: 'Return exactly TRUYN_VERTEX_CLAUDE_OK and nothing else.' }]
    }]
  })
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify({
    status: 'failure',
    httpStatus: response.status,
    error: body?.error?.message || body?.error || 'unknown Vertex Claude error'
  }, null, 2));
  process.exit(1);
}

const output = (body.content || [])
  .filter((item) => item?.type === 'text' && typeof item.text === 'string')
  .map((item) => item.text)
  .join('\n')
  .trim();

if (output !== 'TRUYN_VERTEX_CLAUDE_OK') {
  console.error(JSON.stringify({ status: 'failure', reason: 'unexpected_marker', output }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'success',
  provider: 'vertex-anthropic',
  model: body.model || model,
  location,
  providerRequestIdPresent: Boolean(body.id),
  providerLatencyMs: Date.now() - startedAt,
  usage: body.usage || null,
  marker: output,
  publicRelayExposure: false
}, null, 2));
