import type { Journal, Mood } from "../../shared-types/src/index.ts";

export function weeklyRecap(moods: Mood[], journals: Journal[]) {
  const values = moods
    .map((m) => m.score)
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 10);
  const counts = new Map<string, number>();
  for (const journal of journals)
    for (const topic of new Set(journal.topics))
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
  return {
    average: values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
        10
      : null,
    reportedDays: values.length,
    topics: [...counts]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count),
  };
}
