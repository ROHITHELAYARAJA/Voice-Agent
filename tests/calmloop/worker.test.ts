import { it, expect, vi } from "vitest";
import type { Pool } from "pg";
import type { Environment } from "../../apps/api/src/config.ts";
import { encrypt } from "../../apps/api/src/security.ts";
import { processJob, type Job } from "../../services/call-worker/src/worker.ts";
const key = Buffer.alloc(32, 5),
  env = {
    CREDENTIAL_ENCRYPTION_KEY: key.toString("base64"),
    VOICE_SESSION_SECRET: "s".repeat(32),
    VOICE_PUBLIC_URL: "https://voice.example",
  } as Environment;
function fixture(
  owner: string,
  letter: string,
  { permission = true, trial = false } = {},
) {
  let status = "claimed";
  const sql: string[] = [];
  const credentials = {
      provider: "twilio",
      account_sid: `AC${letter.repeat(32)}`,
      auth_token: `token-${letter}`,
      caller_number: letter === "a" ? "+14155550101" : "+14155550102",
    },
    ref = `ref-${letter}`;
  const job: Job = {
    id: `job-${letter}`,
    user_id: owner,
    schedule_id: "11111111-1111-4111-8111-111111111111",
    claim_token: "claim",
    occurrence_at: new Date().toISOString(),
    attempts: 1,
  };
  const query = vi.fn(async (text: string, params?: unknown[]) => {
    sql.push(text);
    if (text.startsWith("select p.display_name"))
      return {
        rows: [
          {
            phone_number: letter === "a" ? "+919000000001" : "+919000000002",
            capabilities: { media_streams: !trial },
            recurring_calls: permission,
            transcription: true,
            enabled: true,
            local_time: "20:00",
            timezone: letter === "a" ? "Asia/Kolkata" : "Europe/London",
            weekdays: [1, 2, 3, 4, 5, 6, 7],
          },
        ],
        rowCount: 1,
      };
    if (text.includes("set status='sending'")) {
      if (status !== "claimed") return { rows: [], rowCount: 0 };
      status = "sending";
      return { rows: [{ id: job.id }], rowCount: 1 };
    }
    if (text.startsWith("insert into public.call_sessions"))
      return {
        rows: [{ id: "22222222-2222-4222-8222-222222222222" }],
        rowCount: 1,
      };
    if (text.startsWith("select e.id")) {
      expect(params?.[0]).toBe(owner);
      return {
        rows: [
          {
            id: ref,
            envelope: encrypt(credentials, key, owner, "twilio", ref),
          },
        ],
        rowCount: 1,
      };
    }
    if (text.startsWith("select not p.suspended"))
      return { rows: [{ permitted: permission }], rowCount: 1 };
    if (text.includes("set status='uncertain'")) status = "uncertain";
    if (text.includes("set status='canceled'")) status = "canceled";
    if (text.includes("set status='sent'")) status = "sent";
    return { rows: [], rowCount: 1 };
  });
  return {
    pool: {
      connect: async () => ({ query, release: vi.fn() }),
      query,
    } as unknown as Pool,
    job,
    credentials,
    sql,
  };
}
it("uses each customer's credentials and independent schedule", async () => {
  for (const [owner, letter] of [
    ["alice", "a"],
    ["bob", "b"],
  ]) {
    const f = fixture(owner!, letter!);
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ sid: `CA${letter!.repeat(32)}` })),
    );
    await processJob(f.pool, env, f.job, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain(f.credentials.account_sid);
    expect(new Headers(request.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from(`${f.credentials.account_sid}:${f.credentials.auth_token}`).toString("base64")}`,
    );
    expect((request.body as URLSearchParams).get("From")).toBe(
      f.credentials.caller_number,
    );
    expect(f.sql.some((s) => s.includes("next_call_at_utc=$2"))).toBe(true);
  }
});
it("does not dial without current consent or Trial streaming permission", async () => {
  for (const options of [{ permission: false }, { trial: true }]) {
    const f = fixture("alice", "a", options),
      fetcher = vi.fn();
    await processJob(f.pool, env, f.job, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(f.sql.some((s) => s.includes("status='canceled'"))).toBe(true);
  }
});
it("marks a lost response uncertain and never blindly sends it again", async () => {
  const f = fixture("alice", "a"),
    fetcher = vi.fn(async () => {
      throw new Error("Network disconnected after request");
    });
  await processJob(f.pool, env, f.job, fetcher);
  expect(f.sql.some((s) => s.includes("status='uncertain'"))).toBe(true);
  await processJob(f.pool, env, f.job, fetcher);
  expect(fetcher).toHaveBeenCalledOnce();
});
