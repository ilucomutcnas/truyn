import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuntimeRelaySecurityConfig } from '../runtime/relay-security-config.js';

test('relay public network is fully closed by default', () => {
  assert.deepEqual(createRuntimeRelaySecurityConfig({}), {
    publicNetwork: false,
    allowPublicRegistration: false,
    allowPublicDispatch: false
  });
});

test('public registration/dispatch flags cannot bypass the public-network master opt-in', () => {
  assert.throws(
    () => createRuntimeRelaySecurityConfig({ TRUYN_ALLOW_PUBLIC_REGISTRATION: '1' }),
    /TRUYN_PUBLIC_NETWORK=1/
  );
  assert.throws(
    () => createRuntimeRelaySecurityConfig({ TRUYN_ALLOW_PUBLIC_DISPATCH: 'true' }),
    /TRUYN_PUBLIC_NETWORK=1/
  );
});

test('public network still requires separate registration and dispatch choices', () => {
  assert.deepEqual(createRuntimeRelaySecurityConfig({ TRUYN_PUBLIC_NETWORK: '1' }), {
    publicNetwork: true,
    allowPublicRegistration: false,
    allowPublicDispatch: false
  });
  assert.deepEqual(createRuntimeRelaySecurityConfig({
    TRUYN_PUBLIC_NETWORK: '1',
    TRUYN_ALLOW_PUBLIC_REGISTRATION: '1'
  }), {
    publicNetwork: true,
    allowPublicRegistration: true,
    allowPublicDispatch: false
  });
  assert.deepEqual(createRuntimeRelaySecurityConfig({
    TRUYN_PUBLIC_NETWORK: '1',
    TRUYN_ALLOW_PUBLIC_REGISTRATION: '1',
    TRUYN_ALLOW_PUBLIC_DISPATCH: '1'
  }), {
    publicNetwork: true,
    allowPublicRegistration: true,
    allowPublicDispatch: true
  });
});

test('runtime relay wires explicit public registration/dispatch config into createRelay', async () => {
  const source = await readFile(new URL('../runtime/service.js', import.meta.url), 'utf8');
  assert.match(source, /createRuntimeRelaySecurityConfig/);
  assert.match(source, /allowPublicRegistration:\s*relaySecurity\.allowPublicRegistration/);
  assert.match(source, /allowPublicDispatch:\s*relaySecurity\.allowPublicDispatch/);
});
