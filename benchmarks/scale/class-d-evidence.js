import { evaluateClassD100 } from './class-d.js';

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeAzureClassD100Evidence(raw = {}) {
  const recoveryP95Ms = finite(raw?.healed?.recoveryP95Ms, Infinity);
  const normalized = {
    topology: {
      realNodeCount: finite(raw?.topology?.realProcessCount ?? raw?.topology?.nodeCount, 0),
      distinctIdentityCount: finite(raw?.topology?.uniqueIdentityCount, 0),
      distinctQuicSocketCount: finite(raw?.topology?.uniqueEndpointCount, 0),
      hostCount: finite(raw?.topology?.hostCount, 0)
    },
    routing: {
      baselineSuccessRatio: finite(raw?.baseline?.routingSuccess, 0),
      healedSuccessRatio: finite(raw?.healed?.routingSuccess, 0)
    },
    recovery: { latencyMs: { p95: recoveryP95Ms } },
    // The bounded 100-node campaign defines convergence as restoration of the
    // healed routing set after packet partition/churn. Keep the derivation
    // explicit so a future campaign can replace it with an independent metric.
    convergence: { latencyMs: { p95: recoveryP95Ms } },
    safety: {
      acknowledgedWriteLossCount: finite(raw?.hardInvariants?.acknowledgedDurableWriteLoss, Infinity),
      invalidSignedStateAcceptedCount: finite(raw?.hardInvariants?.invalidSignedStateAccepted, Infinity),
      staleRevokedReceiptAcceptedCount: finite(raw?.hardInvariants?.staleOrRevokedReceiptAccepted, Infinity)
    },
    adversarial: {
      churn: {
        exercised: finite(raw?.adversarial?.randomizedChurn?.stopped, 0) > 0 &&
          finite(raw?.adversarial?.randomizedChurn?.restarted, 0) > 0
      },
      packetPartition: {
        exercised: raw?.adversarial?.packetPartition?.realPacketPath === true &&
          finite(raw?.adversarial?.packetPartition?.blockedSuccesses, Infinity) === 0
      },
      byzantine: { exercised: raw?.adversarial?.byzantineReplica != null },
      sybil: { exercised: finite(raw?.adversarial?.sybilPressure?.attackerNodes, 0) > 0 },
      eclipse: { exercised: raw?.adversarial?.eclipse?.exercised === true },
      collusion: { exercised: finite(raw?.adversarial?.collusion?.colluders, 0) > 0 }
    },
    cleanup: {
      complete: raw?.cleanup?.confirmed === true,
      remainingResources: finite(raw?.cleanup?.remainingResources, Infinity)
    }
  };

  return {
    normalized,
    derivation: {
      source: raw?.scope || 'unknown',
      testedCommit: raw?.testedCommit || null,
      workflowRunId: raw?.workflowRunId || null,
      convergenceMetric: 'healed.recoveryP95Ms',
      cleanupMetric: 'cleanup.confirmed + cleanup.remainingResources'
    }
  };
}

export function evaluateAzureClassD100Evidence(raw = {}) {
  const { normalized, derivation } = normalizeAzureClassD100Evidence(raw);
  return { ...evaluateClassD100(normalized), normalized, derivation };
}
