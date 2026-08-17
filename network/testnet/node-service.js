import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdentity } from '../../core/identity/index.js';
import { nodeIdFromPublicKey } from '../../core/protocol/index.js';
import { TruynNetworkNode } from '../runtime.js';
import { HttpPollingRelayClient } from '../transport/http-relay.js';
import { TESTNET_OPERATOR_PREFIX } from './operator.js';

const MAX_BODY_BYTES = 1024 * 1024;

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temp, 'w', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path);
}

export async function loadOrCreateTestnetIdentity(path) {
  try {
    const identity = JSON.parse(await readFile(path, 'utf8'));
    if (!identity?.publicKeyPem || !identity?.privateKeyPem || nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) {
      throw new Error('invalid_testnet_identity');
    }
    return identity;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const identity = createIdentity();
    await atomicJson(path, identity);
    return identity;
  }
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
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {
    const error = new Error('invalid_json');
    error.statusCode = 400;
    throw error;
  }
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function int(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`invalid_integer:${value}`);
  return parsed;
}

function csv(value = '') {
  return [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
}

function flag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function decodePem(value, label) {
  if (!value) return null;
  try { return Buffer.from(value, 'base64').toString('utf8'); }
  catch { throw new Error(`invalid_${label}_base64`); }
}

export async function createTestnetNodeService({
  identityPath,
  statePath,
  tlsKey,
  tlsCert,
  quicHost = '0.0.0.0',
  quicPort = 4433,
  advertiseHost,
  controlHost = '127.0.0.1',
  controlPort = 8788,
  peerRecordTtlMs = 300_000,
  maxInFlight = 64,
  maxQueued = 256,
  dhtReplicationFactor = 3,
  dhtWriteQuorum = 2,
  dhtRpcTimeoutMs = 5_000,
  operatorNodeIds = [],
  faultControlEnabled = false,
  relayUrl = null,
  relayToken = '',
  relayTimeoutMs = 45_000,
  relayPollWaitMs = 10_000
} = {}) {
  if (!identityPath || !statePath) throw new Error('identityPath and statePath are required');
  if (!tlsKey || !tlsCert) throw new Error('tlsKey and tlsCert are required');
  if (!advertiseHost) throw new Error('advertiseHost is required');
  const identity = await loadOrCreateTestnetIdentity(identityPath);
  const operators = new Set(operatorNodeIds);
  const relay = relayUrl ? new HttpPollingRelayClient({
    baseUrl: relayUrl,
    nodeId: identity.nodeId,
    token: relayToken,
    relayTimeoutMs,
    pollWaitMs: relayPollWaitMs
  }) : null;
  const node = new TruynNetworkNode({
    identity,
    host: quicHost,
    port: quicPort,
    advertiseHost,
    tls: { key: tlsKey, cert: tlsCert },
    statePath,
    peerRecordTtlMs,
    capabilities: ['testnet.echo', 'testnet.dht'],
    maxInFlight,
    maxQueued,
    dhtReplicationFactor,
    dhtWriteQuorum,
    dhtRpcTimeoutMs,
    relayFallback: relay ? (peerNodeId, envelope) => relay.fallback(peerNodeId, envelope) : null
  });

  const startedAt = Date.now();
  let requestCount = 0;
  const statusSnapshot = () => ({
    ok: true,
    nodeId: identity.nodeId,
    started: node.started,
    uptimeMs: Date.now() - startedAt,
    quicPort: node.quic.port,
    peerCount: node.discovery.routing.size(),
    dhtRecordCount: node.recordStore.snapshot().length,
    peerRecordSequence: node.localPeerRecord?.sequence || 0,
    dhtRpcTimeoutMs: node.rpc.timeoutMs,
    operatorCount: operators.size,
    faultControlEnabled,
    relayEnabled: Boolean(relay),
    requests: requestCount
  });

  const requireFaultControl = () => {
    if (faultControlEnabled) return;
    const error = new Error('testnet_fault_control_disabled');
    error.code = 'TRUYN_TESTNET_FAULT_CONTROL_DISABLED';
    error.statusCode = 404;
    throw error;
  };

  const faultStatus = () => {
    requireFaultControl();
    return { enabled: true, ...node.faultSnapshot() };
  };
  const partition = (body = {}) => {
    requireFaultControl();
    const nodeIds = body.nodeIds ?? body.nodeId;
    if (nodeIds == null) throw new Error('fault_partition_nodeIds_required');
    return { enabled: true, ...node.partitionPeers(nodeIds) };
  };
  const heal = (body = {}) => {
    requireFaultControl();
    const nodeIds = Object.hasOwn(body, 'nodeIds') ? body.nodeIds : (Object.hasOwn(body, 'nodeId') ? body.nodeId : null);
    return { enabled: true, ...node.healPeers(nodeIds) };
  };
  const relayFault = (body = {}) => {
    requireFaultControl();
    return { enabled: true, ...node.setRelayFault({ mode: body.mode, delayMs: int(body.delayMs, 0, { min: 0, max: 120_000 }) }) };
  };
  const storeFaultRecord = async (body = {}) => {
    requireFaultControl();
    if (!body.nodeId || !body.record || typeof body.record !== 'object') throw new Error('fault_store_nodeId_and_record_required');
    return node.storeAt(body.nodeId, body.record);
  };

  const replicate = async (body = {}) => {
    const record = node.createRecord(body.namespace, body.key, body.value, {
      sequence: int(body.sequence, 1),
      ttlMs: int(body.ttlMs, 300_000)
    });
    const result = await node.replicateRecord(record, {
      replicationFactor: int(body.replicationFactor, dhtReplicationFactor),
      minAcks: int(body.minAcks, dhtWriteQuorum)
    });
    await node.persistState();
    return { record, result };
  };

  const find = async (body = {}) => {
    if (!body.namespace || !body.key) throw new Error('namespace_and_key_required');
    return node.findReplicatedValue(body.namespace, body.key, {
      fanout: int(body.fanout, dhtReplicationFactor + 4)
    });
  };

  const repair = async (body = {}) => {
    if (!body.namespace || !body.key) throw new Error('namespace_and_key_required');
    const result = await node.repairRecord(body.namespace, body.key, {
      replicationFactor: int(body.replicationFactor, dhtReplicationFactor),
      minAcks: int(body.minAcks, dhtWriteQuorum)
    });
    await node.persistState();
    return result;
  };

  const sweep = async () => {
    const peers = node.discovery.sweep();
    const records = node.recordStore.sweep();
    await node.persistState();
    return { peers, records };
  };

  node.onEnvelope(async (message, context) => {
    const capability = message.payload?.capability?.name;
    const input = message.payload?.input ?? {};
    if (!String(capability || '').startsWith(TESTNET_OPERATOR_PREFIX)) {
      return {
        ok: true,
        echo: input,
        from: message.from,
        to: identity.nodeId,
        transport: context.transport
      };
    }

    if (!operators.has(message.from)) {
      const error = new Error('testnet_operator_denied');
      error.code = 'TRUYN_TESTNET_OPERATOR_DENIED';
      throw error;
    }

    const command = capability.slice(TESTNET_OPERATOR_PREFIX.length);
    if (command === 'status') return statusSnapshot();
    if (command === 'bootstrap') return { results: node.bootstrap(input.records || []) };
    if (command === 'need') {
      if (!input.nodeId) throw new Error('operator_need_nodeId_required');
      return node.need(input.nodeId, 'testnet.echo', input.input ?? { nonce: randomUUID() }, {}, { allowRelayFallback: Boolean(relay) });
    }
    if (command === 'replicate') return replicate(input);
    if (command === 'find') return find(input);
    if (command === 'repair') return repair(input);
    if (command === 'sweep') return sweep();
    if (command === 'faults') return faultStatus();
    if (command === 'partition') return partition(input);
    if (command === 'heal') return heal(input);
    if (command === 'relay') return relayFault(input);
    if (command === 'store') return storeFaultRecord(input);
    throw new Error('unsupported_testnet_operator_command');
  });

  const server = http.createServer(async (req, res) => {
    requestCount += 1;
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, statusSnapshot());
      if (req.method === 'GET' && url.pathname === '/record') return json(res, 200, { record: node.localPeerRecord });
      if (req.method === 'POST' && url.pathname === '/bootstrap') return json(res, 200, { results: node.bootstrap((await readJson(req)).records || []) });
      if (req.method === 'POST' && url.pathname === '/ping') return json(res, 200, { pong: await node.pingPeer((await readJson(req)).nodeId) });
      if (req.method === 'POST' && url.pathname === '/need') {
        const body = await readJson(req);
        const allowRelayFallback = Object.hasOwn(body, 'allowRelayFallback') ? Boolean(body.allowRelayFallback) : Boolean(relay);
        return json(res, 200, await node.need(body.nodeId, 'testnet.echo', body.input ?? { nonce: randomUUID() }, {}, { allowRelayFallback }));
      }
      if (req.method === 'POST' && url.pathname === '/replicate') return json(res, 200, await replicate(await readJson(req)));
      if (req.method === 'GET' && url.pathname === '/find') return json(res, 200, await find({ namespace: url.searchParams.get('namespace'), key: url.searchParams.get('key'), fanout: url.searchParams.get('fanout') }));
      if (req.method === 'POST' && url.pathname === '/repair') return json(res, 200, await repair(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/sweep') return json(res, 200, await sweep());
      if (req.method === 'GET' && url.pathname === '/faults') return json(res, 200, faultStatus());
      if (req.method === 'POST' && url.pathname === '/faults/partition') return json(res, 200, partition(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/faults/heal') return json(res, 200, heal(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/faults/relay') return json(res, 200, relayFault(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/faults/store') return json(res, 200, await storeFaultRecord(await readJson(req)));
      return json(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return json(res, error?.statusCode || 500, {
        ok: false,
        error: error?.code || error?.message || 'testnet_control_error',
        acknowledgements: error?.acknowledgements,
        required: error?.required
      });
    }
  });

  await node.start();
  if (relay) void relay.startReceiver(node);
  await new Promise((resolvePromise, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolvePromise(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(controlPort, controlHost);
  });

  return {
    node,
    relay,
    server,
    identity,
    controlAddress: server.address(),
    async close() {
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
      if (relay) await relay.stopReceiver();
      await node.close();
    }
  };
}

export async function runTestnetNodeFromEnv(env = process.env) {
  const dataDir = resolve(env.TRUYN_TESTNET_DATA_DIR || '.truyn-testnet');
  const tlsKey = decodePem(env.TRUYN_TLS_KEY_B64, 'tls_key') || await readFile(env.TRUYN_TLS_KEY_PATH, 'utf8');
  const tlsCert = decodePem(env.TRUYN_TLS_CERT_B64, 'tls_cert') || await readFile(env.TRUYN_TLS_CERT_PATH, 'utf8');
  const service = await createTestnetNodeService({
    identityPath: resolve(env.TRUYN_IDENTITY_PATH || `${dataDir}/identity.json`),
    statePath: resolve(env.TRUYN_NETWORK_STATE_PATH || `${dataDir}/network-state.json`),
    tlsKey,
    tlsCert,
    quicHost: env.TRUYN_QUIC_HOST || '0.0.0.0',
    quicPort: int(env.TRUYN_QUIC_PORT, 4433, { max: 65535 }),
    advertiseHost: env.TRUYN_ADVERTISE_HOST,
    controlHost: env.TRUYN_CONTROL_HOST || '127.0.0.1',
    controlPort: int(env.TRUYN_CONTROL_PORT, 8788, { max: 65535 }),
    peerRecordTtlMs: int(env.TRUYN_PEER_RECORD_TTL_MS, 300_000),
    maxInFlight: int(env.TRUYN_MAX_IN_FLIGHT, 64),
    maxQueued: int(env.TRUYN_MAX_QUEUED, 256, { min: 0 }),
    dhtReplicationFactor: int(env.TRUYN_DHT_REPLICATION_FACTOR, 3),
    dhtWriteQuorum: int(env.TRUYN_DHT_WRITE_QUORUM, 2),
    dhtRpcTimeoutMs: int(env.TRUYN_DHT_RPC_TIMEOUT_MS, 5_000, { min: 100, max: 120_000 }),
    operatorNodeIds: csv(env.TRUYN_TESTNET_OPERATOR_NODE_IDS),
    faultControlEnabled: flag(env.TRUYN_TESTNET_FAULT_CONTROL),
    relayUrl: env.TRUYN_RELAY_URL || null,
    relayToken: env.TRUYN_RELAY_TOKEN || '',
    relayTimeoutMs: int(env.TRUYN_RELAY_TIMEOUT_MS, 45_000, { min: 100, max: 120_000 }),
    relayPollWaitMs: int(env.TRUYN_RELAY_POLL_WAIT_MS, 10_000, { min: 100, max: 20_000 })
  });
  const address = service.controlAddress;
  process.stdout.write(`${JSON.stringify({
    ok: true,
    nodeId: service.identity.nodeId,
    quicPort: service.node.quic.port,
    controlPort: address.port,
    peerRecord: service.node.localPeerRecord
  })}\n`);
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
if (executed) await runTestnetNodeFromEnv();