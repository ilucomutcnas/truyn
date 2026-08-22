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
  'scripts/class-d-1000-strict-acceptance.sh',
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
  const d100RunCommand = await readFile('scripts/lib/class-d-run-command.sh', 'utf8');
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

  // Canonical guest payload is normalized before any Azure execution. Lock the
  // corrected runtime paths at the acceptance-only RunCommand boundary and
  // reject the historical typo families.
  assert.match(d100, /s = s\.replace\('truqyn', 'truyn'\)/);
  assert.match(d100, /s = s\.replace\('truinyn', 'truyn'\)/);
  assert.match(d100, /s = s\.replace\('truin-d100', 'truyn-d100'\)/);
  assert.match(d100RunCommand, /\/bin\/bash \/tmp\/truyn-d100-run\.sh/);
  assert.doesNotMatch(d100RunCommand, /\/bin\/bash \/tmp\/truin-d100-run\.sh/);
  assert.match(d100, /invalid Class D prepared harness token survived/);
  assert.match(d100, /\/var\/lib\/truyn-d100\/records\.json/);
  assert.match(d100, /EnvironmentFile=\/etc\/truyn-d100\/node-%i\.env/);
  assert.match(d100, /ExecStart=\/usr\/bin\/node \/opt\/truyn\/network\/testnet\/node-service\.js/);

  // Kademlia k=20 does not promise a full membership list in routing.size().
  // The accepted gate must instead prove all 100 signed records were accepted
  // by all 25 node processes per host, then prove reachability with the
  // unchanged canonical baseline/healed routing-success thresholds.
  assert.match(d100, /expected invalid Class D full-routing bootstrap gate not found/);
  assert.match(d100, /BOOTSTRAPPED_NODES/);
  assert.match(d100, /accepted.*-eq 100/s);
  assert.match(d100, /TRUYN_CLASS_D100_PREPARE_ONLY/);

  const d1000 = await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8');
  assert.match(d1000, /14400000/);
  assert.match(d1000, /\('truy n', 'truyn'\)/);
  assert.match(d1000, /\('truin-d1000', 'truyn-d1000'\)/);
  assert.match(d1000, /noncanonical D-1000 prepared token survived/);
  assert.match(d1000, /TRUYN_CLASS_D1000_PREPARE_ONLY/);
  assert.match(d1000, /TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS/);
  assert.match(d1000, /class-d-1000-remote-dht-probe\.js/);
  assert.match(d1000, /remoteDht=target-side-quic/);
  assert.match(d1000, /paths=canonical/);
});

test('D-1000 campaign derives every strict safety counter from an executed probe', async () => {
  const { readFile } = await import('node:fs/promises');
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');

  assert.match(campaign, /class-d-1000-remote-dht-probe\.js/);
  assert.match(campaign, /target_endpoint=/);
  assert.match(campaign, /REMOTE_QUIC/);
  assert.match(campaign, /TARGET_REJECTED/);
  assert.match(campaign, /invalid_dht_record:dht_record_signature/);
  assert.doesNotMatch(campaign, /\/faults\/store/);
  assert.match(campaign, /class-d-1000-safety-probes\.js/);
  assert.match(campaign, /invalid_signed_state_accepted=\$\(marker/);
  assert.match(campaign, /stale_receipt_accepted=\$\(marker/);
  assert.match(campaign, /unauthorized_provider_execution=\$\(marker/);
  assert.match(campaign, /"invalidSignedStateAcceptedCount":\$\{invalid_signed_state_accepted\}/);
  assert.match(campaign, /"staleRevokedReceiptAcceptedCount":\$\{stale_receipt_accepted\}/);
  assert.match(campaign, /"unauthorizedProviderExecutionCount":\$\{unauthorized_provider_execution\}/);
  assert.match(campaign, /"remoteQuicControl":true/);
  assert.match(campaign, /"targetRejected":true/);
  assert.doesNotMatch(campaign, /"invalidSignedStateAcceptedCount":0/);
  assert.doesNotMatch(campaign, /"staleRevokedReceiptAcceptedCount":0/);
  assert.doesNotMatch(campaign, /"unauthorizedProviderExecutionCount":0/);
});

test('D-1000 campaign source uses canonical runtime paths for remote payloads', async () => {
  const { readFile } = await import('node:fs/promises');
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
  assert.doesNotMatch(campaign, /truy n/);
  assert.doesNotMatch(campaign, /truin-d1000/);
  assert.doesNotMatch(campaign, /truqyn/);
  assert.match(campaign, /\/var\/lib\/truyn-d1000\/records-by-host\.json/);
  assert.match(campaign, /systemctl stop truyn-d1000@/);
  assert.match(campaign, /cd \/opt\/truyn/);
});

test('D-1000 campaign proves packet-path failure and a full post-heal routing gate', async () => {
  const { readFile } = await import('node:fs/promises');
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
  assert.match(campaign, /truyn-d1000-partition/);
  assert.match(campaign, /PARTITION_SUCCESSES/);
  assert.match(campaign, /STAGE=healed-routing/);
  assert.match(campaign, /healed_rate=\$\(python3/);
  assert.match(campaign, /assert float\('\$healed_rate'\) >= \.99/);
  assert.match(campaign, /"healedSuccessRatio":\$\{healed_rate\}/);
  assert.match(campaign, /"realPacketPath":true/);
});

test('D-100 prepared harness removes invalid bootstrap and guest paths without cloud access', () => {
  const run = spawnSync('bash', ['scripts/class-d-100-final-acceptance.sh'], {
    encoding: 'utf8',
    env: { ...process.env, TRUYN_CLASS_D100_PREPARE_ONLY: '1' }
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRUYN_CLASS_D100_PREPARED_HARNESS=PASS/);
});

test('D-1000 prepared harness validates strict safety contract without cloud access', () => {
  const run = spawnSync('bash', ['scripts/class-d-1000-final-acceptance.sh'], {
    encoding: 'utf8',
    env: { ...process.env, TRUYN_CLASS_D1000_PREPARE_ONLY: '1' }
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS safetyContract=v2 remoteDht=target-side-quic paths=canonical/);
});
