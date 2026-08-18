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
  assert.match(script, /50command-not-found/);
  assert.match(script, /PEER_TTL_MS=1800000/);
  assert.match(script, /lease_start/);
  assert.match(script, /renewalRetested=false/);
  assert.match(script, /peerLeaseLifecycleEvidence/);
  assert.match(script, /separate-ci-prerequisite/);
  assert.match(script, /class-c-final-acceptance\.sh/);
  assert.doesNotMatch(script, /\|\| true/);
});
