import http from 'node:http';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8080);
const metadataHost = process.env.GCE_METADATA_HOST || 'metadata.google.internal';
const vertexEndpoint = (process.env.REAL_VERTEX_API_ENDPOINT || 'https://aiplatform.googleapis.com').replace(/\/$/, '');

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  });
  res.end(data);
}

async function runtimeAccessToken() {
  const response = await fetch(`http://${metadataHost}/computeMetadata/v1/instance/service-accounts/default/token`, {
    headers: { 'Metadata-Flavor': 'Google' }
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(body?.error_description || body?.error || `Google metadata HTTP ${response.status}`);
  }
  return body.access_token;
}

const server = http.createServer(async (req, res) => {
  // The Cloud Run service is private. Cloud Run validates the caller's ID token
  // before traffic reaches this process, so the application does not duplicate auth.
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, role: 'benchmark-gemini-direct-proxy' });
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/v1/projects/') || !req.url.endsWith(':generateContent')) {
    return sendJson(res, 404, { ok: false, error: 'not_found' });
  }

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new Error('request_too_large');
      chunks.push(chunk);
    }
    const requestBody = Buffer.concat(chunks);
    const token = await runtimeAccessToken();
    const upstream = await fetch(`${vertexEndpoint}${req.url}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': req.headers['content-type'] || 'application/json'
      },
      body: requestBody
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'content-length': body.length
    });
    res.end(body);
  } catch (error) {
    sendJson(res, 500, { error: { message: error.message } });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`${JSON.stringify({ ok: true, role: 'benchmark-gemini-direct-proxy', port })}\n`);
});
