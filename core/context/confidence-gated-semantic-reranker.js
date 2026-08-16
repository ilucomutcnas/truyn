import { createProviderSemanticReranker } from './provider-semantic-reranker.js';

function addUsage(left = {}, right = {}) {
  return {
    input:(left.input || 0) + (right.input || 0),
    output:(left.output || 0) + (right.output || 0),
    total:(left.total || 0) + (right.total || 0)
  };
}

function combineMetadata(parts) {
  let usage = { input:0, output:0, total:0 };
  let providerRequestBodyBytes = 0;
  let providerLatencyMs = 0;
  let repairAttemptsUsed = 0;
  for (const part of parts.filter(Boolean)) {
    usage = addUsage(usage, part.usage);
    providerRequestBodyBytes += part.providerRequestBodyBytes || 0;
    providerLatencyMs += part.providerLatencyMs || 0;
    repairAttemptsUsed += part.repairAttemptsUsed || 0;
  }
  return { usage, providerRequestBodyBytes, providerLatencyMs, repairAttemptsUsed };
}

function normalizeVerifierTiers(verifierCandidateTiers, maxCandidates) {
  if (verifierCandidateTiers == null) return null;
  if (!Array.isArray(verifierCandidateTiers) || verifierCandidateTiers.length < 1) {
    throw new Error('verifierCandidateTiers must be a non-empty integer array when configured');
  }
  const tiers = [...new Set(verifierCandidateTiers)].sort((a, b) => a - b);
  if (tiers.some((value) => !Number.isInteger(value) || value < 1 || value > maxCandidates)) {
    throw new Error('verifierCandidateTiers values must be integers within maxCandidates');
  }
  if (tiers.at(-1) !== maxCandidates) tiers.push(maxCandidates);
  return tiers;
}

function normalizeStabilityRanks(stabilityRecheckDenseRanks, confidenceDenseRankMax) {
  if (stabilityRecheckDenseRanks == null) return null;
  if (!Array.isArray(stabilityRecheckDenseRanks) || stabilityRecheckDenseRanks.length < 1) {
    throw new Error('stabilityRecheckDenseRanks must be a non-empty integer array when configured');
  }
  const ranks = [...new Set(stabilityRecheckDenseRanks)].sort((a, b) => a - b);
  if (ranks.some((value) => !Number.isInteger(value) || value < 1 || value > confidenceDenseRankMax)) {
    throw new Error('stabilityRecheckDenseRanks values must be integers within confidenceDenseRankMax');
  }
  return ranks;
}

/**
 * Confidence-gated semantic reranker.
 *
 * Input candidates MUST already be ordered best-first by the dense retriever.
 * Two independent cheap semantic judges inspect only the first cheapCandidateK
 * candidates. Their agreement is accepted only inside the configured dense
 * confidence rank. Everything else fails closed to a stronger verifier.
 *
 * verifierCandidateTiers selects the smallest dense-prefix verifier tier that
 * contains the observed cheap selections; maxCandidates remains the final
 * fail-closed tier. No case/language/category/expected-answer hints are used.
 *
 * Rank-2 agreement is stability-checked by default because this is the first
 * ambiguous dense position: the cheaper Lite judge is repeated with candidate
 * order reversed. The initial agreement is accepted only if that reordered pass
 * resolves to the same original passage; otherwise the request fails closed to
 * the strong verifier. This is an instability detector, not another vote, and
 * it uses no case id, language, category, expected answer, or block identifier.
 *
 * Provider-facing calls always go through createProviderSemanticReranker, which
 * replaces real block IDs/CIDs with request-local aliases.
 */
