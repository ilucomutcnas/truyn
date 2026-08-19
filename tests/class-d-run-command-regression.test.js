import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wrapper = readFileSync(new URL('../scripts/class-d-100-final-acceptance.sh', import.meta.url), 'utf8');

test('D-100 accepted harness bypasses generic retry for Azure RunCommand', () => {
  assert.match(wrapper, /command az vm run-command invoke/);
  assert.match(wrapper, /managed VM RunCommand extension execution is in progress/);
  assert.match(wrapper, /Please wait for completion before invoking a run command/);
  assert.match(wrapper, /TRUYN_AZ_RUN_COMMAND_BUSY_WAIT/);
  assert.match(wrapper, /Ordinary guest\/command non-zero is terminal[\s\S]*return "\$rc"/);
});

test('D-100 prepare-only rejects blind RunCommand retry and noncanonical temp paths', () => {
  assert.match(wrapper, /'retry az vm run-command invoke'/);
  assert.match(wrapper, /'truqn'/);
  assert.match(wrapper, /grep -q 'TRUYN_AZ_RUN_COMMAND_BUSY_WAIT'/);
  assert.match(wrapper, /grep -q 'command az vm run-command invoke'/);
});

test('strict terminal verifier CLI remains evidence-path only', () => {
  const terminalTest = readFileSync(new URL('./class-d-terminal-verifier.test.js', import.meta.url), 'utf8');
  assert.match(terminalTest, /verify-class-d-terminal\.js', path/);
});
