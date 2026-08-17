import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuntimeRelaySecurityConfig } from '../runtime/relay-security-config.js';
import { createRelay } from '../network/relay/server.js';

const closed = {
  publicNetwork: false,
  allowPublicRegistration: false,
  allowPublicDispatch: false,
  localDevelopmentMode: false,
  productionMode: false
};

test('relay public network is fully closed by default', () => {
  assert.deepEqual(createRuntimeRelaySecurityConfig({}), closed);
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

test('local development mode hard-fails beside public or production markers', () => {
  assert.throws(
    () => createRuntimeRelaySecurityConfig({ TRUYN_LOCAL_DEVELOPMENT_MODE: '1', TRUYN_PUBLIC_NETWORK: '1' }),
    /cannot be combined/
  );
  assert.throws(
    () => createRuntimeRelaySecurityConfig({ TRUYN_LOCAL_DEVELOPMENT_MODE: '1', NODE_ENV: 'production' }),
    /cannot be combined/
  );
  assert.deepEqual(createRuntimeRelaySecurityConfig({ TRUYN_LOCAL_DEVELOPMENT_MODE: '1' }), {
    ...closed,
    localDevelopmentMode: true
  });
});

test('low-level relay rejects localDevelopmentMode combined with public relay access', () => {
  assert.throws(
    () => createRelay({ localDevelopmentMode: true, allowPublicRegistration: true }),
    /cannot be combined/
  );
  assert.throws(
    () => createRelay({ localDevelopmentMode: true, productionMode: true }),
    /cannot be combined/
  );
});

test('public network still requires separate registration and dispatch choices', () => {
  assert.deepEqual(createRuntimeRelaySecurityConfig({ TRUYN_PUBLIC_NETWORK: '1' }), {
    ...closed,
    publicNetwork: true
  });
  assert.deepEqual(createRuntimeRelaySecurityConfig({
    TRUYN_PUBLIC_NETWORK: '1',
    TRUYN_ALLOW_PUBLIC_REGISTRATION: '1'
  }), {
    ...closed,
    publicNetwork: true,
    allowPublicRegistration: true
  });
  assert.deepEqual(createRuntimeRelaySecurityConfig({
    TRUYN_PUBLIC_NETWORK: '1',
    TRUYN_ALLOW_PUBLIC_REGISTRATION: '1',
    TRUYN_ALLOW_PUBLIC_DISPATCH: '1'
  }), {
    ...closed,
    publicNetwork: true,
    allowPublicRegistration: true,
    allowPublicDispatch: true
  });
});

test('runtime relay wires explicit security config into createRelay', async () => {
  const source = await readFile(new URL('../runtime/service.js', import.meta.url), 'utf8');
  assert.match(source, /createRuntimeRelaySecurityConfig/);
  assert.match(source, /allowPublicRegistration:\s*relaySecurity\.allowPublicRegistration/);
  assert.match(source, /allowPublicDispatch:\s*relaySecurity\.allowPublicDispatch/);
  assert.match(source, /localDevelopmentMode:\s*relaySecurity\.localDevelopmentMode/);
  assert.match(source, /productionMode:\s*relaySecurity\.productionMode/);
});
