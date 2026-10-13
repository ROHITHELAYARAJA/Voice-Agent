"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  SmileyIcon,
  SmileyMehIcon,
  SmileySadIcon,
  SunIcon,
  PhoneIcon,
  SparkleIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { useProduct } from "./product-context";
import { Empty, Notice, Skeleton, Field } from "./ui";
import { activities, challengeActivity } from "@nila/validation";
export function localDate(timezone = "Asia/Kolkata", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function viewLink(section: string, preview: boolean) {
  return preview ? `/preview?view=${section}` : `/${section}`;
}
export function MoodSelector() {
  const { data, preview, setSample, mutate } = useProduct();
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string | null>(null);
  if (!data) return null;
  const today = localDate(data.profile.timezone),
    selected = data.moods.find((m) => m.entry_date === today)?.score;
  async function save(score: number) {
    setSaving(true);
    setError("");
    try {
      if (preview)
        setSample({
          ...data!,
          moods: [
            ...data!.moods.filter((m) => m.entry_date !== today),
            {
              id: "preview-today",
              entry_date: today,
              score,
              tags: (
                tags ??
                data!.moods
                  .find((m) => m.entry_date === today)
                  ?.tags.join(",") ??
                ""
              )
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 8),
              source: "manual",
            },
          ],
        });
      else
        await mutate("/moods", {
          entry_date: today,
          score,
          tags: (
            tags ??
            data!.moods.find((m) => m.entry_date === today)?.tags.join(",") ??
            ""
          )
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 8),
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="card-heading">
        <div>
          <span className="eyebrow">A MOMENT FOR YOU</span>
          <h2>How are you feeling today?</h2>
        </div>
        <SunIcon size={28} />
      </div>
      <p className="muted">
        Choose what feels right. There is no perfect answer.
      </p>
      <div
        className="mood-scale"
        role="group"
        aria-label="Today's mood, from one to ten"
      >
        {Array.from({ length: 10 }, (_, i) => {
          const score = i + 1,
            Icon =
              score < 4
                ? SmileySadIcon
                : score < 7
                  ? SmileyMehIcon
                  : SmileyIcon;
          return (
            <button
              key={score}
              disabled={saving}
              aria-pressed={selected === score}
              aria-label={`Mood ${score} out of 10`}
              className={`mood-option ${selected === score ? "selected" : ""}`}
              onClick={() => void save(score)}
            >
              <Icon
                size={30}
                weight={selected === score ? "fill" : "regular"}
              />
              <span>{score}</span>
            </button>
          );
        })}
      </div>
      <div className="scale-labels">
        <span>Having a hard day</span>
        <span>Feeling good</span>
      </div>
      <details className="mood-tags">
        <summary>Add a little context, if you'd like</summary>
        <Field
          label="Optional mood tags"
          hint="Separate your own tags with commas, then choose or save your mood."
        >
          <input
            value={
              tags ??
              data.moods.find((m) => m.entry_date === today)?.tags.join(", ") ??
              ""
            }
            onChange={(e) => setTags(e.target.value)}
            maxLength={250}
            placeholder="Work, rested, grateful…"
          />
        </Field>
        {selected && (
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => void save(selected)}
          >
            Save my tags
          </button>
        )}
      </details>
      {error && <Notice>{error}</Notice>}
      {selected && (
        <p className="saved-note" role="status">
          <CheckIcon size={16} />
          {preview ? "Preview mood updated" : "Your mood is saved"} · {selected}
          /10
        </p>
      )}
    </>
  );
}
export function WeeklyChart({ daysCount = 7 }: { daysCount?: 7 | 30 } = {}) {
  const { data } = useProduct();
  if (!data) return null;
  const days = Array.from({ length: daysCount }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - daysCount + 1 + i);
    const key = localDate(data.profile.timezone, date);
    return {
      key,
      label: new Intl.DateTimeFormat("en", {
        ...(daysCount === 7
          ? { weekday: "short" as const }
          : { day: "numeric" as const }),
        timeZone: data.profile.timezone,
      }).format(date),
      score: data.moods.find((m) => m.entry_date === key)?.score,
    };
  });
  return (
    <>
      <div className="card-heading">
        <h2>
          {daysCount === 7
            ? "Your week, gently seen"
            : "A little perspective on your month"}
        </h2>
        <span className="badge">Last {daysCount} days</span>
      </div>
      <div
        className={`week-chart ${daysCount === 30 ? "monthly-chart" : ""}`}
        role="img"
        aria-label={days
          .map(
            (d) =>
              `${d.label}: ${d.score === undefined ? "not reported" : `${d.score} out of ten`}`,
          )
          .join(", ")}
      >
        {days.map((d) => (
          <div className="chart-column" key={d.key}>
            <span className="chart-value">{d.score ?? "-"}</span>
            <div
              className={`chart-bar ${d.score === undefined ? "missing" : ""}`}
              style={{
                height: d.score === undefined ? 8 : `${d.score * 11}px`,
              }}
            />
            <span>{d.label}</span>
          </div>
        ))}
      </div>
      <p className="caption">Only moods you report. Blank days stay blank.</p>
    </>
  );
}
export function CallCard() {
  const { data, preview, mutate } = useProduct();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!data) return null;
  const schedule = data.schedules.find((s) => s.enabled),
    active = data.calls.find((c) =>
      ["initiated", "ringing", "in-progress", "sending"].includes(c.status),
    );
  const phoneReady =
    data.consent &&
    data.phones.length > 0 &&
    ["twilio", "deepgram", "elevenlabs"].every((provider) =>
      data.connections.some(
        (c) => c.provider === provider && c.status === "connected",
      ),
    ) &&
    !!data.connections.find((c) => c.provider === "twilio")?.capabilities
      .media_streams;
  async function call() {
    setBusy(true);
    setMessage("");
    try {
      await mutate("/calls/test");
      setMessage("Your call is queued. Keep your phone nearby.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="card-heading">
        <span className="eyebrow">YOUR VOICE COMPANION</span>
        <PhoneIcon size={24} />
      </div>
      <h2>
        {active
          ? "Your check-in is underway"
          : schedule?.next_call_at_utc
            ? new Intl.DateTimeFormat("en", {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
                timeZone: schedule.timezone,
              }).format(new Date(schedule.next_call_at_utc))
            : "A little space to talk"}
      </h2>
      <p>
        {active
          ? `Call status: ${active.status}`
          : schedule
            ? `Scheduled in ${schedule.timezone}`
            : !preview && !phoneReady
              ? "Mood tracking and journaling are ready. Telephone calls are optional and need separate setup."
              : "Choose when a friendly check-in fits your day."}
      </p>
      <div className="button-row">
        <Link
          className="button secondary"
          href={viewLink(
            !preview && !phoneReady ? "onboarding" : "schedule",
            preview,
          )}
        >
          {!preview && !phoneReady ? "Set up optional calls" : "Choose a time"}{" "}
          <ArrowUpRightIcon />
        </Link>
        {!preview && phoneReady && (
          <button
            className="button"
            onClick={() => void call()}
            disabled={busy || !data.consent || !!active}
          >
            {busy ? "Queuing…" : "Call me now"}
          </button>
        )}
      </div>
      {preview && (
        <p className="caption">Illustrative preview. No calls are placed.</p>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}
export function ChallengeCard({
  cycle: requestedCycle,
}: { cycle?: string } = {}) {
  const { data, preview } = useProduct();
  if (!data) return null;
  const cycle = requestedCycle ?? data.challenge[0]?.cycle,
    completed = data.challenge.filter(
      (d) => d.cycle === cycle && d.status === "completed",
    ).length,
    day = Math.min(
      30,
      data.challenge.filter((d) => d.cycle === cycle).length + 1,
    ),
    activity = challengeActivity(day);
  return (
    <>
      <div className="card-heading">
        <span className="eyebrow">30 DAYS, AT YOUR PACE</span>
        <SparkleIcon size={24} />
      </div>
      <h2>Small steps. Softer days.</h2>
      <p>
        Day {day}: {activity.title}
      </p>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={30}
        aria-label="Completed self-care challenge days"
      >
        <span style={{ width: `${(completed / 30) * 100}%` }} />
      </div>
      <div className="card-bottom">
        <span>{completed} of 30 completed</span>
        <Link href={viewLink("challenge", preview)}>
          Take a small step <ArrowUpRightIcon />
        </Link>
      </div>
    </>
  );
}
export function DashboardView() {
  const { data, loading, error, preview, refresh } = useProduct();
  if (loading) return <Skeleton />;
  if (!data)
    return (
      <Notice>
        {error || "Your space is loading."}
        <button className="text-button" onClick={() => void refresh()}>
          Try again
        </button>
      </Notice>
    );
  const journal = data.journals[0];
  return (
    <>
      <div className="page-greeting">
        <span className="eyebrow">YOUR PERSONAL SPACE</span>
        <h1>
          A little calmer, {data.profile.display_name || "one day at a time"}.
        </h1>
        <p>
          You don't need to have it all figured out. Start with how you feel.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="dashboard-grid">
        <section className="card full">
          <MoodSelector />
        </section>
        <section className="card sage">
          <CallCard />
        </section>
        <section className="card">
          <WeeklyChart />
        </section>
        <section className="card journal-card">
          <div className="card-heading">
            <h2>Your latest reflection</h2>
            <span className="badge">Private journal</span>
          </div>
          {journal ? (
            <>
              <span className="caption">
                {journal.entry_date} ·{" "}
                {journal.source === "voice"
                  ? "AI-structured from your words"
                  : "Written by you"}
              </span>
              <h3>{journal.title}</h3>
              <p className="journal-excerpt">
                {journal.user_edit ?? journal.reflection}
              </p>
              <Link href={viewLink("journals", preview)}>
                Open your journal <ArrowUpRightIcon />
              </Link>
            </>
          ) : (
            <Empty
              title="Your first page is waiting"
              description="Write a thought, or set up a voice check-in. Only information you share will appear here."
              href={viewLink("journals", preview)}
              label="Write a reflection"
            />
          )}
        </section>
        <section className="card lavender">
          <ChallengeCard />
        </section>
        <section className="card full">
          <div className="card-heading">
            <div>
              <span className="eyebrow">MAKE ROOM FOR YOURSELF</span>
              <h2>One small thing for today</h2>
            </div>
            <Link href={viewLink("self-care", preview)}>
              Explore activities <ArrowUpRightIcon />
            </Link>
          </div>
          <div className="activity-grid">
            {activities.slice(0, 3).map((a) => (
              <Link
                className="activity-tile"
                key={a.key}
                href={viewLink("self-care", preview)}
              >
                <span className="activity-icon">
                  <SparkleIcon size={22} />
                </span>
                <h3>{a.title}</h3>
                <p>{a.description}</p>
                <span className="caption">{a.minutes} min</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
