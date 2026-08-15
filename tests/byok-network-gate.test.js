import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../cli/index.js', import.meta.url));

function runCli(home, args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TRUYN_HOME: home, ...extraEnv }
  });
}

async function unverifiedHome(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'truyn-network-gate-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(runCli(home, ['init']).status, 0);
  const setup = runCli(home, ['setup', '--provider', 'local', '--base-url', 'http://127.0.0.1:11434', '--model', 'local-model']);
  assert.equal(setup.status, 0, setup.stderr);
  const profile = JSON.parse(await readFile(path.join(home, 'provider.json'), 'utf8'));
  assert.equal(profile.verifiedAt, null);
  return home;
}

function expectByokGate(result) {
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BYOK provider is not verified/);
  assert.doesNotMatch(result.stderr, /ENOTFOUND|ECONNREFUSED|fetch failed|network/i);
}

test('all remote CLI network commands require verified BYOK before any network activity', async (t) => {
  const home = await unverifiedHome(t);
  const relay = 'https://relay.example.test';

  expectByokGate(runCli(home, ['register', '--relay', relay]));
  expectByokGate(runCli(home, ['find', 'reasoning.general', '--relay', relay]));
  expectByokGate(runCli(home, ['offer', 'reasoning.general', '--relay', relay]));
  expectByokGate(runCli(home, ['need', 'reasoning.general', 'hello', '--relay', relay]));
  expectByokGate(runCli(home, ['result', 'request-1', 'output', '--relay', relay]));

  await writeFile(path.join(home, 'session.json'), `${JSON.stringify({
    relayUrl: relay,
    nodeId: 'unused',
    sessionToken: 'unused'
  })}\n`, { mode: 0o600 });
  expectByokGate(runCli(home, ['poll', '--relay', relay]));
});

test('loopback CLI network mode remains available without a verified BYOK profile', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'truyn-loopback-gate-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(runCli(home, ['init']).status, 0);

  const result = runCli(home, ['register', '--relay', 'http://127.0.0.1:1']);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /BYOK provider/);
  assert.match(result.stderr, /TRUYN error:/);
});
