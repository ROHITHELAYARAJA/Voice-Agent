"use client";
import type { CSSProperties } from "react";
import type { Journal, Mood } from "@nila/shared-types";
import type { WellnessObservation } from "@nila/validation";
import { moodEmoji } from "@nila/wellness";

export function SnapshotMetrics({
  observations,
}: {
  observations: WellnessObservation[];
}) {
  const metrics = [
    {
      topic: "water",
      emoji: "💧",
      label: "Water",
      unit: "L",
      tone: "water",
      scale: 4,
    },
    {
      topic: "sleep",
      emoji: "😴",
      label: "Sleep",
      unit: "h",
      tone: "sleep",
      scale: 24,
    },
    {
      topic: "energy",
      emoji: "⚡",
      label: "Energy",
      unit: "/ 10",
      tone: "energy",
      scale: 10,
    },
    {
      topic: "screen_time",
      emoji: "📱",
      label: "Screen time",
      unit: "h",
      tone: "screen",
      scale: 24,
    },
  ];
  return (
    <div className="metrics-row">
      {metrics.map((metric) => {
        const value = observations.find((o) => o.topic === metric.topic)?.value;
        const reported = typeof value === "number";
        const fill = reported ? value / Math.max(metric.scale, value) : 0;
        return (
          <section
            className={`wellness-panel metric-panel ${metric.tone}`}
            key={metric.topic}
            aria-label={`${metric.label}: ${reported ? `${value} ${metric.unit}` : "not reported"}`}
          >
            <div className="panel-top">
              <h2>{metric.label}</h2>
              <span aria-hidden="true">{metric.emoji}</span>
            </div>
            <div className="metric-visual" aria-hidden="true">
              {metric.topic === "water" ? (
                <div className="water-vessel">
                  <div style={{ transform: `scaleY(${fill})` }} />
                  <span>💧</span>
                </div>
              ) : metric.topic === "sleep" ? (
                <div className="sleep-moon">
                  ☾<span>✦</span>
                  <i>✧</i>
                </div>
              ) : (
                <div className="energy-bars">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i
                      key={i}
                      className={reported && fill * 10 > i ? "lit" : ""}
                      style={
                        { "--bar-height": `${24 + i * 5}px` } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="metric-number">
              <strong>{reported ? value : "—"}</strong>
              <span>{metric.unit}</span>
            </div>
            <span className="snapshot-subtle">
              {reported ? "You reported" : "Not reported"}
            </span>
          </section>
        );
      })}
    </div>
  );
}

export function MoodTimeline({
  dates,
  selected,
  onSelect,
  moods,
}: {
  dates: string[];
  selected: string;
  onSelect: (date: string) => void;
  moods: Mood[];
}) {
  return (
    <div
      className={`mood-timeline ${dates.length > 7 ? "month-timeline" : ""}`}
      aria-label="Reported mood calendar"
    >
      {dates.map((date) => {
        const score = moods.find((m) => m.entry_date === date)?.score;
        const day = new Date(`${date}T12:00:00Z`);
        return (
          <button
            key={date}
            className={`mood-day ${selected === date ? "chosen" : ""}`}
            aria-pressed={selected === date}
            aria-label={`${date}, ${score === undefined ? "not reported" : `mood ${score} out of ten`}`}
            onClick={() => onSelect(date)}
          >
            <span className="day-label">
              {dates.length > 7
                ? day.getUTCDate()
                : new Intl.DateTimeFormat("en", { weekday: "short" }).format(
                    day,
                  )}
            </span>
            <span
              className={`day-face ${score === undefined ? "unreported" : ""}`}
              aria-hidden="true"
            >
              {moodEmoji(score)}
            </span>
            {dates.length <= 7 && (
              <span className="day-score">{score ?? "—"}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TrendDiagram({
  dates,
  journals,
}: {
  dates: string[];
  journals: Journal[];
}) {
  const rows = dates.map((date) => ({
    date,
    value: journals
      .find((j) => j.entry_date === date)
      ?.wellness?.find((o) => o.topic === "sleep")?.value,
  }));
  const numbers = rows
    .filter((row) => typeof row.value === "number")
    .map((row) => row.value as number);
  const maximum = Math.max(10, ...numbers);
  const average = numbers.length
    ? (numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(1)
    : "—";
  return (
    <div className="sleep-trend">
      <div className="panel-top">
        <span>🌙 Sleep rhythm</span>
        <span className="trend-average">
          {average} <small>h avg</small>
        </span>
      </div>
      <div
        className="sleep-chart"
        role="img"
        aria-label={rows
          .map(
            (row) =>
              `${row.date}: ${typeof row.value === "number" ? `${row.value} hours` : "not reported"}`,
          )
          .join("; ")}
      >
        {rows.map((row) => (
          <div key={row.date} className="sleep-column">
            <span
              className={
                typeof row.value === "number"
                  ? "sleep-bar"
                  : "sleep-bar missing"
              }
              style={{
                transform:
                  typeof row.value === "number"
                    ? `scaleY(${row.value / maximum})`
                    : "scaleY(0)",
              }}
            />
            <i />
          </div>
        ))}
      </div>
      <div className="chart-foot">
        <span>{dates[0]?.slice(5)}</span>
        <span>{maximum} h scale · blank = unreported</span>
        <span>{dates.at(-1)?.slice(5)}</span>
      </div>
    </div>
  );
}
