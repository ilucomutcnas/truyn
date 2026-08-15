import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

const evidenceLedger = [
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
    path: 'docs/benchmarks/SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md',
    minBytes: 5000,
    markers: ['# TRUYN Semantic Retrieval Gate — 7-Actor Production Evidence', '## Evidence', '## Per-actor stability', '## Scaling findings discovered by the run']
  },
  {
    path: 'docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md',
    minBytes: 3000,
    markers: ['# TRUYN Multimodal Provider Parity Benchmark', 'Status: **planned methodology', '## Principle']
  }
];

test('benchmark evidence ledger remains present, substantive and auditable', async () => {
  for (const evidence of evidenceLedger) {
    const absolute = path.join(ROOT, evidence.path);
    let content;
    try {
      content = await readFile(absolute, 'utf8');
    } catch (error) {
      assert.fail(`${evidence.path}: benchmark evidence is missing (${error.code ?? error.message})`);
    }

    assert.ok(
      Buffer.byteLength(content, 'utf8') >= evidence.minBytes,
      `${evidence.path}: benchmark evidence was unexpectedly truncated or replaced by a stub`
    );

    for (const marker of evidence.markers) {
      assert.ok(content.includes(marker), `${evidence.path}: benchmark evidence lost required marker: ${marker}`);
    }
  }
});
