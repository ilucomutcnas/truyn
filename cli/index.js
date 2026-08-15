#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';
import { createMcpHttpServer, runStdioMcpServer } from '../adapters/mcp/server.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAdapter } from '../adapters/providers/index.js';

const DEFAULT_HOME = process.env.TRUYN_HOME || path.join(os.homedir(), '.truyn');
const IDENTITY_FILE = path.join(DEFAULT_HOME, 'identity.json');
const SESSION_FILE = path.join(DEFAULT_HOME, 'session.json');

async function loadIdentity() { return JSON.parse(await readFile(IDENTITY_FILE, 'utf8')); }
async function saveIdentity(identity) { await mkdir(DEFAULT_HOME, { recursive: true }); await writeFile(IDENTITY_FILE, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 }); }
async function saveSession(session) { await mkdir(DEFAULT_HOME, { recursive: true }); await writeFile(SESSION_FILE, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 }); }
async function loadSession() { return JSON.parse(await readFile(SESSION_FILE, 'utf8')); }
function argValue(name, fallback = null) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function print(value) { process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`); }

async function main() {
  const command = process.argv[2];
  if (command === 'init') { const identity = createIdentity(); await saveIdentity(identity); print({ ok: true, nodeId: identity.nodeId, home: DEFAULT_HOME }); return; }
  if (command === 'identity') { const identity = await loadIdentity(); print({ nodeId: identity.nodeId, algorithm: identity.algorithm, publicKey: identity.publicKeyPem }); return; }
  if (command === 'relay') { const port = Number(argValue('--port', process.env.PORT || 8787)); const host = argValue('--host', process.env.HOST || '127.0.0.1'); const relay = createRelay(); const url = await relay.listen({ port, host }); print(`TRUYN MVP relay listening on ${url}`); return; }

  const relayUrl = argValue('--relay', process.env.TRUYN_RELAY || 'http://127.0.0.1:8787');
  const identity = await loadIdentity();
  const node = new TruynNode({ relayUrl, identity });

  if (command === 'mcp') { await runStdioMcpServer({ node }); return; }
  if (command === 'mcp-http') { const port = Number(argValue('--port', process.env.PORT || 8791)); const host = argValue('--host', process.env.HOST || '127.0.0.1'); const server = createMcpHttpServer({ node }); print(`TRUYN MCP HTTP listening on ${await server.listen({ host, port })}`); return; }
  if (command === 'bridge') { const port = Number(argValue('--port', process.env.PORT || 8790)); const host = argValue('--host', process.env.HOST || '127.0.0.1'); const bridge = createHttpAdapterServer({ node }); print(`TRUYN HTTP adapter listening on ${await bridge.listen({ host, port })}`); return; }
  if (command === 'provider') {
    const provider = argValue('--provider');
    const capabilities = (argValue('--capability', 'research') || 'research').split(',').map((value) => value.trim()).filter(Boolean);
    if (!provider) throw new Error('Usage: truyn provider --provider <openai|anthropic> --capability <name[,name]> [--relay URL]');
    const adapter = createProviderAdapter(provider, { capabilities });
    const host = new TruynAdapterHost({ node, adapter, pollIntervalMs: Number(argValue('--poll-ms', 500)) });
    await host.start();
    print({ ok: true, provider, nodeId: identity.nodeId, capabilities, relayUrl });
    return;
  }

  if (command === 'register') { const result = await node.register({ name: argValue('--name') }); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); print(result); return; }
  if (command === 'offer') { await node.register(); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); const capability = process.argv[3]; if (!capability) throw new Error('Usage: truyn offer <capability> [--relay URL]'); print(await node.offer(capability)); return; }
  if (command === 'find') { const capability = process.argv[3]; if (!capability) throw new Error('Usage: truyn find <capability> [--relay URL]'); print(await node.find(capability)); return; }
  if (command === 'need') { await node.register(); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); const capability = process.argv[3]; const input = process.argv[4]; if (!capability || input === undefined) throw new Error('Usage: truyn need <capability> <input> [--relay URL]'); print(await node.need(capability, input)); return; }
  if (command === 'result') { await node.register(); await saveSession({ relayUrl, nodeId: identity.nodeId, sessionToken: node.sessionToken }); const requestId = process.argv[3]; const output = process.argv[4]; if (!requestId || output === undefined) throw new Error('Usage: truyn result <requestId> <output> [--relay URL]'); print(await node.result(requestId, output)); return; }
  if (command === 'poll') { const session = await loadSession(); node.sessionToken = session.sessionToken; print(await node.poll()); return; }

  print(`TRUYN MVP CLI\n\nCommands:\n  truyn init\n  truyn identity\n  truyn relay [--host 127.0.0.1] [--port 8787]\n  truyn register [--relay URL]\n  truyn offer <capability> [--relay URL]\n  truyn find <capability> [--relay URL]\n  truyn need <capability> <input> [--relay URL]\n  truyn result <requestId> <output> [--relay URL]\n  truyn poll [--relay URL]\n  truyn bridge [--port 8790] [--relay URL]\n  truyn mcp [--relay URL]\n  truyn mcp-http [--port 8791] [--relay URL]\n  truyn provider --provider <openai|anthropic> --capability <name[,name]> [--relay URL]`);
}

main().catch((error) => {
  process.stderr.write(`TRUYN error: ${error.message}\n`);
  process.exitCode = 1;
});
