import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const wrapper = readFileSync(new URL('../scripts/class-d-100-final-acceptance.sh', import.meta.url), 'utf8');
const helperUrl = new URL('../scripts/lib/class-d-run-command.sh', import.meta.url);
const helperPath = fileURLToPath(helperUrl);
const helper = readFileSync(helperUrl, 'utf8');
const campaign = readFileSync(new URL('../benchmarks/scale/class-d-azure-100-campaign.sh', import.meta.url), 'utf8');

function runScenario(scenario, extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-d100-runcommand-'));
  const counter = join(dir, 'counter');
  const fakeAz = join(dir, 'az');
  writeFileSync(fakeAz, `#!/usr/bin/env bash
set -euo pipefail
count=0
[[ -f "$TRUYN_TEST_COUNTER" ]] && count="$(cat "$TRUYN_TEST_COUNTER")"
count=$((count+1))
printf '%s' "$count" >"$TRUYN_TEST_COUNTER"
query_ok=0
previous=''
for arg in "$@"; do
  if [[ "$previous" == '--query' && "$arg" == 'value[].message' ]]; then query_ok=1; fi
  previous="$arg"
done
if (( query_ok != 1 )); then
  echo 'RunCommand must query every value[].message component' >&2
  exit 98
fi
case "$TRUYN_TEST_SCENARIO" in
  429-then-success)
    if (( count < 3 )); then echo "ERROR: Operation returned an invalid status 'Too Many Requests'" >&2; exit 29; fi
    echo 'TRUYN_GUEST_EXECUTION_ADMITTED=1'
    echo 'RESULT=ok'
    ;;
  busy-then-success)
    if (( count < 3 )); then echo 'managed VM RunCommand extension execution is in progress. Please wait for completion before invoking a run command' >&2; exit 31; fi
    echo 'TRUYN_GUEST_EXECUTION_ADMITTED=1'
    echo 'RESULT=ok'
    ;;
  guest-nonzero)
    echo 'TRUYN_GUEST_EXECUTION_ADMITTED=1'
    echo 'guest failed after mutation' >&2
    exit 17
    ;;
  429-always)
    echo 'ERROR: HTTP 429 Too Many Requests' >&2
    exit 29
    ;;
  *)
    echo "unknown scenario: $TRUYN_TEST_SCENARIO" >&2
    exit 99
    ;;
esac
`);
  chmodSync(fakeAz, 0o755);

  const script = `source ${JSON.stringify(helperPath)}; truyn_class_d_remote rg vm 'echo mutation'`;
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      TRUYN_TEST_COUNTER: counter,
      TRUYN_TEST_SCENARIO: scenario,
      TRUYN_AZ_RUN_COMMAND_BUSY_RETRIES: '4',
      TRUYN_AZ_RUN_COMMAND_BUSY_SLEEP_SECONDS: '0',
      TRUYN_AZ_RUN_COMMAND_429_RETRIES: '4',
      TRUYN_AZ_RUN_COMMAND_429_BASE_DELAY_SECONDS: '0',
      TRUYN_AZ_RUN_COMMAND_429_MAX_DELAY_SECONDS: '0',
      ...extraEnv,
    },
  });
  const attempts = Number(readFileSync(counter, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  return { ...result, attempts };
}

test('D-100 accepted harness delegates Azure RunCommand to admission-aware helper', () => {
  assert.match(wrapper, /truyn_class_d_remote "\$RG" "\$vm" "\$script"/);
  assert.match(wrapper, /source "\$TMP\/run-command-helper\.sh"/);
  assert.match(helper, /command az vm run-command invoke/);
  assert.match(helper, /TRUYN_GUEST_EXECUTION_ADMITTED=1/);
  assert.match(helper, /TRUYN_AZ_RUN_COMMAND_BUSY_WAIT/);
  assert.match(helper, /TRUYN_AZ_RUN_COMMAND_429_BACKOFF/);
});

test('RunCommand helper preserves all Azure value message components', () => {
  assert.match(helper, /--query 'value\[\]\.message'/);
  assert.doesNotMatch(helper, /--query 'value\[0\]\.message'/);
});

test('explicit Azure 429 before guest admission gets bounded retry and then succeeds', () => {
  const result = runScenario('429-then-success');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 3);
  assert.match(result.stderr, /TRUYN_AZ_RUN_COMMAND_429_BACKOFF[\s\S]*attempt=1[\s\S]*attempt=2/);
  assert.match(result.stdout, /RESULT=ok/);
});

test('RunCommand busy before guest admission is retried', () => {
  const result = runScenario('busy-then-success');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 3);
  assert.match(result.stderr, /TRUYN_AZ_RUN_COMMAND_BUSY_WAIT[\s\S]*attempt=1[\s\S]*attempt=2/);
});

test('guest non-zero after admission fails immediately without replay', () => {
  const result = runScenario('guest-nonzero');
  assert.notEqual(result.status, 0);
  assert.equal(result.attempts, 1);
  assert.doesNotMatch(result.stderr, /TRUYN_AZ_RUN_COMMAND_(?:429_BACKOFF|BUSY_WAIT)/);
});

test('429 retry exhaustion fails closed', () => {
  const result = runScenario('429-always', { TRUYN_AZ_RUN_COMMAND_429_RETRIES: '3' });
  assert.notEqual(result.status, 0);
  assert.equal(result.attempts, 3);
  assert.match(result.stderr, /HTTP 429 Too Many Requests/);
});

test('partition and churn recovery polling stay guest-local inside one RunCommand each', () => {
  assert.match(campaign, /for attempt in range\(1,31\):[\s\S]*PARTITION_HEAL_ATTEMPTS/);
  assert.match(campaign, /for attempt in range\(1,46\):[\s\S]*CHURN_RECOVERY_ATTEMPTS/);
  assert.doesNotMatch(campaign, /for n in \$\(seq 1 30\); do[\s\S]{0,400}remote/);
  assert.doesNotMatch(campaign, /for n in \$\(seq 1 45\); do[\s\S]{0,500}remote/);
});

test('D-100 prepare-only rejects blind RunCommand retry and noncanonical temp paths', () => {
  assert.match(wrapper, /'retry az vm run-command invoke'/);
  assert.match(wrapper, /'truqn'/);
  assert.match(wrapper, /grep -q 'truyn_class_d_remote'/);
  assert.match(wrapper, /grep -q 'TRUYN_AZ_RUN_COMMAND_429_BACKOFF'/);
});

test('strict terminal verifier CLI remains evidence-path only', () => {
  const terminalTest = readFileSync(new URL('./class-d-terminal-verifier.test.js', import.meta.url), 'utf8');
  assert.match(terminalTest, /verify-class-d-terminal\.js', path/);
});
