import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Class D V12 prepare-only gates healed sampling on strict bounded convergence', () => {
  const stdout = execFileSync('bash', ['scripts/class-d-100-v12-acceptance.sh'], {
    cwd: process.cwd(),
    env: { ...process.env, TRUYN_CLASS_D100_PREPARE_ONLY: '1', TRUYN_LOCAL_DEVELOPMENT: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(stdout, /TRUYN_CLASS_D100_PREPARED_HARNESS=PASS/);

  const v12 = readFileSync('scripts/class-d-100-v12-acceptance.sh', 'utf8');
  assert.match(v12, /stage=healed-convergence status=PASS/);
  assert.match(v12, /assert rate >= \.99/);
  assert.match(v12, /assert elapsed <= 120000/);
  assert.match(v12, /assert float\('\$healed_rate'\) >= \.99/);

  const canonical = readFileSync('benchmarks/scale/class-d.js', 'utf8');
  assert.match(canonical, /healedRoutingSuccess:\s*0\.99/);
  assert.match(canonical, /convergenceP95Ms:\s*120_000/);
});
