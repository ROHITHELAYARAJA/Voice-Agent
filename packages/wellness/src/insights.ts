import type { Journal, Mood } from "../../shared-types/src/index.ts";
export { voiceFeatures } from "./catalog.ts";

export function moodEmoji(score?: number | null) {
  return score == null
    ? "◌"
    : score <= 2
      ? "😞"
      : score <= 4
        ? "😔"
        : score <= 6
          ? "😐"
          : score <= 8
            ? "🙂"
            : "😄";
}

export function dateWindow(
  timezone: string,
  days: number,
  offset = 0,
  now = new Date(),
) {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const anchor = new Date(`${local}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() - offset - days + 1 + i);
    return date.toISOString().slice(0, 10);
  });
}

export function voiceHistory(journals: Journal[]) {
  const byDate = new Map<string, Journal>();
  for (const journal of [...journals]
    .filter((j) => j.source === "voice")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const previous = byDate.get(journal.entry_date);
    if (!previous) byDate.set(journal.entry_date, journal);
    else {
      const replaced = new Set((journal.wellness ?? []).map((o) => o.topic));
      byDate.set(journal.entry_date, {
        ...journal,
        wellness: [
          ...(previous.wellness ?? []).filter((o) => !replaced.has(o.topic)),
          ...(journal.wellness ?? []),
        ],
      });
    }
  }
  return [...byDate.values()].sort((a, b) =>
    b.entry_date.localeCompare(a.entry_date),
  );
}

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
