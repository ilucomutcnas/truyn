#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';
import { createMcpHttpServer, runStdioMcpServer } from '../adapters/mcp/server.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAdapter } from '../adapters/providers/index.js';
import {
  assertVerifiedByokProfile,
  createByokProfile,
  isLoopbackRelay,
  markByokVerified,
  providerAdapterOptions,
  validateByokEnvironment
} from './byok-profile.js';

const DEFAULT_HOME = process.env.TRUYN_HOME || path.join(os.homedir(), '.truyn');
const IDENTITY_FILE = path.join(DEFAULT_HOME, 'identity.json');
const SESSION_FILE = path.join(DEFAULT_HOME, 'session.json');
const BYOK_PROFILE_FILE = path.join(DEFAULT_HOME, 'provider.json');
const BYOK_IDENTITY_FILE = path.join(DEFAULT_HOME, 'provider-identity.json');

async function loadIdentity() { return JSON.parse(await readFile(IDENTITY_FILE, 'utf8')); }
async function saveIdentity(identity) { await mkdir(DEFAULT_HOME, { recursive: true }); await writeFile(IDENTITY_FILE, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 }); }
async function saveSession(session) { await mkdir(DEFAULT_HOME, { recursive: true }); await writeFile(SESSION_FILE, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 }); }
async function loadSession() { return JSON.parse(await readFile(SESSION_FILE, 'utf8')); }
async function savePrivateJson(file, value) { await mkdir(DEFAULT_HOME, { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
async function loadOptionalJson(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } }
function argValue(name, fallback = null) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function argFlag(name) { return process.argv.includes(name); }
function print(value) { process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`); }

async function ensureProviderIdentity() {
  const existing = await loadOptionalJson(BYOK_IDENTITY_FILE);
  if (existing) return existing;
  const identity = createIdentity();
  await savePrivateJson(BYOK_IDENTITY_FILE, identity);
  return identity;
}

async function requireNetworkByok(relayUrl, requesterIdentity) {
  if (isLoopbackRelay(relayUrl)) return null;
  const profile = await loadOptionalJson(BYOK_PROFILE_FILE);
  assertVerifiedByokProfile(profile, requesterIdentity.nodeId);
  return profile;
}

async function configureByok(requesterIdentity) {
  const provider = argValue('--provider');
  if (!provider) {
    throw new Error('Usage: truyn setup --provider <openai|openai-compatible|local|anthropic|azure-openai|vertex-gemini|custom-http|custom-mcp> [options] [--no-auth] [--test]');
  }
  const providerIdentity = await ensureProviderIdentity();
  const profile = createByokProfile({
    provider,
    model: argValue('--model'),
    baseUrl: argValue('--base-url'),
    endpoint: argValue('--endpoint'),
    tool: argValue('--tool'),
    projectId: argValue('--project-id'),
    location: argValue('--location'),
    credentialEnv: argValue('--credential-env'),
    capabilities: (argValue('--capability', 'reasoning.general') || 'reasoning.general').split(','),
    requesterNodeId: requesterIdentity.nodeId,
    providerNodeId: providerIdentity.nodeId,
    noAuth: argFlag('--no-auth')
  });

  await savePrivateJson(BYOK_PROFILE_FILE, profile);
  if (!argFlag('--test')) {
    print({
      ok: true,
      configured: true,
      verified: false,
      provider: profile.provider,
      authMode: profile.authMode,
      credentialEnv: profile.credentialEnv,
      providerNodeId: profile.providerNodeId,
      next: 'Re-run the same setup command with --test before remote AI workload.'
    });
    return;
  }

  const environment = validateByokEnvironment(profile, process.env);
  if (!environment.ok) throw new Error(`BYOK provider environment is incomplete: ${environment.missing.join(', ')}`);
  const adapter = createProviderAdapter(profile.adapterProvider, providerAdapterOptions(profile, process.env));
  const capability = profile.capabilities[0];
  const result = await adapter.execute({
    capability,
    input: 'TRUYN BYOK connection test. Return a short non-empty confirmation.',
    policy: { purpose: 'byok-connection-test' }
  });
  if (result?.output == null || String(result.output).trim().length === 0) {
    throw new Error('BYOK provider test returned an empty result');
  }
  const verified = markByokVerified(profile);
  await savePrivateJson(BYOK_PROFILE_FILE, verified);
  print({
    ok: true,
    configured: true,
    verified: true,
    provider: verified.provider,
    model: verified.model,
    authMode: verified.authMode,
    credentialEnv: verified.credentialEnv,
    requesterNodeId: verified.requesterNodeId,
    providerNodeId: verified.providerNodeId,
    credentialsStoredByTruyn: false
  });
}

async function main() {
  const command = process.argv[2];
  if (command === 'init') { const identity = createIdentity(); await saveIdentity(identity); print({ ok: true, nodeId: identity.nodeId, home: DEFAULT_HOME }); return; }
  if (command === 'identity') { const identity = await loadIdentity(); print({ nodeId: identity.nodeId, algorithm: identity.algorithm, publicKey: identity.publicKeyPem }); return; }
  if (command === 'relay') {
    const port = Number(argValue('--port', process.env.PORT || 8787));
    const host = argValue('--host', '127.0.0.1');
    const relay = createRelay({ localDevelopmentMode: true });
    const url = await relay.listen({ port, host });
    print(`TRUYN local-development relay listening on ${url}`);
    return;
  }

  const relayUrl = argValue('--relay', process.env.TRUYN_RELAY || 'http://127.0.0.1:8787');
  const identity = await loadIdentity();

  if (command === 'setup') { await configureByok(identity); return; }
  if (command === 'setup-status') {
    const profile = await loadOptionalJson(BYOK_PROFILE_FILE);
    if (!profile) { print({ ok: true, configured: false, verified: false }); return; }
    print({
      ok: true,
      configured: true,
      verified: Boolean(profile.verifiedAt),
      provider: profile.provider,
      model: profile.model,
      authMode: profile.authMode,
      credentialEnv: profile.credentialEnv,
      requesterNodeId: profile.requesterNodeId,
      providerNodeId: profile.providerNodeId,
      accessMode: profile.accessMode,
      billingMode: profile.billingMode,
      credentialsStoredByTruyn: false
    });
    return;
  }

  const node = new TruynNode({ relayUrl, identity });

  if (command === 'mcp') { await requireNetworkByok(relayUrl, identity); await runStdioMcpServer({ node }); return; }
  if (command === 'mcp-http') { await requireNetworkByok(relayUrl, identity); const port = Number(argValue('--port', process.env.PORT || 8791)); const host = argValue('--host', process.env.HOST || '127.0.0.1'); const server = createMcpHttpServer({ node }); print(`TRUYN MCP HTTP listening on ${await server.listen({ host, port })}`); return; }
  if (command === 'bridge') { await requireNetworkByok(relayUrl, identity); const port = Number(argValue('--port', process.env.PORT || 8790)); const host = argValue('--host', process.env.HOST || '127.0.0.1'); const bridge = createHttpAdapterServer({ node }); print(`TRUYN HTTP adapter listening on ${await bridge.listen({ host, port })}`); return; }
  if (command === 'provider') {
    const configured = await loadOptionalJson(BYOK_PROFILE_FILE);
    const explicitProvider = argValue('--provider');
    const localRelay = isLoopbackRelay(relayUrl);

    if (configured && !explicitProvider) {
      assertVerifiedByokProfile(configured, identity.nodeId);
      const environment = validateByokEnvironment(configured, process.env);
      if (!environment.ok) throw new Error(`BYOK provider environment is incomplete: ${environment.missing.join(', ')}`);
      const providerIdentity = await loadOptionalJson(BYOK_IDENTITY_FILE);
      if (!providerIdentity || providerIdentity.nodeId !== configured.providerNodeId) throw new Error('Configured BYOK provider identity is missing or mismatched');
      const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
      const adapter = createProviderAdapter(configured.adapterProvider, providerAdapterOptions(configured, process.env));
      const accessPolicy = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [identity.nodeId] });
      const billingPolicy = createProviderBillingPolicy({ mode: 'byok' });
      const adapterHost = new TruynAdapterHost({
        node: providerNode,
        adapter,
        accessPolicy,
        billingPolicy,
        pollIntervalMs: Number(argValue('--poll-ms', 500)),
        fastPath: argFlag('--fast'),
        socketPath: argFlag('--socket')
      });
      await adapterHost.start();
      print({ ok: true, provider: configured.provider, requesterNodeId: identity.nodeId, providerNodeId: providerIdentity.nodeId, capabilities: configured.capabilities, accessMode: 'owner-only', billingMode: 'byok' });
      return;
    }

    if (!localRelay) {
      throw new Error('Remote provider mode requires a verified private BYOK profile. Run truyn setup ... --test, then truyn provider.');
    }
    const provider = explicitProvider;
    const capabilities = (argValue('--capability', 'research') || 'research').split(',').map((value) => value.trim()).filter(Boolean);
    if (!provider) throw new Error('Usage: truyn provider --provider <provider> --capability <name[,name]> [--relay URL]');
    const adapter = createProviderAdapter(provider, { capabilities });
    const adapterHost = new TruynAdapterHost({ node, adapter, pollIntervalMs: Number(argValue('--poll-ms', 500)) });
    await adapterHost.start();
    print({ ok: true, provider, nodeId: identity.nodeId, capabilities, localDevelopment: true });
    return;
  }

  if (command === 'register') { const result = await node.register({ name: argValue('--name') }); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); print(result); return; }
  if (command === 'offer') { await node.register(); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); const capability = process.argv[3]; if (!capability) throw new Error('Usage: truyn offer <capability> [--relay URL]'); print(await node.offer(capability)); return; }
  if (command === 'find') { await node.register(); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); const capability = process.argv[3]; if (!capability) throw new Error('Usage: truyn find <capability> [--relay URL]'); print(await node.find(capability)); return; }
  if (command === 'need') { await requireNetworkByok(relayUrl, identity); await node.register(); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); const capability = process.argv[3]; const input = process.argv[4]; if (!capability || input === undefined) throw new Error('Usage: truyn need <capability> <input> [--relay URL]'); print(await node.need(capability, input)); return; }
  if (command === 'result') { await node.register(); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); const requestId = process.argv[3]; const output = process.argv[4]; if (!requestId || output === undefined) throw new Error('Usage: truyn result <requestId> <output> [--relay URL]'); print(await node.result(requestId, output)); return; }
  if (command === 'poll') { const session = await loadSession(); node.sessionToken = session.sessionToken; print(await node.poll()); return; }

  print(`TRUYN MVP CLI\n\nCommands:\n  truyn init\n  truyn identity\n  truyn setup --provider <provider> [--model MODEL] [--base-url URL] [--endpoint URL] [--tool NAME] [--credential-env NAME] [--no-auth] [--test]\n    providers: openai, openai-compatible, local, anthropic, azure-openai, vertex-gemini, custom-http, custom-mcp\n  truyn setup-status\n  truyn relay [--host 127.0.0.1] [--port 8787]  # loopback only\n  truyn register [--relay URL]\n  truyn offer <capability> [--relay URL]\n  truyn find <capability> [--relay URL]\n  truyn need <capability> <input> [--relay URL]  # remote requires verified BYOK\n  truyn result <requestId> <output> [--relay URL]\n  truyn poll [--relay URL]\n  truyn bridge [--port 8790] [--relay URL]        # remote requires verified BYOK\n  truyn mcp [--relay URL]                        # remote requires verified BYOK\n  truyn mcp-http [--port 8791] [--relay URL]     # remote requires verified BYOK\n  truyn provider [--relay URL]                   # verified BYOK provider\n  truyn provider --provider <provider> --capability <name[,name]>  # local development only`);
}

main().catch((error) => {
  process.stderr.write(`TRUYN error: ${error.message}\n`);
  process.exitCode = 1;
});