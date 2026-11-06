export const ANALYTICS_MIN_SAMPLE = 50;
export const ANALYTICS_MIN_DAYS = 14;

export function wilsonInterval95(successes, sampleSize) {
  if (!Number.isFinite(successes) || !Number.isFinite(sampleSize) || sampleSize <= 0 || successes < 0 || successes > sampleSize) return null;
  const z = 1.96;
  const proportion = successes / sampleSize;
  const denominator = 1 + z * z / sampleSize;
  const center = (proportion + z * z / (2 * sampleSize)) / denominator;
  const margin = z * Math.sqrt(proportion * (1 - proportion) / sampleSize + z * z / (4 * sampleSize * sampleSize)) / denominator;
  return {
    low: Math.round(Math.max(0, center - margin) * 1000) / 10,
    high: Math.round(Math.min(1, center + margin) * 1000) / 10,
  };
}

export function isAnalyticsMature({ observations = 0, observedDays = 0, minimumSample = ANALYTICS_MIN_SAMPLE, minimumDays = ANALYTICS_MIN_DAYS } = {}) {
  return Number(observations) >= minimumSample && Number(observedDays) >= minimumDays;
}

export function intervalsOverlap(first, second) {
  if (!first || !second) return false;
  return first.low <= second.high && second.low <= first.high;
}

export function analyticsComparisonStatus({ intervalsOverlap: overlap = false, hasIntervals = false, reportReady = false, metricsMature = false } = {}) {
  if (hasIntervals && overlap) return 'unproven';
  if (!reportReady || !metricsMature) return 'immature';
  if (!hasIntervals) return 'insufficient';
  return 'observed-difference';
}
