import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createAttestation, createClaim } from '../core/claims/index.js';
import {
  createDelegationCertificate,
  createSourceOwnerCertificate,
  sourceOwnerIdFromPublicKey,
  verifyDelegationCertificate
} from '../core/trust/source-owner-pki.js';
import { DurableTransparencyLog } from '../core/trust/transparency-log.js';
import { createTrustReceiptV2, verifyTrustReceiptV2 } from '../core/trust/receipt-v2.js';

async function withTempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'truyn-trust-v2-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function independentAttestation(identity, claim, source) {
  return createAttestation({
    identity,
    claim,
    verdict: 'support',
    evidence: [{ kind: 'source', sourceId: source }],
    lineage: { originIds: [`origin-${source}`], publisherIds: [`publisher-${source}`], generatorIds: [] },
    method: 'independent-review'
  });
}

test('source-owner PKI delegates verifier authority and rejects scope/key substitution', () => {
  const owner = createIdentity();
  const verifier = createIdentity();
  const stranger = createIdentity();
  const root = createSourceOwnerCertificate({ identity: owner, sourceNamespaces: ['news/*'] });
  assert.equal(root.body.sourceOwnerId, sourceOwnerIdFromPublicKey(owner.publicKeyPem));
  const delegation = createDelegationCertificate({
    ownerIdentity: owner,
    ownerCertificate: root,
    delegateIdentity: verifier,
    delegationScopes: ['trust.verify'],
    sourceNamespaces: ['news/*']
  });
  assert.equal(verifyDelegationCertificate(delegation, root, { requiredScope: 'trust.verify' }).ok, true);
  assert.equal(verifyDelegationCertificate(delegation, root, { requiredScope: 'trust.admin' }).ok, false);
  const tampered = structuredClone(delegation);
  tampered.delegatePublicKey = stranger.publicKeyPem;
  assert.equal(verifyDelegationCertificate(tampered, root, { requiredScope: 'trust.verify' }).ok, false);
});

test('durable transparency log preserves hash-chain state, revocations and detects equivocation', async (t) => {
  const owner = createIdentity();
  const root = createSourceOwnerCertificate({ identity: owner });
  const sourceOwnerId = root.body.sourceOwnerId;
  const dirA = await withTempDir(t);
  const dirB = await withTempDir(t);
  const log = await new DurableTransparencyLog({ directory: dirA, sourceOwnerId }).open();
  await log.append({ identity: owner, eventType: 'ROOT', targetId: root.certificateId, payload: { certificateId: root.certificateId } });
  await log.append({ identity: owner, eventType: 'REVOKE', targetId: 'truyn:test:subject', payload: { reason: 'test' } });
  const head = log.head();
  assert.equal(head.sequence, 2);
  assert.equal(log.isRevoked('truyn:test:subject'), true);
  const reopened = await new DurableTransparencyLog({ directory: dirA, sourceOwnerId }).open();
  assert.deepEqual(reopened.head(), head);

  const fork = await new DurableTransparencyLog({ directory: dirB, sourceOwnerId }).open();
  await fork.append({ identity: owner, eventType: 'ROOT', targetId: root.certificateId, payload: { certificateId: root.certificateId, fork: true } });
  await assert.rejects(() => reopened.ingest(fork.entries()), (error) => error?.code === 'transparency_fork_detected');
});

test('Trust Receipt v2 commits lifecycle head and revocation state and becomes stale after revocation', async (t) => {
  const owner = createIdentity();
  const verifier = createIdentity();
  const attesterA = createIdentity();
  const attesterB = createIdentity();
  const issuer = createIdentity();
  const root = createSourceOwnerCertificate({ identity: owner });
  const delegation = createDelegationCertificate({ ownerIdentity: owner, ownerCertificate: root, delegateIdentity: verifier, delegationScopes: ['trust.verify'] });
  const log = await new DurableTransparencyLog({ directory: await withTempDir(t), sourceOwnerId: root.body.sourceOwnerId }).open();
  await log.append({ identity: owner, eventType: 'ROOT', targetId: root.certificateId, payload: { certificateId: root.certificateId } });
  await log.append({ identity: owner, eventType: 'DELEGATE', targetId: delegation.delegationId, payload: { delegationId: delegation.delegationId } });

  const claim = createClaim({ identity: issuer, domain: 'news', statement: 'A signed testnet statement is independently supported.' });
  const attestations = [independentAttestation(attesterA, claim, 'a'), independentAttestation(attesterB, claim, 'b')];
  const state = log.revocationState([delegation.delegationId, claim.claimId]);
  const receipt = createTrustReceiptV2({
    identity: verifier,
    claim,
    attestations,
    ownerCertificate: root,
    delegation,
    lifecycleHead: log.head(),
    revocationState: state
  });
  const verified = verifyTrustReceiptV2(receipt, { expectedClaimId: claim.claimId, currentLifecycleHead: log.head(), currentRevocationState: state });
  assert.equal(verified.ok, true);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.lifecycleHeadHash, log.head().headHash);

  await log.append({ identity: owner, eventType: 'REVOKE', targetId: delegation.delegationId, payload: { reason: 'key compromise drill' } });
  const currentState = log.revocationState([delegation.delegationId, claim.claimId]);
  const stale = verifyTrustReceiptV2(receipt, { currentLifecycleHead: log.head(), currentRevocationState: currentState });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'trust_receipt_v2_lifecycle_head_stale');
  assert.throws(() => createTrustReceiptV2({ identity: verifier, claim, attestations, ownerCertificate: root, delegation, lifecycleHead: log.head(), revocationState: currentState }), /delegation is revoked/);
});
