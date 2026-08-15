from pathlib import Path


def replace_once(path, before, after):
    p = Path(path)
    src = p.read_text()
    count = src.count(before)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}")
    p.write_text(src.replace(before, after, 1))


replace_once(
    "node/client.js",
    "    this.fastSocketQueue = [];\n    this.fastSocketWaiters = [];",
    "    this.fastSocketQueue = [];\n    this.fastSocketWaiters = [];\n    this.fastSocketChainWaiters = new Map();",
)

replace_once(
    "node/client.js",
    """  async compactChain(stages, { waitMs = 120_000 } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact CHAIN');
    if (!Array.isArray(stages) || stages.length < 2) throw new Error('compactChain requires at least two stages');
    const payload = { stages };
    const frame = this.compactFrame('CHAIN', payload);
    const response = await requestJson(`${this.relayUrl}/v1/fast/chains?waitMs=${Math.max(0, Math.floor(waitMs))}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify({ frame, payload })
    });""",
    """  async compactChain(stages, { waitMs = 120_000 } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact CHAIN');
    if (!Array.isArray(stages) || stages.length < 2) throw new Error('compactChain requires at least two stages');
    const payload = { stages };
    const frame = this.compactFrame('CHAIN', payload);
    const boundedWait = Math.max(0, Math.min(120_000, Math.floor(waitMs)));
    let response;
    let requesterTransport = 'http';

    if (this.fastSocket?.readyState === WebSocket.OPEN) {
      requesterTransport = 'websocket';
      response = await new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          if (this.fastSocketChainWaiters.get(frame.i) === waiter) this.fastSocketChainWaiters.delete(frame.i);
          reject(new Error('fast_socket_chain_timeout'));
        }, boundedWait || 120_000);
        this.fastSocketChainWaiters.set(frame.i, waiter);
        this.fastSocket.send(JSON.stringify({ kind: 'CHAIN', frame, payload, waitMs: boundedWait }), (error) => {
          if (!error) return;
          if (this.fastSocketChainWaiters.get(frame.i) === waiter) this.fastSocketChainWaiters.delete(frame.i);
          clearTimeout(waiter.timer);
          reject(error);
        });
      });
    } else {
      response = await requestJson(`${this.relayUrl}/v1/fast/chains?waitMs=${boundedWait}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.sessionToken}` },
        body: JSON.stringify({ frame, payload })
      });
    }""",
)

replace_once(
    "node/client.js",
    "      ...response,\n      frame,\n      payload,\n      results: verifiedResults,",
    "      ...response,\n      requesterTransport,\n      frame,\n      payload,\n      results: verifiedResults,",
)

replace_once(
    "node/client.js",
    """  rejectFastSocketWaiters(error) {
    const waiters = this.fastSocketWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }""",
    """  rejectFastSocketWaiters(error) {
    const waiters = this.fastSocketWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  rejectFastSocketChainWaiters(error) {
    const waiters = [...this.fastSocketChainWaiters.values()];
    this.fastSocketChainWaiters.clear();
    for (const waiter of waiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }""",
)

replace_once(
    "node/client.js",
    """          if (message?.kind === 'ACK') return;
          if (message?.kind === 'ERROR') {
            this.rejectFastSocketWaiters(new Error(message.error || 'fast_socket_error'));
            return;
          }
          this.deliverFastSocketEvent(message);""",
    """          if (message?.kind === 'ACK') return;
          if (message?.kind === 'CHAIN_RESULT') {
            const waiter = this.fastSocketChainWaiters.get(message.chainId);
            if (!waiter) return;
            this.fastSocketChainWaiters.delete(message.chainId);
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.resolve(message);
            return;
          }
          if (message?.kind === 'ERROR') {
            const error = new Error(message.error || 'fast_socket_error');
            if (message.chainId) {
              const waiter = this.fastSocketChainWaiters.get(message.chainId);
              if (waiter) {
                this.fastSocketChainWaiters.delete(message.chainId);
                if (waiter.timer) clearTimeout(waiter.timer);
                waiter.reject(error);
                return;
              }
            }
            this.rejectFastSocketWaiters(error);
            this.rejectFastSocketChainWaiters(error);
            return;
          }
          this.deliverFastSocketEvent(message);""",
)

