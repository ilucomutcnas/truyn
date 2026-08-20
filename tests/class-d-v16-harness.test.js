import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Class D V16 prepare-only retries only idempotent churn RunCommand on Azure 429', () => {
  const stdout = execFileSync('bash', ['scripts/class-d-100-v16-acceptance.sh'], {
    cwd: process.cwd(),
    env: { ...process.env, TRUYN_CLASS_D100_PREPARE_ONLY: '1', TRUYN_LOCAL_DEVELOPMENT: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.match(stdout, /TRUYN_CLASS_D100_PREPARED_HARNESS=PASS/);

  const source = readFileSync('scripts/class-d-100-v16-acceptance.sh', 'utf8');
  assert.match(source, /BASE="scripts\/class-d-100-v13-acceptance\.sh"/);
  assert.match(source, /remote_churn_idempotent_arm_retry/);
  assert.match(source, /Too Many Requests/);
  assert.match(source, /attempt >= 4/);
  assert.match(source, /attempt \* 15/);
  assert.match(source, /Non-429 failures still fail closed immediately/);
  assert.match(source, /systemctl stop truyn-d100@/);
  assert.match(source, /systemctl start truyn-d100@/);
});

test('Class D V16 leaves canonical D-100 acceptance predicates unchanged', () => {
  const evaluator = readFileSync('benchmarks/scale/class-d.js', 'utf8');
  assert.match(evaluator, /baselineRoutingSuccess:\s*0\.99/);
  assert.match(evaluator, /healedRoutingSuccess:\s*0\.99/);
  assert.match(evaluator, /recoveryP95Ms:\s*120_000/);
  assert.match(evaluator, /convergenceP95Ms:\s*120_000/);
  assert.match(evaluator, /acknowledgedWriteLossMax:\s*0/);
  assert.match(evaluator, /invalidSignedStateAcceptedMax:\s*0/);
  assert.match(evaluator, /staleRevokedReceiptAcceptedMax:\s*0/);
});
