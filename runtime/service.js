import http from 'node:http';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAdapter } from '../adapters/providers/index.js';

const role = process.env.TRUYN_ROLE || 'provider';
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8080);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadRuntimeIdentity() {
  if (process.env.TRUYN_IDENTITY_JSON) return JSON.parse(process.env.TRUYN_IDENTITY_JSON);
  if (process.env.TRUYN_IDENTITY_B64) {
    return JSON.parse(Buffer.from(process.env.TRUYN_IDENTITY_B64, 'base64').toString('utf8'));
  }
  return createIdentity();
}

function writeJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  });
  res.end(data);
}

async function runRelay() {
  const relay = createRelay();
  const url = await relay.listen({ host, port });
  process.stdout.write(`${JSON.stringify({ ok: true, role: 'relay', url, fastPath: true })}\n`);

  const shutdown = async () => {
    await relay.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

async function runProvider() {
  const relayUrl = process.env.TRUYN_RELAY;
  const providerName = process.env.TRUYN_PROVIDER;
  if (!relayUrl) throw new Error('TRUYN_RELAY is required for provider role');
  if (!providerName) throw new Error('TRUYN_PROVIDER is required for provider role');

  const capabilities = (process.env.TRUYN_CAPABILITIES || 'research')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const identity = loadRuntimeIdentity();
  const node = new TruynNode({ relayUrl, identity });
  const adapter = createProviderAdapter(providerName, { capabilities });
  const fastPath = process.env.TRUYN_FAST_PATH !== '0';
  // The relay's default node freshness lease is 15s. Keep the long-poll heartbeat
  // comfortably inside that lease so an actively connected provider never ages out.
  const longPollMs = Number(process.env.TRUYN_LONG_POLL_MS || 10_000);
  const adapterHost = new TruynAdapterHost({
    node,
    adapter,
    fastPath,
    longPollMs,
    pollIntervalMs: Number(process.env.TRUYN_POLL_MS || 500)
  });

  let stopping = false;
  let ready = false;
  let lastError = null;
  let handled = 0;

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      return writeJson(res, 200, {
        ok: true,
        role: 'provider',
        ready,
        provider: providerName,
        nodeId: identity.nodeId,
        capabilities,
        relayUrl,
        fastPath,
        longPollMs,
        handled,
        lastError
      });
    }
    if (req.method === 'GET' && req.url === '/ready') {
      return writeJson(res, ready ? 200 : 503, { ok: ready, lastError, fastPath, longPollMs });
    }
    return writeJson(res, 404, { ok: false, error: 'not_found' });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    role: 'provider',
    provider: providerName,
    nodeId: identity.nodeId,
    capabilities,
    relayUrl,
    fastPath,
    longPollMs,
    health: `http://${host}:${port}/health`
  })}\n`);

  const loop = (async () => {
    while (!stopping) {
      try {
        const result = await adapterHost.runOnce();
        ready = true;
        lastError = null;
        handled += result.handled;
        // Compact providers keep a long-poll open, so there is no fixed sleep in the hot path.
        if (!fastPath && adapterHost.pollIntervalMs > 0) await sleep(adapterHost.pollIntervalMs);
      } catch (error) {
        ready = false;
        lastError = error.message;
        adapterHost.registered = false;
        adapterHost.offerIds = [];
        node.sessionToken = null;
        process.stderr.write(`TRUYN provider retry: ${error.message}\n`);
        await sleep(Number(process.env.TRUYN_RETRY_MS || 1000));
      }
    }
  })();

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await loop;
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (role === 'relay') await runRelay();
else if (role === 'provider') await runProvider();
else throw new Error(`Unsupported TRUYN_ROLE: ${role}`);
