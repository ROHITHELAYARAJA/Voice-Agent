"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useProduct } from "./product-context";
import {
  CallCard,
  ChallengeCard,
  MoodSelector,
  WeeklyChart,
  localDate,
  viewLink,
} from "./dashboard";
import { Empty, Field, Modal, Notice, Skeleton } from "./ui";
import {
  activities,
  challengeActivity,
} from "../../../../packages/validation/src/index";
import type { Journal } from "../../../../packages/shared-types/src/index";
function message(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}
export function JournalsView() {
  const { data, mutate, preview, setSample } = useProduct();
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Journal | null>(null),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function start(journal: Journal | null) {
    setEditing(journal);
    setTitle(journal?.title ?? "");
    setText(journal?.user_edit ?? journal?.reflection ?? "");
    setError("");
    setOpen(true);
  }
  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      if (preview) {
        const journal: Journal = editing
          ? { ...editing, title, user_edit: text }
          : {
              id: crypto.randomUUID(),
              entry_date: localDate(data.profile.timezone),
              title,
              reflection: text,
              user_edit: null,
              source: "manual",
              topics: [],
              created_at: new Date().toISOString(),
            };
        setSample({
          ...data,
          journals: [
            journal,
            ...data.journals.filter((j) => j.id !== journal.id),
          ],
        });
      } else
        await mutate(
          editing ? `/journals/${editing.id}` : "/journals",
          editing ? { title, user_edit: text } : { title, reflection: text },
          editing ? "PATCH" : "POST",
        );
      setOpen(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(j: Journal) {
    if (!data || !window.confirm("Delete this journal permanently?")) return;
    try {
      if (preview)
        setSample({
          ...data,
          journals: data.journals.filter((item) => item.id !== j.id),
        });
      else await mutate(`/journals/${j.id}`, undefined, "DELETE");
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">A PLACE FOR YOUR WORDS</span>
          <h1>Your journal</h1>
          <p>Some days need a sentence. Others need a little more.</p>
        </div>
        <button className="button" onClick={() => start(null)}>
          <PlusIcon />
          Write a reflection
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {data?.journals.length ? (
        <div className="journal-list">
          {data.journals.map((j) => (
            <article className="card" key={j.id}>
              <div className="card-heading">
                <span className="caption">{j.entry_date}</span>
                <span className="badge">
                  {j.source === "voice"
                    ? "AI-structured · your words"
                    : "Written by you"}
                </span>
              </div>
              <h2>{j.title}</h2>
              <p className="journal-body">{j.user_edit ?? j.reflection}</p>
              {j.topics.length > 0 && (
                <div className="tag-row">
                  {j.topics.map((t) => (
                    <span key={t} className="badge">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="button-row">
                <button className="button secondary" onClick={() => start(j)}>
                  Review & edit
                </button>
                <button
                  className="text-button danger"
                  onClick={() => void remove(j)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Your story starts here"
          description="No entries yet. Your journal is yours to write, review, and change."
        />
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Make it your own" : "A new reflection"}
        description="Write freely. You can edit or delete this later."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Title">
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Your reflection">
            <textarea
              required
              maxLength={10000}
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          {error && <Notice>{error}</Notice>}
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : preview ? "Update preview" : "Save privately"}
          </button>
        </form>
      </Modal>
    </>
  );
}
export function MoodsView() {
  const { data } = useProduct();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const count = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate(),
    offset = (month.getDay() + 6) % 7;
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">YOUR EMOTIONAL WEATHER</span>
          <h1>Mood calendar</h1>
          <p>A gentle view of the days you've chosen to share.</p>
        </div>
      </div>
      <section className="card">
        <MoodSelector />
      </section>
      <section className="card calendar-card">
        <div className="card-heading">
          <h2>
            {month.toLocaleDateString("en", { month: "long", year: "numeric" })}
          </h2>
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ArrowLeftIcon />
            </button>
            <button
              className="icon-button"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ArrowRightIcon />
            </button>
          </div>
        </div>
        <div className="mood-calendar">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day} className="calendar-heading">
              {day}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`empty-${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const day = i + 1,
              key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
              mood = data?.moods.find((m) => m.entry_date === key);
            return (
              <div
                key={day}
                className={`calendar-day ${mood ? "has-mood" : ""}`}
                aria-label={`${key}: ${mood ? `mood ${mood.score} of 10` : "not reported"}`}
              >
                <span>{day}</span>
                <strong>{mood?.score ?? "·"}</strong>
              </div>
            );
          })}
        </div>
        <p className="caption">
          A dot means no mood was reported. Missing days aren't low moods.
        </p>
      </section>
      <section className="card">
        <WeeklyChart daysCount={30} />
      </section>
    </>
  );
}
export function InsightsView() {
  const { data } = useProduct();
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">NOTICE, WITHOUT JUDGEMENT</span>
          <h1>Your patterns</h1>
          <p>Topics you've shared, seen alongside your reported moods.</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <WeeklyChart />
        </section>
        <section className="card peach">
          <h2>What has been on your mind?</h2>
          {data?.recap.topics.length ? (
            data.recap.topics.map((t) => (
              <div className="list-row" key={t.topic}>
                <strong>{t.topic}</strong>
                <span>
                  {t.count} reflection{t.count === 1 ? "" : "s"}
                </span>
                <span className="caption">
                  {(() => {
                    const dates = new Set(
                      data.journals
                        .filter((j) => j.topics.includes(t.topic))
                        .map((j) => j.entry_date),
                    );
                    const ratings = data.moods.filter((m) =>
                      dates.has(m.entry_date),
                    );
                    return ratings.length
                      ? `Reported mood on ${ratings.length} associated days: ${(ratings.reduce((sum, m) => sum + m.score, 0) / ratings.length).toFixed(1)}/10`
                      : "No associated mood ratings reported";
                  })()}
                </span>
              </div>
            ))
          ) : (
            <Empty
              title="Patterns take time"
              description="When you mention recurring topics during check-ins, they can appear here. We don't infer diagnoses or hidden feelings."
            />
          )}
          <p className="caption">
            Topics are drawn from explicit journal statements. Frequency does
            not establish a cause.
          </p>
        </section>
      </div>
    </>
  );
}
export function SelfCareView() {
  const { data, mutate, preview, setSample } = useProduct();
  const [active, setActive] = useState<string | null>(null),
    [seconds, setSeconds] = useState(0),
    [running, setRunning] = useState(false),
    [error, setError] = useState(""),
    [goal, setGoal] = useState(""),
    [goals, setGoals] = useState<
      { id: string; title: string; completed: boolean }[]
    >([]);
  useEffect(() => {
    if (!preview)
      void import("@/lib/supabase")
        .then(({ api }) => api<typeof goals>("/goals"))
        .then(setGoals)
        .catch((e) => setError(message(e)));
  }, [preview]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () =>
        setSeconds((n) => {
          if (n <= 1) {
            setRunning(false);
            return 0;
          }
          return n - 1;
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [running]);
  async function complete(key: string) {
    if (!data) return;
    try {
      if (preview)
        setSample({
          ...data,
          activities: [
            {
              id: crypto.randomUUID(),
              activity_key: key,
              completed_at: new Date().toISOString(),
            },
            ...data.activities,
          ],
        });
      else await mutate("/activities", { activity_key: key });
      setActive(null);
      setRunning(false);
    } catch (e) {
      setError(message(e));
    }
  }
  async function addGoal() {
    try {
      const newGoal = preview
        ? { id: crypto.randomUUID(), title: goal, completed: false }
        : await mutate<{ id: string; title: string; completed: boolean }>(
            "/goals",
            { title: goal },
          );
      setGoals([...goals, newGoal]);
      setGoal("");
    } catch (e) {
      setError(message(e));
    }
  }
  async function toggleGoal(id: string, completed: boolean) {
    try {
      if (!preview) await mutate(`/goals/${id}`, { completed }, "PATCH");
      setGoals(goals.map((g) => (g.id === id ? { ...g, completed } : g)));
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">SMALL ACTS OF KINDNESS</span>
          <h1>A little care goes a long way</h1>
          <p>Choose something gentle. Skip anything that doesn't feel right.</p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="activity-grid">
        {activities.map((a) => (
          <article className="card" key={a.key}>
            <span className="badge">{a.minutes} min</span>
            <h2>{a.title}</h2>
            <p>{a.description}</p>
            <button
              className="button secondary"
              onClick={() => {
                setActive(a.key);
                setSeconds(120);
                setRunning(false);
              }}
            >
              Try this activity
            </button>
          </article>
        ))}
      </div>
      <section className="card">
        <h2>A goal, just for you</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void addGoal();
          }}
        >
          <input
            aria-label="A personal self-care goal"
            placeholder="Make room for a short walk"
            value={goal}
            required
            maxLength={160}
            onChange={(e) => setGoal(e.target.value)}
          />
          <button className="button">Add goal</button>
        </form>
        {goals.map((g) => (
          <label className="checkbox-row" key={g.id}>
            <input
              type="checkbox"
              checked={g.completed}
              onChange={(e) => void toggleGoal(g.id, e.target.checked)}
            />
            {g.title}
          </label>
        ))}
      </section>
      <Modal
        open={!!active}
        onOpenChange={(open) => {
          if (!open) {
            setActive(null);
            setRunning(false);
          }
        }}
        title={
          activities.find((a) => a.key === active)?.title ?? "A moment for you"
        }
        description={
          activities.find((a) => a.key === active)?.description ?? ""
        }
      >
        {active === "breathe" ? (
          <>
            <div className="breathing-orb" data-running={running}>
              {running
                ? (120 - seconds) % 10 < 4
                  ? "Breathe in gently"
                  : "Breathe out gently"
                : "At your pace"}
            </div>
            <p className="caption">
              Keep breathing comfortably. No need to hold your breath. Stop if
              you feel uncomfortable.
            </p>
            <p role="timer">{seconds}s remaining</p>
            <button
              className="button secondary"
              onClick={() => setRunning(!running)}
              disabled={seconds === 0}
            >
              {running ? "Pause" : "Start breathing moment"}
            </button>
          </>
        ) : (
          <p>Take the time you need. Come back when you're ready.</p>
        )}
        <div className="button-row">
          <button
            className="button"
            onClick={() => active && void complete(active)}
          >
            I've taken this moment
          </button>
          <button
            className="text-button"
            onClick={() => {
              setActive(null);
              setRunning(false);
            }}
          >
            Maybe another time
          </button>
        </div>
      </Modal>
    </>
  );
}
export function ChallengeView() {
  const { data, mutate, preview, setSample } = useProduct();
  const [cycle, setCycle] = useState<string>(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (data && !cycle)
      setCycle(data.challenge[0]?.cycle ?? crypto.randomUUID());
  }, [data, cycle]);
  const progress = data?.challenge.filter((p) => p.cycle === cycle) ?? [],
    day = Math.min(
      30,
      (progress.length ? Math.max(...progress.map((p) => p.day)) : 0) + 1,
    ),
    activity = challengeActivity(day);
  async function save(status: "completed" | "skipped") {
    if (!data) return;
    try {
      if (preview)
        setSample({
          ...data,
          challenge: [
            { cycle, day, status },
            ...data.challenge.filter((p) => p.cycle !== cycle || p.day !== day),
          ],
        });
      else await mutate("/challenge", { cycle, day, status });
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">THIRTY INVITATIONS TO SLOW DOWN</span>
          <h1>Your self-care challenge</h1>
          <p>One small activity. Your pace. No catching up required.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            if (
              window.confirm(
                "Start a new challenge? Your previous progress stays saved.",
              )
            )
              setCycle(crypto.randomUUID());
          }}
        >
          Start fresh
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      <section className="card lavender">
        <ChallengeCard cycle={cycle} />
      </section>
      {progress.length < 30 ? (
        <section className="card">
          <span className="badge">Day {day}</span>
          <h2>{activity.title}</h2>
          <p>{activity.description}</p>
          <div className="button-row">
            <button className="button" onClick={() => void save("completed")}>
              <CheckIcon />
              I've done this
            </button>
            <button
              className="button secondary"
              onClick={() => void save("skipped")}
            >
              Skip today, kindly
            </button>
          </div>
        </section>
      ) : (
        <section className="card sage">
          <h2>You made space for yourself.</h2>
          <p>
            Your challenge is complete, including the days you chose to skip.
            Start again whenever it feels right.
          </p>
        </section>
      )}
      <div className="challenge-days">
        {Array.from({ length: 30 }, (_, i) => {
          const p = progress.find((p) => p.day === i + 1);
          return (
            <div
              key={i}
              className={`challenge-day ${p?.status ?? ""}`}
              aria-label={`Day ${i + 1}: ${p?.status ?? "not started"}`}
            >
              <span>{i + 1}</span>
              {p?.status === "completed" ? (
                <CheckIcon />
              ) : p?.status === "skipped" ? (
                <span>Skipped</span>
              ) : (
                <small>{challengeActivity(i + 1).title}</small>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
export function RecapView() {
  const { data } = useProduct();
  const recap = data?.recap;
  const since = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const statements =
    data?.journals
      .filter((j) => j.entry_date >= since)
      .flatMap((j) => j.statements ?? []) ?? [];
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">LOOK BACK WITH KINDNESS</span>
          <h1>Your weekly reflection</h1>
          <p>The last seven days, built only from what you chose to share.</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="card full">
          <h2>Moments and intentions, in your words</h2>
          {statements.some((s) =>
            ["positive", "intention"].includes(s.kind),
          ) ? (
            statements
              .filter((s) => ["positive", "intention"].includes(s.kind))
              .map((s, i) => (
                <blockquote key={i}>
                  <span className="badge">
                    {s.kind === "positive"
                      ? "A positive moment"
                      : "Your intention"}
                  </span>
                  <p>“{s.quote}”</p>
                </blockquote>
              ))
          ) : (
            <p>
              No explicit positive moments or intentions were captured this
              week. Missing information stays unknown.
            </p>
          )}
          <p className="caption">
            AI organizes these quotes. The statements are yours.
          </p>
        </section>
        <section className="card lavender">
          <span className="eyebrow">AVERAGE REPORTED MOOD</span>
          <p className="metric">
            {recap?.average ?? "-"}
            <small>/10</small>
          </p>
          <p>
            {recap?.reportedDays ?? 0} reported day
            {recap?.reportedDays === 1 ? "" : "s"}. Unreported days are
            excluded.
          </p>
        </section>
        <section className="card">
          <WeeklyChart />
        </section>
        <section className="card">
          <h2>Words you came back to</h2>
          {recap?.topics.length ? (
            recap.topics.map((t) => (
              <div className="list-row" key={t.topic}>
                <span>{t.topic}</span>
                <span>{t.count} mentions across journals</span>
              </div>
            ))
          ) : (
            <p>No recurring topics reported this week.</p>
          )}
        </section>
        <section className="card sage">
          <h2>Care you made room for</h2>
          <p>
            {data?.activities.filter(
              (a) =>
                Date.now() - new Date(a.completed_at).getTime() < 7 * 86400000,
            ).length ?? 0}{" "}
            activities completed in the last seven days.
          </p>
          <p>
            For the week ahead, you might choose one small routine that feels
            manageable.
          </p>
          <p className="caption">
            This is an optional general suggestion, not a clinical assessment.
          </p>
        </section>
      </div>
    </>
  );
}
export function CallsView() {
  const { data, preview, mutate } = useProduct();
  const [error, setError] = useState("");
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">ON YOUR TERMS</span>
          <h1>Your check-ins</h1>
          <p>See what happened, and choose when to talk next.</p>
        </div>
        <Link href={viewLink("schedule", preview)} className="button secondary">
          Manage schedule
        </Link>
      </div>
      <section className="card sage">
        <CallCard />
      </section>
      {error && <Notice>{error}</Notice>}
      <section className="card">
        <h2>Call history</h2>
        {data?.calls.length ? (
          data.calls.map((c) => (
            <div key={c.id} className="list-row">
              <div>
                <strong>{new Date(c.created_at).toLocaleString()}</strong>
                <p className="caption">
                  {c.status === "uncertain"
                    ? "Delivery uncertain. We won't automatically redial."
                    : c.finished_at
                      ? "Call ended"
                      : "Status updates automatically"}
                </p>
              </div>
              <span className="badge">{c.status}</span>
              {!preview && ["ringing", "in-progress"].includes(c.status) && (
                <button
                  className="button secondary"
                  onClick={() =>
                    void mutate(`/calls/${c.id}/stop`).catch((e) =>
                      setError(message(e)),
                    )
                  }
                >
                  End call
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="No calls yet"
            description="Once setup and consent are complete, you can choose a time or request a test call."
          />
        )}
      </section>
    </>
  );
}
export function ViewBoundary({ children }: { children: React.ReactNode }) {
  const { loading, data, error, refresh } = useProduct();
  return data ? (
    children
  ) : loading ? (
    <Skeleton />
  ) : (
    <section className="card page-stack" aria-labelledby="connection-title">
      <span className="eyebrow">YOUR PRIVATE SPACE</span>
      <h1 id="connection-title">Let's reconnect your space</h1>
      <Notice error>
        {error || "Your information could not load. Please try again."}
      </Notice>
      <p>
        Signing in worked. Your journals, moods and check-ins will appear once
        the private data service is available.
      </p>
      <div className="row">
        <button className="button" onClick={() => void refresh()}>
          Try again
        </button>
        <Link className="button secondary" href="/preview">
          Explore the design preview
        </Link>
      </div>
    </section>
  );
}
