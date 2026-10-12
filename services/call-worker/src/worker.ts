import type { Pool } from "pg";
import type { Environment } from "../../../apps/api/src/config.ts";
import { loadCredentials } from "../../../apps/api/src/credentials.ts";
import { twilioHeaders } from "../../../apps/api/src/providers.ts";
import { signSession } from "../../../apps/api/src/security.ts";
import { nextOccurrence } from "./scheduling.ts";

export type Job = {
  id: string;
  user_id: string;
  schedule_id: string | null;
  occurrence_at: string;
  claim_token: string;
  attempts: number;
};
export async function materializeSchedules(pool: Pool) {
  await pool.query(
    "insert into public.call_jobs(user_id,schedule_id,occurrence_at,next_attempt_at) select user_id,id,next_call_at_utc,next_call_at_utc from public.call_schedules where enabled and next_call_at_utc<=now() on conflict(schedule_id,occurrence_at) do nothing",
  );
}
export async function processJob(
  pool: Pool,
  env: Environment,
  job: Job,
  fetcher = fetch,
) {
  const client = await pool.connect();
  let sessionId: string | undefined;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      job.user_id,
    ]);
    const eligible = await client.query(
      `select p.display_name,n.phone_number,c.capabilities,co.recurring_calls,co.transcription,
      s.enabled,s.local_time,s.timezone,s.weekdays,s.id schedule_id
      from public.profiles p
      join lateral (select recurring_calls,transcription,adult from public.consent_records where user_id=p.user_id order by created_at desc limit 1) co on co.adult
      join public.provider_connections c on c.user_id=p.user_id and c.provider='twilio' and c.status='connected'
      left join public.call_schedules s on s.user_id=p.user_id and s.id=$2
      join public.verified_phone_numbers n on n.user_id=p.user_id and (s.phone_id=n.id or $2::uuid is null)
      where p.user_id=$1 and not p.suspended and p.onboarding_complete
      and exists(select 1 from public.platform_settings where key='calling' and enabled)
      and (select count(*) from public.provider_connections where user_id=p.user_id and status='connected')=3
      and not exists(select 1 from public.call_sessions where user_id=p.user_id and status in ('sending','uncertain','initiated','ringing','in-progress'))
      and (select count(*) from public.call_sessions where user_id=p.user_id and created_at>now()-interval '24 hours')<10
      order by n.created_at limit 1`,
      [job.user_id, job.schedule_id],
    );
    const row = eligible.rows[0];
    if (
      !row ||
      !row.recurring_calls ||
      !row.transcription ||
      !row.capabilities.media_streams ||
      (job.schedule_id && !row.enabled)
    ) {
      await client.query(
        "update public.call_jobs set status='canceled',last_error_code='ELIGIBILITY_CHANGED',lease_until=null where id=$1 and claim_token=$2",
        [job.id, job.claim_token],
      );
      await client.query("commit");
      return;
    }
    const claimed = await client.query(
      "update public.call_jobs set status='sending' where id=$1 and claim_token=$2 and status='claimed' and lease_until>now() returning id",
      [job.id, job.claim_token],
    );
    if (!claimed.rowCount) {
      await client.query("rollback");
      return;
    }
    const created = await client.query(
      "insert into public.call_sessions(user_id,job_id,status,destination_number) values($1,$2,'sending',$3) returning id",
      [job.user_id, job.id, row.phone_number],
    );
    sessionId = created.rows[0].id;
    if (job.schedule_id) {
      const next = nextOccurrence(
        row.local_time,
        row.timezone,
        row.weekdays,
        new Date(Math.max(Date.now(), new Date(job.occurrence_at).getTime())),
      );
      await client.query(
        "update public.call_schedules set next_call_at_utc=$2 where id=$1",
        [job.schedule_id, next],
      );
    }
    await client.query("commit");
    const credentials = await loadCredentials(
      pool,
      Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, "base64"),
      job.user_id,
      "twilio",
    );
    if (credentials.provider !== "twilio") throw new Error("PROVIDER_MISMATCH");
    await pool.query(
      "update public.call_sessions set caller_number=$2 where id=$1",
      [sessionId, credentials.caller_number],
    );
    const current = await pool.query(
      "select not p.suspended and c.recurring_calls and c.transcription as permitted from public.profiles p join lateral(select recurring_calls,transcription from public.consent_records where user_id=p.user_id order by created_at desc limit 1)c on true where p.user_id=$1",
      [job.user_id],
    );
    if (!current.rows[0]?.permitted) {
      await pool.query(
        "update public.call_jobs set status='canceled',lease_until=null where id=$1",
        [job.id],
      );
      await pool.query(
        "update public.call_sessions set status='canceled',finished_at=now() where id=$1",
        [sessionId],
      );
      return;
    }
    const token = signSession(sessionId!, env.VOICE_SESSION_SECRET),
      base = env.VOICE_PUBLIC_URL.replace(/\/$/, "");
    const body = new URLSearchParams({
      To: row.phone_number,
      From: credentials.caller_number,
      Url: `${base}/twiml/${sessionId}/${token}`,
      Method: "POST",
      StatusCallback: `${base}/status/${sessionId}/${token}`,
      StatusCallbackMethod: "POST",
      Timeout: "30",
      TimeLimit: "600",
    });
    for (const event of ["initiated", "ringing", "answered", "completed"])
      body.append("StatusCallbackEvent", event);
    const response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Calls.json`,
      {
        method: "POST",
        headers: {
          ...twilioHeaders(credentials),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      if (response.status >= 500)
        throw new Error("UNCERTAIN_PROVIDER_RESPONSE");
      await pool.query(
        "update public.call_jobs set status='failed',last_error_code=$2,lease_until=null where id=$1",
        [job.id, `TWILIO_HTTP_${response.status}`],
      );
      await pool.query(
        "update public.call_sessions set status='failed',finished_at=now() where id=$1 and call_sid is null",
        [sessionId],
      );
      return;
    }
    const value = (await response.json()) as { sid?: string; status?: string };
    if (!value.sid?.match(/^CA[a-f0-9]{32}$/i))
      throw new Error("UNCERTAIN_CALL_ID");
    await pool.query(
      "update public.call_sessions set call_sid=coalesce(call_sid,$2),status=case when status='sending' then 'initiated' else status end where id=$1 and (call_sid is null or call_sid=$2)",
      [sessionId, value.sid],
    );
    await pool.query(
      "update public.call_jobs set status='sent',lease_until=null where id=$1",
      [job.id],
    );
  } catch {
    await client.query("rollback").catch(() => undefined);
    if (sessionId) {
      await pool.query(
        "update public.call_jobs set status='uncertain',lease_until=null,last_error_code='RECONCILIATION_REQUIRED' where id=$1 and status='sending'",
        [job.id],
      );
      await pool.query(
        "update public.call_sessions set status='uncertain' where id=$1 and status='sending'",
        [sessionId],
      );
    } else
      await pool.query(
        "update public.call_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,next_attempt_at=now()+interval '2 minutes',lease_until=null,last_error_code='PRE_DIAL_FAILURE' where id=$1 and claim_token=$2 and status='claimed'",
        [job.id, job.claim_token],
      );
  } finally {
    client.release();
  }
}
export async function reconcile(pool: Pool, env: Environment) {
  await pool.query(
    "update public.call_sessions s set status='uncertain' from public.call_jobs j where s.job_id=j.id and j.status='uncertain' and s.status='sending'",
  );
  const rows = await pool.query(
    "select s.id,s.user_id,s.call_sid,s.job_id from public.call_sessions s where s.status in ('uncertain','initiated','ringing','in-progress') and s.created_at<now()-interval '2 minutes' limit 50",
  );
  for (const row of rows.rows) {
    if (!row.call_sid) continue;
    try {
      const credentials = await loadCredentials(
        pool,
        Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, "base64"),
        row.user_id,
        "twilio",
      );
      if (credentials.provider !== "twilio") continue;
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Calls/${row.call_sid}.json`,
        {
          headers: twilioHeaders(credentials),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) continue;
      const data = (await response.json()) as { status: string };
      if (
        ![
          "completed",
          "busy",
          "no-answer",
          "failed",
          "canceled",
          "in-progress",
          "ringing",
          "queued",
        ].includes(data.status)
      )
        continue;
      await pool.query(
        "update public.call_sessions set status=$2,finished_at=case when $2 in ('completed','busy','no-answer','failed','canceled') then now() else finished_at end where id=$1",
        [row.id, data.status],
      );
      await pool.query(
        "update public.call_jobs set status='sent',lease_until=null where id=$1 and status='uncertain'",
        [row.job_id],
      );
    } catch {
      continue;
    }
  }
  await pool.query(
    "delete from private.call_transcripts where expires_at<now()",
  );
  await pool.query(
    "delete from public.audit_logs where created_at<now()-interval '90 days'",
  );
}
