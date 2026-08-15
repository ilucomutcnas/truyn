import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

test('CLI persists custom MCP endpoint/tool and credential reference without credential value', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'truyn-mcp-byok-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(runCli(home, ['init']).status, 0);

  const secret = 'MCP_SECRET_NOT_FOR_PROFILE';
  const setup = runCli(home, [
    'setup',
    '--provider', 'custom-mcp',
    '--endpoint', 'https://mcp.example.test/mcp',
    '--tool', 'research',
    '--credential-env', 'MY_MCP_TOKEN',
    '--capability', 'reasoning.general'
  ], { MY_MCP_TOKEN: secret });
  assert.equal(setup.status, 0, setup.stderr);

  const profileText = await readFile(path.join(home, 'provider.json'), 'utf8');
  const profile = JSON.parse(profileText);
  assert.equal(profile.provider, 'custom-mcp');
  assert.equal(profile.adapterProvider, 'mcp-http-tool');
  assert.equal(profile.endpoint, 'https://mcp.example.test/mcp');
  assert.equal(profile.tool, 'research');
  assert.equal(profile.authMode, 'bearer');
  assert.equal(profile.credentialEnv, 'MY_MCP_TOKEN');
  assert.equal(profileText.includes(secret), false);
  assert.equal(profile.verifiedAt, null);

  const status = runCli(home, ['setup-status'], { MY_MCP_TOKEN: secret });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout.includes(secret), false);
});

test('CLI custom MCP setup rejects a missing tool before verification/network activity', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'truyn-mcp-missing-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(runCli(home, ['init']).status, 0);
  const setup = runCli(home, [
    'setup',
    '--provider', 'custom-mcp',
    '--endpoint', 'https://mcp.example.test/mcp'
  ]);
  assert.equal(setup.status, 1);
  assert.match(setup.stderr, /--tool/);
});
