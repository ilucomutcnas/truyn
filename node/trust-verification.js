import { createAttestation, verifyAttestation, verifyClaim } from '../core/claims/index.js';
import { createTrustReceipt } from '../core/trust/index.js';
import {
  resolveAuthorizedTrustVerifiers,
  trustVerifierDiscoveryCapability,
  trustVerifierOfferMetadata,
  trustVerifierRequestCapability
} from '../core/trust/network.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ClaimAttesterHost {
  constructor({
    node,
    domain,
    verifier,
    allowedRequesterIds = [],
    methods = ['independent-review'],
    pollIntervalMs = 10
  } = {}) {
    if (!node) throw new Error('claim attester node is required');
    if (typeof domain !== 'string' || !domain.trim()) throw new Error('claim attester domain is required');
    if (typeof verifier !== 'function') throw new Error('claim attester verifier function is required');
    if (!Array.isArray(allowedRequesterIds) || allowedRequesterIds.length === 0) throw new Error('claim attester requires allowed requester IDs');
    this.node = node;
    this.domain = domain.normalize('NFKC').trim().toLowerCase();
    this.verifier = verifier;
    this.allowedRequesterIds = [...new Set(allowedRequesterIds)];
    this.allowedRequesterSet = new Set(this.allowedRequesterIds);
    this.methods = [...new Set(methods)];
    this.pollIntervalMs = pollIntervalMs;
    this.discoveryCapability = trustVerifierDiscoveryCapability(this.domain);
    this.requestCapability = trustVerifierRequestCapability(this.domain, this.node.identity.nodeId);
    this.offerIds = [];
    this.running = false;
    this.loopPromise = null;
    this.metrics = {
      needsReceived: 0,
      needsAuthorized: 0,
      needsDenied: 0,
      attestationsSigned: 0,
      verifierFailures: 0
    };
  }

  async publish() {
    if (!this.node.sessionToken) await this.node.register({ name: `TRUYN claim attester ${this.domain}` });
    if (this.offerIds.length > 0) return this.offerIds;
    const claimVerifier = trustVerifierOfferMetadata({
      domain: this.domain,
      verifierNodeId: this.node.identity.nodeId,
      requestCapability: this.requestCapability,
      methods: this.methods
    });
    const metadata = {
      accessMode: 'owner-only',
      allowedRequesterIds: this.allowedRequesterIds,
      claimVerifier
    };
    const discovery = await this.node.offer(this.discoveryCapability, metadata);
    const request = await this.node.offer(this.requestCapability, metadata);
    this.offerIds.push(discovery.offerId, request.offerId);
    return this.offerIds;
  }

  async handleNeed(event) {
    this.metrics.needsReceived += 1;
    const envelope = event?.envelope;
    if (event?.verification?.ok !== true || envelope?.type !== 'NEED') return false;
    const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
    if (capability !== this.requestCapability) return false;
    const requesterId = envelope.from;
    if (!this.allowedRequesterSet.has(requesterId)) {
      this.metrics.needsDenied += 1;
      await this.node.result(envelope.id, null, { claimVerification: true, failed: true, error: 'CLAIM_VERIFIER_ACCESS_DENIED' });
      return true;
    }
    this.metrics.needsAuthorized += 1;
    const claim = envelope.payload?.input?.claim;
    const verification = verifyClaim(claim);
    if (!verification.ok || claim?.body?.domain !== this.domain) {
      await this.node.result(envelope.id, null, { claimVerification: true, failed: true, error: 'CLAIM_INVALID' });
      return true;
    }

    try {
      const decision = await this.verifier({ claim: structuredClone(claim), requesterNodeId: requesterId });
      const attestation = createAttestation({
        identity: this.node.identity,
        claim,
        verdict: decision?.verdict,
        evidence: decision?.evidence || [],
        lineage: decision?.lineage || {},
        method: decision?.method || this.methods[0] || 'independent-review',
        rationaleDigest: decision?.rationaleDigest || null
      });
      this.metrics.attestationsSigned += 1;
      await this.node.result(envelope.id, { attestation }, {
        claimVerification: true,
        claimId: claim.claimId,
        verdict: attestation.body.verdict
      });
    } catch (error) {
      this.metrics.verifierFailures += 1;
      await this.node.result(envelope.id, null, {
        claimVerification: true,
        failed: true,
        error: 'CLAIM_VERIFICATION_FAILED'
      });
    }
    return true;
  }

  async serveOnce() {
    await this.publish();
    const polled = await this.node.poll();
    let handled = 0;
    for (const event of polled.events || []) if (await this.handleNeed(event)) handled += 1;
    return { handled, events: (polled.events || []).length };
  }

  async start() {
    if (this.running) return;
    await this.publish();
    this.running = true;
    this.loopPromise = (async () => {
      while (this.running) {
        await this.serveOnce();
        if (this.running) await delay(this.pollIntervalMs);
      }
    })();
  }

  async stop() {
    this.running = false;
    if (this.loopPromise) {
      try { await this.loopPromise; } catch {}
      this.loopPromise = null;
    }
  }

  stats() {
    return { ...this.metrics };
  }
}

