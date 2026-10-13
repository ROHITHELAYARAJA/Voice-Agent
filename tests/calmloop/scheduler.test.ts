import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { Environment } from "../../apps/api/src/config.ts";
import { runScheduledTask } from "../../services/call-worker/src/tasks.ts";

function fixture({ acquired = true, enabled = true, fail = false } = {}) {
  const release = vi.fn();
  const lockQuery = vi.fn(async (sql: string) => ({
    rows: sql.includes("pg_try") ? [{ acquired }] : [],
  }));
  const query = vi.fn(async (sql: string) => {
    if (fail) throw new Error("Database unavailable");
    return { rows: sql.includes("platform_settings") ? [{ enabled }] : [] };
  });
  const pool = {
    connect: async () => ({ query: lockQuery, release }),
    query,
  } as unknown as Pool;
  return { pool, release, lockQuery, query };
}

it("does not start a second overlapping scheduler execution", async () => {
  const f = fixture({ acquired: false });
  expect(
    await runScheduledTask(f.pool, {} as Environment, "calls"),
  ).toMatchObject({ status: "already-running" });
  expect(f.query).not.toHaveBeenCalled();
  expect(f.release).toHaveBeenCalledOnce();
});

it("does not create or claim jobs while platform calling is paused", async () => {
  const f = fixture({ enabled: false });
  expect(
    await runScheduledTask(f.pool, {} as Environment, "calls"),
  ).toMatchObject({ status: "paused" });
  expect(f.query).toHaveBeenCalledOnce();
  expect(f.lockQuery).toHaveBeenLastCalledWith(
    expect.stringContaining("pg_advisory_unlock"),
    ["calls"],
  );
});

it("claims only a bounded batch and releases its lock", async () => {
  const f = fixture();
  expect(
    await runScheduledTask(f.pool, {} as Environment, "calls"),
  ).toMatchObject({ status: "completed" });
  expect(f.query).toHaveBeenCalledWith(
    "select * from public.claim_call_jobs(2)",
  );
  expect(f.release).toHaveBeenCalledOnce();
});

it("unlocks after a failed task so a later Cron tick can recover", async () => {
  const f = fixture({ fail: true });
  await expect(
    runScheduledTask(f.pool, {} as Environment, "calls"),
  ).rejects.toThrow("Database unavailable");
  expect(f.lockQuery).toHaveBeenLastCalledWith(
    expect.stringContaining("pg_advisory_unlock"),
    ["calls"],
  );
  expect(f.release).toHaveBeenCalledOnce();
});
