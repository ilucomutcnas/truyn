import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function evidence(remainingResources = 0) {
  return {
    scope: '1000-real-process-scale+safety-contract-v2',
    testedCommit: 'abc123',
    workflowRunId: '42',
    topology: {
      nodeCount: 1000,
      realProcessCount: 1000,
      hostCount: 20,
      uniqueIdentityCount: 1000,
      uniqueEndpointCount: 1000,
      syntheticNodeCount: 0
    },
    routing: {
      baselineSuccessRatio: 0.995,
      postRestartSuccessRatio: 0.994,
      healedSuccessRatio: 0.993
    },
    convergence: { latencyMs: { p95: 120000 } },
    recovery: { latencyMs: { p95: 130000 } },
    adversarial: {
      packetPartition: {
        exercised: true,
        realPacketPath: true,
        probeCount: 20,
        blockedSuccesses: 0,
        recoveryMs: 10000
      }
    },
    safety: {
      acknowledgedWriteLossCount: 0,
      invalidSignedStateAcceptedCount: 0,
      staleRevokedReceiptAcceptedCount: 0,
      unauthorizedProviderExecutionCount: 0,
      probes: {
        invalidSignedState: {
          realNetworkDht: true,
          validRecordAcks: 3,
          forgedStoreHttpCode: '500'
        },
        staleReceipt: {
          exactCommitLocalVerifier: true,
          reason: 'trust_receipt_v2_lifecycle_head_stale'
        },
        providerAuthorization: {
          exactCommitAdapterHost: true,
          accessDenied: true,
          adapterExecutions: 0
        }
      }
    },
    cleanup: { confirmed: true, remainingResources }
  };
}

function run(raw) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-d1000-terminal-'));
  const path = join(dir, 'evidence.json');
  writeFileSync(path, JSON.stringify(raw));
  const result = spawnSync(process.execPath, ['benchmarks/scale/verify-class-d-1000-terminal.js', path], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test('strict terminal verifier accepts complete probe-backed D-1000 evidence with zero remaining resources', () => {
  const result = run(evidence(0));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.checks.packetPartitionProbe, true);
  assert.equal(parsed.checks.invalidSignedStateProbe, true);
  assert.equal(parsed.checks.staleReceiptProbe, true);
  assert.equal(parsed.checks.providerAuthorizationProbe, true);
  assert.equal(parsed.checks.zeroRemainingResources, true);
  assert.equal(parsed.checks.noUnauthorizedProviderExecution, true);
});

test('strict terminal verifier rejects nonzero remaining resources', () => {
  const result = run(evidence(1));
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failed.includes('zeroRemainingResources'));
});

test('strict terminal verifier rejects missing safety evidence', () => {
  const raw = evidence(0);
  delete raw.safety.invalidSignedStateAcceptedCount;
  const result = run(raw);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failed.includes('canonicalEvaluator'));
  assert.ok(parsed.failed.includes('noInvalidSignedStateAccepted'));
});

test('strict terminal verifier rejects hardcoded zero counters without probe provenance', () => {
  const raw = evidence(0);
  delete raw.safety.probes;
  const result = run(raw);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failed.includes('canonicalEvaluator'));
  assert.ok(parsed.failed.includes('invalidSignedStateProbe'));
  assert.ok(parsed.failed.includes('staleReceiptProbe'));
  assert.ok(parsed.failed.includes('providerAuthorizationProbe'));
});

test('strict terminal verifier rejects healed routing without real packet-partition proof', () => {
  const raw = evidence(0);
  delete raw.adversarial.packetPartition;
  raw.routing.healedSuccessRatio = 1;
  const result = run(raw);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failed.includes('canonicalEvaluator'));
  assert.ok(parsed.failed.includes('packetPartitionProbe'));
  assert.ok(parsed.failed.includes('healedRouting'));
});
