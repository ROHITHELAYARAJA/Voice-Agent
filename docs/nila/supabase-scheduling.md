# Supabase scheduling

The paid Render worker is replaced by Supabase Cron. Keep the Render Node API and Python voice Web Services. The local worker remains available for development, but do not run it alongside Cron.

Supabase Cron invokes short authenticated API tasks through `pg_net`. An Edge Function is unnecessary: the API already owns credential decryption, tenant validation, scheduling, and provider requests. No new provider key or hosting account is required. Vault holds the API origin and internal authentication secret. No secrets appear in migration files or Cron commands.

| Job            | Frequency           | Work                                                                                                  |
| -------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| nila-calls     | Every minute        | Materialize due occurrences and atomically claim up to two jobs                                       |
| nila-reconcile | Every five minutes  | Check up to three uncertain or active call statuses                                                   |
| nila-recaps    | Hourly at minute 5  | Update rolling weekly summaries for up to ten eligible accounts                                       |
| nila-retention | Hourly at minute 17 | Remove expired retained transcripts, 90-day audit events, and this scheduler's seven-day Cron history |

Each API task takes a database advisory lock to prevent overlapping executions across API instances. Database queries have timeouts and provider requests have bounded timeouts. Failed or uncertain Twilio creations retain the existing reconciliation behavior and are never blindly redialed. Consent, suspension, verified destination, provider entitlement, and platform calling checks remain mandatory. Installing Cron does not enable calls or complete onboarding. Journals are not removed by retention maintenance.

The initial capacity is two attempted calls per minute, with minute-level schedule precision. This is suitable for the initial student prototype, not a promise of unlimited customer capacity. Missed or delayed invocations recover from the durable database queue.

## Setup

Apply `supabase/migrations/20261012172645_supabase_cron_scheduler.sql` once. It installs `pg_cron`, `pg_net`, the private dispatch and cleanup functions, and four initially paused jobs. It does not delete application records during installation.

Redeploy `nila-api-stage` from the latest `codex/nila-platform` commit. Its `/health` response must include `scheduler: supabase-cron-v1`. The API must use the same internal secret as the local prepared environment file.

Run `npm run configure:scheduler` from the repository root. It reads the ignored Render API and voice environment files, configures Vault using parameterized SQL over a certificate-verified database connection, and makes an authenticated non-dialing API verification request. Only a successful scheduler verification enables the four Cron jobs. It prints no credentials. If verification fails, the jobs remain paused; repair the API deployment and rerun it.

The bundled public Supabase CA certificate allows production database certificate validation; TLS verification stays enabled. Certificate source: `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. SHA-256 certificate fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Check jobs in Supabase **Integrations → Cron**. Cron success means an HTTP request was queued; check API task logs and `net._http_response` to confirm HTTP completion. The API logs only task names and completion status. Check schedules and call sessions before authorizing a real call.

Free Render Web Services can sleep and have shared monthly instance-hour limits. Cron does not remove those limits or guarantee precise call timing. Supabase free-plan limits also apply; phone and AI usage retain provider charges.

## Removing the Render worker

The repository's Render configuration now defines only the API and voice services. If a worker was never deployed, cancel its creation form. If one already exists, suspend `nila-call-worker-staging` and review Render billing; deleting it requires a separate explicit service deletion instruction. Changing the repository alone does not remove an existing Render service. Do not remove the API or voice services.
