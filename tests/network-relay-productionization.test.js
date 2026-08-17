import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { TruynNetworkNode } from '../network/runtime.js';
import { HttpPollingRelayClient, acceptRelayedEnvelope } from '../network/transport/http-relay.js';
import { createTestnetRelayService } from '../network/testnet/relay-service.js';

async function generateTls() {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-class-c-relay-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath,
    '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { dir, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function relayUrl(service) {
  return `http://127.0.0.1:${service.address.port}`;
}

function signedNeed(identity, to, value) {
  return createEnvelope({
    type: 'NEED',
    from: identity.nodeId,
    to,
    payload: { capability: { name: 'echo' }, input: { value }, policy: {} },
    privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem
  });
}

test('Class C: direct-impossible NEED falls back through signed relay and survives relay down/up', { timeout: 30_000 }, async () => {
  const tls = await generateTls();
  const token = 'class-c-ephemeral-test-token';
  const relay = await createTestnetRelayService({ host: '127.0.0.1', token });
  const aIdentity = createIdentity();
  const bIdentity = createIdentity();
  const aRelay = new HttpPollingRelayClient({
    baseUrl: relayUrl(relay), nodeId: aIdentity.nodeId, token, requestTimeoutMs: 2_000, relayTimeoutMs: 5_000, pollWaitMs: 200, resultPollMs: 10
  });
  const bRelay = new HttpPollingRelayClient({
    baseUrl: relayUrl(relay), nodeId: bIdentity.nodeId, token, requestTimeoutMs: 2_000, relayTimeoutMs: 5_000, pollWaitMs: 200, resultPollMs: 10
  });
  const a = new TruynNetworkNode({
    identity: aIdentity, host: '127.0.0.1', tls,
    relayFallback: (peerNodeId, envelope) => aRelay.fallback(peerNodeId, envelope)
  });
  const b = new TruynNetworkNode({ identity: bIdentity, host: '127.0.0.1', tls });
  b.onEnvelope(async (message, context) => ({
    ok: true,
    transport: context.transport,
    authenticatedSender: context.peerNodeId,
    value: message.payload.input.value
  }));

  try {
    await Promise.all([a.start(), b.start()]);
    void bRelay.startReceiver(b);

    // A deliberately has no peer record for B. Direct routing is therefore impossible,
    // but the original signed envelope can still be delivered by the relay path.
    const first = await a.need(b.identity.nodeId, 'echo', { value: 1 });
    assert.equal(first.transport, 'relay-fallback');
    assert.equal(first.directFailure, 'peer_not_discovered');
    assert.deepEqual(first.result, {
      ok: true,
      transport: 'relay',
      authenticatedSender: a.identity.nodeId,
      value: 1
    });

    relay.setDisabled(true);
    await assert.rejects(
      a.need(b.identity.nodeId, 'echo', { value: 2 }),
      (error) => error?.code === 'TRUYN_RELAY_UNAVAILABLE'
    );

    relay.setDisabled(false);
    const recovered = await a.need(b.identity.nodeId, 'echo', { value: 3 });
    assert.equal(recovered.transport, 'relay-fallback');
    assert.equal(recovered.result.transport, 'relay');
    assert.equal(recovered.result.value, 3);

    await assert.rejects(
      a.need(b.identity.nodeId, 'echo', { value: 4 }, {}, { allowRelayFallback: false }),
      /peer_not_discovered/
    );
  } finally {
    await bRelay.stopReceiver();
    await Promise.allSettled([a.close(), b.close(), relay.close()]);
    await rm(tls.dir, { recursive: true, force: true });
  }
});

test('Class C: relay recipient independently rejects tampering and wrong-recipient envelopes', async () => {
  const aIdentity = createIdentity();
  const bIdentity = createIdentity();
  const fakeNode = {
    started: true,
    identity: bIdentity,
    workInbox: null,
    envelopeHandler: async () => ({ ok: true })
  };

  const envelope = signedNeed(aIdentity, bIdentity.nodeId, 1);
  const accepted = await acceptRelayedEnvelope(fakeNode, envelope, { relayMessageId: 'test-message' });
  assert.deepEqual(accepted, { ok: true });

  const tampered = structuredClone(envelope);
  tampered.payload.input.value = 999;
  await assert.rejects(
    acceptRelayedEnvelope(fakeNode, tampered),
    (error) => error?.code === 'TRUYN_RELAY_INVALID_ENVELOPE:invalid_signature'
  );

  const wrongRecipient = structuredClone(envelope);
  wrongRecipient.to = aIdentity.nodeId;
  await assert.rejects(
    acceptRelayedEnvelope(fakeNode, wrongRecipient),
    (error) => error?.code === 'TRUYN_RELAY_INVALID_ENVELOPE:invalid_signature'
  );

  const correctlySignedWrongRecipient = signedNeed(aIdentity, aIdentity.nodeId, 2);
  await assert.rejects(
    acceptRelayedEnvelope(fakeNode, correctlySignedWrongRecipient),
    (error) => error?.code === 'TRUYN_RELAY_RECIPIENT_MISMATCH'
  );
});
