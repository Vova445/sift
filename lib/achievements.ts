import { env } from 'cloudflare:workers';
import { ACHIEVEMENT_CATALOG_VERSION, achievementProgressLabel, evaluateAchievementCatalog } from './achievement-catalog.js';
import { longestAnalysisStreak } from './achievement-policy.js';
import { eventsForUser, refreshAchievementProjection } from './event-bus';

export async function getAchievementCollection(userId: string) {
  await refreshAchievementProjection(userId);
  const [events, earned] = await Promise.all([
    eventsForUser(userId),
    env.DB.prepare(`SELECT key,unlocked_at FROM user_achievements WHERE user_id=?`).bind(userId).all<{ key: string; unlocked_at: string | null }>(),
  ]);
  const issued = new Map(earned.results.map((row) => [row.key, row.unlocked_at]));
  const badges = evaluateAchievementCatalog(events).map((badge) => ({
    key: badge.key,
    title: badge.title,
    description: badge.description,
    goal: badge.goal,
    current: badge.progress,
    icon: badge.icon,
    earnedAt: issued.get(badge.key) || null,
    progressLabel: achievementProgressLabel(badge.key, badge.progress, badge.goal),
    catalogVersion: ACHIEVEMENT_CATALOG_VERSION,
  }));
  const analysisDays = events.filter((event) => event.type === 'analysis_completed').map((event) => event.created_at.slice(0, 10));
  return {
    badges,
    analysisCount: analysisDays.length,
    longestStreak: longestAnalysisStreak(analysisDays),
    catalogVersion: ACHIEVEMENT_CATALOG_VERSION,
  };
}
