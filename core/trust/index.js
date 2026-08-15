export function trustabilityLite({ identityVerified = false, successfulTasks = 0, failedTasks = 0, lastSeenAt = null, attestations = 0, now = Date.now() } = {}) {
  const total = successfulTasks + failedTasks;
  const successRate = (successfulTasks + 1) / (total + 2);
  const seenAt = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const recency = seenAt > 0 && now - seenAt <= 5 * 60_000 ? 1 : 0;
  const attestationScore = Math.min(1, Math.max(0, attestations / 5));

  const score =
    0.40 * (identityVerified ? 1 : 0) +
    0.35 * successRate +
    0.15 * recency +
    0.10 * attestationScore;

  return {
    version: 'trustability-lite/1',
    score: Number(score.toFixed(4)),
    inputs: {
      identityVerified,
      successfulTasks,
      failedTasks,
      successRate: Number(successRate.toFixed(4)),
      recency,
      attestations
    }
  };
}
