import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptUrl = new URL('../scripts/class-c-final-acceptance-resilient.sh', import.meta.url);

test('Class C wrapper isolates runner/orchestration noise without weakening WAN gates', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  assert.match(script, /TRUYN_AZ_CLI_RETRIES:=4/);
  assert.match(script, /if command az "\$@"; then/);
  assert.match(script, /attempt >= TRUYN_AZ_CLI_RETRIES/);
  assert.match(script, /return "\$rc"/);
  assert.match(script, /export -f az/);
  assert.doesNotMatch(script, /command az "\$@"\s*\|\|\s*true/);
  assert.match(script, /50command-not-found/);
  assert.match(script, /PEER_TTL_MS=1800000/);
  assert.match(script, /lease_start/);
  assert.match(script, /renewalRetested=false/);
  assert.match(script, /peerLeaseLifecycleEvidence/);
  assert.match(script, /separate-ci-prerequisite/);

  // Linux IFNAMSIZ is 16 including NUL, so real interface names must be <=15.
  assert.ok('tcgn-host'.length <= 15);
  assert.ok('tcgn-inner'.length <= 15);
  assert.match(script, /replace\('truyn-cgnat-host', 'tcgn-host'\)/);
  assert.match(script, /replace\('truyn-cgnat-inner', 'tcgn-inner'\)/);

  // The inner double-NAT node must be owned by systemd so Azure RunCommand
  // cannot reap it, but namespace entry itself stays explicit and privileged;
  // the node process only then drops to the unprivileged truyn account.
  assert.match(script, /ExecStart=\/usr\/bin\/ip netns exec truyn-cgnat \/usr\/sbin\/runuser -u truyn -- \/usr\/bin\/env/);
  assert.match(script, /TRUYN_ADVERTISE_HOST=192\.168\.55\.2/);
  assert.match(script, /TRUYN_PEER_RECORD_TTL_MS=1800000/);
  assert.match(script, /StandardOutput=append:\/var\/lib\/truropyn-cgnat\.log/);
  assert.match(script, /StandardError=append:\/var\/lib\/truropyn-cgnat\.log/);
  assert.doesNotMatch(script, /NetworkNamespacePath=\/run\/netns\/truyn-cgnat/);
  assert.match(script, /systemctl start truyn-cgnat\.service/);

  // Azure RunCommand wraps stdout. Inner peer-record transport therefore uses
  // a semantic marker, never a positional "last line is base64" assumption.
  assert.match(script, /TRUYN_INNER_REC_B64/);
  assert.match(script, /marker .*INNER_REC_OUT.*TRUYN_INNER_REC_B64/);
  assert.match(script, /double_nat_record_missing/);
  assert.match(script, /double_nat_record_decode/);
  assert.match(script, /expected Class C inner NAT record decode block not found/);
  assert.doesNotMatch(script, /INNER_REC64=.*tail -1/);

  // A failed inner start must preserve enough evidence to diagnose the next
  // fault without another blind paid cloud rerun.
  assert.match(script, /systemctl --no-pager --full status truyn-cgnat\.service/);
  assert.match(script, /journalctl -u truyn-cgnat\.service --no-pager -n 160/);
  assert.match(script, /ip netns exec truyn-cgnat ip addr/);
  assert.match(script, /cat \/var\/lib\/truropyn-cgnat\.log/);
  assert.match(script, /expected Class C inner NAT readiness check not found/);
  assert.match(script, /expected Class C inner NAT launch line not found/);
  assert.match(script, /class-c-final-acceptance\.sh/);
});
