import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { createIdentity } from '../core/identity/index.js';
import { createAttestation, createClaim } from '../core/claims/index.js';
import {
  FederatedPlacementResolver,
  PlacementDirectoryPeer,
  createPlacementRecord,
  createPlacementRevocation,
  publishPlacementDht,
  verifyPlacementRecord
} from '../core/network/placement-discovery.js';
import {
  buildCandidateQuorum,
  selectTrustedReplicaSet
} from '../core/context/byzantine-retrieval.js';
import {
  assessActiveTrust,
  createDispute,
  createLineageCertificate,
  createTrustRevocation,
  verifyDispute
} from '../core/trust/lifecycle.js';

const casesPerScenario = Number.parseInt(process.env.TRUST_NETWORK_CASES_PER_SCENARIO || '100', 10);
const outputPath = process.env.TRUST_NETWORK_OUTPUT || null;
if (!Number.isInteger(casesPerScenario) || casesPerScenario < 1 || casesPerScenario > 1000) {
  throw new Error('TRUST_NETWORK_CASES_PER_SCENARIO must be 1..1000');
}

const nowBase = Date.now();
const latencies = [];
const counters = {
  correctCases: 0,
  totalCases: 0,
  byzantineFalseAccepted: 0,
  stalePlacementReturned: 0,
  revokedPlacementReturned: 0,
  uncertifiedFalseVerified: 0,
  staleAttestationFalseActive: 0,
  unauthorizedRevocationApplied: 0,
  authorizedRevocationMisses: 0,
  authorizedDisputeMisses: 0,
  tamperAccepted: 0,
  rawSourceLeaks: 0
};
const scenarioResults = {};

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function timingSummary(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    p50: Number(percentile(values, 50).toFixed(3)),
    p95: Number(percentile(values, 95).toFixed(3)),
    p99: Number(percentile(values, 99).toFixed(3)),
    mean: Number(mean.toFixed(3))
  };
}

async function runScenario(name, fn) {
  const local = [];
  let correct = 0;
  for (let index = 0; index < casesPerScenario; index += 1) {
    const started = performance.now();
    const ok = await fn(index);
    const elapsed = performance.now() - started;
    local.push(elapsed);
    latencies.push(elapsed);
    counters.totalCases += 1;
    if (ok) {
      correct += 1;
      counters.correctCases += 1;
    }
  }
  scenarioResults[name] = {
    cases: casesPerScenario,
    correct,
    accuracyPct: Number(((correct / casesPerScenario) * 100).toFixed(3)),
    latencyMs: timingSummary(local)
  };
}

function activeEvidenceFixture(index, { stale = false, forgedLineage = false } = {}) {
  const issuer = createIdentity();
  const attesterA = createIdentity();
  const attesterB = createIdentity();
  const ownerA = createIdentity();
  const ownerB = createIdentity();
  const claim = createClaim({ identity: issuer, domain: 'benchmark', statement: `Benchmark claim ${index} is supported.` });
  const createdAt = new Date(nowBase - (stale ? 3 * 60 * 60_000 : 1000)).toISOString();
  const sourceA = `source-a-${index}`;
  const sourceB = `source-b-${index}`;
  const originA = `origin-a-${index}`;
  const originB = `origin-b-${index}`;
  const publisherA = `publisher-a-${index}`;
  const publisherB = `publisher-b-${index}`;
  const attestations = [
    createAttestation({
      identity: attesterA,
      claim,
      verdict: 'support',
      evidence: [{ kind: 'record', sourceId: sourceA }],
      lineage: { originIds: [forgedLineage ? `invented-origin-${index}` : originA], publisherIds: [publisherA] },
      createdAt
    }),
    createAttestation({
      identity: attesterB,
      claim,
      verdict: 'support',
      evidence: [{ kind: 'observation', sourceId: sourceB }],
      lineage: { originIds: [originB], publisherIds: [publisherB] },
      createdAt
    })
  ];
  const lineageCertificates = [
    createLineageCertificate({
      identity: ownerA,
      sourceId: sourceA,
      lineage: { originIds: [originA], publisherIds: [publisherA] },
      issuedAt: new Date(nowBase - 2000).toISOString(),
      expiresAt: new Date(nowBase + 60_000).toISOString()
    }),
    createLineageCertificate({
      identity: ownerB,
      sourceId: sourceB,
      lineage: { originIds: [originB], publisherIds: [publisherB] },
      issuedAt: new Date(nowBase - 2000).toISOString(),
      expiresAt: new Date(nowBase + 60_000).toISOString()
    })
  ];
  return { issuer, attesterA, attesterB, claim, attestations, lineageCertificates };
}

