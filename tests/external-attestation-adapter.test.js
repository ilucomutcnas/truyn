import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createClaim, verifyAttestation } from '../core/claims/index.js';
import { ExternalAttestationAdapter } from '../adapters/attestation/external.js';

function fixtureClaim() {
  return createClaim({
    identity: createIdentity(),
    domain: 'release-calendar',
    subject: 'TRUYN v0.2',
    statement: 'TRUYN v0.2 verification gate passed.'
  });
}

test('external attestation adapter converts an independent decision into a signed TRUYN attestation', async () => {
  const identity = createIdentity();
  const claim = fixtureClaim();
  const adapter = new ExternalAttestationAdapter({
    identity,
    sourceId: 'external:registry:test',
    verify: async ({ claim: observed }) => {
      assert.equal(observed.claimId, claim.claimId);
      return {
        verdict: 'support',
        contentDigest: `sha256:${'a'.repeat(64)}`,
        lineage: { originIds: ['registry-primary-record'] },
        rationale: 'The external registry record matches the claim.'
      };
    }
  });

  const attestation = await adapter.attest({ claim });
  assert.equal(attestation.attesterNodeId, identity.nodeId);
  assert.equal(attestation.body.verdict, 'support');
  assert.equal(attestation.body.evidence[0].kind, 'external');
  assert.equal(attestation.body.evidence[0].sourceId, 'external:registry:test');
  assert.match(attestation.body.rationaleDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(attestation).includes('The external registry record matches'), false);
  assert.equal(verifyAttestation(attestation, claim.claimId).ok, true);
});

test('external attestation adapter never treats malformed external output as evidence', async () => {
  const identity = createIdentity();
  const claim = fixtureClaim();
  const adapter = new ExternalAttestationAdapter({
    identity,
    sourceId: 'external:registry:test',
    verify: async () => ({ verdict: 'definitely-true' })
  });
  await assert.rejects(() => adapter.attest({ claim }), /verdict must be support, contradict or uncertain/);
});

test('external attestation adapter does not copy caller context or provider secrets into the signed record', async () => {
  const secret = 'provider-secret-must-not-leak';
  const identity = createIdentity();
  const claim = fixtureClaim();
  const adapter = new ExternalAttestationAdapter({
    identity,
    sourceId: 'external:private-checker',
    verify: async ({ context }) => {
      assert.equal(context.apiKey, secret);
      return { verdict: 'uncertain', rationale: 'No conclusive record.' };
    }
  });
  const attestation = await adapter.attest({ claim, context: { apiKey: secret } });
  assert.equal(JSON.stringify(attestation).includes(secret), false);
  assert.equal(verifyAttestation(attestation, claim.claimId).ok, true);
});
