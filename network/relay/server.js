import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { compactStageRequestId, verifyCompactFrame, verifyEnvelope } from '../../core/protocol/index.js';
import { trustabilityLite } from '../../core/trust/index.js';
import { applyContextDelta, buildContextDocument } from '../../core/context/index.js';

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
  const segments = {
    publicRequestToStage1SocketDispatchMs: delta('publicRequestReceived', 'stage1SocketDispatch'),
    stage1SocketDispatchToResultReceivedMs: delta('stage1SocketDispatch', 'stage1ResultReceived'),
    stage1ResultToStage2SocketDispatchMs: delta('stage1ResultReceived', 'stage2SocketDispatch'),
    stage2SocketDispatchToResultReceivedMs: delta('stage2SocketDispatch', 'stage2ResultReceived'),
    stage2ResultToResponseFlushedMs: delta('stage2ResultReceived', 'responseFlushed')
  };
  return {
    chainId: chain.chainId,
    status: chain.status,
    marks,
    requesterTransport: chain.trace?.requesterTransport || (chain.socket ? 'websocket' : 'http'),
    stageTransport: chain.trace?.stageTransport || [],
    segments,
    relayTotalMs: delta('publicRequestReceived', 'responseFlushed')
  };
}

export function createRelay({ nodeFreshnessMs = 15_000 } = {}) {
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
    const queueForNode = fastEvents.get(nodeId) || [];
    queueForNode.push(event);
    fastEvents.set(nodeId, queueForNode);
    return 'queued';
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



  function contextReaders(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.length)) {
      throw new Error('context readers must be node-id strings');
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
      const message = JSON.stringify({ kind: 'CHAIN_RESULT', status, ...body });
      chain.socket.send(message, (error) => {
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
        marks: {
          publicRequestReceived: { monotonicMs: requestReceivedAtMs, wallTime: requestReceivedWallTime }
        },
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
    traceMark(chain, stageIndex === 0 ? 'stage1SocketDispatch' : 'stage2SocketDispatch');
    return true;
  }

  function processFastResult(providerNodeId, frame, payload, receivedAtMs = performance.now()) {
    const provider = nodes.get(providerNodeId);
    if (!provider) return { status: 401, body: { ok: false, error: 'node_not_registered' } };
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
      traceMark(chain, request.stageIndex === 0 ? 'stage1ResultReceived' : 'stage2ResultReceived', receivedAtMs);
      chain.results[request.stageIndex] = event;
      if (payload?.metadata?.failed) {
        closeChain(chain, 200, {
          ok: true,
          chainId: chain.chainId,
          results: chain.results,
          providers: chain.providers,
          providerTrust: chain.providerTrust,
          failedStage: request.stageIndex
        });
      } else if (request.stageIndex + 1 < chain.payload.stages.length) {
        dispatchChainStage(chain, request.stageIndex + 1);
      } else {
        closeChain(chain, 200, {
          ok: true,
          chainId: chain.chainId,
          results: chain.results,
          providers: chain.providers,
          providerTrust: chain.providerTrust
        });
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

  const server = http.createServer(async (req, res) => {
    const requestReceivedAtMs = performance.now();
    const requestReceivedWallTime = new Date().toISOString();
    try {
      const url = new URL(req.url, 'http://relay.local');

      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, {
          ok: true,
          protocol: 'TRUYN/1',
          nodes: nodes.size,
          offers: offers.size,
          pendingRequests: [...requests.values()].filter((request) => request.status !== 'completed').length,
          pendingChains: [...chains.values()].filter((chain) => chain.status === 'running').length,
          contexts: contexts.size,
          providerSockets: [...providerSockets.values()].filter((socket) => socket.readyState === WebSocket.OPEN).length,
          fastPath: true,
          chainPath: true,
          socketPath: true
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/register') {
        const { envelope } = await readJson(req);
        const verification = verifyEnvelope(envelope, { allowedTypes: ['IDENTITY'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });

        const previousToken = nodes.get(envelope.from)?.sessionToken;
        if (previousToken) sessions.delete(previousToken);
        const oldSocket = providerSockets.get(envelope.from);
        if (oldSocket) {
          providerSockets.delete(envelope.from);
          try { oldSocket.close(4001, 'session_replaced'); } catch {}
        }
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
          .map((offer) => ({ ...offer.envelope, trust: trustFor(offer.envelope.from) }));
        return json(res, 200, { ok: true, offers: matches });
      }



      if (req.method === 'POST' && url.pathname === '/v1/contexts') {
        const ownerNodeId = authenticatedNodeId(req);
        if (!ownerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const owner = nodes.get(ownerNodeId);
        const { frame, payload } = await readJson(req);
        const verification = verifyCompactFrame(frame, payload, owner.publicKey, { allowedTypes: ['CONTEXT_PUT'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const document = buildContextDocument(payload?.blocks);
        const record = saveContext(ownerNodeId, document, {
          readers: payload?.readers || [],
          metadata: payload?.metadata || {}
        });
        touch(ownerNodeId);
        return json(res, 200, {
          ok: true,
          cid: record.cid,
          manifest: record.manifest,
          contentBytes: record.contentBytes,
          serializedBytes: record.serializedBytes
        });
      }

      const contextRoute = url.pathname.match(/^\/v1\/contexts\/([^/]+)\/(manifest|select|delta)$/);
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
          const { ids } = await readJson(req);
          if (!Array.isArray(ids) || ids.length === 0 || ids.length > 32 || ids.some((id) => typeof id !== 'string')) {
            return json(res, 400, { ok: false, error: 'invalid_context_selection' });
          }
          const byId = new Map(record.blocks.map((block) => [block.id, block]));
          const selected = [];
          for (const id of ids) {
            const block = byId.get(id);
            if (!block) return json(res, 404, { ok: false, error: 'context_block_not_found', blockId: id });
            selected.push({ id: block.id, cid: block.cid, text: block.text, bytes: block.bytes });
          }
          touch(nodeId);
          return json(res, 200, { ok: true, cid, blocks: selected });
        }

        if (req.method === 'POST' && action === 'delta') {
          if (!record.owners.has(nodeId)) return json(res, 403, { ok: false, error: 'context_owner_required' });
          const owner = nodes.get(nodeId);
          const { frame, payload } = await readJson(req);
          const verification = verifyCompactFrame(frame, payload, owner.publicKey, { allowedTypes: ['CONTEXT_DELTA'] });
          if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
          if (payload?.baseCid !== cid) return json(res, 400, { ok: false, error: 'context_base_cid_mismatch' });
          const nextBlocks = applyContextDelta(record.blocks, payload?.ops);
          const document = buildContextDocument(nextBlocks);
          const inheritedReaders = [...record.readers];
          const readers = [...new Set([...inheritedReaders, ...contextReaders(payload?.readers || [])])];
          const child = saveContext(nodeId, document, {
            readers,
            metadata: payload?.metadata || record.metadata,
            baseCid: cid,
            deltaOps: payload?.ops
          });
          touch(nodeId);
          return json(res, 200, {
            ok: true,
            cid: child.cid,
            baseCid: cid,
            manifest: child.manifest,
            contentBytes: child.contentBytes,
            serializedBytes: child.serializedBytes,
            deltaBytes: Buffer.byteLength(JSON.stringify(payload?.ops || []))
          });
        }
      }

      if (req.method === 'POST' && url.pathname === '/v1/fast/chains') {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const requester = nodes.get(requesterNodeId);
        const { frame, payload } = await readJson(req);
        const verification = verifyCompactFrame(frame, payload, requester.publicKey, { allowedTypes: ['CHAIN'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const started = startChain({
          requesterNodeId,
          frame,
          payload,
          waitMs: boundedWaitMs(url, 120_000),
          res,
          requestReceivedAtMs,
          requestReceivedWallTime,
          requesterTransport: 'http'
        });
        if (started) return json(res, started.status, started.body);
        return;
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
        queueFast(match.envelope.from, { kind: 'NEED', frame, payload, from: requesterNodeId });

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
        const { frame, payload } = await readJson(req);
        const processed = processFastResult(providerNodeId, frame, payload, requestReceivedAtMs);
        return json(res, processed.status, processed.body);
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/fast/chains/') && url.pathname.endsWith('/trace')) {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const encodedChainId = url.pathname.slice('/v1/fast/chains/'.length, -'/trace'.length);
        const chainId = decodeURIComponent(encodedChainId);
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

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

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
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, nodeId);
      });
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
        touch(nodeId);
        message = JSON.parse(data.toString());
        if (message?.kind === 'CHAIN') {
          const requester = nodes.get(nodeId);
          const verification = verifyCompactFrame(message.frame, message.payload, requester.publicKey, { allowedTypes: ['CHAIN'] });
          if (!verification.ok) {
            socket.send(JSON.stringify({ kind: 'ERROR', chainId: message.frame?.i || null, ok: false, status: 400, error: verification.reason }));
            return;
          }
          const rawWaitMs = Number(message.waitMs);
          const waitMs = Number.isFinite(rawWaitMs) ? Math.max(0, Math.min(120_000, Math.floor(rawWaitMs))) : 120_000;
          const started = startChain({
            requesterNodeId: nodeId,
            frame: message.frame,
            payload: message.payload,
            waitMs,
            socket,
            requestReceivedAtMs: receivedAtMs,
            requestReceivedWallTime: receivedWallTime,
            requesterTransport: 'websocket'
          });
          if (started) {
            socket.send(JSON.stringify({ kind: 'ERROR', chainId: message.frame?.i || null, ok: false, status: started.status, error: started.body.error }));
          }
          return;
        }
        if (message?.kind !== 'RESULT') throw new Error('unsupported_socket_message');
        const processed = processFastResult(nodeId, message.frame, message.payload, receivedAtMs);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ kind: 'ACK', ...processed.body, status: processed.status }));
        }
      } catch (error) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ kind: 'ERROR', chainId: message?.frame?.i || null, ok: false, error: error.message }));
        }
      }
    });
    socket.on('close', () => {
      if (providerSockets.get(nodeId) === socket) providerSockets.delete(nodeId);
    });
    socket.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const [nodeId, socket] of providerSockets) {
      if (socket.readyState !== WebSocket.OPEN) {
        providerSockets.delete(nodeId);
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
