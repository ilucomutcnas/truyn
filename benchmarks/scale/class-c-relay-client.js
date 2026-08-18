import { readFile } from 'node:fs/promises';
import { createIdentity } from '../../core/identity/index.js';
import { TruynNetworkNode } from '../../network/runtime.js';
import { HttpPollingRelayClient } from '../../network/transport/http-relay.js';

const env = process.env;
const mode = env.TRUYN_CLASS_C_RELAY_MODE;
const relayUrl = env.TRUYN_RELAY_URL;
const relayToken = env.TRUYN_RELAY_TOKEN || '';
const tls = {
  key: await readFile(env.TRUYN_TLS_KEY_PATH, 'utf8'),
  cert: await readFile(env.TRUYN_TLS_CERT_PATH, 'utf8')
};

if (!relayUrl) throw new Error('TRUYN_RELAY_URL is required');

if (mode === 'target') {
  const identity = createIdentity();
  const node = new TruynNetworkNode({
    identity,
    host: '0.0.0.0',
    port: Number(env.TRUYN_QUIC_PORT || 4544),
    advertiseHost: env.TRUYN_ADVERTISE_HOST,
    tls,
    peerRecordAutoRenew: false
  });
  node.onEnvelope(async (message, context) => ({
    ok: true,
    transport: context.transport,
    authenticatedSender: context.peerNodeId,
    proof: message.payload?.input?.proof || null
  }));
  await node.start();
  const relay = new HttpPollingRelayClient({
    baseUrl: relayUrl,
    nodeId: identity.nodeId,
    token: relayToken,
    requestTimeoutMs: 5_000,
    relayTimeoutMs: 20_000,
    pollWaitMs: 1_000,
    resultPollMs: 25
  });
  void relay.startReceiver(node);
  process.stdout.write(`TRUYN_CLASS_C_RELAY_TARGET_READY nodeId=${identity.nodeId}\n`);
  const stop = async () => {
    await relay.stopReceiver();
    await node.close();
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await new Promise(() => {});
} else if (mode === 'source') {
  const targetNodeId = env.TRUYN_TARGET_NODE_ID;
  if (!targetNodeId) throw new Error('TRUYN_TARGET_NODE_ID is required');
  const identity = createIdentity();
  const relay = new HttpPollingRelayClient({
    baseUrl: relayUrl,
    nodeId: identity.nodeId,
    token: relayToken,
    requestTimeoutMs: 5_000,
    relayTimeoutMs: 20_000,
    pollWaitMs: 1_000,
    resultPollMs: 25
  });
  const node = new TruynNetworkNode({
    identity,
    host: '127.0.0.1',
    port: 0,
    advertiseHost: '127.0.0.1',
    tls,
    peerRecordAutoRenew: false,
    relayFallback: (peerNodeId, envelope) => relay.fallback(peerNodeId, envelope)
  });
  try {
    await node.start();
    const started = performance.now();
    const result = await node.need(targetNodeId, 'testnet.echo', {
      proof: env.TRUYN_PROOF_LABEL || 'class-c-relay-fallback'
    });
    const elapsedMs = Number((performance.now() - started).toFixed(3));
    process.stdout.write(`${JSON.stringify({
      ok: result.transport === 'relay-fallback' && result.result?.transport === 'relay',
      transport: result.transport,
      targetTransport: result.result?.transport || null,
      directFailure: result.directFailure || null,
      elapsedMs
    })}\n`);
  } finally {
    await node.close();
  }
} else {
  throw new Error('TRUYN_CLASS_C_RELAY_MODE must be target or source');
}
