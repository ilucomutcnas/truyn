import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyEnvelope } from '../../core/protocol/index.js';

const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MESSAGE_TTL_MS = 60_000;

function json(res, status, value) {
  if (status === 204) { res.writeHead(204, { 'cache-control': 'no-store' }); res.end(); return; }
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('request_body_too_large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {
    const error = new Error('invalid_json');
    error.statusCode = 400;
    throw error;
  }
}

function authorized(req, token) {
  if (!token) return true;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createTestnetRelayService({
  host = '127.0.0.1',
  port = 0,
  token = '',
  messageTtlMs = DEFAULT_MESSAGE_TTL_MS,
  disabled = false
} = {}) {
  const messages = new Map();
  const queues = new Map();
  const waiters = new Map();
  let isDisabled = Boolean(disabled);

  const expire = () => {
    const now = Date.now();
    for (const [id, item] of messages) {
      if (item.expiresAt > now) continue;
      messages.delete(id);
      const queue = queues.get(item.envelope.to);
      if (queue) queues.set(item.envelope.to, queue.filter((value) => value !== id));
    }
  };

  const nextFor = (nodeId) => {
    expire();
    const queue = queues.get(nodeId) || [];
    while (queue.length) {
      const id = queue.shift();
      const item = messages.get(id);
      if (item && item.state === 'queued') {
        item.state = 'delivered';
        queues.set(nodeId, queue);
        return { id, envelope: item.envelope };
      }
    }
    queues.set(nodeId, queue);
    return null;
  };

  const wake = (nodeId) => {
    const waiter = waiters.get(nodeId);
    if (!waiter) return;
    const message = nextFor(nodeId);
    if (!message) return;
    waiters.delete(nodeId);
    clearTimeout(waiter.timer);
    json(waiter.res, 200, message);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, isDisabled ? 503 : 200, { ok: !isDisabled });
      }
      if (!authorized(req, token)) return json(res, 401, { ok: false, error: 'TRUYN_RELAY_UNAUTHORIZED' });
      if (isDisabled) return json(res, 503, { ok: false, error: 'TRUYN_RELAY_UNAVAILABLE' });
      expire();

      if (req.method === 'POST' && url.pathname === '/v1/relay') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope);
        if (!verification.ok) return json(res, 400, { ok: false, error: `TRUYN_RELAY_INVALID_ENVELOPE:${verification.reason}` });
        if (!envelope.to) return json(res, 400, { ok: false, error: 'TRUYN_RELAY_RECIPIENT_REQUIRED' });
        const id = randomUUID();
        messages.set(id, { envelope, state: 'queued', result: null, error: null, expiresAt: Date.now() + messageTtlMs });
        const queue = queues.get(envelope.to) || [];
        queue.push(id);
        queues.set(envelope.to, queue);
        wake(envelope.to);
        return json(res, 202, { ok: true, id });
      }

      if (req.method === 'GET' && url.pathname === '/v1/poll') {
        const nodeId = url.searchParams.get('nodeId');
        if (!nodeId) return json(res, 400, { ok: false, error: 'TRUYN_RELAY_NODE_ID_REQUIRED' });
        const immediate = nextFor(nodeId);
        if (immediate) return json(res, 200, immediate);
        const waitMs = Math.max(0, Math.min(20_000, Number(url.searchParams.get('waitMs') || 10_000)));
        if (!Number.isFinite(waitMs) || waitMs <= 0) return json(res, 204, null);
        const previous = waiters.get(nodeId);
        if (previous) { clearTimeout(previous.timer); json(previous.res, 204, null); }
        const timer = setTimeout(() => {
          if (waiters.get(nodeId)?.res === res) waiters.delete(nodeId);
          if (!res.writableEnded) json(res, 204, null);
        }, waitMs);
        waiters.set(nodeId, { res, timer });
        req.once('close', () => {
          const current = waiters.get(nodeId);
          if (current?.res === res) { clearTimeout(current.timer); waiters.delete(nodeId); }
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/complete') {
        const body = await readJson(req);
        const item = messages.get(body.id);
        if (!item) return json(res, 404, { ok: false, error: 'TRUYN_RELAY_MESSAGE_NOT_FOUND' });
        if (item.envelope.to !== body.nodeId) return json(res, 403, { ok: false, error: 'TRUYN_RELAY_COMPLETION_RECIPIENT_MISMATCH' });
        item.state = 'completed';
        item.result = body.result ?? null;
        item.error = body.error || null;
        return json(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/v1/result') {
        const id = url.searchParams.get('id');
        const item = messages.get(id);
        if (!item) return json(res, 404, { ok: false, error: 'TRUYN_RELAY_MESSAGE_NOT_FOUND' });
        if (item.state !== 'completed') return json(res, 204, null);
        messages.delete(id);
        return json(res, 200, { ok: true, result: item.result, error: item.error });
      }

      return json(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return json(res, error?.statusCode || 500, { ok: false, error: error?.code || error?.message || 'relay_error' });
    }
  });

  await new Promise((resolvePromise, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolvePromise(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  return {
    server,
    address: server.address(),
    setDisabled(value) { isDisabled = Boolean(value); return isDisabled; },
    snapshot() {
      expire();
      return { messages: messages.size, queued: [...messages.values()].filter((item) => item.state === 'queued').length, disabled: isDisabled };
    },
    async close() {
      for (const waiter of waiters.values()) { clearTimeout(waiter.timer); if (!waiter.res.writableEnded) json(waiter.res, 503, { ok: false, error: 'TRUYN_RELAY_SHUTDOWN' }); }
      waiters.clear();
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    }
  };
}

export async function runTestnetRelayFromEnv(env = process.env) {
  const service = await createTestnetRelayService({
    host: env.TRUYN_RELAY_HOST || '0.0.0.0',
    port: Number(env.PORT || env.TRUYN_RELAY_PORT || 8080),
    token: env.TRUYN_RELAY_TOKEN || '',
    messageTtlMs: Number(env.TRUYN_RELAY_MESSAGE_TTL_MS || DEFAULT_MESSAGE_TTL_MS),
    disabled: ['1', 'true', 'yes', 'on'].includes(String(env.TRUYN_RELAY_DISABLED || '').toLowerCase())
  });
  process.stdout.write(`${JSON.stringify({ ok: true, port: service.address.port })}\n`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await service.close();
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return service;
}

const executed = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executed) await runTestnetRelayFromEnv();
