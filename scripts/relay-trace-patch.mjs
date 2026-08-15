import { readFile, writeFile, unlink } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${path}: patch anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: patch anchor is not unique`);
  await writeFile(path, source.slice(0, first) + after + source.slice(first + before.length), 'utf8');
}

await replaceOnce(
  'network/relay/server.js',
  "import { randomBytes } from 'node:crypto';\nimport { WebSocket, WebSocketServer } from 'ws';",
  "import { randomBytes } from 'node:crypto';\nimport { performance } from 'node:perf_hooks';\nimport { WebSocket, WebSocketServer } from 'ws';"
);

await replaceOnce(
  'network/relay/server.js',
  `function capabilityName(stage) {\n  return stage?.capability?.name || stage?.capability || null;\n}\n`,
  `function capabilityName(stage) {\n  return stage?.capability?.name || stage?.capability || null;\n}\n\nconst roundMs = (value) => Number(value.toFixed(3));\n\nfunction traceMark(chain, name, monotonicMs = performance.now(), wallTime = new Date().toISOString()) {\n  if (!chain?.trace) return;\n  chain.trace.marks[name] = { monotonicMs, wallTime };\n}\n\nfunction chainTraceSnapshot(chain) {\n  const marks = chain.trace?.marks || {};\n  const delta = (from, to) => {\n    const start = marks[from]?.monotonicMs;\n    const end = marks[to]?.monotonicMs;\n    return Number.isFinite(start) && Number.isFinite(end) ? roundMs(Math.max(0, end - start)) : null;\n  };\n  const segments = {\n    publicRequestToStage1SocketDispatchMs: delta('publicRequestReceived', 'stage1SocketDispatch'),\n    stage1SocketDispatchToResultReceivedMs: delta('stage1SocketDispatch', 'stage1ResultReceived'),\n    stage1ResultToStage2SocketDispatchMs: delta('stage1ResultReceived', 'stage2SocketDispatch'),\n    stage2SocketDispatchToResultReceivedMs: delta('stage2SocketDispatch', 'stage2ResultReceived'),\n    stage2ResultToResponseFlushedMs: delta('stage2ResultReceived', 'responseFlushed')\n  };\n  return {\n    chainId: chain.chainId,\n    status: chain.status,\n    marks,\n    stageTransport: chain.trace?.stageTransport || [],\n    segments,\n    relayTotalMs: delta('publicRequestReceived', 'responseFlushed')\n  };\n}\n`
);

await replaceOnce(
  'network/relay/server.js',
  `  function queueFast(nodeId, event) {\n    if (sendSocketEvent(nodeId, event)) return;\n    const waiter = fastWaiters.get(nodeId);\n    if (waiter && !waiter.res.writableEnded) {\n      removeFastWaiter(nodeId, waiter);\n      touch(nodeId);\n      json(waiter.res, 200, { ok: true, events: [event] });\n      return;\n    }\n    const queueForNode = fastEvents.get(nodeId) || [];\n    queueForNode.push(event);\n    fastEvents.set(nodeId, queueForNode);\n  }`,
  `  function queueFast(nodeId, event) {\n    if (sendSocketEvent(nodeId, event)) return 'socket';\n    const waiter = fastWaiters.get(nodeId);\n    if (waiter && !waiter.res.writableEnded) {\n      removeFastWaiter(nodeId, waiter);\n      touch(nodeId);\n      json(waiter.res, 200, { ok: true, events: [event] });\n      return 'long-poll';\n    }\n    const queueForNode = fastEvents.get(nodeId) || [];\n    queueForNode.push(event);\n    fastEvents.set(nodeId, queueForNode);\n    return 'queued';\n  }`
);

await replaceOnce(
  'network/relay/server.js',
  `  function closeChain(chain, status, body) {\n    if (chain.timer) clearTimeout(chain.timer);\n    chain.status = status === 200 ? 'completed' : 'failed';\n    chain.completedAt = new Date().toISOString();\n    if (!chain.res.writableEnded) json(chain.res, status, body);\n  }`,
  `  function closeChain(chain, status, body) {\n    if (chain.timer) clearTimeout(chain.timer);\n    chain.status = status === 200 ? 'completed' : 'failed';\n    chain.completedAt = new Date().toISOString();\n    if (!chain.res.writableEnded) {\n      chain.res.once('finish', () => traceMark(chain, 'responseFlushed'));\n      json(chain.res, status, body);\n    }\n  }`
);

await replaceOnce(
  'network/relay/server.js',
  `    queueFast(match.envelope.from, {\n      kind: 'CHAIN_STAGE',\n      signedType: 'CHAIN',\n      frame: chain.frame,\n      payload: chain.payload,\n      from: chain.requester,\n      stageIndex,\n      requestId,\n      priorResult: stageIndex > 0 ? chain.results[stageIndex - 1] : null\n    });\n    return true;`,
  `    const transport = queueFast(match.envelope.from, {\n      kind: 'CHAIN_STAGE',\n      signedType: 'CHAIN',\n      frame: chain.frame,\n      payload: chain.payload,\n      from: chain.requester,\n      stageIndex,\n      requestId,\n      priorResult: stageIndex > 0 ? chain.results[stageIndex - 1] : null\n    });\n    chain.trace.stageTransport[stageIndex] = transport;\n    traceMark(chain, stageIndex === 0 ? 'stage1SocketDispatch' : 'stage2SocketDispatch');\n    return true;`
);

await replaceOnce(
  'network/relay/server.js',
  `  function processFastResult(providerNodeId, frame, payload) {`,
  `  function processFastResult(providerNodeId, frame, payload, receivedAtMs = performance.now()) {`
);

await replaceOnce(
  'network/relay/server.js',
  `      const chain = chains.get(request.chainId);\n      if (!chain || chain.status !== 'running') return { status: 409, body: { ok: false, error: 'chain_not_running' } };\n      chain.results[request.stageIndex] = event;`,
  `      const chain = chains.get(request.chainId);\n      if (!chain || chain.status !== 'running') return { status: 409, body: { ok: false, error: 'chain_not_running' } };\n      traceMark(chain, request.stageIndex === 0 ? 'stage1ResultReceived' : 'stage2ResultReceived', receivedAtMs);\n      chain.results[request.stageIndex] = event;`
);

await replaceOnce(
  'network/relay/server.js',
  `  const server = http.createServer(async (req, res) => {\n    try {\n      const url = new URL(req.url, 'http://relay.local');`,
  `  const server = http.createServer(async (req, res) => {\n    const requestReceivedAtMs = performance.now();\n    const requestReceivedWallTime = new Date().toISOString();\n    try {\n      const url = new URL(req.url, 'http://relay.local');`
);

await replaceOnce(
  'network/relay/server.js',
  `          providerTrust: [],\n          results: []\n        };`,
  `          providerTrust: [],\n          results: [],\n          trace: {\n            marks: {\n              publicRequestReceived: {\n                monotonicMs: requestReceivedAtMs,\n                wallTime: requestReceivedWallTime\n              }\n            },\n            stageTransport: []\n          }\n        };`
);

await replaceOnce(
  'network/relay/server.js',
  `      if (req.method === 'POST' && url.pathname === '/v1/fast/results') {\n        const providerNodeId = authenticatedNodeId(req);\n        if (!providerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });\n        const { frame, payload } = await readJson(req);\n        const processed = processFastResult(providerNodeId, frame, payload);\n        return json(res, processed.status, processed.body);\n      }`,
  `      if (req.method === 'POST' && url.pathname === '/v1/fast/results') {\n        const providerNodeId = authenticatedNodeId(req);\n        if (!providerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });\n        const { frame, payload } = await readJson(req);\n        const processed = processFastResult(providerNodeId, frame, payload, requestReceivedAtMs);\n        return json(res, processed.status, processed.body);\n      }\n\n      if (req.method === 'GET' && url.pathname.startsWith('/v1/fast/chains/') && url.pathname.endsWith('/trace')) {\n        const requesterNodeId = authenticatedNodeId(req);\n        if (!requesterNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });\n        const encodedChainId = url.pathname.slice('/v1/fast/chains/'.length, -'/trace'.length);\n        const chainId = decodeURIComponent(encodedChainId);\n        const chain = chains.get(chainId);\n        if (!chain) return json(res, 404, { ok: false, error: 'chain_not_found' });\n        if (chain.requester !== requesterNodeId) return json(res, 403, { ok: false, error: 'requester_mismatch' });\n        if (!chain.trace?.marks?.responseFlushed) return json(res, 409, { ok: false, error: 'chain_trace_not_flushed' });\n        return json(res, 200, { ok: true, trace: chainTraceSnapshot(chain) });\n      }`
);

await replaceOnce(
  'network/relay/server.js',
  `    socket.on('message', (data) => {\n      try {\n        touch(nodeId);\n        const message = JSON.parse(data.toString());\n        if (message?.kind !== 'RESULT') throw new Error('unsupported_socket_message');\n        const processed = processFastResult(nodeId, message.frame, message.payload);`,
  `    socket.on('message', (data) => {\n      const receivedAtMs = performance.now();\n      try {\n        touch(nodeId);\n        const message = JSON.parse(data.toString());\n        if (message?.kind !== 'RESULT') throw new Error('unsupported_socket_message');\n        const processed = processFastResult(nodeId, message.frame, message.payload, receivedAtMs);`
);

await replaceOnce(
  'benchmarks/cross-cloud-ab.js',
  `const requester = new TruynNode({ relayUrl, identity: createIdentity() });\nconst routeCache = new Map();`,
  `const requester = new TruynNode({ relayUrl, identity: createIdentity() });\nconst routeCache = new Map();\n\nasync function fetchRelayChainTrace(chainId) {\n  const traceUrl = \`${relayUrl}/v1/fast/chains/\${encodeURIComponent(chainId)}/trace\`;\n  for (let attempt = 0; attempt < 20; attempt += 1) {\n    const response = await fetch(traceUrl, {\n      headers: { authorization: \`Bearer \${requester.sessionToken}\` }\n    });\n    const body = await response.json();\n    if (response.ok) return body.trace;\n    if (response.status !== 409) throw new Error(body.error || \`Trace HTTP \${response.status}\`);\n    await sleep(10);\n  }\n  throw new Error('Timed out waiting for relay chain trace flush');\n}`
);

await replaceOnce(
  'benchmarks/cross-cloud-ab.js',
  `  const providerBodyBytes = (azure.providerBodyBytes || 0) + (gemini.providerBodyBytes || 0);\n  const providerLatencyMs = (azure.providerLatencyMs || 0) + (gemini.providerLatencyMs || 0);\n  const protocolOverheadBytes = chain.protocolOverheadBytes;\n  const truynPayloadBytes = chain.truynPayloadBytes;`,
  `  const providerBodyBytes = (azure.providerBodyBytes || 0) + (gemini.providerBodyBytes || 0);\n  const providerLatencyMs = (azure.providerLatencyMs || 0) + (gemini.providerLatencyMs || 0);\n  const relayTrace = await fetchRelayChainTrace(chain.chainId);\n  const relaySegments = relayTrace.segments || {};\n  const orchestrationBreakdown = {\n    edgeIngressEgressResidualMs: round(Math.max(0, endToEndLatencyMs - (relayTrace.relayTotalMs || 0)), 3),\n    relayIngressToStage1DispatchMs: relaySegments.publicRequestToStage1SocketDispatchMs,\n    stage1SocketNonProviderMs: round(Math.max(0, (relaySegments.stage1SocketDispatchToResultReceivedMs || 0) - (azure.providerLatencyMs || 0)), 3),\n    relayStageTransitionMs: relaySegments.stage1ResultToStage2SocketDispatchMs,\n    stage2SocketNonProviderMs: round(Math.max(0, (relaySegments.stage2SocketDispatchToResultReceivedMs || 0) - (gemini.providerLatencyMs || 0)), 3),\n    relayStage2ResultToResponseFlushedMs: relaySegments.stage2ResultToResponseFlushedMs\n  };\n  const protocolOverheadBytes = chain.protocolOverheadBytes;\n  const truynPayloadBytes = chain.truynPayloadBytes;`
);

await replaceOnce(
  'benchmarks/cross-cloud-ab.js',
  `    orchestrationOverheadMs: endToEndLatencyMs - providerLatencyMs,\n    azure,\n    gemini,`,
  `    orchestrationOverheadMs: endToEndLatencyMs - providerLatencyMs,\n    relayTrace,\n    orchestrationBreakdown,\n    azure,\n    gemini,`
);

await replaceOnce(
  'benchmarks/cross-cloud-ab.js',
  `    measuredApplicationBodyBytes: stats(samples, (sample) => sample.aggregate.measuredApplicationBodyBytes),\n    estimatedCostUsd: stats(samples, (sample) => sample.aggregate.estimatedCost?.totalUsd, 9)\n  };`,
  `    measuredApplicationBodyBytes: stats(samples, (sample) => sample.aggregate.measuredApplicationBodyBytes),\n    estimatedCostUsd: stats(samples, (sample) => sample.aggregate.estimatedCost?.totalUsd, 9),\n    relayTrace: {\n      relayTotalMs: stats(samples, (sample) => sample.relayTrace?.relayTotalMs),\n      publicRequestToStage1SocketDispatchMs: stats(samples, (sample) => sample.relayTrace?.segments?.publicRequestToStage1SocketDispatchMs),\n      stage1SocketDispatchToResultReceivedMs: stats(samples, (sample) => sample.relayTrace?.segments?.stage1SocketDispatchToResultReceivedMs),\n      stage1ResultToStage2SocketDispatchMs: stats(samples, (sample) => sample.relayTrace?.segments?.stage1ResultToStage2SocketDispatchMs),\n      stage2SocketDispatchToResultReceivedMs: stats(samples, (sample) => sample.relayTrace?.segments?.stage2SocketDispatchToResultReceivedMs),\n      stage2ResultToResponseFlushedMs: stats(samples, (sample) => sample.relayTrace?.segments?.stage2ResultToResponseFlushedMs)\n    },\n    orchestrationBreakdown: {\n      edgeIngressEgressResidualMs: stats(samples, (sample) => sample.orchestrationBreakdown?.edgeIngressEgressResidualMs),\n      relayIngressToStage1DispatchMs: stats(samples, (sample) => sample.orchestrationBreakdown?.relayIngressToStage1DispatchMs),\n      stage1SocketNonProviderMs: stats(samples, (sample) => sample.orchestrationBreakdown?.stage1SocketNonProviderMs),\n      relayStageTransitionMs: stats(samples, (sample) => sample.orchestrationBreakdown?.relayStageTransitionMs),\n      stage2SocketNonProviderMs: stats(samples, (sample) => sample.orchestrationBreakdown?.stage2SocketNonProviderMs),\n      relayStage2ResultToResponseFlushedMs: stats(samples, (sample) => sample.orchestrationBreakdown?.relayStage2ResultToResponseFlushedMs)\n    }\n  };`
);

await replaceOnce(
  'benchmarks/cross-cloud-ab.js',
  `const directCost = direct.estimatedCostUsd.mean;\nconst truynCost = truyn.estimatedCostUsd.mean;`,
  `const directCost = direct.estimatedCostUsd.mean;\nconst truynCost = truyn.estimatedCostUsd.mean;\nconst orchestrationComponentMeans = Object.entries(truyn.orchestrationBreakdown || {})\n  .map(([name, value]) => ({ name, meanMs: value?.mean }))\n  .filter((entry) => Number.isFinite(entry.meanMs))\n  .sort((a, b) => b.meanMs - a.meanMs);\nconst orchestrationBottleneck = orchestrationComponentMeans[0] || null;`
);

await replaceOnce(
  'benchmarks/cross-cloud-ab.js',
  `  optimizationGate,\n  aggregate: { direct, truyn },`,
  `  optimizationGate,\n  diagnostics: {\n    relayTraceAvailable: true,\n    traceSegments: [\n      'public request received -> stage1 socket dispatch',\n      'stage1 socket dispatch -> stage1 result received',\n      'stage1 result received -> stage2 socket dispatch',\n      'stage2 socket dispatch -> stage2 result received',\n      'stage2 result received -> HTTP response flushed'\n    ],\n    orchestrationBottleneck,\n    orchestrationComponentMeans\n  },\n  aggregate: { direct, truyn },`
);

await replaceOnce(
  'tests/mvp.test.js',
  `  assert.ok(result.protocolOverheadBytes <= 375, \`chain protocol overhead was \${result.protocolOverheadBytes} bytes\`);\n  assert.equal(relay.state.providerSockets.size, 2);`,
  `  assert.ok(result.protocolOverheadBytes <= 375, \`chain protocol overhead was \${result.protocolOverheadBytes} bytes\`);\n  assert.equal(relay.state.providerSockets.size, 2);\n\n  const traceResponse = await fetch(\`${relayUrl}/v1/fast/chains/\${encodeURIComponent(result.chainId)}/trace\`, {\n    headers: { authorization: \`Bearer \${requester.sessionToken}\` }\n  });\n  assert.equal(traceResponse.status, 200);\n  const traceBody = await traceResponse.json();\n  assert.equal(traceBody.ok, true);\n  assert.deepEqual(traceBody.trace.stageTransport, ['socket', 'socket']);\n  assert.ok(Number.isFinite(traceBody.trace.relayTotalMs));\n  for (const value of Object.values(traceBody.trace.segments)) assert.ok(Number.isFinite(value));`
);

await unlink('scripts/relay-trace-patch.mjs');
await unlink('.github/workflows/relay-trace-patch.yml');