await runScenario('federated_placement_agreement', async (index) => {
  const holder = createIdentity();
  const rootCid = `truyn:ctx:${String(index).padStart(64, '0').slice(-64)}`;
  const peers = Array.from({ length: 5 }, (_, peerIndex) => new PlacementDirectoryPeer({ peerId: `p-${index}-${peerIndex}` }));
  const record = createPlacementRecord({
    identity: holder,
    rootCid,
    partitionIndex: 0,
    partitionCount: 1,
    blockCount: 1,
    issuedAt: new Date(nowBase - 1000).toISOString(),
    expiresAt: new Date(nowBase + 60_000).toISOString()
  });
  publishPlacementDht(record, peers, { replicationFactor: 3, now: nowBase });
  peers[0].gossipWith(peers[4], { now: nowBase });
  const resolver = new FederatedPlacementResolver({ peers, replicationFactor: 5, minDirectoryAgreement: 2 });
  const records = await resolver.findRecords(rootCid, { now: nowBase });
  return records.length === 1 && records[0].record.body.holderNodeId === holder.nodeId && records[0].directoryAgreement >= 2;
});

await runScenario('expired_placement_excluded', async (index) => {
  const record = createPlacementRecord({
    identity: createIdentity(),
    rootCid: `truyn:ctx:expired-${index}`,
    partitionIndex: 0,
    partitionCount: 1,
    blockCount: 1,
    issuedAt: new Date(nowBase - 60_000).toISOString(),
    expiresAt: new Date(nowBase - 1000).toISOString()
  });
  const expired = !verifyPlacementRecord(record, { now: nowBase }).ok;
  if (!expired) counters.stalePlacementReturned += 1;
  return expired;
});

await runScenario('revoked_placement_excluded', async (index) => {
  const holder = createIdentity();
  const rootCid = `truyn:ctx:revoked-${index}`;
  const peers = Array.from({ length: 3 }, (_, peerIndex) => new PlacementDirectoryPeer({ peerId: `r-${index}-${peerIndex}` }));
  const record = createPlacementRecord({
    identity: holder,
    rootCid,
    partitionIndex: 0,
    partitionCount: 1,
    blockCount: 1,
    issuedAt: new Date(nowBase - 1000).toISOString(),
    expiresAt: new Date(nowBase + 60_000).toISOString()
  });
  publishPlacementDht(record, peers, { replicationFactor: 3, now: nowBase });
  const revocation = createPlacementRevocation({ identity: holder, record, revokedAt: new Date(nowBase + 1).toISOString() });
  for (const peer of peers) peer.ingestRevocation(revocation);
  const resolver = new FederatedPlacementResolver({ peers, replicationFactor: 3, minDirectoryAgreement: 2 });
  const records = await resolver.findRecords(rootCid, { now: nowBase + 2 });
  if (records.length !== 0) counters.revokedPlacementReturned += 1;
  return records.length === 0;
});