export function createConfidenceGatedSemanticReranker({
  liteProvider,
  flashProvider,
  verifierProvider,
  name = 'confidence-gated-semantic-reranker',
  cheapCandidateK = 24,
  confidenceDenseRankMax = 15,
  maxCandidates = 64,
  verifierCandidateTiers = [16,64],
  stabilityRecheckDenseRanks = [2],
  liteProviderOptions = {},
  flashProviderOptions = {},
  verifierProviderOptions = {},
  repairAttempts = 1
} = {}) {
  if (!liteProvider || !flashProvider || !verifierProvider) {
    throw new Error('confidence-gated semantic reranker requires liteProvider, flashProvider, and verifierProvider');
  }
  if (!Number.isInteger(cheapCandidateK) || cheapCandidateK < 1 || cheapCandidateK > maxCandidates) {
    throw new Error('cheapCandidateK must be an integer within maxCandidates');
  }
  if (!Number.isInteger(confidenceDenseRankMax) || confidenceDenseRankMax < 1 || confidenceDenseRankMax > cheapCandidateK) {
    throw new Error('confidenceDenseRankMax must be 1..cheapCandidateK');
  }
  const verifierTiers = normalizeVerifierTiers(verifierCandidateTiers, maxCandidates);
  const stabilityRanks = normalizeStabilityRanks(stabilityRecheckDenseRanks, confidenceDenseRankMax);

  const lite = createProviderSemanticReranker({
    provider:liteProvider,
    name:`${name}:lite`,
    providerOptions:liteProviderOptions,
    maxCandidates:cheapCandidateK,
    repairAttempts
  });
  const flash = createProviderSemanticReranker({
    provider:flashProvider,
    name:`${name}:flash`,
    providerOptions:flashProviderOptions,
    maxCandidates:cheapCandidateK,
    repairAttempts
  });
  const verifier = createProviderSemanticReranker({
    provider:verifierProvider,
    name:`${name}:verifier`,
    providerOptions:verifierProviderOptions,
    maxCandidates,
    repairAttempts
  });

  const metrics = {
    requests:0,
    cheapAccepted:0,
    verifierFallbacks:0,
    cheapDisagreements:0,
    lowDenseConfidence:0,
    stabilityRechecks:0,
    stabilityFailures:0,
    verifierTierCounts:{}
  };

  async function rerank(query, candidates, { topK = 1 } = {}) {
    if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > maxCandidates) {
      throw new Error(`confidence-gated reranker candidates must be 1..${maxCandidates}`);
    }
    if (topK !== 1) throw new Error('confidence-gated semantic reranker supports topK=1');
    metrics.requests += 1;

    const cheapCandidates = candidates.slice(0, Math.min(cheapCandidateK, candidates.length));
    const [liteResult, flashResult] = await Promise.all([
      lite.rerank(query, cheapCandidates),
      flash.rerank(query, cheapCandidates)
    ]);
    const agreement = liteResult.id === flashResult.id;
    const liteDenseRank = candidates.findIndex((candidate) => candidate.id === liteResult.id) + 1;
    const flashDenseRank = candidates.findIndex((candidate) => candidate.id === flashResult.id) + 1;
    const agreedDenseRank = agreement ? liteDenseRank : null;
    let cheapMetadata = combineMetadata([liteResult.metadata, flashResult.metadata]);

    let stabilityChecked = false;
    let stabilityPassed = true;
    let stabilityLiteDenseRank = null;
    if (agreement && stabilityRanks?.includes(agreedDenseRank)) {
      stabilityChecked = true;
      metrics.stabilityRechecks += 1;
      const reversedCandidates = [...cheapCandidates].reverse();
      const liteStability = await lite.rerank(query, reversedCandidates);
      stabilityLiteDenseRank = candidates.findIndex((candidate) => candidate.id === liteStability.id) + 1;
      stabilityPassed = liteStability.id === liteResult.id;
      cheapMetadata = combineMetadata([liteResult.metadata, flashResult.metadata, liteStability.metadata]);
      if (!stabilityPassed) metrics.stabilityFailures += 1;
    }

    if (agreement && agreedDenseRank > 0 && agreedDenseRank <= confidenceDenseRankMax && stabilityPassed) {
      metrics.cheapAccepted += 1;
      return {
        id:liteResult.id,
        metadata:{
          ...cheapMetadata,
          routeMode:stabilityChecked ? 'cheap_stable' : 'cheap_confident',
          cheapAgreement:true,
          agreedDenseRank,
          liteDenseRank,
          flashDenseRank,
          stabilityChecked,
          stabilityPassed,
          stabilityLiteDenseRank,
          stabilityFlashDenseRank:null,
          cheapCandidateK,
          confidenceDenseRankMax,
          stabilityRecheckDenseRanks:stabilityRanks ? [...stabilityRanks] : null,
          providerCandidateAliases:true
        }
      };
    }

    metrics.verifierFallbacks += 1;
    if (!agreement) metrics.cheapDisagreements += 1;
    else if (!stabilityChecked || stabilityPassed) metrics.lowDenseConfidence += 1;

    const observedRanks = [liteDenseRank, flashDenseRank, stabilityLiteDenseRank]
      .filter((rank) => Number.isInteger(rank) && rank > 0);
    const observedDenseRank = observedRanks.length > 0 ? Math.max(...observedRanks) : maxCandidates;
    const verifierCandidateK = verifierTiers
      ? (verifierTiers.find((tier) => tier >= observedDenseRank) || maxCandidates)
      : maxCandidates;
    metrics.verifierTierCounts[verifierCandidateK] = (metrics.verifierTierCounts[verifierCandidateK] || 0) + 1;

    const verified = await verifier.rerank(query, candidates.slice(0, verifierCandidateK));
    const totalMetadata = combineMetadata([cheapMetadata, verified.metadata]);
    return {
      id:verified.id,
      metadata:{
        ...totalMetadata,
        routeMode:stabilityChecked && !stabilityPassed ? 'stability_verifier_fallback' : 'verifier_fallback',
        cheapAgreement:agreement,
        agreedDenseRank,
        liteDenseRank,
        flashDenseRank,
        stabilityChecked,
        stabilityPassed,
        stabilityLiteDenseRank,
        stabilityFlashDenseRank:null,
        verifierCandidateK,
        cheapCandidateK,
        confidenceDenseRankMax,
        stabilityRecheckDenseRanks:stabilityRanks ? [...stabilityRanks] : null,
        providerCandidateAliases:true
      }
    };
  }

  return {
    name,
    rerank,
    stats:() => ({
      ...metrics,
      verifierTierCounts:{ ...metrics.verifierTierCounts },
      cheapCandidateK,
      confidenceDenseRankMax,
      maxCandidates,
      verifierCandidateTiers:verifierTiers ? [...verifierTiers] : null,
      stabilityRecheckDenseRanks:stabilityRanks ? [...stabilityRanks] : null,
      stabilityRecheckJudge:stabilityRanks ? 'lite' : null,
      lite:lite.stats(),
      flash:flash.stats(),
      verifier:verifier.stats(),
      providerCandidateAliases:true
    })
  };
}
