import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createIdentity } from '../core/identity/index.js';
import { contextQueryHash } from '../core/context/index.js';
import { createAttestation, createClaimFromRetrievedContext } from '../core/claims/index.js';
import { assessClaimEvidence, createTrustReceipt, verifyTrustReceipt } from '../core/trust/index.js';

const CASES_PER_SCENARIO = Number.parseInt(process.env.TRUSTABILITY_CASES_PER_SCENARIO || '100', 10);
const OUTPUT = process.env.TRUSTABILITY_OUTPUT || 'claim-trustability-v1.json';
const SCENARIOS = [
  'independent_support',
  'correlated_echo',
  'unknown_sybil',
  'independent_dispute',
  'independent_contradiction',
  'retrieval_tamper'
];

if (!Number.isInteger(CASES_PER_SCENARIO) || CASES_PER_SCENARIO < 1 || CASES_PER_SCENARIO > 10_000) {
  throw new Error('TRUSTABILITY_CASES_PER_SCENARIO must be 1..10000');
}

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const round = (value, digits = 6) => Number(value.toFixed(digits));

const issuer = createIdentity();
const receiptVerifier = createIdentity();
const attesterPool = Array.from({ length: 12 }, () => createIdentity());

function retrievalFixture(caseKey) {
  const rootCid = `truyn:ctx:${sha256(`root:${caseKey}`)}`;
  const question = `What is the authoritative value for case ${caseKey}?`;
  const answer = `The authoritative value for ${caseKey} is value-${sha256(caseKey).slice(0, 12)}.`;
  return {
    answer,
    result: {
      context: answer,
      provenance: {
        version: 1,
        protocol: 'truyn-distributed-context-v1',
        rootCid,
        manifestCid: rootCid,
        queryHash: contextQueryHash(question),
        verified: true,
        partitionCount: 4,
        authorizedHolderOffers: 5,
        queriedHolders: 4,
        networkCandidateCount: 8,
        networkBytes: 1024 + Number.parseInt(sha256(caseKey).slice(0, 3), 16) % 2048,
        selected: [{
          holderNodeId: `truyn:node:${sha256(`holder:${caseKey}`)}`,
          partitionIndex: Number.parseInt(sha256(caseKey).slice(0, 2), 16) % 4,
          contentCommitment: `sha256:${sha256(`content:${caseKey}`)}`,
          holderReceiptDigest: `sha256:${sha256(`receipt:${caseKey}`)}`
        }]
      }
    }
  };
}

function claimFor(caseKey) {
  const retrieval = retrievalFixture(caseKey);
  const claim = createClaimFromRetrievedContext({
    identity: issuer,
    domain: 'benchmark-factual-claim',
    subject: `case:${caseKey}`,
    statement: retrieval.answer,
    retrievalResult: retrieval.result,
    qualifiers: { benchmark: 'claim-trustability-v1' }
  });
  return { claim, retrievalResult: retrieval.result };
}

function attestation({ claim, identity, verdict, originIds = [], publisherIds = [], generatorIds = [], sourceId }) {
  return createAttestation({
    identity,
    claim,
    verdict,
    method: 'deterministic-benchmark-review',
    evidence: [{
      kind: 'benchmark-source',
      sourceId,
      contentDigest: `sha256:${sha256(`evidence:${sourceId}`)}`
    }],
    lineage: { originIds, publisherIds, generatorIds }
  });
}

