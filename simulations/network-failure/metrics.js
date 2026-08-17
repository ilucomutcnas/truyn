function finiteSorted(values = []) {
  return values.filter(Number.isFinite).sort((a, b) => a - b);
}

export function percentile(values, p) {
  const sorted = finiteSorted(values);
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

export function distribution(values = []) {
  const sorted = finiteSorted(values);
  if (sorted.length === 0) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length
  };
}

export function ratio(successes, total) {
  if (!Number.isFinite(total) || total <= 0) return null;
  return successes / total;
}

export function telemetryDelta(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Object.fromEntries([...keys].map((key) => [key, Number(after[key] || 0) - Number(before[key] || 0)]));
}
