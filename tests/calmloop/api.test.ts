import { afterEach, describe, it, expect, vi } from "vitest";
import { buildApi } from "../../apps/api/src/app.ts";
import type { Environment } from "../../apps/api/src/config.ts";
import type { database } from "../../apps/api/src/db.ts";
const owner = "11111111-1111-4111-8111-111111111111";
const env: Environment = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  DATABASE_URL: "postgres://example",
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  VOICE_SESSION_SECRET: "s".repeat(32),
  INTERNAL_SERVICE_SECRET: "i".repeat(32),
  VOICE_PUBLIC_URL: "https://voice.example",
  WEB_ORIGIN: "https://web.example",
  PORT: 4000,
  NODE_ENV: "test",
};
const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function token(aal = "aal1") {
  return `header.${Buffer.from(JSON.stringify({ sub: owner, aal, amr: [{ timestamp: Date.now() / 1000 }] })).toString("base64url")}.signature`;
}
async function fixture({
  admin = false,
  mfa = false,
  invalid = false,
  suspended = false,
} = {}) {
  const writes: unknown[] = [];
  function query(table: string) {
    const result = {
      data:
        table === "profiles"
          ? { suspended }
          : table === "account_roles"
            ? [{ role: admin ? "admin" : "customer" }]
            : [
                  "consent_records",
                  "provider_connections",
                  "verified_phone_numbers",
                ].includes(table)
              ? []
              : {},
      error: null,
    };
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve(result),
      upsert: (body: unknown) => {
        writes.push(body);
        return chain;
      },
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  }
  const transaction = {
    query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
    release: vi.fn(),
  };
  const db = {
    admin: {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: invalid
              ? null
              : {
                  id: owner,
                  email_confirmed_at: new Date().toISOString(),
                  factors: mfa ? [{ status: "verified" }] : [],
                },
          },
          error: invalid ? new Error("Invalid JWT") : null,
        })),
      },
      from: query,
    },
    scoped: vi.fn(() => ({ from: query })),
    pool: {
      end: vi.fn(),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      connect: vi.fn(async () => transaction),
    },
  } as unknown as ReturnType<typeof database>;
  const app = await buildApi(env, db);
  apps.push(app);
  return { app, writes, db, transaction };
}
describe("API authentication and ownership", () => {
  it("opens self-care without providers or a phone and keeps calls disabled for the authenticated owner", async () => {
    const { app, transaction } = await fixture();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await app.inject({
      method: "POST",
      url: "/v1/onboarding/complete",
      headers: { authorization: `Bearer ${token()}` },
      payload: { mode: "self_care", adult: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ready: true, mode: "self_care" });
    expect(fetch).not.toHaveBeenCalled();
    const queries = transaction.query.mock.calls as unknown as [
      string,
      unknown[]?,
    ][];
    expect(queries[0]?.[0]).toBe("begin");
    expect(queries.at(-1)?.[0]).toBe("commit");
    for (const [sql, values] of queries.slice(1, -1)) {
      expect(values).toEqual([owner]);
      expect(sql).not.toContain("encrypted_credentials");
    }
    expect(
      queries.some(([sql]) => sql.includes("true,false,false,false")),
    ).toBe(true);
    expect(queries.some(([sql]) => sql.includes("enabled=false"))).toBe(true);
    expect(queries.some(([sql]) => sql.includes("status='canceled'"))).toBe(
      true,
    );
    expect(
      queries.some(([sql]) => sql.includes("onboarding_complete=true")),
    ).toBe(true);
    expect(transaction.release).toHaveBeenCalled();
  });
  it("requires adult confirmation and rejects another user's ID during self-care onboarding", async () => {
    for (const payload of [
      { mode: "self_care", adult: false },
      { mode: "self_care" },
      { mode: "self_care", adult: true, user_id: "other" },
    ]) {
      const { app, db } = await fixture();
      const response = await app.inject({
        method: "POST",
        url: "/v1/onboarding/complete",
        headers: { authorization: `Bearer ${token()}` },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(db.pool.connect).not.toHaveBeenCalled();
    }
  });
  it("rolls back failed self-care onboarding instead of reporting success", async () => {
    const { app, transaction } = await fixture();
    transaction.query.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await app.inject({
      method: "POST",
      url: "/v1/onboarding/complete",
      headers: { authorization: `Bearer ${token()}` },
      payload: { mode: "self_care", adult: true },
    });
    expect(response.statusCode).toBe(500);
    expect(transaction.query).toHaveBeenLastCalledWith("rollback");
    expect(transaction.release).toHaveBeenCalled();
  });
  it("keeps telephone calls gated after self-care access and rejects unsupported voice setup", async () => {
    const { app, db } = await fixture();
    for (const url of ["/v1/calls/test", "/v1/onboarding/complete"]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers: { authorization: `Bearer ${token()}` },
      });
      expect(response.statusCode).toBe(409);
    }
    expect(db.pool.connect).not.toHaveBeenCalled();
  });
  it("explains why a trial demo cannot connect Nila without saving unsupported credentials", async () => {
    const { app, db } = await fixture();
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "active", type: "Trial" })),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await app.inject({
      method: "POST",
      url: "/v1/providers",
      headers: { authorization: `Bearer ${token()}` },
      payload: {
        provider: "twilio",
        account_sid: "AC" + "a".repeat(32),
        auth_token: "private-token".repeat(3),
        caller_number: "+14155550100",
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toContain(
      "trial accounts block Media Streams",
    );
    expect(response.body).not.toContain("private-token");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.pool.query).toHaveBeenCalledTimes(1);
  });
  it("explains rejected caller ownership without saving credentials or returning secrets", async () => {
    const { app, db } = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("IncomingPhoneNumbers")
                ? { incoming_phone_numbers: [] }
                : { status: "active", type: "Full" },
            ),
          ),
      ),
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/providers",
      headers: { authorization: `Bearer ${token()}` },
      payload: {
        provider: "twilio",
        account_sid: "AC" + "a".repeat(32),
        auth_token: "private-token".repeat(3),
        caller_number: "+14155550100",
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toContain(
      "caller number does not belong to this account",
    );
    expect(response.body).not.toContain("private-token");
    expect(db.pool.query).toHaveBeenCalledTimes(1);
  });
  it("requires the internal secret before scheduler access and supports non-dialing verification", async () => {
    const { app, db } = await fixture();
    const request = {
      method: "POST" as const,
      url: "/internal/scheduler/calls",
      payload: { dry_run: true },
    };
    expect((await app.inject(request)).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          ...request,
          headers: { authorization: `Bearer ${token()}` },
        })
      ).statusCode,
    ).toBe(403);
    const verified = await app.inject({
      ...request,
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_SECRET}` },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toMatchObject({
      status: "configured",
      scheduler: "supabase-cron-v1",
    });
    expect(db.pool.query).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          ...request,
          url: "/internal/scheduler/delete",
          headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_SECRET}` },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("rejects missing and invalid identities before accessing data", async () => {
    const { app, db } = await fixture({ invalid: true });
    expect((await app.inject({ url: "/v1/dashboard" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: "/v1/dashboard",
          headers: { authorization: `Bearer ${token()}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(db.scoped).not.toHaveBeenCalled();
  });
  it("takes the mood owner only from the verified identity", async () => {
    const { app, writes } = await fixture();
    const headers = { authorization: `Bearer ${token()}` };
    const good = await app.inject({
      method: "POST",
      url: "/v1/moods",
      headers,
      payload: { entry_date: "2026-10-12", score: 6, tags: [] },
    });
    expect(good.statusCode).toBe(200);
    expect(writes[0]).toMatchObject({ user_id: owner, source: "manual" });
    const spoof = await app.inject({
      method: "POST",
      url: "/v1/moods",
      headers,
      payload: {
        entry_date: "2026-10-12",
        score: 6,
        tags: [],
        user_id: "other",
      },
    });
    expect(spoof.statusCode).toBe(400);
    expect(writes).toHaveLength(1);
  });
  it("requires MFA for administrators and customers with enrolled MFA", async () => {
    for (const settings of [{ admin: true }, { mfa: true }]) {
      const { app } = await fixture(settings);
      expect(
        (
          await app.inject({
            url: "/v1/dashboard",
            headers: { authorization: `Bearer ${token()}` },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: "/v1/mfa-status",
            headers: { authorization: `Bearer ${token()}` },
          })
        ).statusCode,
      ).toBe(200);
    }
  });
  it("blocks customer admin access and suspended accounts", async () => {
    const customer = await fixture();
    expect(
      (
        await customer.app.inject({
          url: "/v1/admin",
          headers: { authorization: `Bearer ${token("aal2")}` },
        })
      ).statusCode,
    ).toBe(403);
    const suspended = await fixture({ suspended: true });
    expect(
      (
        await suspended.app.inject({
          url: "/v1/dashboard",
          headers: { authorization: `Bearer ${token()}` },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("rejects unauthenticated internal service requests", async () => {
    const { app } = await fixture();
    expect(
      (await app.inject({ url: `/internal/voice/${owner}/context` }))
        .statusCode,
    ).toBe(403);
  });
});
