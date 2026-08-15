import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../cli/index.js', import.meta.url));

function runCli(home, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TRUYN_HOME: home }
  });
}

function permissionBits(stats) {
  return stats.mode & 0o777;
}

async function assertPrivate(home, names) {
  for (const name of names) {
    const stats = await stat(path.join(home, name));
    assert.equal(permissionBits(stats), 0o600, `${name} must be 0600`);
  }
}

test('requester identity, provider identity and BYOK profile are created and repaired owner-only', async (t) => {
  if (process.platform === 'win32') return;
  const home = await mkdtemp(path.join(os.tmpdir(), 'truyn-byok-mode-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  assert.equal(runCli(home, ['init']).status, 0);
  const setupArgs = [
    'setup', '--provider', 'local', '--base-url', 'http://127.0.0.1:11434', '--model', 'local-model'
  ];
  const setup = runCli(home, setupArgs);
  assert.equal(setup.status, 0, setup.stderr);

  const names = ['identity.json', 'provider-identity.json', 'provider.json'];
  await assertPrivate(home, names);

  for (const name of names) await chmod(path.join(home, name), 0o644);
  const repair = runCli(home, setupArgs);
  assert.equal(repair.status, 0, repair.stderr);
  await assertPrivate(home, names);
});
