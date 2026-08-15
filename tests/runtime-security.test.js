import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuntimeProviderAccessPolicy } from '../runtime/security-config.js';

test('runtime provider access defaults to owner-only and denies without an allowlist', () => {
  const policy = createRuntimeProviderAccessPolicy({});
  assert.equal(policy.mode, 'owner-only');
  assert.equal(policy.authorize({ from: 'truyn:node:external' }).ok, false);
});

test('runtime public provider access fails closed without the second explicit opt-in', () => {
  assert.throws(
    () => createRuntimeProviderAccessPolicy({ TRUYN_PROVIDER_ACCESS_MODE: 'public' }),
    /TRUYN_ALLOW_PUBLIC_PROVIDER=1/
  );
});

test('runtime public provider access requires both public mode and explicit opt-in', () => {
  const policy = createRuntimeProviderAccessPolicy({
    TRUYN_PROVIDER_ACCESS_MODE: 'public',
    TRUYN_ALLOW_PUBLIC_PROVIDER: '1'
  });
  assert.equal(policy.mode, 'public');
  assert.equal(policy.authorize({ from: 'truyn:node:external' }).ok, true);
});

test('runtime service wires the fail-closed access policy into TruynAdapterHost', async () => {
  const source = await readFile(new URL('../runtime/service.js', import.meta.url), 'utf8');
  assert.match(source, /createRuntimeProviderAccessPolicy/);
  assert.match(source, /const accessPolicy = createRuntimeProviderAccessPolicy\(process\.env\)/);
  assert.match(source, /new TruynAdapterHost\(\{[\s\S]*?accessPolicy,/);
});