function caseInput(scenario, index) {
  const caseKey = `${scenario}-${String(index).padStart(4, '0')}`;
  const { claim, retrievalResult } = claimFor(caseKey);
  let attestations = [];
  let retrievalProvenance = retrievalResult.provenance;
  let expectedStatus;

  if (scenario === 'independent_support') {
    expectedStatus = 'verified';
    attestations = [
      attestation({ claim, identity: attesterPool[0], verdict: 'support', originIds: [`origin-A:${caseKey}`], publisherIds: [`publisher-A:${caseKey}`], sourceId: `source-A:${caseKey}` }),
      attestation({ claim, identity: attesterPool[1], verdict: 'support', originIds: [`origin-B:${caseKey}`], publisherIds: [`publisher-B:${caseKey}`], sourceId: `source-B:${caseKey}` }),
      attestation({ claim, identity: attesterPool[2], verdict: 'support', originIds: [`origin-A:${caseKey}`], publisherIds: [`mirror-A:${caseKey}`], sourceId: `mirror-A:${caseKey}` })
    ];
  } else if (scenario === 'correlated_echo') {
    expectedStatus = 'insufficient_independence';
    attestations = Array.from({ length: 8 }, (_, n) => attestation({
      claim,
      identity: attesterPool[n],
      verdict: 'support',
      originIds: [`single-origin:${caseKey}`],
      publisherIds: [`mirror-${n}:${caseKey}`],
      sourceId: `syndicated-copy-${n}:${caseKey}`
    }));
  } else if (scenario === 'unknown_sybil') {
    expectedStatus = 'insufficient_independence';
    attestations = Array.from({ length: 10 }, (_, n) => attestation({
      claim,
      identity: attesterPool[n],
      verdict: 'support',
      sourceId: `anonymous-copy-${n}:${caseKey}`
    }));
  } else if (scenario === 'independent_dispute') {
    expectedStatus = 'disputed';
    attestations = [
      attestation({ claim, identity: attesterPool[0], verdict: 'support', originIds: [`support-origin:${caseKey}`], sourceId: `support:${caseKey}` }),
      attestation({ claim, identity: attesterPool[1], verdict: 'contradict', originIds: [`contradict-origin:${caseKey}`], sourceId: `contradict:${caseKey}` })
    ];
  } else if (scenario === 'independent_contradiction') {
    expectedStatus = 'contradicted';
    attestations = [
      attestation({ claim, identity: attesterPool[0], verdict: 'contradict', originIds: [`contradict-A:${caseKey}`], sourceId: `contradict-A:${caseKey}` }),
      attestation({ claim, identity: attesterPool[1], verdict: 'contradict', originIds: [`contradict-B:${caseKey}`], sourceId: `contradict-B:${caseKey}` })
    ];
  } else if (scenario === 'retrieval_tamper') {
    expectedStatus = 'retrieval_unverified';
    attestations = [
      attestation({ claim, identity: attesterPool[0], verdict: 'support', originIds: [`origin-A:${caseKey}`], sourceId: `source-A:${caseKey}` }),
      attestation({ claim, identity: attesterPool[1], verdict: 'support', originIds: [`origin-B:${caseKey}`], sourceId: `source-B:${caseKey}` })
    ];
    retrievalProvenance = structuredClone(retrievalProvenance);
    retrievalProvenance.networkBytes += 1;
  } else {
    throw new Error(`unknown scenario: ${scenario}`);
  }

  return { caseKey, claim, attestations, retrievalProvenance, expectedStatus };
}

const rows = [];
let receiptTamperAccepted = 0;
let rawSourceLeaks = 0;
let signatureFailures = 0;
let statusFailures = 0;

for (const scenario of SCENARIOS) {
  for (let index = 0; index < CASES_PER_SCENARIO; index += 1) {
    const input = caseInput(scenario, index);
    const start = performance.now();
    const assessment = assessClaimEvidence({
      claim: input.claim,
      attestations: input.attestations,
      retrievalProvenance: input.retrievalProvenance
    });
    const receipt = createTrustReceipt({
      identity: receiptVerifier,
      claim: input.claim,
      attestations: input.attestations,
      retrievalProvenance: input.retrievalProvenance
    });
    const elapsedMs = performance.now() - start;
    const receiptVerification = verifyTrustReceipt(receipt, input.claim.claimId);
    if (!receiptVerification.ok) signatureFailures += 1;
    if (assessment.truthAssessment.status !== input.expectedStatus || receipt.payload.truthAssessment.status !== input.expectedStatus) statusFailures += 1;

    const tampered = structuredClone(receipt);
    tampered.payload.truthAssessment.status = tampered.payload.truthAssessment.status === 'verified' ? 'disputed' : 'verified';
    if (verifyTrustReceipt(tampered, input.claim.claimId).ok) receiptTamperAccepted += 1;

    const publicJson = JSON.stringify(receipt);
    const leaked = input.attestations.some((item) =>
      (item.body.evidence || []).some((evidence) => publicJson.includes(evidence.sourceId)) ||
      (item.body.lineage?.originIds || []).some((value) => publicJson.includes(value)) ||
      (item.body.lineage?.publisherIds || []).some((value) => publicJson.includes(value)) ||
      (item.body.lineage?.generatorIds || []).some((value) => publicJson.includes(value))
    );
    if (leaked) rawSourceLeaks += 1;

    rows.push({
      scenario,
      expectedStatus: input.expectedStatus,
      actualStatus: assessment.truthAssessment.status,
      retrievalVerified: assessment.retrievalIntegrity.verified,
      rawAttestations: assessment.truthAssessment.rawAttestations,
      independentKnownGroups: assessment.truthAssessment.independentKnownGroups,
      supportGroups: assessment.truthAssessment.supportGroups,
      contradictGroups: assessment.truthAssessment.contradictGroups,
      unknownLineageGroups: assessment.truthAssessment.unknownLineageGroups,
      receiptVerified: receiptVerification.ok,
      elapsedMs: round(elapsedMs)
    });
  }
}

