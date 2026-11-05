import { env } from 'cloudflare:workers';
import { ACHIEVEMENT_CATALOG_VERSION, achievementProgressLabel, evaluateAchievementCatalog } from './achievement-catalog.js';
import { longestAnalysisStreak, recentAnalysisWeek } from './achievement-policy.js';
import { eventsForUser, refreshAchievementProjection } from './event-bus';
import { confirmedReferralCount } from './referrals';

export async function getAchievementCollection(userId: string) {
  await refreshAchievementProjection(userId);
  const [events, earned, referralCount] = await Promise.all([
    eventsForUser(userId),
    env.DB.prepare(`SELECT key,unlocked_at FROM user_achievements WHERE user_id=?`).bind(userId).all<{ key: string; unlocked_at: string | null }>(),
    confirmedReferralCount(userId),
  ]);
  const issued = new Map(earned.results.map((row) => [row.key, row.unlocked_at]));
  const badges = evaluateAchievementCatalog(events).map((badge) => ({
    key: badge.key,
    title: badge.title,
    description: badge.description,
    condition: badge.condition,
    goal: badge.goal,
    current: badge.progress,
    icon: badge.icon,
    earnedAt: issued.get(badge.key) || null,
    progressLabel: achievementProgressLabel(badge.key, badge.progress, badge.goal),
    catalogVersion: ACHIEVEMENT_CATALOG_VERSION,
  }));
  const analysisDays = events.filter((event) => event.type === 'analysis_completed').map((event) => event.created_at.slice(0, 10));
  const utcDays = [...new Set(analysisDays)];
  return {
    badges,
    analysisCount: analysisDays.length,
    longestStreak: longestAnalysisStreak(analysisDays),
    recentStreak: recentAnalysisWeek(utcDays),
    confirmedReferrals: referralCount,
    catalogVersion: ACHIEVEMENT_CATALOG_VERSION,
  };
}
