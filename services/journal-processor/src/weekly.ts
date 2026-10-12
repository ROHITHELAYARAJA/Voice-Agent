import type { Pool } from "pg";
import type {
  Mood,
  Journal,
} from "../../../packages/shared-types/src/index.ts";
import { weeklyRecap } from "./insights.ts";
export async function generateWeeklyInsights(pool: Pool) {
  const owners = await pool.query<{ user_id: string; timezone: string }>(
    "select p.user_id,p.timezone from public.profiles p where not p.suspended and p.onboarding_complete and not exists(select 1 from public.weekly_insights w where w.user_id=p.user_id and w.created_at>now()-interval '24 hours') limit 100",
  );
  for (const owner of owners.rows) {
    const end = new Intl.DateTimeFormat("en-CA", {
      timeZone: owner.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const start = new Date(`${end}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 6);
    const since = start.toISOString().slice(0, 10);
    const moods = await pool.query<Mood>(
      "select id,entry_date::text,score,tags,source from public.mood_entries where user_id=$1 and entry_date between $2 and $3",
      [owner.user_id, since, end],
    );
    const journals = await pool.query<Journal>(
      "select id,entry_date::text,title,reflection,user_edit,source,topics,statements,created_at from public.journal_entries where user_id=$1 and entry_date between $2 and $3",
      [owner.user_id, since, end],
    );
    const completed = await pool.query<{ count: number }>(
      "select count(*)::int as count from public.self_care_activities where user_id=$1 and completed_at>now()-interval '7 days'",
      [owner.user_id],
    );
    const report = {
      ...weeklyRecap(moods.rows, journals.rows),
      positiveMoments: journals.rows.flatMap((j) =>
        (j.statements ?? [])
          .filter((s) => s.kind === "positive")
          .map((s) => s.quote),
      ),
      intentions: journals.rows.flatMap((j) =>
        (j.statements ?? [])
          .filter((s) => s.kind === "intention")
          .map((s) => s.quote),
      ),
      activitiesCompleted: completed.rows[0]?.count ?? 0,
      source: "Computed from self-reported moods and exact user statements",
      period: { start: since, end },
    };
    await pool.query(
      "insert into public.weekly_insights(user_id,week_start,report) values($1,$2,$3) on conflict(user_id,week_start) do update set report=excluded.report,created_at=now() where public.weekly_insights.report is distinct from excluded.report",
      [owner.user_id, since, report],
    );
  }
}