const latencies = rows.map((row) => row.elapsedMs);
const scenarioResults = Object.fromEntries(SCENARIOS.map((scenario) => {
  const subset = rows.filter((row) => row.scenario === scenario);
  return [scenario, {
    cases: subset.length,
    correct: subset.filter((row) => row.actualStatus === row.expectedStatus).length,
    accuracyPct: round(100 * subset.filter((row) => row.actualStatus === row.expectedStatus).length / subset.length, 3),
    meanRawAttestations: round(subset.reduce((sum, row) => sum + row.rawAttestations, 0) / subset.length, 3),
    meanIndependentKnownGroups: round(subset.reduce((sum, row) => sum + row.independentKnownGroups, 0) / subset.length, 3)
  }];
}));

const totalCases = rows.length;
const correctCases = rows.filter((row) => row.actualStatus === row.expectedStatus).length;
const correlatedFalseVerified = rows.filter((row) => row.scenario === 'correlated_echo' && row.actualStatus === 'verified').length;
const sybilFalseVerified = rows.filter((row) => row.scenario === 'unknown_sybil' && row.actualStatus === 'verified').length;
const conflictMisses = rows.filter((row) => row.scenario === 'independent_dispute' && row.actualStatus !== 'disputed').length;
const retrievalTamperFalseAccepted = rows.filter((row) => row.scenario === 'retrieval_tamper' && row.actualStatus !== 'retrieval_unverified').length;

const summary = {
  benchmark: 'truyn-claim-trustability-v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  workload: {
    scenarios: SCENARIOS,
    casesPerScenario: CASES_PER_SCENARIO,
    totalCases,
    note: 'Deterministic mechanics/resistance benchmark; no external model/provider inference is used.'
  },
  result: {
    correctCases,
    totalCases,
    statusAccuracyPct: round(100 * correctCases / totalCases, 3),
    signatureFailures,
    receiptTamperAccepted,
    rawSourceLeaks,
    correlatedEchoFalseVerified: correlatedFalseVerified,
    unknownSybilFalseVerified: sybilFalseVerified,
    independentDisputeMisses: conflictMisses,
    retrievalTamperFalseAccepted,
    allGatesPass: statusFailures === 0 && signatureFailures === 0 && receiptTamperAccepted === 0 && rawSourceLeaks === 0 && correlatedFalseVerified === 0 && sybilFalseVerified === 0 && conflictMisses === 0 && retrievalTamperFalseAccepted === 0
  },
  latencyMs: {
    p50: round(percentile(latencies, 50), 3),
    p95: round(percentile(latencies, 95), 3),
    p99: round(percentile(latencies, 99), 3),
    mean: round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length, 3)
  },
  scenarios: scenarioResults,
  gates: {
    statusAccuracyPct: 100,
    correlatedEchoFalseVerified: 0,
    unknownSybilFalseVerified: 0,
    independentDisputeMisses: 0,
    retrievalTamperFalseAccepted: 0,
    receiptTamperAccepted: 0,
    rawSourceLeaks: 0,
    signatureFailures: 0
  }
};

await writeFile(OUTPUT, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (!summary.result.allGatesPass) process.exitCode = 1;
