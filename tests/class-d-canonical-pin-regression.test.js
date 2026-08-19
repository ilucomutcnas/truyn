import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const provision = readFileSync(new URL('../benchmarks/scale/class-d-azure-100-provision.sh', import.meta.url), 'utf8');
const campaign = readFileSync(new URL('../benchmarks/scale/class-d-azure-100-campaign.sh', import.meta.url), 'utf8');
const wrapper = readFileSync(new URL('../scripts/class-d-100-final-acceptance.sh', import.meta.url), 'utf8');
test('D-100 canonical paths and tested SHA propagation are fail-closed', () => {
  for (const bad of ['truqyn','truinyn','truin-d100','GITHUB_SHA']) assert.equal(provision.includes(bad), false, bad);
  assert.equal(campaign.includes('GITHUB_SHA'), false);
  assert.match(provision, /TRUYN_TESTED_COMMIT/);
  assert.match(provision, /git rev-parse HEAD/);
  assert.match(provision, /TESTED_COMMIT=\$\{TRUYN_TESTED_COMMIT\}/);
  assert.match(provision, /marker "\$out" TESTED_COMMIT/);
  assert.match(wrapper, /TRUYN_TESTED_COMMIT is required for accepted D-100/);
});