await runScenario('byzantine_high_trust_replica_rejected', async (index) => {
  const goodCid = `truyn:ctxb:good-${index}`;
  const badCid = `truyn:ctxb:bad-${index}`;
  const candidates = [
    { cid: badCid, holderNodeId: `malicious-${index}`, partitionIndex: 0, holderTrust: { score: 0.99 }, receipt: { id: `bad-${index}` } },
    { cid: goodCid, holderNodeId: `honest-a-${index}`, partitionIndex: 0, holderTrust: { score: 0.90 }, receipt: { id: `good-a-${index}` } },
    { cid: goodCid, holderNodeId: `honest-b-${index}`, partitionIndex: 0, holderTrust: { score: 0.89 }, receipt: { id: `good-b-${index}` } }
  ];
  const quorum = buildCandidateQuorum(candidates, { quorum: 2 });
  const ok = quorum.length === 1 && quorum[0].cid === goodCid && quorum[0].quorum.observed === 2;
  if (!ok) counters.byzantineFalseAccepted += 1;
  return ok;
});

await runScenario('trustability_aware_holder_selection', async (index) => {
  const issuedAt = new Date(nowBase - 1000).toISOString();
  const expiresAt = new Date(nowBase + 60_000).toISOString();
  const holder = (nodeId, score, zone) => ({
    nodeId: `${nodeId}-${index}`,
    trust: { score },
    offer: { payload: { metadata: { distributedContext: { placement: { issuedAt, expiresAt, directoryAgreement: 3, failureDomainCommitment: zone } } } } }
  });
  const holders = [holder('a', 0.99, 'z1'), holder('b', 0.98, 'z1'), holder('c', 0.85, 'z2'), holder('d', 0.80, 'z3')];
  const selected = selectTrustedReplicaSet(holders, { replicaReads: 3, quorum: 2, now: nowBase });
  return selected.length === 3 && selected[0].nodeId.startsWith('a-') && new Set(selected.map((item) => item.offer.payload.metadata.distributedContext.placement.failureDomainCommitment)).size === 3;
});

await runScenario('certified_independent_support', async (index) => {
  const fixture = activeEvidenceFixture(index);
  const assessment = assessActiveTrust({
    claim: fixture.claim,
    attestations: fixture.attestations,
    lineageCertificates: fixture.lineageCertificates,
    now: nowBase,
    policy: { minIndependentSupport: 2 }
  });
  return assessment.lifecycleStatus === 'verified' && assessment.truthAssessment.independentKnownGroups === 2 && assessment.activeAttestations === 2;
});

await runScenario('fabricated_lineage_rejected', async (index) => {
  const fixture = activeEvidenceFixture(index, { forgedLineage: true });
  const assessment = assessActiveTrust({
    claim: fixture.claim,
    attestations: [fixture.attestations[0]],
    lineageCertificates: fixture.lineageCertificates,
    now: nowBase
  });
  const ok = assessment.lifecycleStatus !== 'verified' && assessment.uncertifiedAttestations === 1 && assessment.activeAttestations === 0;
  if (!ok) counters.uncertifiedFalseVerified += 1;
  return ok;
});

await runScenario('stale_attestation_rejected', async (index) => {
  const fixture = activeEvidenceFixture(index, { stale: true });
  const assessment = assessActiveTrust({
    claim: fixture.claim,
    attestations: fixture.attestations,
    lineageCertificates: fixture.lineageCertificates,
    now: nowBase,
    maxAttestationAgeMs: 60 * 60_000
  });
  const ok = assessment.lifecycleStatus !== 'verified' && assessment.activeAttestations === 0 && assessment.staleAttestations === 2;
  if (!ok) counters.staleAttestationFalseActive += 1;
  return ok;
});

await runScenario('issuer_authoritative_revocation', async (index) => {
  const fixture = activeEvidenceFixture(index);
  const stranger = createIdentity();
  const unauthorized = createTrustRevocation({ identity: stranger, targetType: 'attestation', targetId: fixture.attestations[0].attestationId });
  const before = assessActiveTrust({
    claim: fixture.claim,
    attestations: fixture.attestations,
    lineageCertificates: fixture.lineageCertificates,
    revocations: [unauthorized],
    now: nowBase
  });
  if (before.activeAttestations !== 2) counters.unauthorizedRevocationApplied += 1;
  const authorized = createTrustRevocation({ identity: fixture.attesterA, targetType: 'attestation', targetId: fixture.attestations[0].attestationId });
  const after = assessActiveTrust({
    claim: fixture.claim,
    attestations: fixture.attestations,
    lineageCertificates: fixture.lineageCertificates,
    revocations: [authorized],
    now: nowBase
  });
  const ok = before.activeAttestations === 2 && after.activeAttestations === 1 && after.revokedAttestations === 1 && after.lifecycleStatus !== 'verified';
  if (!ok) counters.authorizedRevocationMisses += 1;
  return ok;
});

