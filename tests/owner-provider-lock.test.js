import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enforceOwnerProviderRuntimeLock } from '../runtime/owner-provider-lock.js';

const SERVICE = fileURLToPath(new URL('../runtime/service.js', import.meta.url));

const ownerOnly = { mode: 'owner-only' };
const publicAccess = { mode: 'public' };
const ownerFunded = { mode: 'owner-funded' };
const byok = { mode: 'byok' };

test('owner runtime lock is inert for normal BYOK runtimes unless owner-only switches are misused', () => {
  assert.deepEqual(enforceOwnerProviderRuntimeLock({}, { accessPolicy: ownerOnly, billingPolicy: byok }), {
    ownerProvider: false,
    ownerPaidExternalAccess: false,
    ownerProviderNetworkVisibility: false
  });

  assert.throws(
    () => enforceOwnerProviderRuntimeLock({ OWNER_PAID_EXTERNAL_ACCESS: '1' }, { accessPolicy: ownerOnly, billingPolicy: byok }),
    /TRUYN_OWNER_PROVIDER=1/
  );
  assert.throws(
    () => enforceOwnerProviderRuntimeLock({ OWNER_PROVIDER_NETWORK_VISIBILITY: 'true' }, { accessPolicy: ownerOnly, billingPolicy: byok }),
    /TRUYN_OWNER_PROVIDER=1/
  );
});

test('explicit owner runtime requires owner-only access and owner-funded billing', () => {
  const env = { TRUYN_OWNER_PROVIDER: '1' };

  assert.throws(
    () => enforceOwnerProviderRuntimeLock(env, { accessPolicy: publicAccess, billingPolicy: ownerFunded }),
    /requires owner-only access policy/
  );
  assert.throws(
    () => enforceOwnerProviderRuntimeLock(env, { accessPolicy: ownerOnly, billingPolicy: byok }),
    /requires owner-funded billing policy/
  );

  assert.deepEqual(enforceOwnerProviderRuntimeLock(env, { accessPolicy: ownerOnly, billingPolicy: ownerFunded }), {
    ownerProvider: true,
    ownerPaidExternalAccess: false,
    ownerProviderNetworkVisibility: false
  });
});

test('owner-paid external access and owner-provider network visibility remain hard disabled', () => {
  assert.throws(
    () => enforceOwnerProviderRuntimeLock({
      TRUYN_OWNER_PROVIDER: '1',
      OWNER_PAID_EXTERNAL_ACCESS: '1'
    }, { accessPolicy: ownerOnly, billingPolicy: ownerFunded }),
    /must remain disabled/
  );

  assert.throws(
    () => enforceOwnerProviderRuntimeLock({
      TRUYN_OWNER_PROVIDER: '1',
      OWNER_PROVIDER_NETWORK_VISIBILITY: '1'
    }, { accessPolicy: ownerOnly, billingPolicy: ownerFunded }),
    /must remain disabled/
  );
});

test('runtime rejects an explicitly owner-funded public provider before provider adapter initialization', () => {
  const result = spawnSync(process.execPath, [SERVICE], {
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      TRUYN_ROLE: 'provider',
      TRUYN_RELAY: 'http://127.0.0.1:1',
      TRUYN_PROVIDER: 'openai',
      TRUYN_OWNER_PROVIDER: '1',
      TRUYN_PROVIDER_ACCESS_MODE: 'public',
      TRUYN_ALLOW_PUBLIC_PROVIDER: '1',
      TRUYN_PROVIDER_BILLING_MODE: 'owner-funded',
      OPENAI_API_KEY: ''
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Owner provider runtime requires owner-only access policy/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY is required/);
});

test('runtime rejects an owner provider mislabelled as BYOK before provider adapter initialization', () => {
  const result = spawnSync(process.execPath, [SERVICE], {
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      TRUYN_ROLE: 'provider',
      TRUYN_RELAY: 'http://127.0.0.1:1',
      TRUYN_PROVIDER: 'openai',
      TRUYN_OWNER_PROVIDER: '1',
      TRUYN_PROVIDER_ACCESS_MODE: 'owner-only',
      TRUYN_PROVIDER_BILLING_MODE: 'byok',
      OPENAI_API_KEY: ''
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Owner provider runtime requires owner-funded billing policy/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY is required/);
});
