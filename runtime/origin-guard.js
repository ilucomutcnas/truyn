import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export const ORIGIN_GUARD_HEADER = 'x-truyn-origin-token';

function enabled(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function guardedHeaders(headers = {}) {
  const next = { ...headers };
  delete next[ORIGIN_GUARD_HEADER];
  return next;
}

function writeJson(res, status, body) {
  if (res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(data);
}

function writeSocketResponse(socket, status, statusText) {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function responseHead(response) {
  let head = `HTTP/1.1 ${response.statusCode || 502} ${response.statusMessage || 'Bad Gateway'}\r\n`;
  for (const [name, value] of Object.entries(response.headers || {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) head += `${name}: ${item}\r\n`;
    } else {
      head += `${name}: ${value}\r\n`;
    }
  }
  return `${head}\r\n`;
}

export function createRuntimeOriginGuardConfig(env = process.env) {
  const active = enabled(env.TRUYN_ORIGIN_GUARD);
  const token = String(env.TRUYN_ORIGIN_GUARD_TOKEN || '').trim();
  if (active && !token) throw new Error('TRUYN_ORIGIN_GUARD=1 requires TRUYN_ORIGIN_GUARD_TOKEN');
  if (!active && token) throw new Error('TRUYN_ORIGIN_GUARD_TOKEN requires explicit TRUYN_ORIGIN_GUARD=1');
  return { enabled: active, token: active ? token : null };
}

export function createOriginGuard({ targetHost = '127.0.0.1', targetPort, token } = {}) {
  if (!Number.isInteger(targetPort) || targetPort <= 0 || targetPort > 65535) throw new Error('targetPort is required');
  if (!String(token || '').trim()) throw new Error('origin guard token is required');
  const expectedToken = String(token).trim();

  function authorized(req) {
    return constantTimeEqual(req.headers[ORIGIN_GUARD_HEADER], expectedToken);
  }

  function proxyHttp(req, res) {
    const upstream = http.request({
      host: targetHost,
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: guardedHeaders(req.headers)
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstream.on('error', () => writeJson(res, 502, { ok: false, error: 'origin_upstream_unavailable' }));
    req.pipe(upstream);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://origin.guard');
    if (!authorized(req)) {
      if (req.method === 'GET' && url.pathname === '/health') {
        return writeJson(res, 200, { ok: true, protocol: 'TRUYN/1' });
      }
      return writeJson(res, 403, { ok: false, error: 'origin_guard_denied' });
    }
    return proxyHttp(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    if (!authorized(req)) return writeSocketResponse(socket, 403, 'Forbidden');
    const upstream = http.request({
      host: targetHost,
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: guardedHeaders(req.headers)
    });
    upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      if (socket.destroyed) {
        upstreamSocket.destroy();
        return;
      }
      socket.write(responseHead(response));
      if (upstreamHead?.length) socket.write(upstreamHead);
      if (head?.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });
    upstream.on('response', (response) => {
      if (socket.destroyed) return;
      socket.write(responseHead(response));
      response.pipe(socket);
      response.once('end', () => socket.destroy());
    });
    upstream.on('error', () => writeSocketResponse(socket, 502, 'Bad Gateway'));
    upstream.end();
  });

  return {
    server,
    async listen({ host = '127.0.0.1', port = 8787 } = {}) {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
