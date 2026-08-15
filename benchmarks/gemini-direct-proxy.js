import http from 'node:http';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8080);
const authToken = process.env.BENCHMARK_PROXY_TOKEN;

if (!authToken) throw new Error('BENCHMARK_PROXY_TOKEN is required');

const provider = createVertexGeminiProvider({
  projectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
});

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, role: 'benchmark-gemini-direct-proxy' });
  }

  if (req.method !== 'POST' || req.url !== '/invoke') {
    return send(res, 404, { ok: false, error: 'not_found' });
  }

  if (req.headers.authorization !== `Bearer ${authToken}`) {
    return send(res, 401, { ok: false, error: 'unauthorized' });
  }

  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1_000_000) throw new Error('request_too_large');
    }
    const body = JSON.parse(raw || '{}');
    const result = await provider.execute({
      capability: body.capability,
      input: body.input,
      policy: body.policy || {}
    });
    return send(res, 200, { ok: true, result });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`${JSON.stringify({ ok: true, role: 'benchmark-gemini-direct-proxy', port })}\n`);
});
