import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Class D V13 prepare-only keeps strict gates and parallelizes failure-domain convergence probes', () => {
  const stdout = execFileSync('bash', ['scripts/class-d-100-v13-acceptance.sh'], {
    cwd: process.cwd(),
    env: { ...process.env, TRUYN_CLASS_D100_PREPARE_ONLY: '1', TRUYN_LOCAL_DEVELOPMENT: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.match(stdout, /TRUYN_CLASS_D100_PREPARED_HARNESS=PASS/);

  const source = readFileSync('scripts/class-d-100-v13-acceptance.sh', 'utf8');
  assert.match(source, /pids\+=\("\$!"\)/);
  assert.match(source, /for pid in "\$\{pids\[@\]\}"/);
  assert.match(source, /assert float\('\$healed_rate'\) >= \.99/);
  assert.match(source, /assert rate >= \.99/);
  assert.match(source, /assert elapsed <= 120000/);
});
