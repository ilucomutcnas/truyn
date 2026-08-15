import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { nodeIdFromPublicKey } from '../core/protocol/index.js';

const relayUrl = process.env.TRUYN_RELAY_ORIGIN;
const ownerIdentityB64 = process.env.TRUYN_OWNER_IDENTITY_B64;
const outputPath = process.env.TRUYN_OWNER_FLEET_PROOF_OUTPUT || 'artifacts/owner-fleet-proof.json';

if (!relayUrl) throw new Error('TRUYN_RELAY_ORIGIN is required');
if (!ownerIdentityB64) throw new Error('TRUYN_OWNER_IDENTITY_B64 is required');

const ownerIdentity = JSON.parse(Buffer.from(ownerIdentityB64, 'base64').toString('utf8'));
const ownerNodeId = nodeIdFromPublicKey(ownerIdentity.publicKeyPem);
if (ownerIdentity.nodeId && ownerIdentity.nodeId !== ownerNodeId) throw new Error('Owner identity nodeId mismatch');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForOffer(node, capability, timeoutMs = 180_000) {
  const startedAt = Date.now();
  let attempts = 0;
  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1;
    const found = await node.find(capability);
    if (found.offers?.length) {
      return {
        capability,
        providerNodeId: found.offers[0].from,
        discoveryLatencyMs: Date.now() - startedAt,
        attempts
      };
    }
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for protected OFFER ${capability}`);
}

const report = {
  proof: 'TRUYN protected owner provider fleet',
  generatedAt: new Date().toISOString(),
  ownerNodeId,
  relayRegistrationGate: null,
  discoveries: [],
  textCanaries: [],
  claims: {
    externalRegistrationDenied: false,
    ownerRequesterRegistered: false,
    protectedProvidersDiscovered: false,
    textNetworkCanariesPassed: false,
    mediaInferenceExecuted: false
  }
};

// A fresh foreign identity must be denied before it can obtain a relay session.
const foreign = new TruynNode({ relayUrl, identity: createIdentity() });
try {
  await foreign.register({ name: 'foreign-negative-proof' });
  throw new Error('Foreign requester unexpectedly registered');
} catch (error) {
  if (error?.status !== 403 || error?.body?.error !== 'registration_denied') throw error;
  report.relayRegistrationGate = { status: 403, error: 'registration_denied' };
  report.claims.externalRegistrationDenied = true;
}

const owner = new TruynNode({ relayUrl, identity: ownerIdentity });
await owner.register({ name: 'owner-benchmark-requester' });
report.claims.ownerRequesterRegistered = true;

const capabilities = [
  'owner.benchmark.gpt',
  'owner.benchmark.grok',
  'owner.benchmark.deepseek',
  'owner.benchmark.llama',
  'owner.benchmark.mistral',
  'owner.benchmark.kimi',
  'owner.benchmark.gpt-image',
  'owner.benchmark.gemini'
];
for (const capability of capabilities) report.discoveries.push(await waitForOffer(owner, capability));
report.claims.protectedProvidersDiscovered = report.discoveries.length === capabilities.length;

const textAliases = ['gpt', 'grok', 'deepseek', 'llama', 'mistral', 'kimi', 'gemini'];
for (const alias of textAliases) {
  const capability = `owner.benchmark.${alias}`;
  const startedAt = Date.now();
  const providerOptions = alias === 'kimi'
    ? { temperature: 0, maxTokens: 512 }
    : alias === 'gemini'
      ? { thinkingBudget: 0 }
      : { temperature: 0, maxTokens: 64 };
  const result = await owner.compactNeed(
    capability,
    'Reply with exactly one short word: OK',
    { purpose: 'owner-fleet-access-canary', providerOptions },
    { waitMs: 120_000 }
  );
  if (!result.verification?.ok) throw new Error(`${alias} RESULT signature verification failed`);
  if (result.metadata?.failed) throw new Error(`${alias} protected provider returned failure`);
  if (typeof result.output !== 'string' || result.output.trim().length === 0) throw new Error(`${alias} returned empty output`);
  report.textCanaries.push({
    alias,
    capability,
    providerNodeId: result.provider,
    signatureVerified: true,
    endToEndLatencyMs: Date.now() - startedAt,
    providerLatencyMs: result.metadata?.providerLatencyMs ?? result.metadata?.latencyMs ?? null,
    usage: result.metadata?.usage || null
  });
}
report.claims.textNetworkCanariesPassed = report.textCanaries.length === textAliases.length;

// Image/video generation is intentionally not executed here. Earlier isolated smoke evidence remains authoritative.
report.claims.mediaInferenceExecuted = false;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  ownerNodeId,
  externalRegistrationDenied: report.claims.externalRegistrationDenied,
  protectedProviderCount: report.discoveries.length,
  textCanaryCount: report.textCanaries.length,
  mediaInferenceExecuted: false,
  outputPath
}));
