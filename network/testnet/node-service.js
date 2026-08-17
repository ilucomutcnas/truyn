import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdentity } from '../../core/identity/index.js';
import { nodeIdFromPublicKey } from '../../core/protocol/index.js';
import { TruynNetworkNode } from '../runtime.js';

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
  dhtRpcTimeoutMs = 5_000
} = {}) {
  if (!identityPath || !statePath) throw new Error('identityPath and statePath are required');
  if (!tlsKey || !tlsCert) throw new Error('tlsKey and tlsCert are required');
  if (!advertiseHost) throw new Error('advertiseHost is required');
  const identity = await loadOrCreateTestnetIdentity(identityPath);
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
    dhtRpcTimeoutMs
  });

  node.onEnvelope(async (message, context) => ({
    ok: true,
    echo: message.payload?.input ?? null,
    from: message.from,
    to: identity.nodeId,
    transport: context.transport
  }));

  const startedAt = Date.now();
  let requestCount = 0;
  const server = http.createServer(async (req, res) => {
    requestCount += 1;
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/status') {
        return json(res, 200, {
          ok: true,
          nodeId: identity.nodeId,
          started: node.started,
          uptimeMs: Date.now() - startedAt,
          quicPort: node.quic.port,
          peerCount: node.discovery.routing.size(),
          dhtRecordCount: node.recordStore.snapshot().length,
          peerRecordSequence: node.localPeerRecord?.sequence || 0,
          dhtRpcTimeoutMs: node.rpc.timeoutMs,
          requests: requestCount
        });
      }
      if (req.method === 'GET' && url.pathname === '/record') return json(res, 200, { record: node.localPeerRecord });
      if (req.method === 'POST' && url.pathname === '/bootstrap') {
        const body = await readJson(req);
        return json(res, 200, { results: node.bootstrap(body.records || []) });
      }
      if (req.method === 'POST' && url.pathname === '/ping') {
        const body = await readJson(req);
        return json(res, 200, { pong: await node.pingPeer(body.nodeId) });
      }
      if (req.method === 'POST' && url.pathname === '/need') {
        const body = await readJson(req);
        const result = await node.need(body.nodeId, 'testnet.echo', body.input ?? { nonce: randomUUID() }, {}, { allowRelayFallback: false });
        return json(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/replicate') {
        const body = await readJson(req);
        const record = node.createRecord(body.namespace, body.key, body.value, {
          sequence: int(body.sequence, 1),
          ttlMs: int(body.ttlMs, 300_000)
        });
        const result = await node.replicateRecord(record, {
          replicationFactor: int(body.replicationFactor, dhtReplicationFactor),
          minAcks: int(body.minAcks, dhtWriteQuorum)
        });
        await node.persistState();
        return json(res, 200, { record, result });
      }
      if (req.method === 'GET' && url.pathname === '/find') {
        const namespace = url.searchParams.get('namespace');
        const key = url.searchParams.get('key');
        if (!namespace || !key) return json(res, 400, { ok: false, error: 'namespace_and_key_required' });
        return json(res, 200, await node.findReplicatedValue(namespace, key, { fanout: int(url.searchParams.get('fanout'), dhtReplicationFactor + 4) }));
      }
      if (req.method === 'POST' && url.pathname === '/repair') {
        const body = await readJson(req);
        const result = await node.repairRecord(body.namespace, body.key, {
          replicationFactor: int(body.replicationFactor, dhtReplicationFactor),
          minAcks: int(body.minAcks, dhtWriteQuorum)
        });
        await node.persistState();
        return json(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/sweep') {
        const peers = node.discovery.sweep();
        const records = node.recordStore.sweep();
        await node.persistState();
        return json(res, 200, { peers, records });
      }
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
  await new Promise((resolvePromise, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolvePromise(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(controlPort, controlHost);
  });

  return {
    node,
    server,
    identity,
    controlAddress: server.address(),
    async close() {
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
      await node.close();
    }
  };
}

export async function runTestnetNodeFromEnv(env = process.env) {
  const dataDir = resolve(env.TRUYN_TESTNET_DATA_DIR || '.truyn-testnet');
  const [tlsKey, tlsCert] = await Promise.all([
    readFile(env.TRUYN_TLS_KEY_PATH, 'utf8'),
    readFile(env.TRUYN_TLS_CERT_PATH, 'utf8')
  ]);
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
    dhtRpcTimeoutMs: int(env.TRUYN_DHT_RPC_TIMEOUT_MS, 5_000, { min: 100, max: 120_000 })
  });
  const address = service.controlAddress;
  process.stdout.write(`${JSON.stringify({ ok: true, nodeId: service.identity.nodeId, quicPort: service.node.quic.port, controlPort: address.port })}\n`);
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
