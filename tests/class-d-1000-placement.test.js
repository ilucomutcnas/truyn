import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClassD1000Placement, assertRealClassD1000Placement } from '../benchmarks/scale/class-d-1000-placement.js';

test('D-1000 placement is exactly 1000 independent process slots across at least ten hosts', () => {
  const placement = buildClassD1000Placement();
  const result = assertRealClassD1000Placement(placement);
  assert.equal(result.passed, true);
  assert.equal(result.nodeProcesses, 1000);
  assert.equal(result.hostFailureDomains, 10);
  assert.equal(result.distinctIdentityPaths, 1000);
  assert.equal(result.distinctStatePaths, 1000);
  assert.equal(result.distinctQuicSockets, 1000);
  assert.equal(placement.minProcessesPerHost, 100);
  assert.equal(placement.maxProcessesPerHost, 100);
});

test('D-1000 placement refuses fewer than ten host failure domains', () => {
  assert.throws(() => buildClassD1000Placement({ hostCount: 9 }), /hostCount must be >= 10/);
});

test('D-1000 placement cannot be promoted when node slots are missing', () => {
  const placement = buildClassD1000Placement();
  placement.hosts[0].nodes.pop();
  assert.equal(assertRealClassD1000Placement(placement).passed, false);
});
