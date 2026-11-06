export type AchievementCatalogEvent = {
  type?: string;
  event_type?: string;
  sourceId?: string;
  source_id?: string;
  payload?: Record<string, unknown> | string;
  createdAt?: string;
  created_at?: string;
};

export type AchievementRuleResult = { unlocked: boolean; progress: number };
export type AchievementDefinition = {
  key: string;
  title: string;
  description: string;
  goal: number;
  icon: string;
  rule: (events: AchievementCatalogEvent[]) => AchievementRuleResult;
  formatProgress: (progress: number, goal: number) => string;
};

export const ACHIEVEMENT_CATALOG_VERSION: number;
export const ACHIEVEMENT_CATALOG: AchievementDefinition[];
export function evaluateAchievementCatalog(events: AchievementCatalogEvent[]): Array<AchievementRuleResult & Omit<AchievementDefinition, 'rule' | 'formatProgress'>>;
export function achievementProgressLabel(key: string, progress: number, goal: number): string;
