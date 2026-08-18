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
  assert.match(script, /NetworkNamespacePath=\/run\/netns\/truyn-cgnat/);
  assert.match(script, /ExecStart=\/usr\/bin\/node \/opt\/truyn\/network\/testnet\/node-service\.js/);
  assert.match(script, /StandardOutput=append:\/var\/lib\/truyn-cgnat\.log/);
  assert.match(script, /systemctl start truyn-cgnat\.service/);
  assert.match(script, /expected Class C inner NAT launch line not found/);
  assert.match(script, /class-c-final-acceptance\.sh/);
});