replace_once(
    "node/client.js",
    "        this.rejectFastSocketWaiters(new Error('fast_socket_closed'));\n      });",
    "        const closeError = new Error('fast_socket_closed');\n        this.rejectFastSocketWaiters(closeError);\n        this.rejectFastSocketChainWaiters(closeError);\n      });",
)

replace_once(
    "node/client.js",
    "    this.rejectFastSocketWaiters(new Error('fast_socket_closed'));\n  }",
    "    const closeError = new Error('fast_socket_closed');\n    this.rejectFastSocketWaiters(closeError);\n    this.rejectFastSocketChainWaiters(closeError);\n  }",
)

replace_once(
    "network/relay/server.js",
    "    stageTransport: chain.trace?.stageTransport || [],\n    segments,",
    "    requesterTransport: chain.trace?.requesterTransport || (chain.socket ? 'websocket' : 'http'),\n    stageTransport: chain.trace?.stageTransport || [],\n    segments,",
)

replace_once(
    "network/relay/server.js",
    """  function closeChain(chain, status, body) {
    if (chain.timer) clearTimeout(chain.timer);
    chain.status = status === 200 ? 'completed' : 'failed';
    chain.completedAt = new Date().toISOString();
    if (!chain.res.writableEnded) {
      chain.res.once('finish', () => traceMark(chain, 'responseFlushed'));
      json(chain.res, status, body);
    }
  }""",
    """  function closeChain(chain, status, body) {
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
  }""",
)

replace_once(
    "network/relay/server.js",
    """      if (req.method === 'POST' && url.pathname === '/v1/fast/chains') {
        const requesterNodeId = authenticatedNodeId(req);
        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const requester = nodes.get(requesterNodeId);
        const { frame, payload } = await readJson(req);
        const verification = verifyCompactFrame(frame, payload, requester.publicKey, { allowedTypes: ['CHAIN'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        if (chains.has(frame.i)) return json(res, 409, { ok: false, error: 'duplicate_chain' });
        if (!Array.isArray(payload?.stages) || payload.stages.length < 2 || payload.stages.length > 8) {
          return json(res, 400, { ok: false, error: 'invalid_chain_stages' });
        }
        for (let index = 0; index < payload.stages.length; index += 1) {
          const capability = capabilityName(payload.stages[index]);
          if (!capability || typeof capability !== 'string') {
            return json(res, 400, { ok: false, error: 'invalid_chain_capability', stageIndex: index });
          }
          if (!matchingOffers({ capability, requesterNodeId })[0]) {
            return json(res, 404, { ok: false, error: 'no_matching_provider', capability, stageIndex: index });
          }
        }

        const waitMs = boundedWaitMs(url, 120_000);
        const chain = {
          chainId: frame.i,
          requester: requesterNodeId,
          frame,
          payload,
          res,
          timer: null,
          createdAt: new Date().toISOString(),
          status: 'running',
          currentStage: -1,
          providers: [],
          providerTrust: [],
          results: [],
          trace: {
            marks: {
              publicRequestReceived: {
                monotonicMs: requestReceivedAtMs,
                wallTime: requestReceivedWallTime
              }
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
        return;
      }""",
    """      if (req.method === 'POST' && url.pathname === '/v1/fast/chains') {
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
      }""",
)

replace_once(
    "network/relay/server.js",
    """    socket.on('message', (data) => {
      const receivedAtMs = performance.now();
      try {
        touch(nodeId);
        const message = JSON.parse(data.toString());
        if (message?.kind !== 'RESULT') throw new Error('unsupported_socket_message');
        const processed = processFastResult(nodeId, message.frame, message.payload, receivedAtMs);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ kind: 'ACK', ...processed.body, status: processed.status }));
        }
      } catch (error) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ kind: 'ERROR', ok: false, error: error.message }));
        }
      }
    });""",
    """    socket.on('message', (data) => {
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
    });""",
)

