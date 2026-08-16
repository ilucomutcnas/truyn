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

/**
 * Confidence-gated semantic reranker.
 *
 * Input candidates MUST already be ordered best-first by the dense retriever.
 * Two independent cheap semantic judges inspect only the first cheapCandidateK
 * candidates. Their agreement is accepted only when the agreed passage also
 * remains inside the configured dense confidence rank. All other requests fail
 * closed into a stronger verifier over the complete candidate set.
 *
 * Every provider-facing selection is delegated to createProviderSemanticReranker,
 * which replaces real block IDs/CIDs with request-local aliases. No provider in
 * this gate receives TRUYN routing identifiers.
 */
export function createConfidenceGatedSemanticReranker({
  liteProvider,
  flashProvider,
  verifierProvider,
  name = 'confidence-gated-semantic-reranker',
  cheapCandidateK = 24,
  confidenceDenseRankMax = 12,
  maxCandidates = 64,
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
    lowDenseConfidence:0
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
    const agreedDenseRank = agreement
      ? candidates.findIndex((candidate) => candidate.id === liteResult.id) + 1
      : null;
    const cheapMetadata = combineMetadata([liteResult.metadata, flashResult.metadata]);

    if (agreement && agreedDenseRank > 0 && agreedDenseRank <= confidenceDenseRankMax) {
      metrics.cheapAccepted += 1;
      return {
        id:liteResult.id,
        metadata:{
          ...cheapMetadata,
          routeMode:'cheap_confident',
          cheapAgreement:true,
          agreedDenseRank,
          cheapCandidateK,
          confidenceDenseRankMax,
          providerCandidateAliases:true
        }
      };
    }

    metrics.verifierFallbacks += 1;
    if (!agreement) metrics.cheapDisagreements += 1;
    else metrics.lowDenseConfidence += 1;
    const verified = await verifier.rerank(query, candidates);
    const totalMetadata = combineMetadata([cheapMetadata, verified.metadata]);
    return {
      id:verified.id,
      metadata:{
        ...totalMetadata,
        routeMode:'verifier_fallback',
        cheapAgreement:agreement,
        agreedDenseRank,
        cheapCandidateK,
        confidenceDenseRankMax,
        providerCandidateAliases:true
      }
    };
  }

  return {
    name,
    rerank,
    stats:() => ({
      ...metrics,
      cheapCandidateK,
      confidenceDenseRankMax,
      maxCandidates,
      lite:lite.stats(),
      flash:flash.stats(),
      verifier:verifier.stats(),
      providerCandidateAliases:true
    })
  };
}
