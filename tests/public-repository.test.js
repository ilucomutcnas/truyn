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
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /(?:sk|rk)-(?:live|test)-[A-Za-z0-9_-]{16,}/i,
  /AccountKey=[A-Za-z0-9+/=]{20,}/i,
  /(?:client_secret|api[_-]?key|access[_-]?token|bearer)\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{20,}/i
];

const forbiddenOperationalMarkers = [
  /\baz\s+(?:login|account|containerapp|resource|rest|deployment|group|network|vm|acr)\b/i,
  /\bgcloud\s+(?:auth|run|projects|artifacts|iam|compute|services|storage)\b/i,
  /\bwrangler\s+(?:secret|deploy|versions|rollback|kv|r2|d1)\b/i,
  /management\.azure\.com/i,
  /cloudflare\.com\/client\/v4/i,
  /x-truyn-origin-token/i
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function normalize(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function isTextFile(relative) {
  return TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase()) || relative.endsWith('/Dockerfile') || path.basename(relative).startsWith('Dockerfile');
}

function isExecutableSource(relative) {
  return EXECUTABLE_EXTENSIONS.has(path.extname(relative).toLowerCase()) || relative.startsWith('.github/workflows/');
}

async function read(relative) {
  return readFile(path.join(ROOT, relative), 'utf8');
}

test('published benchmark evidence is preserved and not replaced by stubs', async () => {
  for (const evidence of protectedBenchmarkEvidence) {
    const content = await read(evidence.path);
    assert.ok(Buffer.byteLength(content, 'utf8') >= evidence.minBytes, `${evidence.path}: benchmark evidence unexpectedly truncated`);
    for (const marker of evidence.markers) assert.ok(content.includes(marker), `${evidence.path}: missing benchmark marker ${marker}`);
  }
});

test('public repository contains no known operational/cloud leakage or credential patterns', async () => {
  const files = await walk(ROOT);
  const errors = [];
  for (const file of files) {
    const relative = normalize(file);
    if (relative === SELF || relative.startsWith(BENCHMARK_EVIDENCE_DIR)) continue;

    if (relative.startsWith('.github/workflows/') && !ALLOWED_WORKFLOWS.has(relative)) {
      errors.push(`${relative}: workflow is not on the public allowlist`);
    }

    if (forbiddenPathFragments.some((fragment) => relative.includes(fragment)) || forbiddenPathPatterns.some((pattern) => pattern.test(relative))) {
      errors.push(`${relative}: forbidden operational path category`);
    }

    if (!isTextFile(relative)) continue;
    const content = await readFile(file, 'utf8');
    for (const literal of forbiddenLiteralMarkers) {
      if (content.includes(literal)) errors.push(`${relative}: forbidden operational marker category`);
    }
    for (const pattern of forbiddenCredentialPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) errors.push(`${relative}: credential/private-key pattern`);
    }
    if (isExecutableSource(relative)) {
      for (const pattern of forbiddenOperationalMarkers) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) errors.push(`${relative}: forbidden operational marker category`);
      }
    }
  }
  assert.deepEqual(errors, [], errors.join('\n'));
});
