import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const accepted = readFileSync(new URL('../scripts/class-d-100-accepted-entrypoint.sh', import.meta.url), 'utf8');
const v13 = readFileSync(new URL('../scripts/class-d-100-v13-acceptance.sh', import.meta.url), 'utf8');
const v12 = readFileSync(new URL('../scripts/class-d-100-v12-acceptance.sh', import.meta.url), 'utf8');
const v11 = readFileSync(new URL('../scripts/class-d-100-v11-acceptance.sh', import.meta.url), 'utf8');
const v10 = readFileSync(new URL('../scripts/class-d-100-v10-acceptance.sh', import.meta.url), 'utf8');

function assertAcceptedInvocation(command) {
  assert.doesNotMatch(command, /(?:bash\s+)?scripts\/class-d-100-final-acceptance\.sh(?:\s|$)/,
    'accepted Class D-100 must not bypass the versioned hardening chain');
}

test('regression: V16 direct-final launcher is rejected', () => {
  const historicalFailingInvocation = 'bash scripts/class-d-100-final-acceptance.sh';
  assert.throws(() => assertAcceptedInvocation(historicalFailingInvocation), /must not bypass/);
});

test('canonical accepted entrypoint traverses V13 -> V12 -> V11 -> V10', () => {
  assert.match(accepted, /class-d-100-v13-acceptance\.sh/);
  assert.match(v13, /BASE="scripts\/class-d-100-v12-acceptance\.sh"/);
  assert.match(v12, /BASE="scripts\/class-d-100-v11-acceptance\.sh"/);
  assert.match(v11, /BASE="scripts\/class-d-100-v10-acceptance\.sh"/);
  assert.match(v10, /BASE="scripts\/class-d-100-final-acceptance\.sh"/);
  assert.match(v10, /TRUYN_D100_INSTALL_DIAG readiness=FAIL/);
  assert.match(v10, /printf '%s\\n' "\$out" >&2/);
  assert.match(v11, /command -v npm >\/dev\/null 2>&1/);
  assert.match(v11, /TRUYN_D100_NODE_BOOTSTRAP_DIAG/);
});

test('repository workflows cannot launch accepted D-100 by direct final implementation', () => {
  const workflowsDir = new URL('../.github/workflows/', import.meta.url);
  for (const name of readdirSync(workflowsDir).filter((n) => /\.ya?ml$/.test(n))) {
    const text = readFileSync(new URL(name, workflowsDir), 'utf8');
    assertAcceptedInvocation(text);
  }
});

test('canonical predicates remain strict in versioned chain', () => {
  assert.match(v12, />= \.99/);
  assert.match(v12, /<= 120000/);
  assert.match(v13, />= \.99/);
  assert.match(v13, /<= 120000/);
});
