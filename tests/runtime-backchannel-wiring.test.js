import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createIdentity } from '../core/identity/index.js';
import { TruynNode } from '../node/client.js';
import { ProviderTruynNode } from '../runtime/provider-node.js';

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

test('runtime relay enforces protected provider proof before issuing a session', async (t) => {
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
      TRUYN_PROTECTED_PROVIDER_NODE_IDS: identity.nodeId,
      TRUYN_PROVIDER_BACKCHANNEL_TOKEN: 'runtime-m2m-secret',
      TRUYN_PUBLIC_NETWORK: '0'
    }
  });
  t.after(() => stop(child));

  const ready = await waitReady(child);
  assert.equal(ready.providerBackchannelGuard, true);
  assert.equal(ready.originGuard, false);

  const relayUrl = `http://127.0.0.1:${port}`;
  const plain = new TruynNode({ relayUrl, identity });
  await assert.rejects(() => plain.register(), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, 'provider_backchannel_denied');
    return true;
  });

  const protectedNode = new ProviderTruynNode({
    relayUrl,
    identity,
    backchannelToken: 'runtime-m2m-secret'
  });
  const registered = await protectedNode.register();
  assert.equal(registered.nodeId, identity.nodeId);
});
