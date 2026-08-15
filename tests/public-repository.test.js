import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT_EXTENSIONS = new Set(['.md', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.toml', '.txt', '.proto', '.sh', '.ps1', '.cmd', '.html', '.css']);

const forbiddenPathFragments = [
  '.github/workflows/cloud-poc-',
  'docs/benchmarks/CROSS_CLOUD_AB_',
  'docs/benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_',
  'docs/benchmarks/CONTEXT_EFFICIENCY_',
  'docs/benchmarks/SEMANTIC_RETRIEVAL_GATE_',
  'benchmarks/gemini-direct-proxy',
  'examples/cross-cloud-ai-proof'
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
  'truyn-frontdoor',
  'truyn-edge-',
  'relay-origin-group',
  'truyn-gpt-4-1-mini',
  'truyn-gemini',
  '1334540181',
  'iam.gserviceaccount.com',
  'github.com/inn-media/truyn/actions/runs/'
];

const forbiddenCredentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/
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
    for (const fragment of forbiddenPathFragments) {
      if (file.relative.includes(fragment)) violations.push(`${file.relative}: forbidden path ${fragment}`);
    }

    const ext = path.extname(file.relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !['Dockerfile', 'LICENSE', 'VERSION'].includes(path.basename(file.relative))) continue;
    let content;
    try { content = await readFile(file.absolute, 'utf8'); } catch { continue; }

    for (const marker of forbiddenLiteralMarkers) {
      if (content.includes(marker)) violations.push(`${file.relative}: forbidden operational marker ${marker}`);
    }
    for (const pattern of forbiddenCredentialPatterns) {
      if (pattern.test(content)) violations.push(`${file.relative}: credential/private-key pattern ${pattern}`);
    }
  }

  assert.deepEqual(violations, [], `Public repository leakage guard failed:\n${violations.join('\n')}`);
});
