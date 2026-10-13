"use client";
import { useState } from "react";
import { ArrowUpRightIcon, QuotesIcon } from "@phosphor-icons/react";
import { voiceFeatures } from "@nila/wellness";
import type { Dashboard, Journal } from "@nila/shared-types";
import type { WellnessObservation } from "@nila/validation";
import { useProduct } from "./product-context";
import { Notice } from "./ui";

export function ReflectionCard({
  journal,
  date,
  onOpen,
}: {
  journal?: Journal;
  date: string;
  onOpen: () => void;
}) {
  const positives =
    journal?.statements?.filter((s) => s.kind === "positive") ?? [];
  const lines = journal?.statements?.map((s) => s.quote) ?? [];
  return (
    <section className="wellness-panel reflection-panel">
      <div className="panel-top">
        <h2>Your day, softly remembered</h2>
        <QuotesIcon size={25} />
      </div>
      <span className="snapshot-subtle">
        {date} ·{" "}
        {journal ? "Approved voice summary" : "No approved summary yet"}
      </span>
      <p className="daily-reflection">
        {journal?.user_edit ??
          (lines.length
            ? lines.slice(0, 3).join(" · ")
            : journal?.reflection) ??
          "Your words will find a home here after your nightly call."}
      </p>
      <div className="reflection-bottom">
        <span>
          <span aria-hidden="true">{positives.length ? "🏆" : "🌙"}</span>
          {positives.length
            ? positives[0]?.quote
            : "Only what you choose to share"}
        </span>
        <button
          className="icon-button"
          onClick={onOpen}
          aria-label="Open approved summaries"
        >
          <ArrowUpRightIcon size={20} />
        </button>
      </div>
    </section>
  );
}