export class ClaimVerificationCoordinator {
  constructor({
    node,
    verifierLimit = 8,
    policy = {},
    resultTimeoutMs = 10_000,
    pollIntervalMs = 5
  } = {}) {
    if (!node) throw new Error('claim verification coordinator node is required');
    if (!Number.isInteger(verifierLimit) || verifierLimit < 1 || verifierLimit > 32) throw new Error('verifierLimit must be 1..32');
    this.node = node;
    this.verifierLimit = verifierLimit;
    this.policy = { ...policy };
    this.resultTimeoutMs = resultTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.unmatchedEvents = [];
    this.metrics = {
      claimsVerified: 0,
      discoveryCalls: 0,
      verifierNeeds: 0,
      verifierResults: 0,
      attestationsAccepted: 0,
      attestationFailures: 0,
      receiptsSigned: 0
    };
  }

  async register(name = 'TRUYN claim verification coordinator') {
    if (!this.node.sessionToken) return this.node.register({ name });
    return { ok: true, nodeId: this.node.identity.nodeId, alreadyRegistered: true };
  }

  async discover(domain, limit = this.verifierLimit) {
    await this.register();
    this.metrics.discoveryCalls += 1;
    const discovery = await this.node.find(trustVerifierDiscoveryCapability(domain));
    return resolveAuthorizedTrustVerifiers(discovery.offers || [], domain, { limit });
  }

  async waitForResults(assignments) {
    const pending = new Map(assignments.map((assignment) => [assignment.needId, assignment]));
    const results = new Map();
    const deadline = Date.now() + this.resultTimeoutMs;
    while (pending.size > 0 && Date.now() < deadline) {
      const polled = await this.node.poll();
      for (const event of polled.events || []) {
        const requestId = event?.envelope?.payload?.requestId;
        if (event?.kind !== 'RESULT' || !pending.has(requestId)) {
          this.unmatchedEvents.push(event);
          continue;
        }
        const assignment = pending.get(requestId);
        if (event.verification?.ok !== true) throw new Error('claim verifier RESULT signature verification failed');
        if (event.envelope.from !== assignment.verifier.nodeId) throw new Error('claim verifier RESULT provider mismatch');
        results.set(requestId, event);
        pending.delete(requestId);
      }
      if (pending.size > 0) await delay(this.pollIntervalMs);
    }
    if (pending.size > 0) {
      const error = new Error('claim_verification_result_timeout');
      error.code = 'claim_verification_result_timeout';
      error.pendingVerifiers = [...pending.values()].map((item) => item.verifier.nodeId);
      throw error;
    }
    return results;
  }

  async verify({ claim, retrievalProvenance = null, verifierLimit = this.verifierLimit, policy = this.policy } = {}) {
    const claimVerification = verifyClaim(claim);
    if (!claimVerification.ok) throw new Error(`invalid claim: ${claimVerification.reason}`);
    await this.register();
    this.metrics.claimsVerified += 1;
    const verifiers = await this.discover(claim.body.domain, verifierLimit);
    const attestations = [];

    if (verifiers.length > 0) {
      const assignments = await Promise.all(verifiers.map(async (verifier) => {
        const assigned = await this.node.need(verifier.requestCapability, { claim }, {
          claimVerification: true,
          claimId: claim.claimId,
          expectedProvider: verifier.nodeId
        });
        if (assigned.provider !== verifier.nodeId) throw new Error('claim verification routed to unexpected verifier');
        this.metrics.verifierNeeds += 1;
        return { ...assigned, verifier };
      }));
      const events = await this.waitForResults(assignments);
      for (const assignment of assignments) {
        const event = events.get(assignment.needId);
        this.metrics.verifierResults += 1;
        const attestation = event?.envelope?.payload?.output?.attestation;
        const verification = verifyAttestation(attestation, claim.claimId);
        if (!verification.ok || attestation.attesterNodeId !== assignment.verifier.nodeId) {
          this.metrics.attestationFailures += 1;
          throw new Error(`claim attestation verification failed: ${verification.reason || 'provider_mismatch'}`);
        }
        this.metrics.attestationsAccepted += 1;
        attestations.push(attestation);
      }
    }

    const receipt = createTrustReceipt({
      identity: this.node.identity,
      claim,
      attestations,
      retrievalProvenance,
      policy
    });
    this.metrics.receiptsSigned += 1;
    return {
      claimId: claim.claimId,
      receipt,
      verification: {
        authorizedVerifierCount: verifiers.length,
        attestationCount: attestations.length,
        retrievalIntegrity: receipt.payload.retrievalIntegrity,
        truthAssessment: receipt.payload.truthAssessment,
        provenanceGraphDigest: receipt.payload.provenanceGraphDigest
      }
    };
  }

  stats() {
    return { ...this.metrics, unmatchedEvents: this.unmatchedEvents.length };
  }
}
