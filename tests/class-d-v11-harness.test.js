import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('Class D V11 prepare-only preserves strict gate while hardening bootstrap and cleanup', () => {
  const stdout = execFileSync('bash', ['scripts/class-d-100-v11-acceptance.sh'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRUYN_CLASS_D100_PREPARE_ONLY: '1',
      TRUYN_LOCAL_DEVELOPMENT: '1',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.match(stdout, /TRUYN_CLASS_D100_PREPARED_HARNESS=PASS/);
});
