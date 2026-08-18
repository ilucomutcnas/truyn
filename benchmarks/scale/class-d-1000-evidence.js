import { evaluateClassD1000 } from './class-d.js';

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeAzureClassD1000Evidence(raw = {}) {
  const normalized = {
    topology: {
      realNodeCount: finite(raw?.topology?.realProcessCount ?? raw?.topology?.nodeCount, 0),
      distinctIdentityCount: finite(raw?.topology?.uniqueIdentityCount, 0),
      distinctQuicSocketCount: finite(raw?.topology?.uniqueEndpointCount, 0),
      hostCount: finite(raw?.topology?.hostCount, 0)
    },
    routing: {
      baselineSuccessRatio: finite(raw?.routing?.baselineSuccessRatio, 0)
    },
    convergence: {
      latencyMs: { p95: finite(raw?.convergence?.latencyMs?.p95, Infinity) }
    },
    recovery: {
      latencyMs: { p95: finite(raw?.recovery?.latencyMs?.p95, Infinity) }
    },
    safety: {
      acknowledgedWriteLossCount: finite(raw?.safety?.acknowledgedWriteLossCount, Infinity)
    },
    cleanup: {
      complete: raw?.cleanup?.confirmed === true
    }
  };
  return {
    normalized,
    derivation: {
      source: raw?.scope || 'unknown',
      testedCommit: raw?.testedCommit || null,
      workflowRunId: raw?.workflowRunId || null,
      convergenceMetric: 'convergence.latencyMs.p95',
      recoveryMetric: 'recovery.latencyMs.p95',
      cleanupMetric: 'cleanup.confirmed'
    }
  };
}

export function evaluateAzureClassD1000Evidence(raw = {}) {
  const { normalized, derivation } = normalizeAzureClassD1000Evidence(raw);
  return {
    ...evaluateClassD1000(normalized),
    normalized,
    derivation
  };
}
