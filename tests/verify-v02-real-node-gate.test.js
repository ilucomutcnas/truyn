import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { createIdentity } from '../core/identity/index.js';
import { createClaim, verifyAttestation } from '../core/claims/index.js';
import {
  assessActiveTrust,
  createChallenge,
  createLineageCertificate,
  createTrustRevocation,
  verifyChallenge,
  verifyTrustRevocation,
  verifyVerification
} from '../core/trust/lifecycle.js';
import { createTrustReceipt, verifyTrustReceipt } from '../core/trust/claim-verification.js';
import { ExternalAttestationAdapter } from '../adapters/attestation/external.js';

const WORKERS = 16;

async function startWorker(index) {
  const child = spawn(process.execPath, ['benchmarks/workers/verify-v02-verifier-node.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TRUYN_VERIFY_WORKER_INDEX: String(index) }
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const ready = await Promise.race([
    new Promise((resolve, reject) => {
      lines.on('line', (line) => {
        try {
          const value = JSON.parse(line);
          if (value.ready === true) resolve(value);
        } catch {}
      });
      child.once('exit', (code) => reject(new Error(`verify worker ${index} exited before ready (${code}): ${stderr}`)));
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`verify worker ${index} readiness timeout: ${stderr}`)), 10_000))
  ]);
  lines.close();
  return { child, ...ready };
}

async function stopWorker(worker) {
  if (!worker?.child || worker.child.exitCode != null) return;
  worker.child.kill('SIGTERM');
  await Promise.race([
    once(worker.child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 1000))
  ]);
  if (worker.child.exitCode == null) worker.child.kill('SIGKILL');
}

