import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Environment } from "./config.ts";
import { database } from "./db.ts";
import { loadCredentials, saveCredentials } from "./credentials.ts";
import {
  providerRequest,
  providerVerificationMessage,
  twilioHeaders,
  validateProvider,
} from "./providers.ts";
import {
  activities,
  consentInput,
  journalInput,
  moodInput,
  phoneInput,
  preferencesInput,
  providerInput,
  scheduleInput,
  voiceCapabilities,
} from "../../../packages/validation/src/index.ts";
import { nextOccurrence } from "../../../services/call-worker/src/scheduling.ts";
import { runScheduledTask } from "../../../services/call-worker/src/tasks.ts";
import { weeklyRecap } from "../../../services/journal-processor/src/insights.ts";
import type {
  Journal,
  Mood,
} from "../../../packages/shared-types/src/index.ts";
import {
  reflectionInput,
  validatedReflection,
} from "../../../services/journal-processor/src/reflection.ts";

type Identity = {
  user: User;
  client: SupabaseClient;
  aal: string;
  authenticatedAt: number;
};
class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
function checked<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error)
    throw new ApiError(
      503,
      "Your information could not be saved. Please try again.",
    );
  return result.data as NonNullable<T>;
}
export async function buildApi(env: Environment, db = database(env)) {
  const app = Fastify({
    logger: {
      level: "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body",
        "res.headers.set-cookie",
      ],
      serializers: {
        req: (r) => ({ method: r.method, route: r.routeOptions?.url }),
        res: (r) => ({ statusCode: r.statusCode }),
      },
    },
    bodyLimit: 20000,
  });
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: false });
  await app.register(helmet);
  await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  const key = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, "base64");
  const identities = new WeakMap<FastifyRequest, Identity>();
  async function authenticate(request: FastifyRequest) {
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new ApiError(401, "Please sign in to continue.");
    const { data, error } = await db.admin.auth.getUser(token);
    if (error || !data.user || !data.user.email_confirmed_at)
      throw new ApiError(401, "Please sign in with a verified account.");
    const profile = checked(
      await db.admin
        .from("profiles")
        .select("suspended")
        .eq("user_id", data.user.id)
        .single(),
    );
    if (profile.suspended)
      throw new ApiError(
        403,
        "Your account is paused. Please contact support.",
      );
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
    ) as { aal?: string; amr?: { timestamp: number }[] };
    const identity = {
      user: data.user,
      client: db.scoped(token),
      aal: claims.aal ?? "aal1",
      authenticatedAt: Math.max(
        0,
        ...(claims.amr ?? []).map((a) => a.timestamp),
      ),
    };
    if (
      data.user.factors?.some((f) => f.status === "verified") &&
      identity.aal !== "aal2" &&
      !request.url.startsWith("/v1/mfa-status")
    )
      throw new ApiError(403, "Verify your authenticator to continue.");
    const roles = checked(
      await db.admin
        .from("account_roles")
        .select("role")
        .eq("user_id", data.user.id),
    );
    if (
      roles.some((r) => r.role === "admin") &&
      identity.aal !== "aal2" &&
      !request.url.startsWith("/v1/mfa-status")
    )
      throw new ApiError(
        403,
        "Administrator accounts require multi-factor verification.",
      );
    identities.set(request, identity);
  }
  function identity(request: FastifyRequest) {
    const value = identities.get(request);
    if (!value) throw new ApiError(401, "Sign in required.");
    return value;
  }
  async function administrator(request: FastifyRequest) {
    const value = identity(request);
    const roles = checked(
      await db.admin
        .from("account_roles")
        .select("role")
        .eq("user_id", value.user.id),
    );
    if (value.aal !== "aal2" || !roles.some((r) => r.role === "admin"))
      throw new ApiError(403, "Administrator verification required.");
    return value;
  }
  function internal(request: FastifyRequest) {
    const expected = Buffer.from(`Bearer ${env.INTERNAL_SERVICE_SECRET}`),
      given = Buffer.from(request.headers.authorization ?? "");
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new ApiError(403, "Unauthorized service.");
  }
  async function eligibility(owner: string) {
    const [profile, consent, connections, phone, preferences, platform] =
      await Promise.all([
        db.admin
          .from("profiles")
          .select("suspended,onboarding_complete")
          .eq("user_id", owner)
          .single(),
        db.admin
          .from("consent_records")
          .select("recurring_calls,transcription,adult")
          .eq("user_id", owner)
          .order("created_at", { ascending: false })
          .limit(1),
        db.admin
          .from("provider_connections")
          .select("provider,status,capabilities")
          .eq("user_id", owner),
        db.admin
          .from("verified_phone_numbers")
          .select("id")
          .eq("user_id", owner),
        db.admin
          .from("call_preferences")
          .select("voice_id,language")
          .eq("user_id", owner)
          .single(),
        db.admin
          .from("platform_settings")
          .select("enabled")
          .eq("key", "calling")
          .single(),
      ]);
    const p = checked(profile),
      c = checked(consent)[0],
      providers = checked(connections),
      phones = checked(phone),
      prefs = checked(preferences);
    const ready =
      !p.suspended &&
      !!c?.adult &&
      !!c?.recurring_calls &&
      !!c?.transcription &&
      phones.length > 0 &&
      ["twilio", "deepgram", "elevenlabs"].every((name) =>
        providers.some(
          (item) => item.provider === name && item.status === "connected",
        ),
      );
    const twilio = providers.find((item) => item.provider === "twilio");
    if (!ready)
      throw new ApiError(
        409,
        "Complete provider setup, phone verification, and consent first.",
      );
    if (!twilio?.capabilities?.media_streams)
      throw new ApiError(
        409,
        "This Twilio account does not permit Media Streams. A trial cannot run the production voice path.",
      );
    if (
      !prefs.voice_id ||
      (!voiceCapabilities.manual.includes(prefs.language) &&
        prefs.language !== "auto")
    )
      throw new ApiError(409, "Choose a supported language and voice.");
    return { calling: !!checked(platform).enabled };
  }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: "Please check the form values.",
        fields: error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    const candidateStatus = (error as { statusCode?: number } | null)
      ?.statusCode;
    const status =
      error instanceof ApiError
        ? error.statusCode
        : typeof candidateStatus === "number" &&
            candidateStatus >= 400 &&
            candidateStatus < 500
          ? candidateStatus
          : 500;
    if (status === 500)
      app.log.error({ code: "INTERNAL_FAILURE" }, "Request failed");
    return reply.code(status).send({
      error:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Your private information remains protected.",
    });
  });
  app.get("/health", async () => ({
    status: "ready",
    service: "calmloop-api",
    scheduler: "supabase-cron-v1",
  }));
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/v1/")) await authenticate(request);
    if (request.url.startsWith("/internal/")) internal(request);
  });
  app.post("/internal/scheduler/:task", async (request) => {
    const { task } = z
      .object({ task: z.enum(["calls", "reconcile", "recaps"]) })
      .parse(request.params);
    const body = z
      .object({ dry_run: z.boolean().default(false) })
      .strict()
      .parse(request.body ?? {});
    if (body.dry_run)
      return { task, status: "configured", scheduler: "supabase-cron-v1" };
    const result = await runScheduledTask(db.pool, env, task);
    app.log.info(result, "Supabase scheduled task finished");
    return result;
  });
  app.get("/v1/mfa-status", async (request) => ({
    aal: identity(request).aal,
  }));
  app.put("/v1/profile", async (request) => {
    const { user } = identity(request);
    const body = z
      .object({
        display_name: z.string().trim().min(1).max(80),
        timezone: scheduleInput.shape.timezone,
      })
      .strict()
      .parse(request.body);
    checked(
      await db.admin.from("profiles").update(body).eq("user_id", user.id),
    );
    return { saved: true };
  });
  app.get("/v1/dashboard", async (request) => {
    const { client, user } = identity(request);
    const queries = await Promise.all([
      client
        .from("profiles")
        .select("display_name,timezone,onboarding_complete")
        .eq("user_id", user.id)
        .single(),
      client
        .from("mood_entries")
        .select("id,entry_date,score,tags,source")
        .order("entry_date", { ascending: false })
        .limit(90),
      client
        .from("journal_entries")
        .select(
          "id,entry_date,title,reflection,user_edit,source,topics,statements,created_at",
        )
        .order("entry_date", { ascending: false })
        .limit(90),
      client
        .from("call_sessions")
        .select("id,status,created_at,finished_at")
        .order("created_at", { ascending: false })
        .limit(30),
      client
        .from("provider_connections")
        .select("provider,status,label,verified_at,capabilities"),
      client
        .from("call_schedules")
        .select("id,local_time,timezone,weekdays,enabled,next_call_at_utc"),
      client
        .from("self_care_activities")
        .select("id,activity_key,completed_at")
        .order("completed_at", { ascending: false })
        .limit(100),
      client
        .from("challenge_progress")
        .select("cycle,day,status")
        .order("updated_at", { ascending: false })
        .limit(100),
      client
        .from("call_preferences")
        .select("language,voice_id,retain_transcript,retention_days")
        .single(),
      client
        .from("consent_records")
        .select("recurring_calls,transcription")
        .order("created_at", { ascending: false })
        .limit(1),
      client
        .from("verified_phone_numbers")
        .select("id,masked_number,verified_at"),
    ]);
    const values = queries.map((result) =>
      checked({ data: result.data as unknown, error: result.error }),
    );
    const moods = values[1] as Mood[],
      journals = values[2] as Journal[];
    const cutoff = new Date(Date.now() - 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      profile: values[0],
      moods,
      journals,
      calls: values[3],
      connections: values[4],
      schedules: values[5],
      activities: values[6],
      challenge: values[7],
      preferences: values[8],
      consent:
        !!(
          values[9] as { recurring_calls: boolean; transcription: boolean }[]
        )[0]?.recurring_calls &&
        !!(values[9] as { transcription: boolean }[])[0]?.transcription,
      phones: values[10],
      recap: weeklyRecap(
        moods.filter((m) => m.entry_date >= cutoff),
        journals.filter((j) => j.entry_date >= cutoff),
      ),
    };
  });
  app.post("/v1/moods", async (request) => {
    const { client, user } = identity(request);
    const body = moodInput.parse(request.body);
    return checked(
      await client
        .from("mood_entries")
        .upsert(
          { ...body, user_id: user.id, source: "manual" },
          { onConflict: "user_id,entry_date" },
        )
        .select()
        .single(),
    );
  });
  app.post("/v1/journals", async (request) => {
    const { client, user } = identity(request);
    const body = journalInput.parse(request.body);
    const profile = checked(
      await db.admin
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .single(),
    );
    return checked(
      await client
        .from("journal_entries")
        .insert({
          ...body,
          user_id: user.id,
          entry_date: new Intl.DateTimeFormat("en-CA", {
            timeZone: profile.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
          source: "manual",
        })
        .select()
        .single(),
    );
  });
  app.patch("/v1/journals/:id", async (request) => {
    const { client } = identity(request);
    const id = z.uuid().parse((request.params as { id: string }).id);
    const body = z
      .object({
        title: z.string().min(1).max(120),
        user_edit: z.string().max(10000),
      })
      .strict()
      .parse(request.body);
    return checked(
      await client
        .from("journal_entries")
        .update(body)
        .eq("id", id)
        .select()
        .single(),
    );
  });
  app.delete("/v1/journals/:id", async (request) => {
    const { client } = identity(request);
    const id = z.uuid().parse((request.params as { id: string }).id);
    checked(await client.from("journal_entries").delete().eq("id", id));
    return { deleted: true };
  });
  app.post("/v1/activities", async (request) => {
    const { client, user } = identity(request);
    const body = z
      .object({
        activity_key: z.enum(
          activities.map((a) => a.key) as [string, ...string[]],
        ),
      })
      .strict()
      .parse(request.body);
    return checked(
      await client
        .from("self_care_activities")
        .insert({ ...body, user_id: user.id })
        .select()
        .single(),
    );
  });
  app.post("/v1/goals", async (request) => {
    const { client, user } = identity(request);
    const body = z
      .object({ title: z.string().trim().min(1).max(160) })
      .strict()
      .parse(request.body);
    return checked(
      await client
        .from("self_care_goals")
        .insert({ ...body, user_id: user.id })
        .select()
        .single(),
    );
  });
  app.get("/v1/goals", async (request) =>
    checked(
      await identity(request)
        .client.from("self_care_goals")
        .select("id,title,completed"),
    ),
  );
  app.patch("/v1/goals/:id", async (request) => {
    const body = z
      .object({ completed: z.boolean() })
      .strict()
      .parse(request.body);
    return checked(
      await identity(request)
        .client.from("self_care_goals")
        .update(body)
        .eq("id", z.uuid().parse((request.params as { id: string }).id))
        .select()
        .single(),
    );
  });
  app.post("/v1/challenge", async (request) => {
    const { client, user } = identity(request);
    const body = z
      .object({
        cycle: z.uuid(),
        day: z.number().int().min(1).max(30),
        status: z.enum(["completed", "skipped"]),
      })
      .strict()
      .parse(request.body);
    return checked(
      await client
        .from("challenge_progress")
        .upsert(
          { ...body, user_id: user.id },
          { onConflict: "user_id,cycle,day" },
        )
        .select()
        .single(),
    );
  });
  app.put("/v1/preferences", async (request) => {
    const { user } = identity(request);
    const body = preferencesInput.parse(request.body);
    const voice = checked(
      await db.admin
        .from("provider_connections")
        .select("capabilities")
        .eq("user_id", user.id)
        .eq("provider", "elevenlabs")
        .single(),
    );
    if (
      !(voice.capabilities?.voices as { id: string }[] | undefined)?.some(
        (v) => v.id === body.voice_id,
      )
    )
      throw new ApiError(
        400,
        "Choose a voice from your connected ElevenLabs account.",
      );
    checked(
      await db.admin
        .from("call_preferences")
        .update(body)
        .eq("user_id", user.id),
    );
    return { saved: true };
  });
  app.post(
    "/v1/providers",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request) => {
      const { user } = identity(request);
      const body = providerInput.parse(request.body);
      const active = await db.pool.query(
        "select id from public.call_sessions where user_id=$1 and status in ('sending','initiated','ringing','in-progress') limit 1",
        [user.id],
      );
      if (active.rowCount)
        throw new ApiError(
          409,
          "End the current check-in before replacing provider credentials.",
        );
      let verified;
      try {
        verified = await validateProvider(body);
      } catch (error) {
        throw new ApiError(
          422,
          providerVerificationMessage(error, body.provider),
        );
      }
      await saveCredentials(db.pool, key, user.id, body, verified);
      return { provider: body.provider, status: "connected", ...verified };
    },
  );
  app.delete("/v1/providers/:provider", async (request) => {
    const { user } = identity(request);
    const provider = z
      .enum(["twilio", "deepgram", "elevenlabs"])
      .parse((request.params as { provider: string }).provider);
    await db.pool.query(
      "update public.call_schedules set enabled=false,next_call_at_utc=null where user_id=$1",
      [user.id],
    );
    await db.pool.query(
      "update public.call_jobs set status='canceled' where user_id=$1 and status in ('queued','claimed')",
      [user.id],
    );
    await db.pool.query(
      "delete from private.encrypted_credentials where user_id=$1 and provider=$2",
      [user.id, provider],
    );
    await db.pool.query(
      "insert into public.audit_logs(user_id,actor_id,action,metadata) values($1,$1,'provider.disconnected',$2)",
      [user.id, { provider }],
    );
    return { disconnected: true };
  });
  app.post(
    "/v1/phone/start",
    { config: { rateLimit: { max: 2, timeWindow: "10 minutes" } } },
    async (request) => {
      const { user } = identity(request);
      const body = phoneInput.parse(request.body);
      const credentials = await loadCredentials(
        db.pool,
        key,
        user.id,
        "twilio",
      );
      if (credentials.provider !== "twilio")
        throw new ApiError(409, "Connect Twilio first.");
      try {
        const result = await providerRequest(
          `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/OutgoingCallerIds.json`,
          {
            ...twilioHeaders(credentials),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          "POST",
          new URLSearchParams({
            PhoneNumber: body.phone_number,
            FriendlyName: "Nila verification",
          }),
        );
        return {
          validation_code: result.validation_code,
          phone_number: body.phone_number,
        };
      } catch {
        throw new ApiError(
          422,
          "Twilio could not start phone verification. Verify the number in your Twilio console and retry confirmation.",
        );
      }
    },
  );
  app.post("/v1/phone/confirm", async (request) => {
    const { user } = identity(request);
    const body = phoneInput.parse(request.body);
    const credentials = await loadCredentials(db.pool, key, user.id, "twilio");
    if (credentials.provider !== "twilio")
      throw new ApiError(409, "Connect Twilio first.");
    const result = await providerRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(body.phone_number)}`,
      twilioHeaders(credentials),
    );
    if (
      !(
        result.outgoing_caller_ids as { phone_number: string }[] | undefined
      )?.some((p) => p.phone_number === body.phone_number)
    )
      throw new ApiError(
        422,
        "The phone number is not verified in your Twilio account yet.",
      );
    return checked(
      await db.admin
        .from("verified_phone_numbers")
        .upsert(
          {
            user_id: user.id,
            phone_number: body.phone_number,
            masked_number: `•••${body.phone_number.slice(-4)}`,
            verified_at: new Date().toISOString(),
          },
          { onConflict: "user_id,phone_number" },
        )
        .select("id,masked_number")
        .single(),
    );
  });
  app.post("/v1/consent", async (request) => {
    const { user } = identity(request);
    const body = consentInput.parse(request.body);
    checked(
      await db.admin
        .from("consent_records")
        .insert({ ...body, user_id: user.id, policy_version: "2026-10-12" }),
    );
    if (!body.recurring_calls || !body.transcription) {
      await db.pool.query(
        "update public.call_schedules set enabled=false,next_call_at_utc=null where user_id=$1",
        [user.id],
      );
      await db.pool.query(
        "update public.call_jobs set status='canceled' where user_id=$1 and status in ('queued','claimed')",
        [user.id],
      );
    }
    await db.pool.query(
      "insert into public.audit_logs(user_id,actor_id,action) values($1,$1,'consent.changed')",
      [user.id],
    );
    return { saved: true };
  });
  app.put("/v1/schedule", async (request) => {
    const { user } = identity(request);
    const body = scheduleInput.parse(request.body);
    if (body.enabled) await eligibility(user.id);
    const phone = checked(
      await db.admin
        .from("verified_phone_numbers")
        .select("id")
        .eq("user_id", user.id)
        .eq("id", body.phone_id)
        .single(),
    );
    const next = body.enabled
      ? nextOccurrence(
          body.local_time,
          body.timezone,
          body.weekdays,
        ).toISOString()
      : null;
    checked(
      await db.admin.from("call_schedules").upsert(
        {
          ...body,
          user_id: user.id,
          phone_id: phone.id,
          next_call_at_utc: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ),
    );
    await db.pool.query(
      "update public.call_jobs set status='canceled' where user_id=$1 and status in ('queued','claimed')",
      [user.id],
    );
    checked(
      await db.admin
        .from("profiles")
        .update({ timezone: body.timezone })
        .eq("user_id", user.id),
    );
    return { saved: true, next_call_at_utc: next };
  });
  app.post("/v1/onboarding/complete", async (request) => {
    const { user } = identity(request);
    await eligibility(user.id);
    checked(
      await db.admin
        .from("profiles")
        .update({ onboarding_complete: true })
        .eq("user_id", user.id),
    );
    return { ready: true };
  });
  app.post(
    "/v1/calls/test",
    { config: { rateLimit: { max: 1, timeWindow: "5 minutes" } } },
    async (request) => {
      const { user } = identity(request);
      const permission = await eligibility(user.id);
      if (!permission.calling)
        throw new ApiError(
          409,
          "Calling is not enabled for this environment yet.",
        );
      const client = await db.pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [
          user.id,
        ]);
        const result = await client.query(
          "insert into public.call_jobs(user_id,occurrence_at) select $1,now() where not exists(select 1 from public.call_jobs where user_id=$1 and created_at>now()-interval '5 minutes') returning id",
          [user.id],
        );
        if (!result.rowCount)
          throw new ApiError(
            429,
            "Please wait before requesting another call.",
          );
        await client.query("commit");
        return { queued: true, id: result.rows[0].id };
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  );
  app.post("/v1/calls/:id/stop", async (request) => {
    const { user, client } = identity(request);
    const session = checked(
      await client
        .from("call_sessions")
        .select("call_sid")
        .eq("id", z.uuid().parse((request.params as { id: string }).id))
        .single(),
    );
    const credentials = await loadCredentials(db.pool, key, user.id, "twilio");
    if (credentials.provider !== "twilio" || !session.call_sid)
      throw new ApiError(409, "This call is not active.");
    await providerRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Calls/${session.call_sid}.json`,
      {
        ...twilioHeaders(credentials),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      "POST",
      new URLSearchParams({ Status: "completed" }),
    );
    return { stopped: true };
  });
  app.get("/v1/export", async (request) => {
    const { client, user } = identity(request);
    const tables = [
      "profiles",
      "mood_entries",
      "journal_entries",
      "consent_records",
      "call_preferences",
      "call_schedules",
      "call_sessions",
      "self_care_activities",
      "self_care_goals",
      "challenge_progress",
      "weekly_insights",
    ];
    const rows = await Promise.all(
      tables.map((t) => client.from(t).select("*").limit(10000)),
    );
    return {
      exported_at: new Date().toISOString(),
      retained_transcripts: (
        await db.pool.query(
          "select session_id,turns,expires_at from private.call_transcripts where user_id=$1",
          [user.id],
        )
      ).rows,
      data: Object.fromEntries(rows.map((r, i) => [tables[i], checked(r)])),
    };
  });
  app.delete("/v1/account", async (request) => {
    const { user, authenticatedAt } = identity(request);
    if (authenticatedAt < Date.now() / 1000 - 300)
      throw new ApiError(
        403,
        "Sign in again before permanently deleting your account.",
      );
    checked(
      await db.admin
        .from("profiles")
        .update({ suspended: true })
        .eq("user_id", user.id),
    );
    const { error } = await db.admin.auth.admin.deleteUser(user.id);
    if (error)
      throw new ApiError(
        503,
        "Deletion did not finish. Your account remains paused; please retry.",
      );
    return { deleted: true };
  });
  app.get("/v1/admin", async (request) => {
    await administrator(request);
    const result = await db.pool.query(
      "select status,count(*)::int as count from public.call_sessions group by status",
    );
    const accounts = checked(
      await db.admin
        .from("profiles")
        .select("user_id,display_name,suspended,created_at"),
    );
    const audit = checked(
      await db.admin
        .from("audit_logs")
        .select("id,action,created_at,metadata")
        .order("created_at", { ascending: false })
        .limit(100),
    );
    const platform = checked(
      await db.admin.from("platform_settings").select("key,enabled"),
    );
    const connections = checked(
      await db.admin
        .from("provider_connections")
        .select("provider,status,label"),
    );
    return { accounts, delivery: result.rows, audit, platform, connections };
  });
  app.patch("/v1/admin/accounts/:id", async (request) => {
    const actor = await administrator(request);
    const id = z.uuid().parse((request.params as { id: string }).id);
    const body = z
      .object({ suspended: z.boolean() })
      .strict()
      .parse(request.body);
    checked(await db.admin.from("profiles").update(body).eq("user_id", id));
    if (body.suspended)
      await db.pool.query(
        "update public.call_schedules set enabled=false,next_call_at_utc=null where user_id=$1",
        [id],
      );
    await db.pool.query(
      "insert into public.audit_logs(actor_id,action,metadata) values($1,'admin.account_status',$2)",
      [actor.user.id, { target: id, suspended: body.suspended }],
    );
    return { saved: true };
  });
  app.put("/v1/admin/features", async (request) => {
    await administrator(request);
    const body = z
      .object({ key: z.literal("calling"), enabled: z.boolean() })
      .strict()
      .parse(request.body);
    checked(await db.admin.from("platform_settings").upsert(body));
    return { saved: true };
  });
  app.get("/internal/voice/:id/context", async (request) => {
    const callbackMode =
      (request.query as { callback?: string }).callback === "1";
    const id = z.uuid().parse((request.params as { id: string }).id);
    const session = checked(
      await db.admin.from("call_sessions").select("*").eq("id", id).single(),
    );
    if (
      !callbackMode &&
      ["completed", "busy", "no-answer", "failed", "canceled"].includes(
        session.status,
      )
    )
      throw new ApiError(409, "Call is closed.");
    if (!callbackMode) {
      const permitted = await eligibility(session.user_id);
      if (!permitted.calling) throw new ApiError(409, "Calling is paused.");
    }
    const prefs = checked(
      await db.admin
        .from("call_preferences")
        .select("*")
        .eq("user_id", session.user_id)
        .single(),
    );
    const profile = checked(
      await db.admin
        .from("profiles")
        .select("display_name,timezone")
        .eq("user_id", session.user_id)
        .single(),
    );
    const credentials = await Promise.all(
      (callbackMode ? ["twilio"] : ["twilio", "deepgram", "elevenlabs"]).map(
        (p) => loadCredentials(db.pool, key, session.user_id, p),
      ),
    );
    const job = checked(
      await db.admin
        .from("call_jobs")
        .select("schedule_id")
        .eq("id", session.job_id)
        .single(),
    );
    let phone;
    if (job.schedule_id) {
      const schedule = checked(
        await db.admin
          .from("call_schedules")
          .select("phone_id")
          .eq("id", job.schedule_id)
          .eq("user_id", session.user_id)
          .single(),
      );
      phone = checked(
        await db.admin
          .from("verified_phone_numbers")
          .select("phone_number")
          .eq("id", schedule.phone_id)
          .eq("user_id", session.user_id)
          .single(),
      );
    } else {
      phone = checked(
        await db.admin
          .from("verified_phone_numbers")
          .select("phone_number")
          .eq("user_id", session.user_id)
          .limit(1)
          .single(),
      );
    }
    return {
      session,
      preferences: prefs,
      profile,
      phone: session.destination_number ?? phone.phone_number,
      credentials,
    };
  });
  app.post("/internal/voice/:id/event", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const body = z
      .object({
        call_sid: z.string().regex(/^CA[a-fA-F0-9]{32}$/),
        status: z.enum([
          "initiated",
          "ringing",
          "in-progress",
          "completed",
          "busy",
          "no-answer",
          "failed",
          "canceled",
        ]),
        spoken_consent: z.boolean().optional(),
        error_code: z.enum(["VOICE_CONNECTION_ENDED"]).nullable().optional(),
      })
      .strict()
      .parse(request.body);
    const result = await db.pool.query(
      "update public.call_sessions set call_sid=coalesce(call_sid,$2),status=$3,spoken_consent=coalesce($4,spoken_consent),error_code=coalesce($5,error_code),finished_at=case when $3 in ('completed','busy','no-answer','failed','canceled') then now() else finished_at end where id=$1 and (call_sid is null or call_sid=$2) and (status not in ('completed','busy','no-answer','failed','canceled') or status=$3) and not(status='in-progress' and $3 in ('initiated','ringing')) and not(status='ringing' and $3='initiated') returning id",
      [
        id,
        body.call_sid,
        body.status,
        body.spoken_consent ?? null,
        body.error_code ?? null,
      ],
    );
    if (!result.rowCount)
      throw new ApiError(409, "Session mismatch or closed.");
    return { saved: true };
  });
  app.delete("/v1/transcripts", async (request) => {
    const { user } = identity(request);
    await db.pool.query(
      "delete from private.call_transcripts where user_id=$1",
      [user.id],
    );
    return { deleted: true };
  });
  app.post("/internal/voice/:id/lease", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const body = z
      .object({ owner: z.uuid(), release: z.boolean().default(false) })
      .strict()
      .parse(request.body);
    const result = await db.pool.query(
      "update public.call_sessions set stream_owner=case when $3 then null else $2::uuid end,stream_lease_until=case when $3 then null else now()+interval '30 seconds' end where id=$1 and status='in-progress' and (stream_owner=$2 or stream_owner is null or stream_lease_until<now()) returning id",
      [id, body.owner, body.release],
    );
    if (!result.rowCount)
      throw new ApiError(409, "Voice stream already claimed or closed.");
    return { saved: true };
  });
  app.post("/internal/voice/:id/generation", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const body = z
      .object({ generation: z.number().int().nonnegative() })
      .strict()
      .parse(request.body);
    await db.pool.query(
      "update public.call_sessions set generation=greatest(generation,$2) where id=$1",
      [id, body.generation],
    );
    return { saved: true };
  });
  app.post("/internal/voice/:id/reflection", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id),
      body = reflectionInput.parse(request.body);
    let reflection;
    try {
      reflection = validatedReflection(body);
    } catch {
      throw new ApiError(
        422,
        "The reflection needs review. Unsupported statements were not saved.",
      );
    }
    const client = await db.pool.connect();
    try {
      await client.query("begin");
      const row = (
        await client.query(
          "select s.*,p.timezone,pr.retain_transcript,pr.retention_days from public.call_sessions s join public.profiles p on p.user_id=s.user_id join public.call_preferences pr on pr.user_id=s.user_id where s.id=$1 for update of s",
          [id],
        )
      ).rows[0];
      if (
        !row ||
        !row.spoken_consent ||
        row.generation !== body.generation ||
        row.status !== "in-progress"
      )
        throw new ApiError(
          409,
          "The summary needs current spoken confirmation.",
        );
      const allowed = (
        await client.query(
          "select recurring_calls and transcription and adult as allowed from public.consent_records where user_id=$1 order by created_at desc limit 1",
          [row.user_id],
        )
      ).rows[0];
      if (!allowed?.allowed)
        throw new ApiError(409, "Permission has been withdrawn.");
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: row.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const journal = (
        await client.query(
          "insert into public.journal_entries(user_id,session_id,entry_date,title,reflection,source,topics,statements) values($1,$2,$3,$4,$5,'voice',$6,$7) on conflict(session_id) do nothing returning id",
          [
            row.user_id,
            id,
            date,
            reflection.title,
            reflection.reflection,
            reflection.topics,
            JSON.stringify(body.statements),
          ],
        )
      ).rows[0];
      if (journal) {
        if (reflection.mood_score !== null)
          await client.query(
            "insert into public.mood_entries(user_id,journal_id,entry_date,score,source) values($1,$2,$3,$4,'voice') on conflict(user_id,entry_date) do nothing",
            [row.user_id, journal.id, date, reflection.mood_score],
          );
        for (const statement of body.statements.filter(
          (s) => s.kind === "stress" && s.topic,
        ))
          await client.query(
            "insert into public.stress_topics(user_id,journal_id,topic,evidence) values($1,$2,$3,$4) on conflict(journal_id,topic) do nothing",
            [row.user_id, journal.id, statement.topic, statement.quote],
          );
        if (row.retain_transcript)
          await client.query(
            "insert into private.call_transcripts(session_id,user_id,turns,expires_at) values($1,$2,$3,now()+make_interval(days=>$4)) on conflict(session_id) do nothing",
            [
              id,
              row.user_id,
              JSON.stringify(body.user_turns),
              row.retention_days,
            ],
          );
      }
      await client.query("commit");
      return { saved: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
  app.addHook("onClose", async () => {
    await db.pool.end();
  });
  return app;
}