await runScenario('authorized_dispute_and_tamper_resistance', async (index) => {
  const fixture = activeEvidenceFixture(index);
  const disputer = createIdentity();
  const dispute = createDispute({
    identity: disputer,
    claim: fixture.claim,
    targetAttestationIds: [fixture.attestations[0].attestationId],
    groundsDigest: `sha256:dispute-${index}`
  });
  const assessment = assessActiveTrust({
    claim: fixture.claim,
    attestations: fixture.attestations,
    lineageCertificates: fixture.lineageCertificates,
    disputes: [dispute],
    authorizedDisputerNodeIds: [disputer.nodeId],
    now: nowBase
  });
  const tampered = structuredClone(dispute);
  tampered.body.groundsDigest = `sha256:tampered-${index}`;
  const tamperRejected = !verifyDispute(tampered, fixture.claim.claimId).ok;
  if (!tamperRejected) counters.tamperAccepted += 1;
  const ok = assessment.lifecycleStatus === 'disputed' && assessment.activeDisputes === 1 && tamperRejected;
  if (!ok) counters.authorizedDisputeMisses += 1;
  return ok;
});

const statusAccuracyPct = Number(((counters.correctCases / counters.totalCases) * 100).toFixed(3));
const report = {
  benchmark: 'truyn-trust-network-v2',
  version: 2,
  generatedAt: new Date().toISOString(),
  workload: {
    casesPerScenario,
    scenarios: Object.keys(scenarioResults),
    totalCases: counters.totalCases,
    note: 'Deterministic protocol/resistance benchmark; no external model or paid-provider inference is used.'
  },
  result: {
    ...counters,
    statusAccuracyPct,
    allGatesPass: statusAccuracyPct === 100 &&
      counters.byzantineFalseAccepted === 0 &&
      counters.stalePlacementReturned === 0 &&
      counters.revokedPlacementReturned === 0 &&
      counters.uncertifiedFalseVerified === 0 &&
      counters.staleAttestationFalseActive === 0 &&
      counters.unauthorizedRevocationApplied === 0 &&
      counters.authorizedRevocationMisses === 0 &&
      counters.authorizedDisputeMisses === 0 &&
      counters.tamperAccepted === 0 &&
      counters.rawSourceLeaks === 0
  },
  latencyMs: timingSummary(latencies),
  scenarios: scenarioResults,
  gates: {
    statusAccuracyPct: 100,
    byzantineFalseAccepted: 0,
    stalePlacementReturned: 0,
    revokedPlacementReturned: 0,
    uncertifiedFalseVerified: 0,
    staleAttestationFalseActive: 0,
    unauthorizedRevocationApplied: 0,
    authorizedRevocationMisses: 0,
    authorizedDisputeMisses: 0,
    tamperAccepted: 0,
    rawSourceLeaks: 0
  }
};

const serialized = JSON.stringify(report, null, 2);
for (const marker of ['source-a-', 'source-b-', 'origin-a-', 'origin-b-', 'publisher-a-', 'publisher-b-']) {
  if (serialized.includes(marker)) counters.rawSourceLeaks += 1;
}
report.result.rawSourceLeaks = counters.rawSourceLeaks;
report.result.allGatesPass = report.result.allGatesPass && counters.rawSourceLeaks === 0;
const finalSerialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, finalSerialized, 'utf8');
console.log(finalSerialized);
if (!report.result.allGatesPass) process.exitCode = 1;
