import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const scripts = [
  'benchmarks/scale/class-d-azure-100-provision.sh',
  'benchmarks/scale/class-d-azure-100-campaign.sh',
  'scripts/class-d-100-final-acceptance.sh',
  'benchmarks/scale/class-d-azure-1000-provision.sh',
  'benchmarks/scale/class-d-azure-1000-campaign.sh',
  'scripts/class-d-1000-final-acceptance.sh',
  'scripts/class-c-final-acceptance.sh'
];

for (const script of scripts) {
  test(`shell harness parses: ${script}`, () => {
    const run = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    assert.equal(run.status, 0, `${script}: ${run.stderr || run.stdout}`);
  });
}

test('final launchers patch known native/runtime hazards before cloud execution', async () => {
  const { readFile } = await import('node:fs/promises');
  const d100 = await readFile('scripts/class-d-100-final-acceptance.sh', 'utf8');
  assert.match(d100, /npm install --no-audit --no-fund/);
  assert.match(d100, /50command-not-found/);
  assert.match(d100, /TRUYN_AZ_CLI_RETRIES:=4/);
  assert.match(d100, /if command az "\$@"; then/);
  assert.match(d100, /attempt >= TRUYN_AZ_CLI_RETRIES/);
  assert.match(d100, /return "\$rc"/);
  assert.doesNotMatch(d100, /command az "\$@"\s*\|\|\s*true/);
  assert.match(d100, /TRUYN_APT_TRANSIENT_RETRY/);
  assert.match(d100, /for apt_attempt in 1 2 3 4/);
  assert.match(d100, /apt-get update -qq && apt-get install -y -qq git curl jq openssl ca-certificates python3 iptables/);
  assert.match(d100, /TRUYN_NODE_BOOTSTRAP_TRANSIENT_RETRY/);
  assert.match(d100, /for node_attempt in 1 2 3 4/);
  assert.match(d100, /expected Class D guest apt bootstrap block not found/);
  assert.doesNotMatch(d100, /apt-get (?:update|install)[^\n]*\|\|\s*true/);
  // The generated remote body deliberately contains the historical misspelling
  // and fixes it before execution; lock both halves of that transformation.
  assert.match(d100, /\/bin\/bash \/tmp\/truin-d100-run\.sh/);
  assert.match(d100, /truin-d100-run\/truyn-d100-run/);

  const d1000 = await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8');
  assert.match(d1000, /14400000/);
  assert.match(d1000, /truin-d1000@.*truyn-d1000@/s);
});
