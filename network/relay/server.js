import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { verifyCompactFrame, verifyEnvelope } from '../../core/protocol/index.js';
import { trustabilityLite } from '../../core/trust/index.js';

function json(res, status, body) {
  if (res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

function boundedWaitMs(url, fallback = 0, max = 120_000) {
  const raw = url.searchParams.get('waitMs');
  if (raw == null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
}

export function createRelay({ nodeFreshnessMs = 15_000 } = {}) {
  const nodes = new Map();
  const sessions = new Map();
  const offers = new Map();
  const events = new Map();
  const fastEvents = new Map();
  const fastWaiters = new Map();
  const resultWaiters = new Map();
  const requests = new Map();
  const stats = new Map();

  function touch(nodeId) {
    const node = nodes.get(nodeId);
    if (node) node.lastSeenAt = new Date().toISOString();
  }

  function nodeSeenAtMs(nodeId) {
    const value = nodes.get(nodeId)?.lastSeenAt;
    const seenAt = value ? new Date(value).getTime() : 0;
    return Number.isFinite(seenAt) ? seenAt : 0;
  }

  function isNodeFresh(nodeId, now = Date.now()) {
    const seenAt = nodeSeenAtMs(nodeId);
    return seenAt > 0 && now - seenAt <= nodeFreshnessMs;
  }

  function matchingOffers({ capability = null, requesterNodeId = null } = {}) {
    const now = Date.now();
    return [...offers.values()]
      .filter((offer) =>
        !offer.revoked &&
        (!capability || offer.capability === capability) &&
        (!requesterNodeId || offer.envelope.from !== requesterNodeId) &&
        isNodeFresh(offer.envelope.from, now)
      )
      .sort((a, b) => nodeSeenAtMs(b.envelope.from) - nodeSeenAtMs(a.envelope.from));
  }

  function queue(nodeId, event) {
    const queueForNode = events.get(nodeId) || [];
    queueForNode.push(event);
    events.set(nodeId, queueForNode);
  }

  function removeFastWaiter(nodeId, waiter) {
    if (fastWaiters.get(nodeId) === waiter) fastWaiters.delete(nodeId);
    if (waiter.timer) clearTimeout(waiter.timer);
  }

  function queueFast(nodeId, event) {
    const waiter = fastWaiters.get(nodeId);
    if (waiter && !waiter.res.writableEnded) {
      removeFastWaiter(nodeId, waiter);
      touch(nodeId);
      json(waiter.res, 200, { ok: true, events: [event] });
      return;
    }
    const queueForNode = fastEvents.get(nodeId) || [];
    queueForNode.push(event);
    fastEvents.set(nodeId, queueForNode);
  }

  function authenticatedNodeId(req) {
    const token = bearer(req);
    return token ? sessions.get(token) || null : null;
  }

  function authenticatePoll(req, nodeId) {
    return authenticatedNodeId(req) === nodeId;
  }

  function trustFor(nodeId) {
    return trustabilityLite({
      identityVerified: true,
      ...(stats.get(nodeId) || {}),
      lastSeenAt: nodes.get(nodeId)?.lastSeenAt
    });
  }

  function registerFastWaiter(req, res, nodeId, waitMs) {
    const existing = fastWaiters.get(nodeId);
    if (existing && !existing.res.writableEnded) {
      removeFastWaiter(nodeId, existing);
      json(existing.res, 200, { ok: true, events: [] });
    }

    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => {
      removeFastWaiter(nodeId, waiter);
      touch(nodeId);
      json(res, 200, { ok: true, events: [] });
    }, waitMs);
    fastWaiters.set(nodeId, waiter);
    req.once('close', () => removeFastWaiter(nodeId, waiter));
  }

  function registerResultWaiter(req, res, requestId, waitMs) {
    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => {
      if (resultWaiters.get(requestId) !== waiter) return;
      resultWaiters.delete(requestId);
      json(res, 504, { ok: false, error: 'result_wait_timeout', requestId });
    }, waitMs);
    resultWaiters.set(requestId, waiter);
    req.once('close', () => {
      if (resultWaiters.get(requestId) === waiter) {
        resultWaiters.delete(requestId);
        clearTimeout(waiter.timer);
      }
    });
  }

  function completeRequest(request, providerNodeId) {
    request.status = 'completed';
    request.completedAt = new Date().toISOString();
    const providerStats = stats.get(providerNodeId) || { successfulTasks: 0, failedTasks: 0 };
    providerStats.successfulTasks += 1;
    stats.set(providerNodeId, providerStats);
    touch(providerNodeId);
    return trustFor(providerNodeId);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://relay.local');

      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, {
          ok: true,
          protocol: 'TRUYN/1',
          nodes: nodes.size,
          offers: offers.size,
          pendingRequests: [...requests.values()].filter((request) => request.status !== 'completed').length,
          fastPath: true
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/register') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['IDENTITY'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });

        const previousToken = nodes.get(envelope.from)?.sessionToken;
        if (previousToken) sessions.delete(previousToken);
        const sessionToken = randomBytes(32).toString('hex');
        nodes.set(envelope.from, {
          nodeId: envelope.from,
          publicKey: envelope.publicKey,
          sessionToken,
          lastSeenAt: new Date().toISOString()
        });
        sessions.set(sessionToken, envelope.from);
        events.set(envelope.from, events.get(envelope.from) || []);
        fastEvents.set(envelope.from, fastEvents.get(envelope.from) || []);
        stats.set(envelope.from, stats.get(envelope.from) || { successfulTasks: 0, failedTasks: 0 });

        return json(res, 200, { ok: true, nodeId: envelope.from, sessionToken });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/nodes/')) {
        const nodeId = decodeURIComponent(url.pathname.slice('/v1/nodes/'.length));
        const node = nodes.get(nodeId);
        if (!node) return json(res, 404, { ok: false, error: 'node_not_found' });
        return json(res, 200, {
          ok: true,
          nodeId,
          publicKey: node.publicKey,
          lastSeenAt: node.lastSeenAt,
          trust: trustFor(nodeId)
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/offers') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['OFFER'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!nodes.has(envelope.from)) return json(res, 401, { ok: false, error: 'node_not_registered' });
        const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
        if (!capability || typeof capability !== 'string') return json(res, 400, { ok: false, error: 'invalid_capability' });

        offers.set(envelope.id, { envelope, capability, revoked: false });
        touch(envelope.from);
        return json(res, 200, { ok: true, offerId: envelope.id });
      }

      if (req.method === 'GET' && url.pathname === '/v1/offers') {
        const capability = url.searchParams.get('capability');
        const matches = matchingOffers({ capability })
          .map((offer) => ({
            ...offer.envelope,
            trust: trustFor(offer.envelope.from)
          }));
        return json(res, 200, { ok: true, offers: matches });
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/needs') {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const requester = nodes.get(requesterNodeId);
        const { frame, payload } = await readJson(req);
        const verification = verifyCompactFrame(frame, payload, requester.publicKey, { allowedTypes: ['NEED'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (requests.has(frame.i)) return json(res, 409, { ok: false, error: 'duplicate_request' });

        const capability = payload?.capability?.name || payload?.capability;
        if (!capability || typeof capability !== 'string') return json(res, 400, { ok: false, error: 'invalid_capability' });
        const match = matchingOffers({ capability, requesterNodeId })[0];
        if (!match) return json(res, 404, { ok: false, error: 'no_matching_provider' });

        const request = {
          needId: frame.i,
          requester: requesterNodeId,
          provider: match.envelope.from,
          capability,
          createdAt: new Date().toISOString(),
          status: 'matched',
          mode: 'fast'
        };
        requests.set(frame.i, request);
        touch(requesterNodeId);

        const waitMs = boundedWaitMs(url, 120_000);
        if (waitMs > 0) registerResultWaiter(req, res, frame.i, waitMs);
        queueFast(match.envelope.from, {
          kind: 'NEED',
          frame,
          payload,
          from: requesterNodeId
        });

        if (waitMs === 0) {
          return json(res, 200, {
            ok: true,
            needId: frame.i,
            provider: match.envelope.from,
            providerTrust: trustFor(match.envelope.from)
          });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/results') {
        const providerNodeId = authenticatedNodeId(req);
        if (!providerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const provider = nodes.get(providerNodeId);
        const { frame, payload } = await readJson(req);
        const verification = verifyCompactFrame(frame, payload, provider.publicKey, { allowedTypes: ['RESULT'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });

        const request = requests.get(frame.i);
        if (!request) return json(res, 404, { ok: false, error: 'request_not_found' });
        if (request.provider !== providerNodeId) return json(res, 403, { ok: false, error: 'provider_mismatch' });
        if (request.status === 'completed') return json(res, 409, { ok: false, error: 'request_already_completed' });

        const trust = completeRequest(request, providerNodeId);
        const event = { kind: 'RESULT', frame, payload, from: providerNodeId, trust };
        const waiter = resultWaiters.get(frame.i);
        if (waiter && !waiter.res.writableEnded) {
          resultWaiters.delete(frame.i);
          clearTimeout(waiter.timer);
          json(waiter.res, 200, { ok: true, result: event });
        } else {
          queueFast(request.requester, event);
        }
        return json(res, 200, { ok: true, requestId: frame.i });
      }

      if (req.method === 'GET' && url.pathname === '/v1/fast/events') {
        const nodeId = url.searchParams.get('nodeId');
        if (!nodeId || !authenticatePoll(req, nodeId)) return json(res, 401, { ok: false, error: 'unauthorized' });
        touch(nodeId);
        const queued = fastEvents.get(nodeId) || [];
        if (queued.length > 0) {
          fastEvents.set(nodeId, []);
          return json(res, 200, { ok: true, events: queued });
        }
        const waitMs = boundedWaitMs(url, 25_000, 30_000);
        if (waitMs <= 0) return json(res, 200, { ok: true, events: [] });
        registerFastWaiter(req, res, nodeId, waitMs);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/needs') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['NEED'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!nodes.has(envelope.from)) return json(res, 401, { ok: false, error: 'node_not_registered' });

        const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
        if (!capability || typeof capability !== 'string') return json(res, 400, { ok: false, error: 'invalid_capability' });

        const match = matchingOffers({ capability, requesterNodeId: envelope.from })[0];
        if (!match) return json(res, 404, { ok: false, error: 'no_matching_provider' });

        requests.set(envelope.id, {
          needId: envelope.id,
          requester: envelope.from,
          provider: match.envelope.from,
          capability,
          createdAt: new Date().toISOString(),
          status: 'matched',
          mode: 'legacy'
        });
        queue(match.envelope.from, { kind: 'NEED', envelope });
        touch(envelope.from);

        return json(res, 200, {
          ok: true,
          needId: envelope.id,
          provider: match.envelope.from,
          providerTrust: trustFor(match.envelope.from)
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/results') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['RESULT'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!nodes.has(envelope.from)) return json(res, 401, { ok: false, error: 'node_not_registered' });

        const requestId = envelope.payload?.requestId;
        const request = requests.get(requestId);
        if (!request) return json(res, 404, { ok: false, error: 'request_not_found' });
        if (request.provider !== envelope.from) return json(res, 403, { ok: false, error: 'provider_mismatch' });

        const trust = completeRequest(request, envelope.from);
        queue(request.requester, { kind: 'RESULT', envelope, trust });
        return json(res, 200, { ok: true, requestId, trust });
      }

      if (req.method === 'POST' && url.pathname === '/v1/revoke') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['REVOKE'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const targetId = envelope.payload?.targetId;
        const offer = offers.get(targetId);
        if (!offer) return json(res, 404, { ok: false, error: 'target_not_found' });
        if (offer.envelope.from !== envelope.from) return json(res, 403, { ok: false, error: 'not_target_owner' });
        offer.revoked = true;
        touch(envelope.from);
        return json(res, 200, { ok: true, targetId });
      }

      if (req.method === 'GET' && url.pathname === '/v1/events') {
        const nodeId = url.searchParams.get('nodeId');
        if (!nodeId || !authenticatePoll(req, nodeId)) return json(res, 401, { ok: false, error: 'unauthorized' });
        const queued = events.get(nodeId) || [];
        events.set(nodeId, []);
        touch(nodeId);
        return json(res, 200, { ok: true, events: queued });
      }

      return json(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  });

  return {
    server,
    state: { nodes, sessions, offers, events, fastEvents, requests, stats },
    async listen({ port = 8787, host = '127.0.0.1' } = {}) {
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      for (const waiter of fastWaiters.values()) {
        clearTimeout(waiter.timer);
        json(waiter.res, 503, { ok: false, error: 'relay_closing' });
      }
      fastWaiters.clear();
      for (const waiter of resultWaiters.values()) {
        clearTimeout(waiter.timer);
        json(waiter.res, 503, { ok: false, error: 'relay_closing' });
      }
      resultWaiters.clear();
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
