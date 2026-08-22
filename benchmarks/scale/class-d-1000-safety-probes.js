#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIdentity } from '../../core/identity/index.js';
import { createAttestation, createClaim } from '../../core/claims/index.js';
import { createDelegationCertificate, createSourceOwnerCertificate } from '../../core/trust/source-owner-pki.js';
import { DurableTransparencyLog } from '../../core/trust/transparency-log.js';
import { createTrustReceiptV2, verifyTrustReceiptV2 } from '../../core/trust/receipt-v2.js';
import { createProviderAccessPolicy } from '../../core/security/provider-access.js';
import { TruynAdapterHost } from '../../adapters/sdk/index.js';

function independentAttestation(identity, claim, source) {
  return createAttestation({
    identity,
    claim,
    verdict: 'support',
    evidence: [{ kind: 'source', sourceId: source }],
    lineage: {
      originIds: [`origin-${source}`],
      publisherIds: [`publisher-${source}`],
      generatorIds: []
    },
    method: 'd1000-safety-probe'
  });
}

async function staleReceiptProbe() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'truyn-d1000-trust-'));
  try {
    const owner = createIdentity();
    const verifier = createIdentity();
    const attesterA = createIdentity();
    const attesterB = createIdentity();
    const issuer = createIdentity();
    const root = createSourceOwnerCertificate({ identity: owner });
    const delegation = createDelegationCertificate({
      ownerIdentity: owner,
      ownerCertificate: root,
      delegateIdentity: verifier,
      delegationScopes: ['trust.verify']
    });
    const log = await new DurableTransparencyLog({ directory, sourceOwnerId: root.body.sourceOwnerId }).open();
    await log.append({ identity: owner, eventType: 'ROOT', targetId: root.certificateId, payload: { certificateId: root.certificateId } });
    await log.append({ identity: owner, eventType: 'DELEGATE', targetId: delegation.delegationId, payload: { delegationId: delegation.delegationId } });

    const claim = createClaim({
      identity: issuer,
      domain: 'network-scale',
      statement: 'D-1000 stale receipt safety probe.'
    });
    const attestations = [
      independentAttestation(attesterA, claim, 'a'),
      independentAttestation(attesterB, claim, 'b')
    ];
    const initialState = log.revocationState([delegation.delegationId, claim.claimId]);
    const receipt = createTrustReceiptV2({
      identity: verifier,
      claim,
      attestations,
      ownerCertificate: root,
      delegation,
      lifecycleHead: log.head(),
      revocationState: initialState
    });
    const before = verifyTrustReceiptV2(receipt, {
      expectedClaimId: claim.claimId,
      currentLifecycleHead: log.head(),
      currentRevocationState: initialState
    });
    if (!before.ok) throw new Error(`fresh receipt verification failed: ${before.reason || 'unknown'}`);

    await log.append({
      identity: owner,
      eventType: 'REVOKE',
      targetId: delegation.delegationId,
      payload: { reason: 'd1000 safety probe' }
    });
    const currentState = log.revocationState([delegation.delegationId, claim.claimId]);
    const stale = verifyTrustReceiptV2(receipt, {
      currentLifecycleHead: log.head(),
      currentRevocationState: currentState
    });
    const accepted = stale.ok === true ? 1 : 0;
    if (accepted !== 0 || stale.reason !== 'trust_receipt_v2_lifecycle_head_stale') {
      throw new Error(`stale receipt fail-closed invariant violated: ${JSON.stringify(stale)}`);
    }
    return {
      staleRevokedReceiptAcceptedCount: accepted,
      reason: stale.reason,
      freshReceiptVerified: true,
      revocationApplied: true
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function unauthorizedProviderProbe() {
  let executions = 0;
  let resultPayload = null;
  const node = {
    sessionToken: null,
    async register() { this.sessionToken = 'd1000-probe-session'; },
    async offer() { return { offerId: 'd1000-private-offer' }; },
    async poll() {
      return {
        events: [{
          kind: 'NEED',
          verification: { ok: true },
          envelope: {
            id: 'd1000-foreign-need',
            from: 'truyn:node:d1000-foreign-requester',
            payload: { capability: 'reasoning.general', input: 'must not execute' }
          }
        }]
      };
    },
    async result(id, output, metadata) { resultPayload = { id, output, metadata }; }
  };
  const adapter = {
    name: 'd1000-paid-provider-probe',
    version: '1',
    capabilities: ['reasoning.general'],
    async execute() {
      executions += 1;
      return { output: 'unsafe execution' };
    }
  };
  const host = new TruynAdapterHost({
    node,
    adapter,
    accessPolicy: createProviderAccessPolicy({
      mode: 'owner-only',
      allowedRequesterIds: 'truyn:node:d1000-owner'
    })
  });
  const run = await host.runOnce();
  const denied = resultPayload?.metadata?.error === 'PROVIDER_ACCESS_DENIED' && resultPayload?.metadata?.accessDenied === true;
  if (run.handled !== 1 || executions !== 0 || !denied) {
    throw new Error(`provider fail-closed invariant violated: ${JSON.stringify({ run, executions, resultPayload })}`);
  }
  return {
    unauthorizedProviderExecutionCount: executions,
    accessDenied: denied,
    handled: run.handled
  };
}

export async function runClassD1000LocalSafetyProbes() {
  const [trust, provider] = await Promise.all([
    staleReceiptProbe(),
    unauthorizedProviderProbe()
  ]);
  return {
    staleRevokedReceiptAcceptedCount: trust.staleRevokedReceiptAcceptedCount,
    unauthorizedProviderExecutionCount: provider.unauthorizedProviderExecutionCount,
    probes: {
      staleReceipt: trust,
      providerAuthorization: provider
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await runClassD1000LocalSafetyProbes();
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exit(1);
  }
}
