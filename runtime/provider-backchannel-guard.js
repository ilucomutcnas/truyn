import http from 'node:http';
import { createNodeBackchannelPolicy, PROVIDER_BACKCHANNEL_HEADER } from '../core/security/node-backchannel.js';

function json(res, status, body) {
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

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

function cleanHeaders(headers = {}, body = null) {
  const next = { ...headers };
  delete next[PROVIDER_BACKCHANNEL_HEADER];
  if (body) next['content-length'] = String(body.length);
  return next;
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

async function bodyBytes(req, maxBodyBytes) {
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
  return Buffer.concat(chunks);
}

function protectedRequestNodeId(req, url, protectedSessions, policy) {
  const nodeId = url.searchParams.get('nodeId');
  if (nodeId && policy.requiresProof(nodeId)) return nodeId;
  const sessionNodeId = protectedSessions.get(bearer(req));
  return sessionNodeId && policy.requiresProof(sessionNodeId) ? sessionNodeId : null;
}

export function createProviderBackchannelGuard({
  targetHost = '127.0.0.1',
  targetPort,
  protectedNodeIds = [],
  token,
  maxBodyBytes = 1024 * 1024
} = {}) {
  if (!Number.isInteger(targetPort) || targetPort <= 0 || targetPort > 65535) throw new Error('targetPort is required');
  const policy = createNodeBackchannelPolicy({ protectedNodeIds, token });
  const protectedSessions = new Map();

  function presentedProof(req) {
    return req.headers[PROVIDER_BACKCHANNEL_HEADER];
  }

  function authorizeNode(req, nodeId) {
    if (!nodeId || !policy.requiresProof(nodeId)) return { ok: true, protected: false };
    return policy.authorize(nodeId, presentedProof(req));
  }

  function proxyStream(req, res) {
    const upstream = http.request({
      host: targetHost,
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: cleanHeaders(req.headers)
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstream.on('error', () => {
      if (res.headersSent) return res.destroy();
      json(res, 502, { ok: false, error: 'backchannel_upstream_unavailable' });
    });
    req.pipe(upstream);
  }

  async function proxyRegistration(req, res) {
    const raw = await bodyBytes(req, maxBodyBytes);
    let parsed = null;
    try { parsed = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch {}
    const nodeId = parsed?.envelope?.from || null;
    const decision = authorizeNode(req, nodeId);
    if (!decision.ok) return json(res, 403, { ok: false, error: decision.reason });

    const upstream = http.request({
      host: targetHost,
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: cleanHeaders(req.headers, raw)
    }, (upstreamRes) => {
      const chunks = [];
      upstreamRes.on('data', (chunk) => chunks.push(chunk));
      upstreamRes.on('end', () => {
        const responseBody = Buffer.concat(chunks);
        if ((upstreamRes.statusCode || 500) < 300 && decision.protected) {
          try {
            const payload = JSON.parse(responseBody.toString('utf8'));
            if (payload?.sessionToken) protectedSessions.set(payload.sessionToken, nodeId);
          } catch {}
        }
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        res.end(responseBody);
      });
    });
    upstream.on('error', () => json(res, 502, { ok: false, error: 'backchannel_upstream_unavailable' }));
    upstream.end(raw);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://backchannel.guard');
      if (req.method === 'POST' && url.pathname === '/v1/register') return await proxyRegistration(req, res);

      const protectedNodeId = protectedRequestNodeId(req, url, protectedSessions, policy);
      const decision = authorizeNode(req, protectedNodeId);
      if (!decision.ok) return json(res, 403, { ok: false, error: decision.reason });
      return proxyStream(req, res);
    } catch (error) {
      return json(res, error?.status === 413 ? 413 : 500, {
        ok: false,
        error: error?.status === 413 ? 'request_too_large' : 'backchannel_internal_error'
      });
    }
  });

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://backchannel.guard');
      const protectedNodeId = protectedRequestNodeId(req, url, protectedSessions, policy);
      const decision = authorizeNode(req, protectedNodeId);
      if (!decision.ok) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
      }

      const upstream = http.request({
        host: targetHost,
        port: targetPort,
        method: req.method,
        path: req.url,
        headers: cleanHeaders(req.headers)
      });
      upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
        if (socket.destroyed) return upstreamSocket.destroy();
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
      upstream.on('error', () => {
        if (socket.destroyed) return;
        socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
      });
      upstream.end();
    } catch {
      socket.destroy();
    }
  });

  return {
    server,
    state: { protectedSessions },
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
      protectedSessions.clear();
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
