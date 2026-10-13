"use client";
import { useState } from "react";
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MoonStarsIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { dateWindow, moodEmoji, voiceHistory } from "@nila/wellness";
import { useProduct } from "./product-context";
import { Modal, Notice, Skeleton } from "./ui";
import { ScheduleForm } from "./setup";
import {
  SnapshotMetrics,
  MoodTimeline,
  TrendDiagram,
} from "./wellness-visuals";
import {
  WellnessCollection,
  ReflectionCard,
  WellnessDetails,
} from "./wellness-cards";

export function localDate(timezone = "Asia/Kolkata", date = new Date()) {
  return dateWindow(timezone, 1, 0, date)[0]!;
}
export function viewLink(section: string, preview: boolean) {
  return preview ? `/preview?view=${section}` : `/${section}`;
}
export function DashboardView() {
  const { data, loading, error, preview, refresh } = useProduct();
  const [range, setRange] = useState<"7" | "previous" | "30">("7");
  const [selected, setSelected] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  if (!data)
    return loading ? (
      <Skeleton />
    ) : (
      <Notice error>
        {error || "Your snapshot could not load."}
        <button className="text-button" onClick={() => void refresh()}>
          Retry
        </button>
      </Notice>
    );
  const dates = dateWindow(
    data.profile.timezone,
    range === "30" ? 30 : 7,
    range === "previous" ? 7 : 0,
  );
  const history = voiceHistory(data.journals);
  const available = history.filter((j) => dates.includes(j.entry_date));
  const currentDate =
    selected && dates.includes(selected)
      ? selected
      : (available[0]?.entry_date ?? dates.at(-1)!);
  const journal = history.find((j) => j.entry_date === currentDate);
  const observations = journal?.wellness ?? [];
  const mood =
    observations.find((o) => o.topic === "mood")?.value ??
    data.moods.find((m) => m.source === "voice" && m.entry_date === currentDate)
      ?.score;
  const schedule = data.schedules.find((s) => s.enabled) ?? data.schedules[0];
  const active = data.calls.some((c) =>
    ["ringing", "in-progress", "initiated"].includes(c.status),
  );
  const dateLabel = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${currentDate}T12:00:00Z`));
  const averageValues = data.moods
    .filter((m) => m.source === "voice" && dates.includes(m.entry_date))
    .map((m) => m.score);
  const average = averageValues.length
    ? (averageValues.reduce((a, b) => a + b, 0) / averageValues.length).toFixed(
        1,
      )
    : "—";
  function moveDay(direction: number) {
    const index = dates.indexOf(currentDate);
    setSelected(
      dates[Math.min(dates.length - 1, Math.max(0, index + direction))]!,
    );
  }
  return (
    <div className="wellness-home">
      <div className="snapshot-heading">
        <div>
          <span className="eyebrow">A LITTLE WINDOW INTO YOUR DAYS</span>
          <h1>Your days, in a softer light.</h1>
        </div>
        <div className="range-switch" role="group" aria-label="History period">
          {(
            [
              ["7", "7 days"],
              ["previous", "Last week"],
              ["30", "30 days"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={range === value}
              onClick={() => {
                setRange(value);
                setSelected(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section className="nightly-strip" aria-label="Nightly phone check-in">
        <div className="night-icon">
          <MoonStarsIcon size={26} weight="duotone" />
        </div>
        <div>
          <strong>
            {active
              ? "Nila is calling"
              : schedule?.enabled
                ? `Your nightly call · ${schedule.local_time.slice(0, 5)}`
                : "Your nightly call"}
          </strong>
          <span>
            {active
              ? "Your snapshot follows after you approve it."
              : schedule?.enabled
                ? schedule.timezone.replaceAll("_", " ")
                : "Choose your evening time in settings."}
          </span>
        </div>
        <button
          className="nightly-settings"
          onClick={() => setScheduleOpen(true)}
          aria-label="Nightly call settings"
        >
          <CalendarBlankIcon size={19} />
          <span>{schedule?.enabled ? "Change time" : "Set time"}</span>
        </button>
      </section>
      <div className="snapshot-grid">
        <section
          className="wellness-panel mood-panel"
          aria-labelledby="mood-title"
        >
          <div className="panel-top">
            <span className="eyebrow" id="mood-title">
              YOUR MOOD
            </span>
            <span className="small-chip">{dateLabel}</span>
          </div>
          <div className="mood-portrait">
            <span className="mood-orbit" aria-hidden="true">
              ✦
            </span>
            <span
              className="hero-emoji"
              role="img"
              aria-label={
                typeof mood === "number"
                  ? `Reported mood ${mood} out of ten`
                  : "Mood not reported"
              }
            >
              {moodEmoji(typeof mood === "number" ? mood : null)}
            </span>
            <span className="mood-orbit second" aria-hidden="true">
              ✧
            </span>
          </div>
          <div className="mood-figure">
            <strong>{typeof mood === "number" ? mood : "—"}</strong>
            <span>/ 10</span>
          </div>
          <p className="snapshot-subtle">
            {journal
              ? "From your approved check-in"
              : "A quiet space for your first check-in"}
          </p>
          <div className="date-pager">
            <button
              aria-label="Previous day"
              disabled={currentDate === dates[0]}
              onClick={() => moveDay(-1)}
            >
              <CaretLeftIcon size={18} />
            </button>
            <span>{dateLabel}</span>
            <button
              aria-label="Next day"
              disabled={currentDate === dates.at(-1)}
              onClick={() => moveDay(1)}
            >
              <CaretRightIcon size={18} />
            </button>
          </div>
        </section>
        <section
          className="wellness-panel timeline-panel"
          aria-labelledby="timeline-title"
        >
          <div className="panel-top">
            <h2 id="timeline-title">Little moments, over time</h2>
            <span className="small-chip">
              {average} <span className="muted">/ 10 avg</span>
            </span>
          </div>
          <MoodTimeline
            dates={dates}
            selected={currentDate}
            onSelect={setSelected}
            moods={data.moods.filter((m) => m.source === "voice")}
          />
          <TrendDiagram dates={dates} journals={history} />
        </section>
        <SnapshotMetrics observations={observations} />
        <ReflectionCard
          journal={journal}
          date={dateLabel}
          onOpen={() => setDetail("journal")}
        />
      </div>
      <WellnessCollection
        observations={observations}
        data={data}
        dates={dates}
        onSelect={setDetail}
      />
      <footer className="snapshot-footer">
        <ShieldCheckIcon size={17} />
        Approved words. Your private space.
        <span>
          {preview ? "Sample data" : loading ? "Updating…" : "Saved check-ins"}
        </span>
      </footer>
      <Modal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        title="Your nightly call"
        description="An evening phone conversation. Updates appear here after your approval."
      >
        <ScheduleForm />
      </Modal>
      <Modal
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title="A closer look"
        description="Information from approved phone check-ins. Empty means not reported."
      >
        <WellnessDetails
          topic={detail ?? "journal"}
          data={data}
          journals={available}
          dates={dates}
        />
      </Modal>
    </div>
  );
}
