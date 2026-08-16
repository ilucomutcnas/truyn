import { createHash } from 'node:crypto';
import { canonicalize } from '../protocol/index.js';
import { verifyAttestation, verifyClaim } from '../claims/index.js';

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

function unionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (value) => {
    while (parent[value] !== value) {
      parent[value] = parent[parent[value]];
      value = parent[value];
    }
    return value;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  return { parent, find, union };
}

function lineageTokens(attestation) {
  const lineage = attestation?.body?.lineage || {};
  return new Set([
    ...(lineage.originIds || []).map((value) => `origin:${value}`),
    ...(lineage.publisherIds || []).map((value) => `publisher:${value}`),
    ...(lineage.generatorIds || []).map((value) => `generator:${value}`)
  ]);
}

export function analyzeAttestationIndependence(attestations) {
  if (!Array.isArray(attestations)) throw new Error('attestations must be an array');
  const uf = unionFind(attestations.length);
  const tokenOwner = new Map();
  const unknown = [];

  attestations.forEach((attestation, index) => {
    const tokens = lineageTokens(attestation);
    if (tokens.size === 0) {
      unknown.push(index);
      return;
    }
    for (const token of tokens) {
      if (tokenOwner.has(token)) uf.union(index, tokenOwner.get(token));
      else tokenOwner.set(token, index);
    }
  });

  // Unknown lineage never receives independent credit. Collapse all unknowns into one conservative group.
  for (let i = 1; i < unknown.length; i += 1) uf.union(unknown[0], unknown[i]);

  const groups = new Map();
  attestations.forEach((attestation, index) => {
    const root = uf.find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(attestation);
  });

  const normalizedGroups = [...groups.values()].map((members) => {
    const origins = new Set();
    const publishers = new Set();
    const generators = new Set();
    const attesters = new Set();
    const verdicts = new Set();
    for (const member of members) {
      attesters.add(member.attesterNodeId);
      verdicts.add(member.body.verdict);
      for (const value of member.body.lineage?.originIds || []) origins.add(value);
      for (const value of member.body.lineage?.publisherIds || []) publishers.add(value);
      for (const value of member.body.lineage?.generatorIds || []) generators.add(value);
    }
    const knownLineage = origins.size + publishers.size + generators.size > 0;
    let verdict = 'uncertain';
    if (verdicts.has('support') && verdicts.has('contradict')) verdict = 'mixed';
    else if (verdicts.has('support')) verdict = 'support';
    else if (verdicts.has('contradict')) verdict = 'contradict';
    return {
      groupId: digest({
        origins: [...origins].sort(),
        publishers: [...publishers].sort(),
        generators: [...generators].sort(),
        unknown: !knownLineage
      }),
      knownLineage,
      verdict,
      memberCount: members.length,
      attesterCount: attesters.size,
      originCount: origins.size,
      publisherCount: publishers.size,
      generatorCount: generators.size,
      attestationIds: members.map((member) => member.attestationId).sort()
    };
  }).sort((a, b) => a.groupId.localeCompare(b.groupId));

  const known = normalizedGroups.filter((group) => group.knownLineage);
  return {
    groups: normalizedGroups,
    independentKnownGroups: known.length,
    supportGroups: known.filter((group) => group.verdict === 'support').length,
    contradictGroups: known.filter((group) => group.verdict === 'contradict').length,
    mixedGroups: known.filter((group) => group.verdict === 'mixed').length,
    uncertainGroups: known.filter((group) => group.verdict === 'uncertain').length,
    unknownLineageGroups: normalizedGroups.filter((group) => !group.knownLineage).length,
    rawAttestations: attestations.length
  };
}

export function buildProvenanceGraph({ claim, attestations = [] }) {
  const claimVerification = verifyClaim(claim);
  if (!claimVerification.ok) throw new Error(`invalid claim: ${claimVerification.reason}`);
  if (!Array.isArray(attestations)) throw new Error('attestations must be an array');

  const nodes = [{ id: claim.claimId, type: 'CLAIM', digest: digest(claim.body) }];
  const edges = [];
  const sourceNodes = new Map();

  for (const attestation of attestations) {
    const verification = verifyAttestation(attestation, claim.claimId);
    if (!verification.ok) throw new Error(`invalid attestation: ${verification.reason}`);
    nodes.push({
      id: attestation.attestationId,
      type: 'ATTEST',
      verdict: attestation.body.verdict,
      attesterNodeId: attestation.attesterNodeId,
      digest: digest(attestation.body)
    });
    edges.push({
      from: attestation.attestationId,
      to: claim.claimId,
      type: attestation.body.verdict === 'support' ? 'SUPPORTS' : attestation.body.verdict === 'contradict' ? 'CONTRADICTS' : 'EVALUATES'
    });

    for (const evidence of attestation.body.evidence || []) {
      const sourceNodeId = `source:${digest({ sourceId: evidence.sourceId, contentDigest: evidence.contentDigest })}`;
      if (!sourceNodes.has(sourceNodeId)) {
        sourceNodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: 'SOURCE',
          kind: evidence.kind,
          sourceCommitment: digest(evidence.sourceId),
          contentDigest: evidence.contentDigest
        });
      }
      edges.push({ from: attestation.attestationId, to: sourceNodeId, type: 'EVIDENCED_BY' });
      for (const parentSourceId of evidence.parentSourceIds || []) {
        const parentNodeId = `source:${digest({ sourceId: parentSourceId, contentDigest: null })}`;
        if (!sourceNodes.has(parentNodeId)) {
          sourceNodes.set(parentNodeId, {
            id: parentNodeId,
            type: 'SOURCE',
            kind: 'lineage-parent',
            sourceCommitment: digest(parentSourceId),
            contentDigest: null
          });
        }
        edges.push({ from: sourceNodeId, to: parentNodeId, type: 'DERIVED_FROM' });
      }
    }

    for (const parentAttestationId of attestation.body.lineage?.parentAttestationIds || []) {
      edges.push({ from: attestation.attestationId, to: parentAttestationId, type: 'DERIVED_FROM_ATTESTATION' });
    }
  }

  nodes.push(...sourceNodes.values());
  const independence = analyzeAttestationIndependence(attestations);
  const graph = {
    version: 1,
    claimId: claim.claimId,
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => `${a.from}:${a.type}:${a.to}`.localeCompare(`${b.from}:${b.type}:${b.to}`)),
    independence
  };
  return { ...graph, graphDigest: digest(graph) };
}
