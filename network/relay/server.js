import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { compactStageRequestId, verifyCompactFrame, verifyEnvelope } from '../../core/protocol/index.js';
import { trustabilityLite } from '../../core/trust/index.js';
import { applyContextDelta, buildContextDocument, retrieveContextBlocks } from '../../core/context/index.js';
import { providerPolicyAllowsRequester, providerPolicyFromOffer } from '../../core/security/relay-provider-policy.js';

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

function httpError(status, code) {
  const error = new Error(code);
  error.httpStatus = status;
  error.publicCode = code;
  return error;
}

async function readJson(req, maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = httpError(413, 'request_too_large');
      error.closeConnection = true;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'invalid_json');
  }
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

function capabilityName(stage) {
  return stage?.capability?.name || stage?.capability || null;
}

const roundMs = (value) => Number(value.toFixed(3));

function traceMark(chain, name, monotonicMs = performance.now(), wallTime = new Date().toISOString()) {
  if (!chain?.trace) return;
  chain.trace.marks[name] = { monotonicMs, wallTime };
}

function chainTraceSnapshot(chain) {
  const marks = chain.trace?.marks || {};
  const delta = (from, to) => {
    const start = marks[from]?.monotonicMs;
    const end = marks[to]?.monotonicMs;
    return Number.isFinite(start) && Number.isFinite(end) ? roundMs(Math.max(0, end - start)) : null;
  };
  const segments = {};
  for (let index = 0; index < (chain.payload?.stages?.length || 0); index += 1) {
    const stage = index + 1;
    segments[`stage${stage}DispatchToResultMs`] = delta(`stage${stage}SocketDispatch`, `stage${stage}ResultReceived`);
    if (index === 0) segments.publicRequestToStage1DispatchMs = delta('publicRequestReceived', 'stage1SocketDispatch');
    if (index > 0) segments[`stage${stage - 1}ResultToStage${stage}DispatchMs`] = delta(`stage${stage - 1}ResultReceived`, `stage${stage}SocketDispatch`);
  }
  segments.finalResultToResponseFlushedMs = delta(`stage${chain.payload?.stages?.length || 0}ResultReceived`, 'responseFlushed');
  return {
    chainId: chain.chainId,
    status: chain.status,
    requesterTransport: chain.trace?.requesterTransport || (chain.socket ? 'websocket' : 'http'),
    stageTransport: chain.trace?.stageTransport || [],
    segments,
    relayTotalMs: delta('publicRequestReceived', 'responseFlushed')
  };
}

