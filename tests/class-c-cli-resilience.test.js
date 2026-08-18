import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptUrl = new URL('../scripts/class-c-final-acceptance-resilient.sh', import.meta.url);

test('Class C wrapper retries Azure CLI process failures without weakening the gate', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  assert.match(script, /TRUYN_AZ_CLI_RETRIES:=4/);
  assert.match(script, /if command az "\$@"; then/);
  assert.match(script, /rc=\$\?/);
  assert.match(script, /attempt >= TRUYN_AZ_CLI_RETRIES/);
  assert.match(script, /return "\$rc"/);
  assert.match(script, /export -f az/);
  assert.match(script, /class-c-final-acceptance\.sh/);
  assert.doesNotMatch(script, /\|\| true/);
});
