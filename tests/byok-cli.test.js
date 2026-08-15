import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdentity } from '../core/identity/index.js';
import {
  assertVerifiedByokProfile,
  createByokProfile,
  isLoopbackRelay,
  markByokVerified,
  providerAdapterOptions,
  validateByokEnvironment
} from '../cli/byok-profile.js';

const CLI = fileURLToPath(new URL('../cli/index.js', import.meta.url));

function runCli(home, args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TRUYN_HOME: home, ...extraEnv }
  });
}

test('BYOK profile stores credential reference but never credential value', () => {
  const requester = createIdentity();
  const provider = createIdentity();
  const profile = createByokProfile({
    provider: 'openai',
    model: 'test-model',
    credentialEnv: 'TEST_BYOK_SECRET',
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId
  });
  const secretValue = 'DO_NOT_PERSIST_THIS_SECRET_VALUE';
  const serialized = JSON.stringify(profile);

  assert.equal(profile.credentialEnv, 'TEST_BYOK_SECRET');
  assert.equal(serialized.includes(secretValue), false);
  assert.deepEqual(providerAdapterOptions(profile, { TEST_BYOK_SECRET: secretValue }), {
    capabilities: ['reasoning.general'],
    apiKey: secretValue,
    model: 'test-model',
    baseUrl: undefined
  });
  assert.equal(validateByokEnvironment(profile, { TEST_BYOK_SECRET: secretValue }).ok, true);
});

test('BYOK requester and provider require separate cryptographic identities', () => {
  const identity = createIdentity();
  assert.throws(() => createByokProfile({
    provider: 'openai',
    model: 'test-model',
    requesterNodeId: identity.nodeId,
    providerNodeId: identity.nodeId
  }), /separate from requester identity/);
});

test('remote workload requires verified private BYOK profile while loopback is development-safe', () => {
  const requester = createIdentity();
  const provider = createIdentity();
  const profile = createByokProfile({
    provider: 'openai',
    model: 'test-model',
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId
  });

  assert.throws(() => assertVerifiedByokProfile(profile, requester.nodeId), /not verified/);
  assert.equal(assertVerifiedByokProfile(markByokVerified(profile), requester.nodeId), true);
  assert.equal(isLoopbackRelay('http://127.0.0.1:8787'), true);
  assert.equal(isLoopbackRelay('http://localhost:8787'), true);
  assert.equal(isLoopbackRelay('https://relay.example.test'), false);
});

test('CLI setup persists no credential value and remote need fails before network until verified', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'truyn-byok-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const secretValue = 'LOCAL_SECRET_VALUE_NOT_FOR_DISK';

  const init = runCli(home, ['init']);
  assert.equal(init.status, 0, init.stderr);

  const setup = runCli(home, [
    'setup', '--provider', 'openai', '--model', 'test-model',
    '--credential-env', 'TEST_BYOK_SECRET'
  ], { TEST_BYOK_SECRET: secretValue });
  assert.equal(setup.status, 0, setup.stderr);

  const requester = JSON.parse(await readFile(path.join(home, 'identity.json'), 'utf8'));
  const providerIdentity = JSON.parse(await readFile(path.join(home, 'provider-identity.json'), 'utf8'));
  const profileText = await readFile(path.join(home, 'provider.json'), 'utf8');
  const profile = JSON.parse(profileText);
  assert.notEqual(providerIdentity.nodeId, requester.nodeId);
  assert.equal(profile.requesterNodeId, requester.nodeId);
  assert.equal(profile.providerNodeId, providerIdentity.nodeId);
  assert.equal(profile.verifiedAt, null);
  assert.equal(profileText.includes(secretValue), false);

  const status = runCli(home, ['setup-status'], { TEST_BYOK_SECRET: secretValue });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout.includes(secretValue), false);
  assert.equal(JSON.parse(status.stdout).credentialsStoredByTruyn, false);

  const remoteNeed = runCli(home, [
    'need', 'reasoning.general', 'hello', '--relay', 'https://relay.example.test'
  ], { TEST_BYOK_SECRET: secretValue });
  assert.equal(remoteNeed.status, 1);
  assert.match(remoteNeed.stderr, /BYOK provider is not verified/);
  assert.doesNotMatch(remoteNeed.stderr, /fetch|ENOTFOUND|network/i);
});

test('CLI setup --test fails closed when credential environment is missing and does not mark verified', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'truyn-byok-missing-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(runCli(home, ['init']).status, 0);

  const tested = runCli(home, [
    'setup', '--provider', 'openai', '--model', 'test-model',
    '--credential-env', 'ABSENT_BYOK_SECRET', '--test'
  ], { ABSENT_BYOK_SECRET: '' });
  assert.equal(tested.status, 1);
  assert.match(tested.stderr, /environment is incomplete/);

  const profile = JSON.parse(await readFile(path.join(home, 'provider.json'), 'utf8'));
  assert.equal(profile.verifiedAt, null);
});
