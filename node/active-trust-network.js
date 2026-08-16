import { createAttestation, verifyAttestation, verifyClaim } from '../core/claims/index.js';
import {
  assessActiveTrust,
  createChallenge,
  createVerification,
  verifyChallenge,
  verifyVerification
} from '../core/trust/lifecycle.js';
import {
  resolveAuthorizedTrustVerifiers,
  trustVerifierDiscoveryCapability,
  trustVerifierOfferMetadata,
  trustVerifierRequestCapability
} from '../core/trust/network.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ActiveChallengeAttesterHost {
  constructor({ node, domain, verifier, allowedRequesterIds = [], methods = ['challenge-response', 'independent-review'], pollIntervalMs = 10 } = {}) {
    if (!node) throw new Error('active challenge attester node is required');
    if (typeof domain !== 'string' || !domain.trim()) throw new Error('active challenge domain is required');
    if (typeof verifier !== 'function') throw new Error('active challenge verifier is required');
    if (!Array.isArray(allowedRequesterIds) || allowedRequesterIds.length === 0) throw new Error('active challenge attester requires allowed requester IDs');
    this.node = node;
    this.domain = domain.normalize('NFKC').trim().toLowerCase();
    this.verifier = verifier;
    this.allowedRequesterIds = [...new Set(allowedRequesterIds)];
    this.allowedRequesterSet = new Set(this.allowedRequesterIds);
    this.methods = [...new Set((methods || []).filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
    this.pollIntervalMs = pollIntervalMs;
    this.discoveryCapability = trustVerifierDiscoveryCapability(this.domain);
    this.requestCapability = trustVerifierRequestCapability(this.domain, this.node.identity.nodeId);
    this.offerIds = [];
    this.running = false;
    this.loopPromise = null;
    this.metrics = { challengesReceived: 0, challengesAuthorized: 0, challengesDenied: 0, verificationsSigned: 0, verifierFailures: 0 };
  }

  async publish() {
    if (!this.node.sessionToken) await this.node.register({ name: `TRUYN active verifier ${this.domain}` });
    if (this.offerIds.length > 0) return this.offerIds;
    const claimVerifier = trustVerifierOfferMetadata({
      domain: this.domain,
      verifierNodeId: this.node.identity.nodeId,
      requestCapability: this.requestCapability,
      methods: this.methods
    });
    const metadata = { accessMode: 'owner-only', allowedRequesterIds: this.allowedRequesterIds, claimVerifier };
    const discovery = await this.node.offer(this.discoveryCapability, metadata);
    const request = await this.node.offer(this.requestCapability, metadata);
    this.offerIds.push(discovery.offerId, request.offerId);
    return this.offerIds;
  }

  async handleNeed(event) {
    const envelope = event?.envelope;
    if (event?.verification?.ok !== true || envelope?.type !== 'NEED') return false;
    const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
    if (capability !== this.requestCapability) return false;
    this.metrics.challengesReceived += 1;
    if (!this.allowedRequesterSet.has(envelope.from)) {
      this.metrics.challengesDenied += 1;
      await this.node.result(envelope.id, null, { activeTrust: true, failed: true, error: 'CHALLENGE_VERIFIER_ACCESS_DENIED' });
      return true;
    }
    this.metrics.challengesAuthorized += 1;
    const claim = envelope.payload?.input?.claim;
    const challenge = envelope.payload?.input?.challenge;
    const claimVerification = verifyClaim(claim);
    const challengeVerification = verifyChallenge(challenge, claim?.claimId);
    if (!claimVerification.ok || !challengeVerification.ok || claim?.body?.domain !== this.domain) {
      await this.node.result(envelope.id, null, { activeTrust: true, failed: true, error: 'CHALLENGE_INVALID' });
      return true;
    }
    try {
      const decision = await this.verifier({
        claim: structuredClone(claim),
        challenge: structuredClone(challenge),
        requesterNodeId: envelope.from
      });
      const attestation = createAttestation({
        identity: this.node.identity,
        claim,
        verdict: decision?.verdict,
        evidence: decision?.evidence || [],
        lineage: decision?.lineage || {},
        method: decision?.method || this.methods[0] || 'challenge-response',
        rationaleDigest: decision?.rationaleDigest || null
      });
      const verification = createVerification({ identity: this.node.identity, challenge, attestation });
      this.metrics.verificationsSigned += 1;
      await this.node.result(envelope.id, { attestation, verification }, {
        activeTrust: true,
        challengeId: challenge.objectId,
        claimId: claim.claimId,
        verdict: attestation.body.verdict
      });
    } catch {
      this.metrics.verifierFailures += 1;
      await this.node.result(envelope.id, null, { activeTrust: true, failed: true, error: 'CHALLENGE_VERIFICATION_FAILED' });
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

  stats() { return { ...this.metrics }; }
}

export class ActiveTrustCoordinator {
  constructor({ node, verifierLimit = 8, resultTimeoutMs = 10_000, pollIntervalMs = 5 } = {}) {
    if (!node) throw new Error('active trust coordinator node is required');
    if (!Number.isInteger(verifierLimit) || verifierLimit < 1 || verifierLimit > 32) throw new Error('active verifierLimit must be 1..32');
    this.node = node;
    this.verifierLimit = verifierLimit;
    this.resultTimeoutMs = resultTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.metrics = { challengesIssued: 0, discoveryCalls: 0, verifierNeeds: 0, verifierResults: 0, verificationsAccepted: 0, verificationFailures: 0 };
  }

  async register() {
    if (!this.node.sessionToken) return this.node.register({ name: 'TRUYN active trust coordinator' });
    return { ok: true, nodeId: this.node.identity.nodeId, alreadyRegistered: true };
  }

  async discover(domain, limit = this.verifierLimit) {
    await this.register();
    this.metrics.discoveryCalls += 1;
    const result = await this.node.find(trustVerifierDiscoveryCapability(domain));
    return resolveAuthorizedTrustVerifiers(result.offers || [], domain, { limit });
  }

  async waitForResults(assignments) {
    const pending = new Map(assignments.map((assignment) => [assignment.needId, assignment]));
    const results = new Map();
    const deadline = Date.now() + this.resultTimeoutMs;
    while (pending.size > 0 && Date.now() < deadline) {
      const polled = await this.node.poll();
      for (const event of polled.events || []) {
        const requestId = event?.envelope?.payload?.requestId;
        if (event?.kind !== 'RESULT' || !pending.has(requestId)) continue;
        const assignment = pending.get(requestId);
        if (event.verification?.ok !== true || event.envelope.from !== assignment.verifier.nodeId) {
          throw new Error('active challenge RESULT identity verification failed');
        }
        results.set(requestId, event);
        pending.delete(requestId);
      }
      if (pending.size > 0) await delay(this.pollIntervalMs);
    }
    if (pending.size > 0) {
      const error = new Error('active_challenge_result_timeout');
      error.code = 'active_challenge_result_timeout';
      error.pendingVerifiers = [...pending.values()].map((item) => item.verifier.nodeId);
      throw error;
    }
    return results;
  }

  async challenge({
    claim,
    methods = ['independent-review'],
    reason = 'active-verification',
    deadlineAt = null,
    verifierLimit = this.verifierLimit,
    lineageCertificates = [],
    revocations = [],
    disputes = [],
    authorizedDisputerNodeIds = [],
    retrievalProvenance = null,
    policy = {},
    now = Date.now(),
    maxAttestationAgeMs
  } = {}) {
    const claimVerification = verifyClaim(claim);
    if (!claimVerification.ok) throw new Error(`invalid claim: ${claimVerification.reason}`);
    await this.register();
    const challenge = createChallenge({ identity: this.node.identity, claim, methods, reason, deadlineAt });
    this.metrics.challengesIssued += 1;
    const verifiers = await this.discover(claim.body.domain, verifierLimit);
    const assignments = await Promise.all(verifiers.map(async (verifier) => {
      const assigned = await this.node.need(verifier.requestCapability, { claim, challenge }, {
        activeTrust: true,
        challengeId: challenge.objectId,
        claimId: claim.claimId,
        expectedProvider: verifier.nodeId
      });
      if (assigned.provider !== verifier.nodeId) throw new Error('active challenge routed to unexpected verifier');
      this.metrics.verifierNeeds += 1;
      return { ...assigned, verifier };
    }));
    const events = await this.waitForResults(assignments);
    const attestations = [];
    const verifications = [];
    for (const assignment of assignments) {
      const event = events.get(assignment.needId);
      this.metrics.verifierResults += 1;
      const attestation = event?.envelope?.payload?.output?.attestation;
      const verification = event?.envelope?.payload?.output?.verification;
      const attestationCheck = verifyAttestation(attestation, claim.claimId);
      const verificationCheck = verifyVerification(verification, challenge.objectId);
      if (!attestationCheck.ok || !verificationCheck.ok || attestation.attesterNodeId !== assignment.verifier.nodeId || verification.signerNodeId !== assignment.verifier.nodeId || verification.body.attestationId !== attestation.attestationId) {
        this.metrics.verificationFailures += 1;
        throw new Error('active verifier proof verification failed');
      }
      this.metrics.verificationsAccepted += 1;
      attestations.push(attestation);
      verifications.push(verification);
    }
    const assessment = assessActiveTrust({
      claim,
      attestations,
      lineageCertificates,
      revocations,
      disputes,
      authorizedDisputerNodeIds,
      retrievalProvenance,
      policy,
      now,
      ...(maxAttestationAgeMs == null ? {} : { maxAttestationAgeMs })
    });
    return { challenge, authorizedVerifierCount: verifiers.length, attestations, verifications, assessment };
  }

  stats() { return { ...this.metrics }; }
}
