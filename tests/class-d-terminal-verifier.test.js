import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function evidence(remainingResources = 0) {
  return {
    scope: '100-real-process-resilience', testedCommit: 'abc123', workflowRunId: '42',
    topology: { nodeCount: 100, realProcessCount: 100, hostCount: 4, uniqueIdentityCount: 100, uniqueEndpointCount: 100 },
    baseline: { routingSuccess: 0.995 },
    adversarial: {
      randomizedChurn: { stopped: 8, restarted: 8 },
      packetPartition: { realPacketPath: true, blockedSuccesses: 0 },
      byzantineReplica: { invalidSignedStateAccepted: 0 },
      sybilPressure: { attackerNodes: 33 },
      eclipse: { exercised: true },
      collusion: { colluders: 3 }
    },
    hardInvariants: { acknowledgedDurableWriteLoss: 0, invalidSignedStateAccepted: 0, staleOrRevokedReceiptAccepted: 0 },
    healed: { routingSuccess: 0.995, recoveryP95Ms: 25000 },
    cleanup: { confirmed: true, remainingResources }
  };
}

function run(raw) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-d100-terminal-'));
  const path = join(dir, 'evidence.json');
  writeFileSync(path, JSON.stringify(raw));
  const result = spawnSync(process.execPath, ['benchmarks/scale/verify-class-d-terminal.js', path], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test('strict terminal verifier accepts canonical D-100 evidence with zero remaining resources', () => {
  const result = run(evidence(0));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.checks.zeroRemainingResources, true);
});

test('strict terminal verifier rejects confirmed cleanup with nonzero remaining resources', () => {
  const result = run(evidence(1));
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failed.includes('zeroRemainingResources'));
});
