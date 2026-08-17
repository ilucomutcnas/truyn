import { createHash } from 'node:crypto';
import { ATTEST_VERDICTS, createAttestation } from '../../core/claims/index.js';

function text(value, label, max = 512) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`);
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

function rationaleDigest(value) {
  if (value == null) return null;
  const normalized = text(value, 'external attestation rationale', 16_384);
  return `sha256:${createHash('sha256').update(normalized).digest('hex')}`;
}

/**
 * Boundary adapter for independent/external evidence sources.
 *
 * The adapter deliberately does not fetch arbitrary URLs. The caller supplies a
 * verifier function that owns provider credentials/network policy. TRUYN only
 * accepts the verifier's normalized decision and turns it into a signed,
 * provenance-bearing attestation. Raw provider responses and credentials are
 * not copied into the attestation.
 */
export class ExternalAttestationAdapter {
  constructor({ identity, sourceId, sourceKind = 'external', method = 'external-verification', verify } = {}) {
    if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('attester identity is required');
    if (typeof verify !== 'function') throw new Error('external verifier function is required');
    this.identity = identity;
    this.sourceId = text(sourceId, 'external sourceId');
    this.sourceKind = text(sourceKind, 'external source kind', 80);
    this.method = text(method, 'external attestation method', 256);
    this.verifyExternal = verify;
  }

  async attest({ claim, input = null, context = null, signal = null } = {}) {
    if (!claim?.claimId) throw new Error('claim is required');
    const result = await this.verifyExternal({ claim, input, context, signal });
    if (!result || typeof result !== 'object') throw new Error('external verifier returned no decision');
    if (!ATTEST_VERDICTS.includes(result.verdict)) throw new Error('external verifier verdict must be support, contradict or uncertain');

    const suppliedEvidence = Array.isArray(result.evidence) ? result.evidence : [];
    const evidence = suppliedEvidence.length > 0
      ? suppliedEvidence
      : [{
          kind: this.sourceKind,
          sourceId: this.sourceId,
          contentDigest: typeof result.contentDigest === 'string' && result.contentDigest.trim() ? result.contentDigest.trim() : null,
          parentSourceIds: Array.isArray(result.parentSourceIds) ? result.parentSourceIds : []
        }];

    return createAttestation({
      identity: this.identity,
      claim,
      verdict: result.verdict,
      evidence,
      lineage: result.lineage || {},
      method: result.method || this.method,
      rationaleDigest: result.rationaleDigest || rationaleDigest(result.rationale),
      createdAt: result.createdAt || new Date().toISOString()
    });
  }
}

export function createExternalAttestationAdapter(options) {
  return new ExternalAttestationAdapter(options);
}
