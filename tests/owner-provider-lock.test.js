import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enforceOwnerProviderRuntimeLock } from '../runtime/owner-provider-lock.js';

const SERVICE = fileURLToPath(new URL('../runtime/service.js', import.meta.url));

const ownerOnly = { mode: 'owner-only' };
const publicAccess = { mode: 'public' };
const byok = { mode: 'byok' };
function ownerFunded(limit = null) { return { mode: 'owner-funded', ownerDailyRequestLimit: limit }; }

test('owner runtime lock is inert for normal BYOK runtimes unless owner-only controls are misused', () => {
  assert.deepEqual(enforceOwnerProviderRuntimeLock({}, { accessPolicy: ownerOnly, billingPolicy: byok }), {
    ownerProvider: false,
    ownerPaidExternalAccess: false,
    ownerProviderNetworkVisibility: false,
    ownerDailyRequestLimit: null
  });

  for (const env of [
    { OWNER_PAID_EXTERNAL_ACCESS: '1' },
    { OWNER_PROVIDER_NETWORK_VISIBILITY: 'true' },
    { OWNER_AI_DAILY_REQUEST_LIMIT: '10' }
  ]) {
    assert.throws(
      () => enforceOwnerProviderRuntimeLock(env, { accessPolicy: ownerOnly, billingPolicy: byok }),
      /TRUYN_OWNER_PROVIDER=1/
    );
  }
});

test('explicit owner runtime requires owner-only access, owner-funded billing, and positive daily request budget', () => {
  const base = { TRUYN_OWNER_PROVIDER: '1', OWNER_AI_DAILY_REQUEST_LIMIT: '25' };

  assert.throws(
    () => enforceOwnerProviderRuntimeLock(base, { accessPolicy: publicAccess, billingPolicy: ownerFunded(25) }),
    /requires owner-only access policy/
  );
  assert.throws(
    () => enforceOwnerProviderRuntimeLock(base, { accessPolicy: ownerOnly, billingPolicy: byok }),
    /requires owner-funded billing policy/
  );
  for (const value of [undefined, '', '0', '-1', '1.5', 'nope']) {
    const env = { TRUYN_OWNER_PROVIDER: '1' };
    if (value !== undefined) env.OWNER_AI_DAILY_REQUEST_LIMIT = value;
    assert.throws(
      () => enforceOwnerProviderRuntimeLock(env, { accessPolicy: ownerOnly, billingPolicy: ownerFunded(null) }),
      /positive OWNER_AI_DAILY_REQUEST_LIMIT/
    );
  }
  assert.throws(
    () => enforceOwnerProviderRuntimeLock(base, { accessPolicy: ownerOnly, billingPolicy: ownerFunded(24) }),
    /not bound to billing policy/
  );

  assert.deepEqual(enforceOwnerProviderRuntimeLock(base, { accessPolicy: ownerOnly, billingPolicy: ownerFunded(25) }), {
    ownerProvider: true,
    ownerPaidExternalAccess: false,
    ownerProviderNetworkVisibility: false,
    ownerDailyRequestLimit: 25
  });
});

test('owner-paid external access and owner-provider network visibility remain hard disabled', () => {
  for (const key of ['OWNER_PAID_EXTERNAL_ACCESS', 'OWNER_PROVIDER_NETWORK_VISIBILITY']) {
    assert.throws(
      () => enforceOwnerProviderRuntimeLock({
        TRUYN_OWNER_PROVIDER: '1',
        OWNER_AI_DAILY_REQUEST_LIMIT: '25',
        [key]: '1'
      }, { accessPolicy: ownerOnly, billingPolicy: ownerFunded(25) }),
      /must remain disabled/
    );
  }
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
      OWNER_AI_DAILY_REQUEST_LIMIT: '25',
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
      OWNER_AI_DAILY_REQUEST_LIMIT: '25',
      TRUYN_PROVIDER_ACCESS_MODE: 'owner-only',
      TRUYN_PROVIDER_BILLING_MODE: 'byok',
      OPENAI_API_KEY: ''
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Owner provider runtime requires owner-funded billing policy/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY is required/);
});
