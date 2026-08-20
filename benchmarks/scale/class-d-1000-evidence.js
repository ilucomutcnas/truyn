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
      syntheticNodeCount: finite(raw?.topology?.syntheticNodeCount, Infinity),
      hostCount: finite(raw?.topology?.hostCount, 0)
    },
    routing: {
      baselineSuccessRatio: finite(raw?.routing?.baselineSuccessRatio, 0),
      // The current pure scale harness performs deterministic node restarts and
      // then measures post-restart routing. Treat that as the initial D-1000
      // healed-routing signal; a future packet-partition scale campaign may
      // replace this derivation with an independently named healed metric.
      healedSuccessRatio: finite(raw?.routing?.healedSuccessRatio ?? raw?.routing?.postRestartSuccessRatio, 0)
    },
    convergence: {
      latencyMs: { p95: finite(raw?.convergence?.latencyMs?.p95, Infinity) }
    },
    recovery: {
      latencyMs: { p95: finite(raw?.recovery?.latencyMs?.p95, Infinity) }
    },
    safety: {
      acknowledgedWriteLossCount: finite(raw?.safety?.acknowledgedWriteLossCount, Infinity),
      invalidSignedStateAcceptedCount: finite(raw?.safety?.invalidSignedStateAcceptedCount, Infinity),
      staleRevokedReceiptAcceptedCount: finite(raw?.safety?.staleRevokedReceiptAcceptedCount, Infinity),
      unauthorizedProviderExecutionCount: finite(raw?.safety?.unauthorizedProviderExecutionCount, Infinity)
    },
    cleanup: {
      complete: raw?.cleanup?.confirmed === true || raw?.cleanup?.complete === true,
      remainingResources: finite(raw?.cleanup?.remainingResources, Infinity)
    }
  };
  return {
    normalized,
    derivation: {
      source: raw?.scope || 'unknown',
      testedCommit: raw?.testedCommit || null,
      workflowRunId: raw?.workflowRunId || null,
      healedRoutingMetric: raw?.routing?.healedSuccessRatio != null
        ? 'routing.healedSuccessRatio'
        : 'routing.postRestartSuccessRatio',
      convergenceMetric: 'convergence.latencyMs.p95',
      recoveryMetric: 'recovery.latencyMs.p95',
      cleanupMetric: 'cleanup.confirmed/complete + cleanup.remainingResources'
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
