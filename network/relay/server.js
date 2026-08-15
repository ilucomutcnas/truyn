import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { verifyEnvelope } from '../../core/protocol/index.js';
import { trustabilityLite } from '../../core/trust/index.js';

function json(res, status, body) {
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

export function createRelay() {
  const nodes = new Map();
  const offers = new Map();
  const events = new Map();
  const requests = new Map();
  const stats = new Map();

  function touch(nodeId) {
    const node = nodes.get(nodeId);
    if (node) node.lastSeenAt = new Date().toISOString();
  }

  function queue(nodeId, event) {
    const queueForNode = events.get(nodeId) || [];
    queueForNode.push(event);
    events.set(nodeId, queueForNode);
  }

  function authenticatePoll(req, nodeId) {
    const node = nodes.get(nodeId);
    return Boolean(node && bearer(req) && bearer(req) === node.sessionToken);
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
          pendingRequests: requests.size
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/register') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['IDENTITY'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });

        const sessionToken = randomBytes(32).toString('hex');
        nodes.set(envelope.from, {
          nodeId: envelope.from,
          publicKey: envelope.publicKey,
          sessionToken,
          lastSeenAt: new Date().toISOString()
        });
        events.set(envelope.from, events.get(envelope.from) || []);
        stats.set(envelope.from, stats.get(envelope.from) || { successfulTasks: 0, failedTasks: 0 });

        return json(res, 200, { ok: true, nodeId: envelope.from, sessionToken });
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
        const matches = [...offers.values()]
          .filter((offer) => !offer.revoked && (!capability || offer.capability === capability))
          .map((offer) => ({
            ...offer.envelope,
            trust: trustabilityLite({
              identityVerified: true,
              ...(stats.get(offer.envelope.from) || {}),
              lastSeenAt: nodes.get(offer.envelope.from)?.lastSeenAt
            })
          }));
        return json(res, 200, { ok: true, offers: matches });
      }

      if (req.method === 'POST' && url.pathname === '/v1/needs') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['NEED'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!nodes.has(envelope.from)) return json(res, 401, { ok: false, error: 'node_not_registered' });

        const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
        if (!capability || typeof capability !== 'string') return json(res, 400, { ok: false, error: 'invalid_capability' });

        const match = [...offers.values()].find(
          (offer) => !offer.revoked && offer.capability === capability && offer.envelope.from !== envelope.from
        );
        if (!match) return json(res, 404, { ok: false, error: 'no_matching_provider' });

        requests.set(envelope.id, {
          needId: envelope.id,
          requester: envelope.from,
          provider: match.envelope.from,
          capability,
          createdAt: new Date().toISOString(),
          status: 'matched'
        });
        queue(match.envelope.from, { kind: 'NEED', envelope });
        touch(envelope.from);

        return json(res, 200, {
          ok: true,
          needId: envelope.id,
          provider: match.envelope.from,
          providerTrust: trustabilityLite({
            identityVerified: true,
            ...(stats.get(match.envelope.from) || {}),
            lastSeenAt: nodes.get(match.envelope.from)?.lastSeenAt
          })
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

        request.status = 'completed';
        request.completedAt = new Date().toISOString();
        const providerStats = stats.get(envelope.from) || { successfulTasks: 0, failedTasks: 0 };
        providerStats.successfulTasks += 1;
        stats.set(envelope.from, providerStats);
        touch(envelope.from);

        const trust = trustabilityLite({
          identityVerified: true,
          ...providerStats,
          lastSeenAt: nodes.get(envelope.from)?.lastSeenAt
        });
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
    state: { nodes, offers, events, requests, stats },
    async listen({ port = 8787, host = '127.0.0.1' } = {}) {
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
