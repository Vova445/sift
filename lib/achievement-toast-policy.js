/**
 * Reconciles earned badges with the browser's last-seen snapshot.
 * A null snapshot means this is a first visit: establish a baseline without
 * surprising the user with toasts for badges earned in the past.
 */
export function reconcileAchievementNotifications(previous, badges) {
  const current = Object.fromEntries(
    (Array.isArray(badges) ? badges : [])
      .filter((badge) => badge?.key && badge?.earnedAt)
      .map((badge) => [String(badge.key), String(badge.earnedAt)]),
  );

  if (previous === null) return { seen: current, newlyEarned: [] };

  const seen = { ...(previous && typeof previous === 'object' ? previous : {}) };
  const newlyEarned = [];
  for (const [key, earnedAt] of Object.entries(current)) {
    if (seen[key] !== earnedAt) {
      const badge = badges.find((item) => String(item?.key) === key && String(item?.earnedAt) === earnedAt);
      if (badge) newlyEarned.push(badge);
    }
    seen[key] = earnedAt;
  }

  return { seen, newlyEarned };
}
