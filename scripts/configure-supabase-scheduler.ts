import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { database } from "../apps/api/src/db.ts";
import { environment } from "../apps/api/src/config.ts";

const settings = parseEnv(
  readFileSync(".local/deployment/render-api.env", "utf8"),
);
const voice = parseEnv(
  readFileSync(".local/deployment/render-voice.env", "utf8"),
);
const env = environment.parse(settings);
const api = new URL(voice.API_INTERNAL_URL!);
if (
  api.protocol !== "https:" ||
  api.username ||
  api.password ||
  api.pathname !== "/"
)
  throw new Error("Set API_INTERNAL_URL to the API HTTPS origin");
const { pool } = database(env);
try {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [name, value] of [
      ["nila_scheduler_api_url", api.origin],
      ["nila_scheduler_service_secret", env.INTERNAL_SERVICE_SECRET],
    ]) {
      const existing = await client.query<{ id: string }>(
        "select id from vault.secrets where name=$1",
        [name],
      );
      if (existing.rows[0])
        await client.query("select vault.update_secret($1::uuid,$2,$3)", [
          existing.rows[0].id,
          value,
          name,
        ]);
      else
        await client.query("select vault.create_secret($1,$2)", [value, name]);
    }
    await client.query("commit");
  } catch {
    await client.query("rollback");
    throw new Error("SCHEDULER_VAULT_CONFIGURATION_FAILED");
  } finally {
    client.release();
  }

  const response = await fetch(`${api.origin}/internal/scheduler/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.INTERNAL_SERVICE_SECRET}`,
    },
    body: JSON.stringify({ dry_run: true }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  }).catch(() => undefined);
  const value = response?.ok ? await response.json() : undefined;
  if (
    value?.scheduler !== "supabase-cron-v1" ||
    value.status !== "configured"
  ) {
    console.log(
      "Vault configured. Cron jobs remain paused until the API's scheduler endpoint passes verification. Redeploy the API, then rerun this command.",
    );
  } else {
    await pool.query(
      "select cron.alter_job(jobid,active:=true) from cron.job where jobname in ('nila-calls','nila-reconcile','nila-recaps','nila-retention')",
    );
    console.log(
      "All four Supabase Cron jobs are enabled. User consent and platform calling controls still apply.",
    );
  }
} finally {
  await pool.end();
}
