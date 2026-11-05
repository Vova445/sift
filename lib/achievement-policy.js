function isEligibleRenewalFinding(finding) {
  return Boolean(finding && finding.kind === 'renewal' && finding.confidence !== 'low' &&
    typeof finding.evidence === 'string' && finding.evidence.trim().length > 0);
}

export function isRenewalAchievementFinding(findings) {
  return Array.isArray(findings) ? findings.some(isEligibleRenewalFinding) : isEligibleRenewalFinding(findings);
}

export function normalizeAnalysisDays(days) {
  return [...new Set((Array.isArray(days) ? days : []).filter((day) =>
    typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(`${day}T00:00:00.000Z`))))].sort();
}

export function longestAnalysisStreak(days) {
  const normalized = normalizeAnalysisDays(days);
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of normalized) {
    const date = Date.parse(`${day}T00:00:00.000Z`);
    run = previous !== null && date - previous === 86_400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return longest;
}

/** Seven UTC calendar days, ending today, with one activity marker per day. */
export function recentAnalysisWeek(days, now = new Date()) {
  const activeDays = new Set(normalizeAnalysisDays(days));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, active: activeDays.has(date) };
  });
}