async function post(worker, path, body) {
  const response = await fetch(`http://127.0.0.1:${worker.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`worker ${worker.nodeId} ${path}: ${value.error || response.status}`);
  return value;
}

function lineageFixture(index, now) {
  const owner = createIdentity();
  const sourceId = `verify-source-${index}`;
  const originId = `verify-origin-${index}`;
  const publisherId = `verify-publisher-${index}`;
  const certificate = createLineageCertificate({
    identity: owner,
    sourceId,
    lineage: { originIds: [originId], publisherIds: [publisherId] },
    issuedAt: new Date(now - 5_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  });
  return { owner, sourceId, originId, publisherId, certificate };
}

test('v0.2 Verify release gate: 16 independent OS verifier nodes survive stale/conflict/revocation adversarial cases', { timeout: 60_000 }, async () => {
  const workers = [];
  try {
    for (let index = 0; index < WORKERS; index += 1) workers.push(await startWorker(index));
    assert.equal(new Set(workers.map((worker) => worker.nodeId)).size, WORKERS, 'each process must own an independent node identity');

    const now = Date.now();
    const issuer = createIdentity();
    const challenger = createIdentity();
    const receiptSigner = createIdentity();
    const claim = createClaim({
      identity: issuer,
      domain: 'verify-v02-gate',
      statement: 'TRUYN v0.2 real-process verification gate statement.'
    });
    const challenge = createChallenge({
      identity: challenger,
      claim,
      methods: ['real-process-http', 'independent-review'],
      reason: 'v0.2-release-gate'
    });
    assert.equal(verifyChallenge(challenge, claim.claimId).ok, true);

    const lineages = Array.from({ length: WORKERS }, (_, index) => lineageFixture(index, now));
    const support = [];
    for (let index = 0; index < WORKERS; index += 1) {
      const lineage = lineages[index];
      const result = await post(workers[index], '/verify', {
        claim,
        challenge,
        verdict: 'support',
        sourceId: lineage.sourceId,
        originId: lineage.originId,
        publisherId: lineage.publisherId,
        createdAt: new Date(now - 1_000).toISOString()
      });
      assert.equal(result.nodeId, workers[index].nodeId);
      assert.equal(result.attestation.attesterNodeId, workers[index].nodeId);
      assert.equal(verifyAttestation(result.attestation, claim.claimId).ok, true);
      assert.equal(verifyVerification(result.verification, challenge.objectId).ok, true);
      assert.equal(result.verification.signerNodeId, workers[index].nodeId);
      support.push(result.attestation);
    }

    const certificates = lineages.map((lineage) => lineage.certificate);
    const baseline = assessActiveTrust({
      claim,
      attestations: support,
      lineageCertificates: certificates,
      now,
      policy: { minIndependentSupport: WORKERS }
    });
    assert.equal(baseline.lifecycleStatus, 'verified');
    assert.equal(baseline.activeAttestations, WORKERS);
    assert.equal(baseline.truthAssessment.supportGroups, WORKERS);
    assert.equal(baseline.truthAssessment.evidenceBalance, 1);

    const receipt = createTrustReceipt({
      identity: receiptSigner,
      claim,
      attestations: support,
      policy: { minIndependentSupport: WORKERS }
    });
    assert.equal(verifyTrustReceipt(receipt, claim.claimId).ok, true);
    assert.equal(receipt.payload.truthAssessment.status, 'verified');

    const stale = [];
    for (let index = 0; index < 4; index += 1) {
      const lineage = lineages[index];
      const result = await post(workers[index], '/verify', {
        claim,
        challenge,
        verdict: 'support',
        sourceId: lineage.sourceId,
        originId: lineage.originId,
        publisherId: lineage.publisherId,
        createdAt: new Date(now - 3 * 60 * 60_000).toISOString()
      });
      stale.push(result.attestation);
    }
    const staleAssessment = assessActiveTrust({
      claim,
      attestations: stale,
      lineageCertificates: certificates,
      now,
      maxAttestationAgeMs: 60 * 60_000,
      policy: { minIndependentSupport: 2 }
    });
    assert.equal(staleAssessment.activeAttestations, 0);
    assert.equal(staleAssessment.staleAttestations, stale.length);
    assert.notEqual(staleAssessment.lifecycleStatus, 'verified');

    const conflictLineages = [];
    const contradictions = [];
    for (let index = 0; index < 4; index += 1) {
      const owner = createIdentity();
      const sourceId = `verify-conflict-source-${index}`;
      const originId = `verify-conflict-origin-${index}`;
      const publisherId = `verify-conflict-publisher-${index}`;
      conflictLineages.push(createLineageCertificate({
        identity: owner,
        sourceId,
        lineage: { originIds: [originId], publisherIds: [publisherId] },
        issuedAt: new Date(now - 5_000).toISOString(),
        expiresAt: new Date(now + 60_000).toISOString()
      }));
      const result = await post(workers[index], '/verify', {
        claim,
        challenge,
        verdict: 'contradict',
        sourceId,
        originId,
        publisherId,
        createdAt: new Date(now - 500).toISOString()
      });
      contradictions.push(result.attestation);
    }
    const conflicted = assessActiveTrust({
      claim,
      attestations: [...support, ...contradictions],
      lineageCertificates: [...certificates, ...conflictLineages],
      now,
      policy: { minIndependentSupport: WORKERS }
    });
    assert.equal(conflicted.lifecycleStatus, 'disputed');
    assert.equal(conflicted.truthAssessment.contradictGroups, contradictions.length);
    assert.ok(conflicted.truthAssessment.evidenceBalance < baseline.truthAssessment.evidenceBalance, 'active verification must change evidence state, not only return metadata');

    const revocationResult = await post(workers[0], '/revoke', { attestationId: support[0].attestationId });
    assert.equal(verifyTrustRevocation(revocationResult.revocation).ok, true);
    const revoked = assessActiveTrust({
      claim,
      attestations: support,
      lineageCertificates: certificates,
      revocations: [revocationResult.revocation],
      now,
      policy: { minIndependentSupport: WORKERS }
    });
    assert.equal(revoked.revokedAttestations, 1);
    assert.equal(revoked.activeAttestations, WORKERS - 1);
    assert.notEqual(revoked.lifecycleStatus, 'verified');

    const lineageRevocation = createTrustRevocation({
      identity: lineages[1].owner,
      targetType: 'lineage-certificate',
      targetId: lineages[1].certificate.certificateId,
      reasonDigest: 'sha256:verify-v02-lineage-key-continuity'
    });
    const lineageRevoked = assessActiveTrust({
      claim,
      attestations: support,
      lineageCertificates: certificates,
      revocations: [lineageRevocation],
      now,
      policy: { minIndependentSupport: WORKERS }
    });
    assert.equal(lineageRevoked.uncertifiedAttestations, 1);
    assert.equal(lineageRevoked.activeAttestations, WORKERS - 1);
    assert.notEqual(lineageRevoked.lifecycleStatus, 'verified');

    const claimRevocation = createTrustRevocation({
      identity: issuer,
      targetType: 'claim',
      targetId: claim.claimId,
      reasonDigest: 'sha256:verify-v02-claim-revoked'
    });
    const claimRevoked = assessActiveTrust({
      claim,
      attestations: support,
      lineageCertificates: certificates,
      revocations: [claimRevocation],
      now
    });
    assert.equal(claimRevoked.lifecycleStatus, 'revoked');

    const tampered = structuredClone((await post(workers[2], '/verify', {
      claim,
      challenge,
      verdict: 'support',
      sourceId: lineages[2].sourceId,
      originId: lineages[2].originId,
      publisherId: lineages[2].publisherId
    })).verification);
    tampered.body.verdict = 'contradict';
    assert.equal(verifyVerification(tampered, challenge.objectId).ok, false);

    const externalSecret = 'must-not-enter-attestation';
    const externalAdapter = new ExternalAttestationAdapter({
      identity: createIdentity(),
      sourceId: 'verify-v02-external-boundary',
      sourceKind: 'external-checker',
      verify: async ({ context }) => ({
        verdict: 'support',
        contentDigest: 'sha256:external-proof',
        lineage: { originIds: ['external-origin'], publisherIds: ['external-publisher'] },
        rationale: `accepted using private provider context ${context.secret}`
      })
    });
    const externalAttestation = await externalAdapter.attest({ claim, context: { secret: externalSecret } });
    assert.equal(verifyAttestation(externalAttestation, claim.claimId).ok, true);
    assert.equal(JSON.stringify(externalAttestation).includes(externalSecret), false, 'provider context must not leak into signed attestation');
  } finally {
    await Promise.all(workers.map(stopWorker));
  }
});
