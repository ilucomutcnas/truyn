import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SELF = 'tests/public-repository.test.js';
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT_EXTENSIONS = new Set(['.md', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.toml', '.txt', '.proto', '.sh', '.ps1', '.cmd', '.html', '.css']);
const EXECUTABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.sh', '.ps1', '.cmd']);
const ALLOWED_WORKFLOWS = new Set(['.github/workflows/.gitkeep', '.github/workflows/ci.yml', '.github/workflows/scale-gate.yml']);
const BENCHMARK_EVIDENCE_DIR = 'docs/benchmarks/';

const protectedBenchmarkEvidence = [
  {
    path: 'docs/benchmarks/CROSS_CLOUD_AB_2026-08-15.md',
    minBytes: 5000,
    markers: ['# TRUYN Cross-Cloud A/B Benchmark', '## Evidence', '## Primary measured result', '## Per-sample evidence']
  },
  {
    path: 'docs/benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md',
    minBytes: 3000,
    markers: ['# TRUYN Cross-Cloud 8× Hot-Path Optimization', '## Final evidence', '## Fixed-gate result', '## Final relay trace']
  },
  {
    path: 'docs/benchmarks/CONTEXT_EFFICIENCY_2026-08-15.md',
    minBytes: 5000,
    markers: ['# TRUYN Content-Addressed Context Economic A/B', '## Evidence', '## Economic result', '## What this result does NOT yet prove']
  },
  {
    path: 'docs/benchmarks/SEMANTIC_RETRIEVAL_GATE_2026-08-15.md',
    minBytes: 4000,
    markers: ['# TRUYN Semantic Retrieval Gate', '## Evidence', '## Gate contract', '## Retrieval and provenance proof']
  },
  {
    path: 'docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md',
    minBytes: 3000,
    markers: ['# TRUYN Multimodal Provider Parity Benchmark', 'Status: **planned methodology', '## Principle']
  }
];

const forbiddenPathFragments = [
  '.github/workflows/cloud-poc-',
  '.github/workflows/owner-identity-',
  '.github/workflows/smoke-',
  '.github/workflows/deploy-protected-owner-',
  '.github/workflows/deploy-owner-',
  'config/owner-benchmark',
  'docs/providers/MULTICLOUD_PROVIDER_IMPLEMENTATION_STATUS_',
  'benchmarks/gemini-direct-proxy',
  'benchmarks/cross-cloud-ab',
  'benchmarks/context-ref-delta-ab',
  'benchmarks/semantic-retrieval-ab',
  'examples/cross-cloud-ai-proof',
  'runtime/vertex-claude-probe',
  'scripts/deploy/azure-owner-',
  'scripts/deploy/gcp-owner-',
  'scripts/prove-owner-fleet',
  'scripts/smoke/'
];

const forbiddenPathPatterns = [
  /^benchmarks\/.*proxy.*\.(?:js|mjs|cjs|sh|ps1|cmd)$/i,
  /^benchmarks\/Dockerfile\..*proxy/i,
  /^benchmarks\/.*(?:multiactor|multi-actor).*\.(?:js|mjs|cjs|sh|ps1|cmd)$/i
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

const forbiddenOperationalExecutablePatterns = [
  /\bGCE_METADATA_HOST\b/,
  /computeMetadata\/v1\/instance\/service-accounts\/default\/token/,
  /\bBENCHMARK_PROXY_TOKEN\b/,
  /process\.env\.AZURE_OPENAI_API_KEY\b/,
  /process\.env\.AZURE_FOUNDRY_API_KEY\b/,
  /process\.env\.GCP_ACCESS_TOKEN\b/
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

test('published benchmark evidence is preserved and not replaced by stubs', async () => {
  for (const evidence of protectedBenchmarkEvidence) {
    const absolute = path.join(ROOT, evidence.path);
    let content;
    try {
      content = await readFile(absolute, 'utf8');
    } catch (error) {
      assert.fail(`${evidence.path}: protected benchmark evidence is missing (${error.code ?? error.message})`);
    }
    assert.ok(Buffer.byteLength(content, 'utf8') >= evidence.minBytes, `${evidence.path}: protected benchmark evidence was unexpectedly truncated`);
    for (const marker of evidence.markers) {
      assert.ok(content.includes(marker), `${evidence.path}: protected benchmark evidence lost required marker: ${marker}`);
    }
  }
});

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
    for (const pattern of forbiddenPathPatterns) {
      if (pattern.test(file.relative)) violations.push(`${file.relative}: forbidden operational path pattern`);
    }

    const ext = path.extname(file.relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !['Dockerfile', 'LICENSE', 'VERSION'].includes(path.basename(file.relative))) continue;
    let content;
    try { content = await readFile(file.absolute, 'utf8'); } catch { continue; }

    const isBenchmarkEvidence = file.relative.startsWith(BENCHMARK_EVIDENCE_DIR);
    for (const marker of forbiddenLiteralMarkers) {
      // GitHub Actions run URLs are reproducibility evidence in sanitized benchmark reports.
      // They remain forbidden elsewhere because arbitrary run links can expose operational context.
      if (isBenchmarkEvidence && marker === 'github.com/inn-media/truyn/actions/runs/') continue;
      if (content.includes(marker)) violations.push(`${file.relative}: forbidden operational marker category`);
    }
    for (const pattern of forbiddenCredentialPatterns) {
      if (pattern.test(content)) violations.push(`${file.relative}: credential/private-key pattern detected`);
    }
    for (const pattern of forbiddenTopologyPatterns) {
      if (pattern.test(content)) violations.push(`${file.relative}: live operational topology pattern detected`);
    }
    if ((file.relative.startsWith('benchmarks/') || file.relative.startsWith('scripts/')) && EXECUTABLE_EXTENSIONS.has(ext)) {
      for (const pattern of forbiddenOperationalExecutablePatterns) {
        if (pattern.test(content)) violations.push(`${file.relative}: operational cloud credential/proxy code detected`);
      }
    }
  }

  assert.deepEqual(violations, [], `Public repository leakage guard failed:\n${violations.join('\n')}`);
});