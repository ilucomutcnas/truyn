import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createIdentity } from '../core/identity/index.js';
import { TruynNode } from '../node/client.js';
import { ORIGIN_GUARD_HEADER } from '../runtime/origin-guard-contract.js';
import { PROVIDER_BACKCHANNEL_HEADER } from '../core/security/node-backchannel.js';

const SERVICE = fileURLToPath(new URL('../runtime/service.js', import.meta.url));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitReady(child, timeoutMs = 5_000) {
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`runtime_ready_timeout:${stderr}`)), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`runtime_exited_before_ready:${code}:${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const value = JSON.parse(line);
          if (value?.role === 'relay' && value?.ready === true) {
            clearTimeout(timer);
            resolve(value);
            return;
          }
        } catch {}
      }
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function post(url, envelope, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ envelope })
  });
  return { status: response.status, body: await response.json() };
}

test('combined runtime perimeter requires edge proof before provider M2M proof', async (t) => {
  const identity = createIdentity();
  const port = await freePort();
  const child = spawn(process.execPath, [SERVICE], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TRUYN_ROLE: 'relay',
      HOST: '127.0.0.1',
      PORT: String(port),
      TRUYN_ALLOWED_NODE_IDS: identity.nodeId,
      TRUYN_ORIGIN_GUARD: '1',
      TRUYN_ORIGIN_GUARD_TOKEN: 'edge-proof',
      TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT: '2099-01-01T00:00:00.000Z',
      TRUYN_PROTECTED_PROVIDER_NODE_IDS: identity.nodeId,
      TRUYN_PROVIDER_BACKCHANNEL_TOKEN: 'provider-proof',
      TRUYN_PUBLIC_NETWORK: '0'
    }
  });
  t.after(() => stop(child));

  const ready = await waitReady(child);
  assert.equal(ready.originGuard, true);
  assert.equal(ready.providerBackchannelGuard, true);

  const relayUrl = `http://127.0.0.1:${port}`;
  const node = new TruynNode({ relayUrl, identity });
  const registration = node.envelope('IDENTITY', {
    nodeId: identity.nodeId,
    algorithm: identity.algorithm,
    protocols: ['TRUYN/1'],
    name: null
  });

  const m2mOnly = await post(`${relayUrl}/v1/register`, registration, {
    [PROVIDER_BACKCHANNEL_HEADER]: 'provider-proof'
  });
  assert.equal(m2mOnly.status, 403);
  assert.equal(m2mOnly.body.error, 'origin_guard_denied');

  const edgeOnly = await post(`${relayUrl}/v1/register`, registration, {
    [ORIGIN_GUARD_HEADER]: 'edge-proof'
  });
  assert.equal(edgeOnly.status, 403);
  assert.equal(edgeOnly.body.error, 'provider_backchannel_denied');

  const both = await post(`${relayUrl}/v1/register`, registration, {
    [ORIGIN_GUARD_HEADER]: 'edge-proof',
    [PROVIDER_BACKCHANNEL_HEADER]: 'provider-proof'
  });
  assert.equal(both.status, 200);
  assert.equal(both.body.nodeId, identity.nodeId);
  assert.ok(both.body.sessionToken);

  const offer = node.envelope('OFFER', {
    capability: 'reasoning.general',
    metadata: { accessMode: 'owner-only' }
  });

  const stolenSession = await post(`${relayUrl}/v1/offers`, offer, {
    [ORIGIN_GUARD_HEADER]: 'edge-proof',
    authorization: `Bearer ${both.body.sessionToken}`
  });
  assert.equal(stolenSession.status, 403);
  assert.equal(stolenSession.body.error, 'provider_backchannel_denied');

  const authorizedOffer = await post(`${relayUrl}/v1/offers`, offer, {
    [ORIGIN_GUARD_HEADER]: 'edge-proof',
    [PROVIDER_BACKCHANNEL_HEADER]: 'provider-proof',
    authorization: `Bearer ${both.body.sessionToken}`
  });
  assert.equal(authorizedOffer.status, 200);
  assert.equal(authorizedOffer.body.ok, true);
});
