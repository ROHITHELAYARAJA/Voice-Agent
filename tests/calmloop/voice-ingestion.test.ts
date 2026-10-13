import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi } from "../../apps/api/src/app.ts";
import type { Environment } from "../../apps/api/src/config.ts";
import type { database } from "../../apps/api/src/db.ts";
const owner = "11111111-1111-4111-8111-111111111111";
const session = "33333333-3333-4333-8333-333333333333";
const env: Environment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public",
  SUPABASE_SERVICE_ROLE_KEY: "server",
  DATABASE_URL: "postgres://example",
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  VOICE_SESSION_SECRET: "v".repeat(32),
  INTERNAL_SERVICE_SECRET: "i".repeat(32),
  VOICE_PUBLIC_URL: "https://voice.example",
  WEB_ORIGIN: "https://web.example",
  PORT: 4000,
  NODE_ENV: "test",
};
const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const quote = "I slept 7 hours.";
const payload = {
  statements: [{ kind: "reflection", quote }],
  mood_score: null,
  mood_evidence: "",
  user_turns: ["yes", quote, "yes"],
  summary_approved: true,
  generation: 2,
  wellness: [{ topic: "sleep", value: 7, unit: "h", quote }],
};
async function fixture(generation = 2, consent = true) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("select s.*"))
      return {
        rows: [
          {
            user_id: owner,
            spoken_consent: consent,
            generation,
            status: "in-progress",
            timezone: "Asia/Kolkata",
            retain_transcript: false,
          },
        ],
      };
    if (sql.startsWith("select recurring_calls"))
      return { rows: [{ allowed: true }] };
    if (sql.startsWith("insert into public.journal_entries"))
      return { rows: [{ id: "journal" }] };
    return { rows: [] };
  });
  const db = {
    pool: {
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
      end: vi.fn(),
    },
  } as unknown as ReturnType<typeof database>;
  const app = await buildApi(env, db);
  apps.push(app);
  return { app, query };
}
describe("tenant-bound voice JSON ingestion", () => {
  it("takes the owner from the call and saves structured wellness in a transaction", async () => {
    const { app, query } = await fixture();
    const response = await app.inject({
      method: "POST",
      url: `/internal/voice/${session}/reflection`,
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_SECRET}` },
      payload,
    });
    expect(response.statusCode).toBe(200);
    const writes = query.mock.calls as unknown as [string, unknown[]][];
    const journal = writes.find(([sql]) =>
      sql.startsWith("insert into public.journal_entries"),
    )!;
    expect(journal[1][0]).toBe(owner);
    expect(journal[1][1]).toBe(session);
    expect(JSON.parse(journal[1][7] as string)[0]).toMatchObject({
      topic: "sleep",
      value: 7,
      unit: "h",
    });
    expect(writes.at(-1)?.[0]).toBe("commit");
  });
  it("stores confirmed 5 L under the call owner without scaling", async () => {
    const { app, query } = await fixture();
    const waterQuote = "Today, I have drunk 5 L of water.";
    const response = await app.inject({
      method: "POST",
      url: `/internal/voice/${session}/reflection`,
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_SECRET}` },
      payload: {
        ...payload,
        statements: [{ kind: "reflection", quote: waterQuote }],
        user_turns: ["yes", waterQuote, "yes"],
        wellness: [{ topic: "water", value: 5, unit: "L", quote: waterQuote }],
      },
    });
    expect(response.statusCode).toBe(200);
    const writes = query.mock.calls as unknown as [string, unknown[]][];
    const journal = writes.find(([sql]) =>
      sql.startsWith("insert into public.journal_entries"),
    )!;
    expect(journal[1][0]).toBe(owner);
    expect(JSON.parse(journal[1][7] as string)).toEqual([
      { topic: "water", value: 5, unit: "L", quote: waterQuote },
    ]);
  });
  it.each([
    [1, true],
    [2, false],
  ])(
    "rejects stale speech generations or absent permission",
    async (generation, consent) => {
      const { app, query } = await fixture(
        generation as number,
        consent as boolean,
      );
      const response = await app.inject({
        method: "POST",
        url: `/internal/voice/${session}/reflection`,
        headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_SECRET}` },
        payload,
      });
      expect(response.statusCode).toBe(409);
      expect(
        query.mock.calls.some(([sql]) => sql.startsWith("insert into")),
      ).toBe(false);
    },
  );
  it("rejects supplied owner IDs and unauthenticated callers", async () => {
    const { app } = await fixture();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/internal/voice/${session}/reflection`,
          headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_SECRET}` },
          payload: { ...payload, user_id: "another-owner" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/internal/voice/${session}/reflection`,
          payload,
        })
      ).statusCode,
    ).toBe(403);
  });
});
