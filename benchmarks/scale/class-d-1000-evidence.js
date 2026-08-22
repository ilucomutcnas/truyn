import { evaluateClassD1000 } from './class-d.js';

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validInvalidSignedStateProbe(raw = {}) {
  const probe = raw?.safety?.probes?.invalidSignedState;
  return probe?.remoteQuicControl === true &&
    probe?.targetRejected === true &&
    finite(probe?.validRecordAcks, 0) >= 2 &&
    probe?.rejectionReason === 'invalid_dht_record:dht_record_signature';
}

function validStaleReceiptProbe(raw = {}) {
  const probe = raw?.safety?.probes?.staleReceipt;
  return probe?.exactCommitLocalVerifier === true &&
    probe?.reason === 'trust_receipt_v2_lifecycle_head_stale';
}

function validProviderAuthorizationProbe(raw = {}) {
  const probe = raw?.safety?.probes?.providerAuthorization;
  return probe?.exactCommitAdapterHost === true &&
    probe?.accessDenied === true &&
    finite(probe?.adapterExecutions, Infinity) === 0;
}

function validPacketPartitionProbe(raw = {}) {
  const probe = raw?.adversarial?.packetPartition;
  return probe?.exercised === true &&
    probe?.realPacketPath === true &&
    finite(probe?.probeCount, 0) > 0 &&
    finite(probe?.blockedSuccesses, Infinity) === 0;
}

export function normalizeAzureClassD1000Evidence(raw = {}) {
  const invalidSignedStateProbe = validInvalidSignedStateProbe(raw);
  const staleReceiptProbe = validStaleReceiptProbe(raw);
  const providerAuthorizationProbe = validProviderAuthorizationProbe(raw);
  const packetPartitionProbe = validPacketPartitionProbe(raw);

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
      // D-1000 healed routing is accepted only when it follows an evidenced
      // real packet-path partition. Post-restart routing remains useful
      // telemetry but no longer substitutes for the strict healed gate.
      healedSuccessRatio: packetPartitionProbe
        ? finite(raw?.routing?.healedSuccessRatio, 0)
        : 0
    },
    convergence: {
      latencyMs: { p95: finite(raw?.convergence?.latencyMs?.p95, Infinity) }
    },
    recovery: {
      latencyMs: { p95: finite(raw?.recovery?.latencyMs?.p95, Infinity) }
    },
    safety: {
      acknowledgedWriteLossCount: finite(raw?.safety?.acknowledgedWriteLossCount, Infinity),
      invalidSignedStateAcceptedCount: invalidSignedStateProbe
        ? finite(raw?.safety?.invalidSignedStateAcceptedCount, Infinity)
        : Infinity,
      staleRevokedReceiptAcceptedCount: staleReceiptProbe
        ? finite(raw?.safety?.staleRevokedReceiptAcceptedCount, Infinity)
        : Infinity,
      unauthorizedProviderExecutionCount: providerAuthorizationProbe
        ? finite(raw?.safety?.unauthorizedProviderExecutionCount, Infinity)
        : Infinity
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
      healedRoutingMetric: packetPartitionProbe ? 'routing.healedSuccessRatio after real packet partition' : 'missing/invalid packet-partition proof',
      invalidSignedStateMetric: invalidSignedStateProbe ? 'target-side QUIC dht.store rejection of signature-tampered record' : 'missing/invalid remote QUIC rejection proof',
      invalidSignedStateProbe,
      staleReceiptProbe,
      providerAuthorizationProbe,
      packetPartitionProbe,
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
