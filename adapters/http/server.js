import http from 'node:http';

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(data);
}

async function readJson(req, maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error('request_too_large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('invalid_json');
    error.status = 400;
    throw error;
  }
}

function assertLoopback(host) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('The public HTTP adapter is local-only; use an authenticated gateway for remote access');
  }
}

export function createHttpAdapterServer({ node, maxBodyBytes = 256 * 1024 }) {
  if (!node) throw new Error('node is required');
  let registered = false;

  async function ensureRegistered() {
    if (!registered || !node.sessionToken) {
      await node.register({ name: 'truyn-http-adapter' });
      registered = true;
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://adapter.local');
      if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/v1/identity') {
        return sendJson(res, 200, { ok: true, nodeId: node.identity.nodeId, algorithm: node.identity.algorithm });
      }
      if (req.method === 'GET' && url.pathname === '/v1/offers') {
        await ensureRegistered();
        const capability = url.searchParams.get('capability') || '';
        return sendJson(res, 200, await node.find(capability));
      }
      if (req.method === 'POST' && url.pathname === '/v1/offer') {
        await ensureRegistered();
        const body = await readJson(req, maxBodyBytes);
        if (!body.capability) return sendJson(res, 400, { ok: false, error: 'capability_required' });
        return sendJson(res, 200, await node.offer(body.capability, body.metadata || {}));
      }
      if (req.method === 'POST' && url.pathname === '/v1/need') {
        await ensureRegistered();
        const body = await readJson(req, maxBodyBytes);
        if (!body.capability) return sendJson(res, 400, { ok: false, error: 'capability_required' });
        return sendJson(res, 200, await node.need(body.capability, body.input, body.policy || {}));
      }
      if (req.method === 'GET' && url.pathname === '/v1/events') {
        await ensureRegistered();
        return sendJson(res, 200, await node.poll());
      }
      if (req.method === 'POST' && url.pathname === '/v1/result') {
        await ensureRegistered();
        const body = await readJson(req, maxBodyBytes);
        if (!body.requestId) return sendJson(res, 400, { ok: false, error: 'requestId_required' });
        return sendJson(res, 200, await node.result(body.requestId, body.output, body.metadata || {}));
      }
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      return sendJson(res, status, { ok: false, error: status < 500 ? error.message : 'adapter_error' });
    }
  });

  return {
    server,
    async listen({ host = '127.0.0.1', port = 8790 } = {}) {
      assertLoopback(host);
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}