export function WellnessCollection({
  observations,
  data,
  dates,
  onSelect,
}: {
  observations: WellnessObservation[];
  data: Dashboard;
  dates: string[];
  onSelect: (topic: string) => void;
}) {
  const known = new Set(observations.map((o) => o.topic as string));
  if (data.calls.length) known.add("calls");
  if (
    data.moods.some((m) => m.source === "voice" && dates.includes(m.entry_date))
  ) {
    known.add("calendar");
    known.add("reports");
  }
  if (data.memories?.length) known.add("memory");
  if (
    data.journals.some(
      (j) => j.source === "voice" && dates.includes(j.entry_date),
    )
  )
    known.add("journal");
  if (
    data.journals.some(
      (j) =>
        j.source === "voice" && dates.includes(j.entry_date) && j.topics.length,
    )
  )
    known.add("patterns");
  if (data.consent) known.add("privacy");
  return (
    <section
      className="wellness-panel collection-panel"
      aria-labelledby="collection-title"
    >
      <div className="panel-top">
        <div>
          <span className="eyebrow">ALL THE LITTLE PARTS OF YOU</span>
          <h2 id="collection-title">Your wellness constellation</h2>
        </div>
        <span className="small-chip">32 connections</span>
      </div>
      <div className="constellation">
        {voiceFeatures.map(([topic, emoji, label]) => (
          <button
            key={topic}
            className={known.has(topic) ? "reported" : "waiting"}
            onClick={() => onSelect(topic)}
            aria-label={`${label}, ${known.has(topic) ? "information available" : "not reported"}`}
            title={label}
          >
            <span className="constellation-emoji" aria-hidden="true">
              {emoji}
            </span>
            <span>{label}</span>
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

export function WellnessDetails({
  topic,
  data,
  journals,
  dates,
}: {
  topic: string;
  data: Dashboard;
  journals: Journal[];
  dates: string[];
}) {
  const { mutate, preview } = useProduct();
  const [error, setError] = useState("");
  const feature = voiceFeatures.find((f) => f[0] === topic);
  const observations = journals.flatMap((j) =>
    (j.wellness ?? [])
      .filter((o) => o.topic === topic)
      .map((o) => ({ ...o, date: j.entry_date })),
  );
  async function remove(path: string) {
    if (!window.confirm("Permanently delete this saved information?")) return;
    try {
      await mutate(path, undefined, "DELETE");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="wellness-details">
      <h3>
        <span aria-hidden="true">{feature?.[1]}</span>{" "}
        {feature?.[2] ?? "Reflection"}
      </h3>
      {topic === "journal" ? (
        journals.length ? (
          journals.map((j) => (
            <article className="detail-entry" key={j.id}>
              <time>{j.entry_date}</time>
              <p>{j.user_edit ?? j.reflection}</p>
              <button
                className="text-button"
                disabled={preview}
                onClick={() => void remove(`/journals/${j.id}`)}
              >
                Delete summary
              </button>
            </article>
          ))
        ) : (
          <p className="muted">No approved summaries in this period.</p>
        )
      ) : topic === "memory" ? (
        data.memories?.length ? (
          data.memories.map((m) => (
            <article className="detail-entry" key={m.id}>
              <p>{m.value}</p>
              <span className="caption">
                Separately approved for future calls
              </span>
              <button
                className="text-button"
                disabled={preview}
                onClick={() => void remove(`/memories/${m.id}`)}
              >
                Forget this
              </button>
            </article>
          ))
        ) : (
          <p className="muted">
            Nothing remembered without your separate permission.
          </p>
        )
      ) : topic === "calls" ? (
        data.calls.length ? (
          data.calls.map((c) => (
            <div className="list-row" key={c.id}>
              <time>{new Date(c.created_at).toLocaleDateString()}</time>
              <span>{c.status}</span>
            </div>
          ))
        ) : (
          <p className="muted">No calls yet.</p>
        )
      ) : topic === "privacy" ? (
        <>
          <p>
            {data.consent
              ? "Recurring calls and transcription permitted."
              : "Recurring call consent is not active."}
          </p>
          <p>
            Audio recording is disabled. Each summary needs spoken approval.
            Memory needs separate permission.
          </p>
        </>
      ) : ["reports", "calendar", "patterns"].includes(topic) ? (
        <PeriodReport data={data} journals={journals} dates={dates} />
      ) : observations.length ? (
        observations.map((o, i) => (
          <article className="detail-entry" key={`${o.date}-${i}`}>
            <time>{o.date}</time>
            <p>
              {String(o.value)} {o.unit ?? ""}
            </p>
            <q>{o.quote}</q>
            {o.due_at && (
              <p>
                {new Date(o.due_at).toLocaleString()} · Nightly follow-up only
              </p>
            )}
          </article>
        ))
      ) : (
        <p className="muted">
          Not reported in this period. Nila rotates topics across nightly calls.
        </p>
      )}
      {topic === "medication_reminder" && (
        <p className="caption">
          User requests only. Follow your clinician's instructions; Nila does
          not change doses or provide medication advice.
        </p>
      )}
      {topic === "support" && (
        <p className="caption">
          For immediate danger, contact local emergency services or someone
          trusted nearby. Nila cannot dispatch help.
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}

function PeriodReport({
  data,
  journals,
  dates,
}: {
  data: Dashboard;
  journals: Journal[];
  dates: string[];
}) {
  const moods = data.moods.filter(
    (m) => m.source === "voice" && dates.includes(m.entry_date),
  );
  const average = moods.length
    ? (moods.reduce((sum, m) => sum + m.score, 0) / moods.length).toFixed(1)
    : "—";
  const topics = new Map<string, number>();
  for (const j of journals)
    for (const topic of new Set(j.topics))
      topics.set(topic, (topics.get(topic) ?? 0) + 1);
  return (
    <>
      <div className="report-figures">
        <span>
          😊 <strong>{average}</strong>
          <small>/ 10 average</small>
        </span>
        <span>
          🌙 <strong>{journals.length}</strong>
          <small>reported days</small>
        </span>
      </div>
      <p className="caption">
        Only self-reported values within your selected period.
      </p>
      {[...topics].map(([topic, count]) => (
        <div className="list-row" key={topic}>
          <span>{topic}</span>
          <span>{count} check-ins</span>
        </div>
      ))}
      {!topics.size && (
        <p className="muted">No recurring stress topics reported.</p>
      )}
      <div className="detail-entry">
        <h3>Moments you appreciated</h3>
        {journals
          .flatMap(
            (j) =>
              j.statements
                ?.filter((s) => s.kind === "positive")
                .map((s) => s.quote) ?? [],
          )
          .map((q, i) => (
            <p key={i}>🏆 {q}</p>
          ))}
      </div>
    </>
  );
}
