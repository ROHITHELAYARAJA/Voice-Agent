import type { Pool } from "pg";
import type { Environment } from "../../../apps/api/src/config.ts";
import { generateWeeklyInsights } from "../../journal-processor/src/weekly.ts";
import {
  materializeSchedules,
  processJob,
  reconcile,
  type Job,
} from "./worker.ts";

export type ScheduledTask = "calls" | "reconcile" | "recaps";

export async function runScheduledTask(
  pool: Pool,
  env: Environment,
  task: ScheduledTask,
) {
  const lock = await pool.connect();
  let acquired = false;
  try {
    const result = await lock.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(724610, hashtext($1)) as acquired",
      [task],
    );
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) return { task, status: "already-running" as const };
    if (task === "calls") {
      const platform = await pool.query<{ enabled: boolean }>(
        "select enabled from public.platform_settings where key='calling'",
      );
      if (!platform.rows[0]?.enabled)
        return { task, status: "paused" as const };
      await materializeSchedules(pool);
      const jobs = await pool.query<Job>(
        "select * from public.claim_call_jobs(2)",
      );
      for (const job of jobs.rows) await processJob(pool, env, job);
    } else if (task === "reconcile") {
      await reconcile(pool, env, { limit: 3, retention: false });
    } else {
      await generateWeeklyInsights(pool, { limit: 10, budgetMs: 30000 });
    }
    return { task, status: "completed" as const };
  } finally {
    if (acquired) {
      try {
        await lock.query("select pg_advisory_unlock(724610, hashtext($1))", [
          task,
        ]);
      } catch {
        lock.release(true);
        acquired = false;
        throw new Error("SCHEDULER_LOCK_RELEASE_FAILED");
      }
    }
    lock.release();
  }
}