replace_once(
    "benchmarks/cross-cloud-ab.js",
    """  if (researchProvider === reviewProvider) throw new Error('TRUYN benchmark requires distinct Azure and Gemini provider identities');
  console.error(`TRUYN single-request chain ready: research=${researchProvider}; review=${reviewProvider}`);""",
    """  if (researchProvider === reviewProvider) throw new Error('TRUYN benchmark requires distinct Azure and Gemini provider identities');
  await requester.ensureFastSocket();
  console.error(`TRUYN single-request chain ready over persistent requester socket: research=${researchProvider}; review=${reviewProvider}`);""",
)

replace_once(
    "benchmarks/cross-cloud-ab.js",
    "    edgeIngressEgressResidualMs: round(Math.max(0, endToEndLatencyMs - (relayTrace.relayTotalMs || 0)), 3),",
    "    requesterPublicEdgeResidualMs: round(Math.max(0, endToEndLatencyMs - (relayTrace.relayTotalMs || 0)), 3),",
)
replace_once(
    "benchmarks/cross-cloud-ab.js",
    "      edgeIngressEgressResidualMs: stats(samples, (sample) => sample.orchestrationBreakdown?.edgeIngressEgressResidualMs),",
    "      requesterPublicEdgeResidualMs: stats(samples, (sample) => sample.orchestrationBreakdown?.requesterPublicEdgeResidualMs),",
)
replace_once(
    "benchmarks/cross-cloud-ab.js",
    "    candidate: 'One persistent requester session sends one signed compact CHAIN through relay.truyn.org. Relay dispatches Azure then Gemini internally over provider long-poll backchannels and returns both signed provider RESULTs in one public HTTP response.',",
    "    candidate: 'One pre-established persistent requester WebSocket sends one signed compact CHAIN through canonical wss://relay.truyn.org. Relay dispatches Azure then Gemini over persistent provider WebSockets and returns both signed provider RESULTs over the same requester WebSocket.',",
)
replace_once(
    "benchmarks/cross-cloud-ab.js",
    "    bootstrapOutsideMeasuredArm: 'Requester registration, OFFER discovery and provider public-key caching happen before warm-up/measured timing. Provider inference remains fully measured.',",
    "    bootstrapOutsideMeasuredArm: 'Requester registration, OFFER discovery, provider public-key caching, and canonical requester WebSocket handshake happen before warm-up/measured timing. Provider inference remains fully measured.',",
)
replace_once(
    "benchmarks/cross-cloud-ab.js",
    "    providerBackchannel: 'Providers use the relay origin directly; the public requester remains on canonical relay.truyn.org / Front Door.',",
    "    requesterTransport: 'Persistent WebSocket over canonical wss://relay.truyn.org / Front Door; TLS/WebSocket handshake is completed before measured arms. HTTP CHAIN remains fallback only.',\n    providerBackchannel: 'Providers use persistent WebSockets to the relay origin directly; the public requester remains on canonical relay.truyn.org / Front Door.',",
)

replace_once(
    "tests/mvp.test.js",
    """  const requester = new TruynNode({ relayUrl });
  t.after(() => researchNode.closeFastSocket());
  t.after(() => reviewNode.closeFastSocket());""",
    """  const requester = new TruynNode({ relayUrl });
  t.after(() => researchNode.closeFastSocket());
  t.after(() => reviewNode.closeFastSocket());
  t.after(() => requester.closeFastSocket());""",
)
replace_once(
    "tests/mvp.test.js",
    """  await requester.register();
  const researchWork = researchHost.runOnce();""",
    """  await requester.register();
  await requester.ensureFastSocket();
  const researchWork = researchHost.runOnce();""",
)
replace_once(
    "tests/mvp.test.js",
    "  assert.equal(relay.state.providerSockets.size, 2);",
    "  assert.equal(result.requesterTransport, 'websocket');\n  assert.equal(relay.state.providerSockets.size, 3);",
)
replace_once(
    "tests/mvp.test.js",
    "  assert.deepEqual(traceBody.trace.stageTransport, ['socket', 'socket']);",
    "  assert.equal(traceBody.trace.requesterTransport, 'websocket');\n  assert.deepEqual(traceBody.trace.stageTransport, ['socket', 'socket']);",
)
