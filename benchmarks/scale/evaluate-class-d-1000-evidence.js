#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateAzureClassD1000Evidence } from './class-d-1000-evidence.js';

const path = resolve(process.argv[2] || 'class-d-1000-evidence.json');
let raw;
try {
  raw = JSON.parse(await readFile(path, 'utf8'));
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'class_d_1000_evidence_unreadable', message: error.message })}\n`);
  process.exit(2);
}

const result = evaluateAzureClassD1000Evidence(raw);
process.stdout.write(`${JSON.stringify({
  ok: true,
  class: result.class,
  passed: result.passed,
  failed: result.failed,
  checks: result.checks,
  thresholds: result.thresholds,
  derivation: result.derivation,
  normalized: result.normalized
})}\n`);
process.exit(result.passed ? 0 : 1);
