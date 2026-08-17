import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ORIGIN_GUARD_HEADER } from './origin-guard-contract.js';

export { ORIGIN_GUARD_HEADER } from './origin-guard-contract.js';

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;

function enabled(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function normalizeHeaderName(value = ORIGIN_GUARD_HEADER) {
  const headerName = String(value || '').trim().toLowerCase();
  if (!headerName || !HEADER_NAME_PATTERN.test(headerName)) throw new Error('invalid origin guard header name');
  return headerName;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function guardedHeaders(headers = {}, headerName = ORIGIN_GUARD_HEADER) {
  const next = { ...headers };
  delete next[normalizeHeaderName(headerName)];
  delete next[ORIGIN_GUARD_HEADER];
  return next;
}

function parseExpiry(value, label) {
  if (!String(value || '').trim()) return null;
  const timestamp = Date.parse(String(value).trim());
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO-8601 timestamp`);
  return timestamp;
}

function secretSafeConfig(base, { token = null, tokens = [] } = {}) {
  const config = { ...base };
  Object.defineProperty(config, 'token', { value: token, enumerable: false, writable: false });
  Object.defineProperty(config, 'tokens', { value: Object.freeze(tokens.map((item) => Object.freeze({ ...item }))), enumerable: false, writable: false });
  Object.defineProperty(config, 'toJSON', { value: () => ({ ...base }), enumerable: false });
  return Object.freeze(config);
}

function normalizeTokenRecords({ token = null, tokenExpiresAt = null, tokens = null, headerName }) {
  const values = Array.isArray(tokens) && tokens.length > 0
    ? tokens
    : (String(token || '').trim() ? [{ value: String(token).trim(), expiresAt: tokenExpiresAt }] : []);
  if (values.length === 0) throw new Error('origin guard token is required');

  return values.map((record) => {
    const value = String(record?.value || '').trim();
    if (!value) throw new Error('origin guard token is required');
    const expiry = parseExpiry(record?.expiresAt, 'origin guard token expiry');
    if (headerName === ORIGIN_GUARD_HEADER && !expiry) {
      throw new Error('x-truyn-origin-token requires an explicit expiry');
    }
    return { value, expiresAt: expiry ? new Date(expiry).toISOString() : null };
  });
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

export function createRuntimeOriginGuardConfig(env = process.env, { now = () => new Date() } = {}) {
  const active = enabled(env.TRUYN_ORIGIN_GUARD);
  const token = String(env.TRUYN_ORIGIN_GUARD_TOKEN || '').trim();
  const tokenExpiryRaw = String(env.TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT || '').trim();
  const previousToken = String(env.TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN || '').trim();
  const previousExpiryRaw = String(env.TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN_EXPIRES_AT || '').trim();
  const configuredHeader = String(env.TRUYN_ORIGIN_GUARD_HEADER || '').trim();

  const anyGuardConfig = token || tokenExpiryRaw || previousToken || previousExpiryRaw || configuredHeader;
  if (!active && anyGuardConfig) throw new Error('origin guard settings require explicit TRUYN_ORIGIN_GUARD=1');
  if (active && !token) throw new Error('TRUYN_ORIGIN_GUARD=1 requires TRUYN_ORIGIN_GUARD_TOKEN');

  const headerName = active ? normalizeHeaderName(configuredHeader || ORIGIN_GUARD_HEADER) : ORIGIN_GUARD_HEADER;
  if (!active) {
    return secretSafeConfig({
      enabled: false,
      headerName,
      tokenExpiresAt: null,
      previousTokenExpiresAt: null,
      acceptedTokenCount: 0,
      rotationEnabled: false
    });
  }

  const tokenExpiry = parseExpiry(tokenExpiryRaw, 'TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT');
  if (headerName === ORIGIN_GUARD_HEADER && !tokenExpiry) {
    throw new Error('TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT is required for x-truyn-origin-token');
  }
  if (tokenExpiry && tokenExpiry <= now().getTime()) throw new Error('TRUYN_ORIGIN_GUARD_TOKEN is expired');

  if (previousToken && !previousExpiryRaw) {
    throw new Error('TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN requires TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN_EXPIRES_AT');
  }
  if (!previousToken && previousExpiryRaw) {
    throw new Error('TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN_EXPIRES_AT requires TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN');
  }
  const previousExpiry = parseExpiry(previousExpiryRaw, 'TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN_EXPIRES_AT');

  const acceptedTokens = [{ value: token, expiresAt: tokenExpiry ? new Date(tokenExpiry).toISOString() : null }];
  if (previousToken && previousExpiry > now().getTime()) {
    acceptedTokens.push({ value: previousToken, expiresAt: new Date(previousExpiry).toISOString() });
  }

  const safe = {
    enabled: true,
    headerName,
    tokenExpiresAt: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
    previousTokenExpiresAt: previousExpiry ? new Date(previousExpiry).toISOString() : null,
    acceptedTokenCount: acceptedTokens.length,
    rotationEnabled: acceptedTokens.length > 1
  };
  return secretSafeConfig(safe, { token, tokens: acceptedTokens });
}

export function createOriginGuard({ targetHost = '127.0.0.1', targetPort, token = null, tokenExpiresAt = null, tokens = null, headerName = ORIGIN_GUARD_HEADER, now = () => Date.now() } = {}) {
  if (!Number.isInteger(targetPort) || targetPort <= 0 || targetPort > 65535) throw new Error('targetPort is required');
  const expectedHeader = normalizeHeaderName(headerName);
  const expectedTokens = normalizeTokenRecords({ token, tokenExpiresAt, tokens, headerName: expectedHeader });

  function authorized(req) {
    const current = Number(now());
    return expectedTokens.some((record) => {
      const expiry = record.expiresAt ? Date.parse(record.expiresAt) : null;
      if (expiry && (!Number.isFinite(current) || current >= expiry)) return false;
      return constantTimeEqual(req.headers[expectedHeader], record.value);
    });
  }

  function proxyHttp(req, res) {
    const upstream = http.request({
      host: targetHost,
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: guardedHeaders(req.headers, expectedHeader)
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstream.on('error', () => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      writeJson(res, 502, { ok: false, error: 'origin_upstream_unavailable' });
    });
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
      headers: guardedHeaders(req.headers, expectedHeader)
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
