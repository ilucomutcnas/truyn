import { createHash } from 'node:crypto';
import { canonicalize } from '../protocol/index.js';

export const TRUST_VERIFIER_NETWORK_VERSION = 1;
export const TRUST_VERIFIER_NETWORK_PROTOCOL = 'truyn-claim-verifier-v1';

const hash = (value) => createHash('sha256').update(canonicalize(value)).digest('hex');

function normalizeDomain(domain) {
  if (typeof domain !== 'string' || domain.trim().length === 0) throw new Error('claim verifier domain is required');
  return domain.normalize('NFKC').trim().toLowerCase();
}

export function trustVerifierDiscoveryCapability(domain) {
  return `trust.verify.${hash({ domain: normalizeDomain(domain) }).slice(0, 32)}`;
}

export function trustVerifierRequestCapability(domain, verifierNodeId) {
  if (typeof verifierNodeId !== 'string' || verifierNodeId.length === 0) throw new Error('verifier node ID is required');
  return `${trustVerifierDiscoveryCapability(domain)}.${hash({ verifierNodeId }).slice(0, 16)}`;
}

export function trustVerifierOfferMetadata({ domain, verifierNodeId, requestCapability, methods = [] }) {
  const normalizedDomain = normalizeDomain(domain);
  if (requestCapability !== trustVerifierRequestCapability(normalizedDomain, verifierNodeId)) {
    throw new Error('claim verifier request capability mismatch');
  }
  return {
    protocol: TRUST_VERIFIER_NETWORK_PROTOCOL,
    version: TRUST_VERIFIER_NETWORK_VERSION,
    role: 'claim-verifier',
    domain: normalizedDomain,
    verifierNodeId,
    requestCapability,
    methods: [...new Set((methods || []).filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort()
  };
}

export function parseTrustVerifierOffer(offer, domain) {
  const normalizedDomain = normalizeDomain(domain);
  const metadata = offer?.payload?.metadata?.claimVerifier;
  if (!metadata || metadata.protocol !== TRUST_VERIFIER_NETWORK_PROTOCOL || metadata.version !== TRUST_VERIFIER_NETWORK_VERSION) return null;
  if (metadata.role !== 'claim-verifier' || metadata.domain !== normalizedDomain) return null;
  if (metadata.verifierNodeId !== offer.from) return null;
  if (metadata.requestCapability !== trustVerifierRequestCapability(normalizedDomain, offer.from)) return null;
  return {
    nodeId: offer.from,
    publicKey: offer.publicKey,
    trust: offer.trust || null,
    domain: normalizedDomain,
    requestCapability: metadata.requestCapability,
    methods: Array.isArray(metadata.methods) ? [...metadata.methods] : [],
    offer
  };
}

export function resolveAuthorizedTrustVerifiers(offers, domain, { limit = 8 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 32) throw new Error('claim verifier limit must be 1..32');
  const parsed = (offers || []).map((offer) => parseTrustVerifierOffer(offer, domain)).filter(Boolean);
  const unique = new Map();
  for (const verifier of parsed) if (!unique.has(verifier.nodeId)) unique.set(verifier.nodeId, verifier);
  return [...unique.values()]
    .sort((left, right) => Number(right.trust?.score || 0) - Number(left.trust?.score || 0) || left.nodeId.localeCompare(right.nodeId))
    .slice(0, limit);
}
