import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SELF = 'tests/public-repository.test.js';
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT_EXTENSIONS = new Set(['.md', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.toml', '.txt', '.proto', '.sh', '.ps1', '.cmd', '.html', '.css']);
const ALLOWED_WORKFLOWS = new Set(['.github/workflows/.gitkeep', '.github/workflows/ci.yml']);

const forbiddenPathFragments = [
  '.github/workflows/cloud-poc-',
  '.github/workflows/owner-identity-',
  '.github/workflows/smoke-',
  'config/owner-benchmark',
  'docs/benchmarks/CROSS_CLOUD_AB_',
  'docs/benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_',
  'docs/benchmarks/CONTEXT_EFFICIENCY_',
  'docs/benchmarks/SEMANTIC_RETRIEVAL_GATE_',
  'docs/providers/MULTICLOUD_PROVIDER_IMPLEMENTATION_STATUS_',
  'benchmarks/gemini-direct-proxy',
  'benchmarks/cross-cloud-ab',
  'benchmarks/context-ref-delta-ab',
  'benchmarks/semantic-retrieval-ab',
  'examples/cross-cloud-ai-proof',
  'runtime/vertex-claude-probe',
  'scripts/smoke/'
];

const forbiddenLiteralMarkers = [
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_TENANT_ID',
  'GCP_WIF_PROVIDER',
  'GCP_PROJECT_NUMBER',
  'GCP_DEPLOYER_SERVICE_ACCOUNT_EMAIL',
  'GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_TOKENS',
  'CLOUDFLARE_ZONE_ID',
  'CLOUDFLARE_ACCOUNT_ID',
  'benchmark-requester-identity',
  'owner-benchmark',
  'truyn-frontdoor',
  'truyn-edge-',
  'relay-origin-group',
  'truyn-gpt-4-1-mini',
  'truyn-gemini',
  '1334540181',
  'github.com/inn-media/truyn/actions/runs/'
];

const forbiddenCredentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/
];

const forbiddenTopologyPatterns = [
  /https?:\/\/[A-Za-z0-9.-]+\.azurecontainerapps\.io\b/i,
  /https?:\/\/[A-Za-z0-9.-]+\.run\.app\b/i,
  /https?:\/\/[A-Za-z0-9.-]+\.vault\.azure\.net\b/i,
  /https?:\/\/[A-Za-z0-9.-]+\.blob\.core\.windows\.net\b/i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com\b/i,
  /\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\bprojects\/[0-9]{6,}\b/,
  /\bworkloadIdentityPools\/[A-Za-z0-9._-]+\/providers\/[A-Za-z0-9._-]+\b/
];

async function collect(dir = ROOT, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(ROOT, absolute).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await collect(absolute, out);
      continue;
    }
    out.push({ absolute, relative });
  }
  return out;
}

test('public repository contains no known operational/cloud leakage or credential patterns', async () => {
  const files = await collect();
  const violations = [];

  for (const file of files) {
    if (file.relative === SELF) continue;
    if (file.relative.startsWith('.github/workflows/') && !ALLOWED_WORKFLOWS.has(file.relative)) {
      violations.push(`${file.relative}: workflow is not on the public allowlist`);
    }
    for (const fragment of forbiddenPathFragments) {
      if (file.relative.includes(fragment)) violations.push(`${file.relative}: forbidden operational path category`);
    }

    const ext = path.extname(file.relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !['Dockerfile', 'LICENSE', 'VERSION'].includes(path.basename(file.relative))) continue;
    let content;
    try { content = await readFile(file.absolute, 'utf8'); } catch { continue; }

    for (const marker of forbiddenLiteralMarkers) {
      if (content.includes(marker)) violations.push(`${file.relative}: forbidden operational marker category`);
    }
    for (const pattern of forbiddenCredentialPatterns) {
      if (pattern.test(content)) violations.push(`${file.relative}: credential/private-key pattern detected`);
    }
    for (const pattern of forbiddenTopologyPatterns) {
      if (pattern.test(content)) violations.push(`${file.relative}: live operational topology pattern detected`);
    }
  }

  assert.deepEqual(violations, [], `Public repository leakage guard failed:\n${violations.join('\n')}`);
});