export function createRelay({
  nodeFreshnessMs = 15_000,
  sessionTtlMs = 60 * 60 * 1000,
  registrationFreshnessMs = 5 * 60 * 1000,
  maxBodyBytes = 1024 * 1024,
  maxNodes = 4096,
  maxOffers = 16384,
  maxContexts = 256,
  maxQueuedEventsPerNode = 256,
  maxRequests = 8192,
  maxChains = 1024,
  allowedNodeIds = [],
  trustedRequesterNodeIds = [],
  allowPublicRegistration = false,
  allowPublicDispatch = false,
  localDevelopmentMode = false,
  productionMode = false,
  exposeDiagnostics = false
} = {}) {
  if (localDevelopmentMode && (productionMode || allowPublicRegistration || allowPublicDispatch)) {
    throw new Error('localDevelopmentMode cannot be combined with production or public relay access');
  }

  const nodes = new Map();
  const sessions = new Map();
  const offers = new Map();
  const events = new Map();
  const fastEvents = new Map();
  const fastWaiters = new Map();
  const providerSockets = new Map();
  const resultWaiters = new Map();
  const requests = new Map();
  const chains = new Map();
  const contexts = new Map();
  const stats = new Map();
  const usedRegistrationIds = new Map();
  const allowedNodes = new Set(allowedNodeIds);
  const trustedRequesters = new Set(trustedRequesterNodeIds);

  for (const nodeId of trustedRequesters) allowedNodes.add(nodeId);

  function touch(nodeId) {
    const node = nodes.get(nodeId);
    if (node) node.lastSeenAt = new Date().toISOString();
  }

  function nodeSeenAtMs(nodeId) {
    const value = nodes.get(nodeId)?.lastSeenAt;
    const seenAt = value ? new Date(value).getTime() : 0;
    return Number.isFinite(seenAt) ? seenAt : 0;
  }

  function connectedSocket(nodeId) {
    const socket = providerSockets.get(nodeId);
    return socket?.readyState === WebSocket.OPEN ? socket : null;
  }

  function isNodeFresh(nodeId, now = Date.now()) {
    if (connectedSocket(nodeId)) return true;
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
        isNodeFresh(offer.envelope.from, now) &&
        (!requesterNodeId || localDevelopmentMode || providerPolicyAllowsRequester(offer.policy, requesterNodeId, {
          trustedRequesterNodeIds: [...trustedRequesters]
        }))
      )
      .sort((a, b) => nodeSeenAtMs(b.envelope.from) - nodeSeenAtMs(a.envelope.from));
  }

  function requesterCanDispatch(nodeId) {
    return Boolean(nodeId && (
      localDevelopmentMode ||
      trustedRequesters.has(nodeId) ||
      (allowPublicDispatch && nodeSessionActive(nodeId))
    ));
  }

  function nodeCanRegister(nodeId) {
    return Boolean(nodeId && (localDevelopmentMode || allowPublicRegistration || allowedNodes.has(nodeId)));
  }

  function boundedQueue(map, nodeId, event) {
    const queueForNode = map.get(nodeId) || [];
    queueForNode.push(event);
    if (queueForNode.length > maxQueuedEventsPerNode) queueForNode.splice(0, queueForNode.length - maxQueuedEventsPerNode);
    map.set(nodeId, queueForNode);
  }

  function queue(nodeId, event) {
    boundedQueue(events, nodeId, event);
  }

  function removeFastWaiter(nodeId, waiter) {
    if (fastWaiters.get(nodeId) === waiter) fastWaiters.delete(nodeId);
    if (waiter.timer) clearTimeout(waiter.timer);
  }

  function sendSocketEvent(nodeId, event) {
    const socket = connectedSocket(nodeId);
    if (!socket) return false;
    try {
      socket.send(JSON.stringify(event));
      touch(nodeId);
      return true;
    } catch {
      return false;
    }
  }

  function queueFast(nodeId, event) {
    if (sendSocketEvent(nodeId, event)) return 'socket';
    const waiter = fastWaiters.get(nodeId);
    if (waiter && !waiter.res.writableEnded) {
      removeFastWaiter(nodeId, waiter);
      touch(nodeId);
      json(waiter.res, 200, { ok: true, events: [event] });
      return 'long-poll';
    }
    boundedQueue(fastEvents, nodeId, event);
    return 'queued';
  }

  function authenticatedNodeId(req) {
    const token = bearer(req);
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (Date.now() >= session.expiresAt) {
      sessions.delete(token);
      return null;
    }
    const node = nodes.get(session.nodeId);
    if (!node || node.sessionToken !== token) return null;
    return session.nodeId;
  }

  function nodeSessionActive(nodeId) {
    const token = nodes.get(nodeId)?.sessionToken;
    if (!token) return false;
    const session = sessions.get(token);
    return Boolean(session && session.nodeId === nodeId && Date.now() < session.expiresAt);
  }

  function authenticateEnvelope(req, envelope) {
    const nodeId = authenticatedNodeId(req);
    return Boolean(nodeId && envelope?.from === nodeId);
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

  function contextReaders(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.length)) {
      throw httpError(400, 'invalid_context_readers');
    }
    return [...new Set(value)];
  }

  function canReadContext(record, nodeId) {
    return Boolean(record && (record.owners.has(nodeId) || record.readers.has(nodeId)));
  }

  function saveContext(ownerNodeId, document, { readers = [], metadata = {}, baseCid = null, deltaOps = null } = {}) {
    const existing = contexts.get(document.cid);
    if (existing) {
      existing.owners.add(ownerNodeId);
      for (const reader of contextReaders(readers)) existing.readers.add(reader);
      return existing;
    }
    if (contexts.size >= maxContexts) throw httpError(503, 'context_capacity_reached');
    const record = {
      cid: document.cid,
      blocks: document.blocks,
      manifest: document.manifest,
      contentBytes: document.contentBytes,
      serializedBytes: document.serializedBytes,
      owners: new Set([ownerNodeId]),
      readers: new Set(contextReaders(readers)),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      baseCid,
      deltaOps,
      createdAt: new Date().toISOString()
    };
    contexts.set(record.cid, record);
    return record;
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

  function pruneCompleted(map, maxSize) {
    if (map.size < maxSize) return;
    for (const [key, value] of map) {
      if (value?.status === 'completed' || value?.status === 'failed') map.delete(key);
      if (map.size < maxSize) return;
    }
    if (map.size >= maxSize) throw httpError(503, 'relay_capacity_reached');
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

  function closeChain(chain, status, body) {
    if (chain.timer) clearTimeout(chain.timer);
    chain.status = status === 200 ? 'completed' : 'failed';
    chain.completedAt = new Date().toISOString();
    if (chain.socket?.readyState === WebSocket.OPEN) {
      chain.socket.send(JSON.stringify({ kind: 'CHAIN_RESULT', status, ...body }), (error) => {
        if (!error) traceMark(chain, 'responseFlushed');
      });
      return;
    }
    if (chain.res && !chain.res.writableEnded) {
      chain.res.once('finish', () => traceMark(chain, 'responseFlushed'));
      json(chain.res, status, body);
    }
  }

  function startChain({ requesterNodeId, frame, payload, waitMs, res = null, socket = null, requestReceivedAtMs = performance.now(), requestReceivedWallTime = new Date().toISOString(), requesterTransport = 'http' }) {
    if (!requesterCanDispatch(requesterNodeId)) return { status: 403, body: { ok: false, error: 'provider_access_denied' } };
    if (chains.has(frame.i)) return { status: 409, body: { ok: false, error: 'duplicate_chain' } };
    if (!Array.isArray(payload?.stages) || payload.stages.length < 2 || payload.stages.length > 8) {
      return { status: 400, body: { ok: false, error: 'invalid_chain_stages' } };
    }
    for (let index = 0; index < payload.stages.length; index += 1) {
      const capability = capabilityName(payload.stages[index]);
      if (!capability || typeof capability !== 'string') {
        return { status: 400, body: { ok: false, error: 'invalid_chain_capability', stageIndex: index } };
      }
      if (!matchingOffers({ capability, requesterNodeId })[0]) {
        return { status: 404, body: { ok: false, error: 'no_matching_provider', capability, stageIndex: index } };
      }
    }
    pruneCompleted(chains, maxChains);
    const chain = {
      chainId: frame.i,
      requester: requesterNodeId,
      frame,
      payload,
      res,
      socket,
      timer: null,
      createdAt: new Date().toISOString(),
      status: 'running',
      currentStage: -1,
      providers: [],
      providerTrust: [],
      results: [],
      trace: {
        requesterTransport,
        marks: { publicRequestReceived: { monotonicMs: requestReceivedAtMs, wallTime: requestReceivedWallTime } },
        stageTransport: []
      }
    };
    chain.timer = setTimeout(() => {
      if (chain.status !== 'running') return;
      closeChain(chain, 504, { ok: false, error: 'chain_wait_timeout', chainId: frame.i });
    }, waitMs || 120_000);
    chains.set(frame.i, chain);
    touch(requesterNodeId);
    dispatchChainStage(chain, 0);
    return null;
  }

  function dispatchChainStage(chain, stageIndex) {
    if (!requesterCanDispatch(chain.requester)) {
      closeChain(chain, 403, { ok: false, error: 'provider_access_denied' });
      return false;
    }
    const stage = chain.payload.stages[stageIndex];
    const capability = capabilityName(stage);
    if (!capability || typeof capability !== 'string') {
      closeChain(chain, 400, { ok: false, error: 'invalid_chain_capability', stageIndex });
      return false;
    }
    const match = matchingOffers({ capability, requesterNodeId: chain.requester })[0];
    if (!match) {
      closeChain(chain, 404, { ok: false, error: 'no_matching_provider', capability, stageIndex });
      return false;
    }
    pruneCompleted(requests, maxRequests);
    const requestId = compactStageRequestId(chain.frame.i, stageIndex);
    const request = {
      needId: requestId,
      requester: chain.requester,
      provider: match.envelope.from,
      capability,
      createdAt: new Date().toISOString(),
      status: 'matched',
      mode: 'chain-stage',
      chainId: chain.frame.i,
      stageIndex
    };
    requests.set(requestId, request);
    chain.providers[stageIndex] = match.envelope.from;
    chain.providerTrust[stageIndex] = trustFor(match.envelope.from);
    chain.currentStage = stageIndex;
    const transport = queueFast(match.envelope.from, {
      kind: 'CHAIN_STAGE',
      signedType: 'CHAIN',
      frame: chain.frame,
      payload: chain.payload,
      from: chain.requester,
      stageIndex,
      requestId,
      priorResult: stageIndex > 0 ? chain.results[stageIndex - 1] : null
    });
    chain.trace.stageTransport[stageIndex] = transport;
    traceMark(chain, `stage${stageIndex + 1}SocketDispatch`);
    return true;
  }

  function processFastResult(providerNodeId, frame, payload, receivedAtMs = performance.now()) {
    const provider = nodes.get(providerNodeId);
    if (!provider || !nodeSessionActive(providerNodeId)) return { status: 401, body: { ok: false, error: 'unauthorized' } };
    const verification = verifyCompactFrame(frame, payload, provider.publicKey, { allowedTypes: ['RESULT'] });
    if (!verification.ok) return { status: 400, body: { ok: false, error: verification.reason } };
    const request = requests.get(frame.i);
    if (!request) return { status: 404, body: { ok: false, error: 'request_not_found' } };
    if (request.provider !== providerNodeId) return { status: 403, body: { ok: false, error: 'provider_mismatch' } };
    if (request.status === 'completed') return { status: 409, body: { ok: false, error: 'request_already_completed' } };
    const trust = completeRequest(request, providerNodeId);
    const event = { kind: 'RESULT', frame, payload, from: providerNodeId, trust };
    if (request.mode === 'chain-stage') {
      const chain = chains.get(request.chainId);
      if (!chain || chain.status !== 'running') return { status: 409, body: { ok: false, error: 'chain_not_running' } };
      traceMark(chain, `stage${request.stageIndex + 1}ResultReceived`, receivedAtMs);
      chain.results[request.stageIndex] = event;
      if (payload?.metadata?.failed) {
        closeChain(chain, 200, { ok: true, chainId: chain.chainId, results: chain.results, providers: chain.providers, providerTrust: chain.providerTrust, failedStage: request.stageIndex });
      } else if (request.stageIndex + 1 < chain.payload.stages.length) {
        dispatchChainStage(chain, request.stageIndex + 1);
      } else {
        closeChain(chain, 200, { ok: true, chainId: chain.chainId, results: chain.results, providers: chain.providers, providerTrust: chain.providerTrust });
      }
      return { status: 200, body: { ok: true, requestId: frame.i, chainId: request.chainId } };
    }
    const waiter = resultWaiters.get(frame.i);
    if (waiter && !waiter.res.writableEnded) {
      resultWaiters.delete(frame.i);
      clearTimeout(waiter.timer);
      json(waiter.res, 200, { ok: true, result: event });
    } else {
      queueFast(request.requester, event);
    }
    return { status: 200, body: { ok: true, requestId: frame.i } };
  }

  function cleanupRegistrationReplayCache(now = Date.now()) {
    for (const [id, expiry] of usedRegistrationIds) if (expiry <= now) usedRegistrationIds.delete(id);
  }

  function registrationIsFresh(envelope, now = Date.now()) {
    const createdAt = Date.parse(envelope?.createdAt || '');
    return Number.isFinite(createdAt) && createdAt <= now + 30_000 && now - createdAt <= registrationFreshnessMs;
  }

  function evictOneStaleNode(now = Date.now()) {
    let candidate = null;
    for (const [nodeId, node] of nodes) {
      if (connectedSocket(nodeId)) continue;
      const seen = Date.parse(node.lastSeenAt || '') || 0;
      if (now - seen <= nodeFreshnessMs) continue;
      if (!candidate || seen < candidate.seen) candidate = { nodeId, seen };
    }
    if (!candidate) return false;
    const node = nodes.get(candidate.nodeId);
    if (node?.sessionToken) sessions.delete(node.sessionToken);
    nodes.delete(candidate.nodeId);
    events.delete(candidate.nodeId);
    fastEvents.delete(candidate.nodeId);
    stats.delete(candidate.nodeId);
    for (const [offerId, offer] of offers) if (offer.envelope.from === candidate.nodeId) offers.delete(offerId);
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const requestReceivedAtMs = performance.now();
    const requestReceivedWallTime = new Date().toISOString();
    try {
      const url = new URL(req.url, 'http://relay.local');

      if (req.method === 'GET' && url.pathname === '/health') {
        if (!exposeDiagnostics) return json(res, 200, { ok: true, protocol: 'TRUYN/1' });
        return json(res, 200, {
          ok: true,
          protocol: 'TRUYN/1',
          nodes: nodes.size,
          offers: offers.size,
          pendingRequests: [...requests.values()].filter((request) => request.status !== 'completed').length,
          pendingChains: [...chains.values()].filter((chain) => chain.status === 'running').length,
          contexts: contexts.size,
          providerSockets: [...providerSockets.values()].filter((socket) => socket.readyState === WebSocket.OPEN).length
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/register') {
        const { envelope } = await readJson(req, maxBodyBytes);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['IDENTITY'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!nodeCanRegister(envelope.from)) return json(res, 403, { ok: false, error: 'registration_denied' });
        const now = Date.now();
        cleanupRegistrationReplayCache(now);
        if (!registrationIsFresh(envelope, now)) return json(res, 400, { ok: false, error: 'stale_registration' });
        if (usedRegistrationIds.has(envelope.id)) return json(res, 409, { ok: false, error: 'registration_replay' });
        usedRegistrationIds.set(envelope.id, now + registrationFreshnessMs + 30_000);
        if (!nodes.has(envelope.from) && nodes.size >= maxNodes && !evictOneStaleNode(now)) {
          return json(res, 503, { ok: false, error: 'node_capacity_reached' });
        }
        const previousToken = nodes.get(envelope.from)?.sessionToken;
        if (previousToken) sessions.delete(previousToken);
        const oldSocket = providerSockets.get(envelope.from);
        if (oldSocket) {
          providerSockets.delete(envelope.from);
          try { oldSocket.close(4001, 'session_replaced'); } catch {}
        }
        const sessionToken = randomBytes(32).toString('base64url');
        nodes.set(envelope.from, {
          nodeId: envelope.from,
          publicKey: envelope.publicKey,
          sessionToken,
          lastSeenAt: new Date(now).toISOString()
        });
        sessions.set(sessionToken, { nodeId: envelope.from, expiresAt: now + sessionTtlMs });
        events.set(envelope.from, events.get(envelope.from) || []);
        fastEvents.set(envelope.from, fastEvents.get(envelope.from) || []);
        stats.set(envelope.from, stats.get(envelope.from) || { successfulTasks: 0, failedTasks: 0 });
        return json(res, 200, { ok: true, nodeId: envelope.from, sessionToken, expiresInMs: sessionTtlMs });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/nodes/')) {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const nodeId = decodeURIComponent(url.pathname.slice('/v1/nodes/'.length));
        const node = nodes.get(nodeId);
        if (!node) return json(res, 404, { ok: false, error: 'node_not_found' });
        return json(res, 200, { ok: true, nodeId, publicKey: node.publicKey });
      }

      if (req.method === 'POST' && url.pathname === '/v1/offers') {
        const { envelope } = await readJson(req, maxBodyBytes);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['OFFER'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!authenticateEnvelope(req, envelope)) return json(res, 401, { ok: false, error: 'unauthorized' });
        const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
        if (!capability || typeof capability !== 'string') return json(res, 400, { ok: false, error: 'invalid_capability' });
        if (!offers.has(envelope.id) && offers.size >= maxOffers) return json(res, 503, { ok: false, error: 'offer_capacity_reached' });
        const policy = providerPolicyFromOffer(envelope);
        offers.set(envelope.id, { envelope, capability, policy, revoked: false });
        touch(envelope.from);
        return json(res, 200, { ok: true, offerId: envelope.id });
      }

      if (req.method === 'GET' && url.pathname === '/v1/offers') {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const capability = url.searchParams.get('capability');
        if (!requesterCanDispatch(requesterNodeId)) {
          const own = [...offers.values()]
            .filter((offer) => !offer.revoked && offer.envelope.from === requesterNodeId && (!capability || offer.capability === capability))
            .map((offer) => offer.envelope);
          return json(res, 200, { ok: true, offers: own });
        }
        const matches = matchingOffers({ capability, requesterNodeId })
          .map((offer) => ({ ...offer.envelope, trust: trustFor(offer.envelope.from) }));
        return json(res, 200, { ok: true, offers: matches });
      }

      if (req.method === 'POST' && url.pathname === '/v1/contexts') {
        const ownerNodeId = authenticatedNodeId(req);
        if (!ownerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        if (!requesterCanDispatch(ownerNodeId)) return json(res, 403, { ok: false, error: 'context_write_denied' });
        const owner = nodes.get(ownerNodeId);
        const { frame, payload } = await readJson(req, maxBodyBytes);
        const verification = verifyCompactFrame(frame, payload, owner.publicKey, { allowedTypes: ['CONTEXT_PUT'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const document = buildContextDocument(payload?.blocks);
        const record = saveContext(ownerNodeId, document, { readers: payload?.readers || [], metadata: payload?.metadata || {} });
        touch(ownerNodeId);
        return json(res, 200, { ok: true, cid: record.cid, manifest: record.manifest, contentBytes: record.contentBytes, serializedBytes: record.serializedBytes });
      }

      const contextRoute = url.pathname.match(/^\/v1\/contexts\/([^/]+)\/(manifest|select|retrieve|delta)$/);
      if (contextRoute) {
        const nodeId = authenticatedNodeId(req);
        if (!nodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const cid = decodeURIComponent(contextRoute[1]);
        const action = contextRoute[2];
        const record = contexts.get(cid);
        if (!record) return json(res, 404, { ok: false, error: 'context_not_found' });
        if (req.method === 'GET' && action === 'manifest') {
          if (!canReadContext(record, nodeId)) return json(res, 403, { ok: false, error: 'context_forbidden' });
          touch(nodeId);
          return json(res, 200, { ok: true, cid, manifest: record.manifest });
        }
        if (req.method === 'POST' && action === 'select') {
          if (!canReadContext(record, nodeId)) return json(res, 403, { ok: false, error: 'context_forbidden' });
          const { ids } = await readJson(req, maxBodyBytes);
          if (!Array.isArray(ids) || ids.length === 0 || ids.length > 32 || ids.some((id) => typeof id !== 'string')) {
            return json(res, 400, { ok: false, error: 'invalid_context_selection' });
          }
          const byId = new Map(record.blocks.map((block) => [block.id, block]));
          const selected = [];
          for (const id of ids) {
            const block = byId.get(id);
            if (!block) return json(res, 404, { ok: false, error: 'context_block_not_found' });
            selected.push({ id: block.id, cid: block.cid, text: block.text, bytes: block.bytes });
          }
          touch(nodeId);
          return json(res, 200, { ok: true, cid, blocks: selected });
        }
        if (req.method === 'POST' && action === 'retrieve') {
          if (!canReadContext(record, nodeId)) return json(res, 403, { ok: false, error: 'context_forbidden' });
          const { query, topK = 1 } = await readJson(req, maxBodyBytes);
          if (typeof query !== 'string' || query.trim().length < 3 || query.length > 4000) return json(res, 400, { ok: false, error: 'invalid_context_query' });
          if (!Number.isInteger(topK) || topK < 1 || topK > 8) return json(res, 400, { ok: false, error: 'invalid_context_top_k' });
          const retrieved = retrieveContextBlocks(record.blocks, query, { topK });
          const selected = retrieved.blocks.map((block, index) => ({ id: block.id, cid: block.cid, text: block.text, bytes: block.bytes, score: block.score, rank: index + 1 }));
          touch(nodeId);
          return json(res, 200, {
            ok: true,
            cid,
            blocks: selected,
            retrieval: {
              version: 1,
              algorithm: retrieved.algorithm,
              rootCid: cid,
              manifestCid: record.manifest.cid,
              queryHash: retrieved.queryHash,
              topK,
              corpusBlocks: retrieved.corpusBlocks,
              selected: selected.map(({ id, cid: blockCid, score, rank }) => ({ id, cid: blockCid, score, rank }))
            }
          });
        }
        if (req.method === 'POST' && action === 'delta') {
          if (!requesterCanDispatch(nodeId) || !record.owners.has(nodeId)) return json(res, 403, { ok: false, error: 'context_owner_required' });
          const owner = nodes.get(nodeId);
          const { frame, payload } = await readJson(req, maxBodyBytes);
          const verification = verifyCompactFrame(frame, payload, owner.publicKey, { allowedTypes: ['CONTEXT_DELTA'] });
          if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
          if (payload?.baseCid !== cid) return json(res, 400, { ok: false, error: 'context_base_cid_mismatch' });
          const nextBlocks = applyContextDelta(record.blocks, payload?.ops);
          const document = buildContextDocument(nextBlocks);
          const readers = [...new Set([...record.readers, ...contextReaders(payload?.readers || [])])];
          const child = saveContext(nodeId, document, { readers, metadata: payload?.metadata || record.metadata, baseCid: cid, deltaOps: payload?.ops });
          touch(nodeId);
          return json(res, 200, { ok: true, cid: child.cid, baseCid: cid, manifest: child.manifest, contentBytes: child.contentBytes, serializedBytes: child.serializedBytes, deltaBytes: Buffer.byteLength(JSON.stringify(payload?.ops || [])) });
        }
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/chains') {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        if (!requesterCanDispatch(requesterNodeId)) return json(res, 403, { ok: false, error: 'provider_access_denied' });
        const requester = nodes.get(requesterNodeId);
        const { frame, payload } = await readJson(req, maxBodyBytes);
        const verification = verifyCompactFrame(frame, payload, requester.publicKey, { allowedTypes: ['CHAIN'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const started = startChain({ requesterNodeId, frame, payload, waitMs: boundedWaitMs(url, 120_000), res, requestReceivedAtMs, requestReceivedWallTime, requesterTransport: 'http' });
        if (started) return json(res, started.status, started.body);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/needs') {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        if (!requesterCanDispatch(requesterNodeId)) return json(res, 403, { ok: false, error: 'provider_access_denied' });
        const requester = nodes.get(requesterNodeId);
        const { frame, payload } = await readJson(req, maxBodyBytes);
        const verification = verifyCompactFrame(frame, payload, requester.publicKey, { allowedTypes: ['NEED'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (requests.has(frame.i)) return json(res, 409, { ok: false, error: 'duplicate_request' });
        const capability = payload?.capability?.name || payload?.capability;
        if (!capability || typeof capability !== 'string') return json(res, 400, { ok: false, error: 'invalid_capability' });
        const match = matchingOffers({ capability, requesterNodeId })[0];
        if (!match) return json(res, 404, { ok: false, error: 'no_matching_provider' });
        pruneCompleted(requests, maxRequests);
        const request = { needId: frame.i, requester: requesterNodeId, provider: match.envelope.from, capability, createdAt: new Date().toISOString(), status: 'matched', mode: 'fast' };
        requests.set(frame.i, request);
        touch(requesterNodeId);
        const waitMs = boundedWaitMs(url, 120_000);
        if (waitMs > 0) registerResultWaiter(req, res, frame.i, waitMs);
        queueFast(match.envelope.from, { kind: 'NEED', frame, payload, from: requesterNodeId });
        if (waitMs === 0) return json(res, 200, { ok: true, needId: frame.i, provider: match.envelope.from, providerTrust: trustFor(match.envelope.from) });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/results') {
        const providerNodeId = authenticatedNodeId(req);
        if (!providerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const { frame, payload } = await readJson(req, maxBodyBytes);
        const processed = processFastResult(providerNodeId, frame, payload, requestReceivedAtMs);
        return json(res, processed.status, processed.body);
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/fast/chains/') && url.pathname.endsWith('/trace')) {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const chainId = decodeURIComponent(url.pathname.slice('/v1/fast/chains/'.length, -'/trace'.length));
        const chain = chains.get(chainId);
        if (!chain) return json(res, 404, { ok: false, error: 'chain_not_found' });
        if (chain.requester !== requesterNodeId) return json(res, 403, { ok: false, error: 'requester_mismatch' });
        if (!chain.trace?.marks?.responseFlushed) return json(res, 409, { ok: false, error: 'chain_trace_not_flushed' });
        return json(res, 200, { ok: true, trace: chainTraceSnapshot(chain) });
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
        const { envelope } = await readJson(req, maxBodyBytes);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['NEED'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!authenticateEnvelope(req, envelope)) return json(res, 401, { ok: false, error: 'unauthorized' });
        if (!requesterCanDispatch(envelope.from)) return json(res, 403, { ok: false, error: 'provider_access_denied' });
        const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
        if (!capability || typeof capability !== 'string') return json(res, 400, { ok: false, error: 'invalid_capability' });
        const match = matchingOffers({ capability, requesterNodeId: envelope.from })[0];
        if (!match) return json(res, 404, { ok: false, error: 'no_matching_provider' });
        pruneCompleted(requests, maxRequests);
        requests.set(envelope.id, { needId: envelope.id, requester: envelope.from, provider: match.envelope.from, capability, createdAt: new Date().toISOString(), status: 'matched', mode: 'legacy' });
        queue(match.envelope.from, { kind: 'NEED', envelope });
        touch(envelope.from);
        return json(res, 200, { ok: true, needId: envelope.id, provider: match.envelope.from, providerTrust: trustFor(match.envelope.from) });
      }

      if (req.method === 'POST' && url.pathname === '/v1/results') {
        const { envelope } = await readJson(req, maxBodyBytes);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['RESULT'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!authenticateEnvelope(req, envelope)) return json(res, 401, { ok: false, error: 'unauthorized' });
        const requestId = envelope.payload?.requestId;
        const request = requests.get(requestId);
        if (!request) return json(res, 404, { ok: false, error: 'request_not_found' });
        if (request.provider !== envelope.from) return json(res, 403, { ok: false, error: 'provider_mismatch' });
        const trust = completeRequest(request, envelope.from);
        queue(request.requester, { kind: 'RESULT', envelope, trust });
        return json(res, 200, { ok: true, requestId, trust });
      }

      if (req.method === 'POST' && url.pathname === '/v1/revoke') {
        const { envelope } = await readJson(req, maxBodyBytes);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['REVOKE'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (!authenticateEnvelope(req, envelope)) return json(res, 401, { ok: false, error: 'unauthorized' });
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
      const status = Number.isInteger(error.httpStatus) ? error.httpStatus : 500;
      if ((error.closeConnection || status === 413) && !res.headersSent) {
        res.shouldKeepAlive = false;
        res.setHeader('connection', 'close');
      }
      return json(res, status, { ok: false, error: error.publicCode || (status < 500 ? error.message : 'internal_error') });
    }
  });

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: maxBodyBytes });

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://relay.local');
      if (url.pathname !== '/v1/fast/socket') {
        socket.destroy();
        return;
      }
      const nodeId = url.searchParams.get('nodeId');
      const authenticated = authenticatedNodeId(req);
      if (!nodeId || authenticated !== nodeId || !nodes.has(nodeId)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, nodeId));
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (socket, req, nodeId) => {
    const previous = providerSockets.get(nodeId);
    if (previous && previous !== socket) {
      try { previous.close(4001, 'socket_replaced'); } catch {}
    }
    providerSockets.set(nodeId, socket);
    socket.isAlive = true;
    touch(nodeId);
    const queued = fastEvents.get(nodeId) || [];
    fastEvents.set(nodeId, []);
    for (const event of queued) sendSocketEvent(nodeId, event);
    socket.on('pong', () => {
      socket.isAlive = true;
      touch(nodeId);
    });
    socket.on('message', (data) => {
      const receivedAtMs = performance.now();
      const receivedWallTime = new Date().toISOString();
      let message = null;
      try {
        if (!nodeSessionActive(nodeId)) {
          socket.close(4003, 'session_expired');
          return;
        }
        touch(nodeId);
        message = JSON.parse(data.toString());
        if (message?.kind === 'CHAIN') {
          if (!requesterCanDispatch(nodeId)) {
            socket.send(JSON.stringify({ kind: 'ERROR', chainId: message.frame?.i || null, ok: false, status: 403, error: 'provider_access_denied' }));
            return;
          }
          const requester = nodes.get(nodeId);
          const verification = verifyCompactFrame(message.frame, message.payload, requester.publicKey, { allowedTypes: ['CHAIN'] });
          if (!verification.ok) {
            socket.send(JSON.stringify({ kind: 'ERROR', chainId: message.frame?.i || null, ok: false, status: 400, error: verification.reason }));
            return;
          }
          const rawWaitMs = Number(message.waitMs);
          const waitMs = Number.isFinite(rawWaitMs) ? Math.max(0, Math.min(120_000, Math.floor(rawWaitMs))) : 120_000;
          const started = startChain({ requesterNodeId: nodeId, frame: message.frame, payload: message.payload, waitMs, socket, requestReceivedAtMs: receivedAtMs, requestReceivedWallTime: receivedWallTime, requesterTransport: 'websocket' });
          if (started) socket.send(JSON.stringify({ kind: 'ERROR', chainId: message.frame?.i || null, ok: false, status: started.status, error: started.body.error }));
          return;
        }
        if (message?.kind !== 'RESULT') throw httpError(400, 'unsupported_socket_message');
        const processed = processFastResult(nodeId, message.frame, message.payload, receivedAtMs);
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ kind: 'ACK', ...processed.body, status: processed.status }));
      } catch (error) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ kind: 'ERROR', chainId: message?.frame?.i || null, ok: false, error: error.publicCode || 'invalid_socket_message' }));
      }
    });
    socket.on('close', () => {
      if (providerSockets.get(nodeId) === socket) providerSockets.delete(nodeId);
    });
    socket.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const [nodeId, socket] of providerSockets) {
      if (socket.readyState !== WebSocket.OPEN || !nodeSessionActive(nodeId)) {
        providerSockets.delete(nodeId);
        try { socket.close(4003, 'session_expired'); } catch {}
        continue;
      }
      if (socket.isAlive === false) {
        providerSockets.delete(nodeId);
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      try { socket.ping(); } catch {}
    }
  }, 10_000);
  heartbeat.unref?.();

  return {
    server,
    state: { nodes, sessions, offers, events, fastEvents, providerSockets, requests, chains, contexts, stats },
    async listen({ port = 8787, host = '127.0.0.1' } = {}) {
      if (localDevelopmentMode && host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
        throw new Error('localDevelopmentMode may only bind to a loopback host');
      }
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      clearInterval(heartbeat);
      for (const socket of providerSockets.values()) {
        try { socket.close(1001, 'relay_closing'); } catch {}
      }
      providerSockets.clear();
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
      for (const chain of chains.values()) {
        if (chain.status === 'running') closeChain(chain, 503, { ok: false, error: 'relay_closing', chainId: chain.chainId });
      }
      wss.close();
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
