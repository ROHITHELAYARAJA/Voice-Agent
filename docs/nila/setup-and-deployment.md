# Nila setup and deployment

The website and services are implemented locally. The supplied Supabase project `ilxcwgogkeedqqjmubfc` (Voice_Agent) is connected and its initial schema was applied on 12 October 2026. All 20 application tables have RLS enabled. Email, Google and GitHub authentication are enabled in Supabase as of 12 October 2026. Google login was reported successful by the owner; the GitHub flow uses the same PKCE callback and still needs an owner login acceptance test. Private Realtime, customer authentication, provider streaming and delivery must still pass the staging acceptance tests. The existing terminal prototype remains at the repository root and keeps its own Excel storage.

## Selected repositories

The existing [Voice-Agent repository](https://github.com/ROHITHELAYARAJA/Voice-Agent) holds the product API, shared worker, Python voice service, migrations and legacy prototype. The [Nila website repository](https://github.com/ROHITHELAYARAJA/Nila) is checked out locally at `C:/Users/erohi/OneDrive/Desktop/Nila-` and receives the Next.js app, shared browser-safe contracts and design skill. The local folder keeps its existing name; its Git remote points to the updated Nila repository. Its Vercel root is `apps/web`. Both repositories keep matching shared contract versions. Source publication does not deploy the application: automatic deployment remains disabled.

## Local website

Run `npm ci`, then `npm run dev`. Open <http://localhost:3000> or <http://localhost:3000/preview>. The preview is explicitly illustrative and cannot place calls or collect provider keys. Copy `apps/web/.env.example` to `apps/web/.env.local` when Supabase and API URLs are available. Use matching frontend origin and API CORS origin; use localhost consistently or 127.0.0.1 consistently.

## Product services

Copy `.env.calmloop.example` to `.env.calmloop`. Keep it separate from the working personal prototype's `.env`. Generate a 32-byte random base64 encryption key and independent random secrets of at least 32 characters for the internal service and voice sessions. Store these only in backend environment settings. Do not put service keys or provider keys in `NEXT_PUBLIC_*` variables.

`npm run start:api` starts the authenticated product API. `npm run start:worker` starts the durable shared scheduler and recap processing. The voice service runs with `uv run uvicorn calmloop_voice.app:app --app-dir services/voice-python --host 127.0.0.1 --port 8000 --no-access-log`. Local phone testing requires an authorized HTTPS tunnel and matching `VOICE_PUBLIC_URL`; regular cloud calls use Render HTTPS/WSS instead. Python reads `.env.calmloop`, not personal provider credentials.

## Supabase staging setup

1. The initial migration `supabase/migrations/202610120001_calmloop.sql` has already been applied to the supplied project. Do not rerun it. Future changes use new migration files; destructive changes require explicit approval.
2. Configure the site URL and exact redirect allowlist for `/auth/callback`, Google and GitHub OAuth callback allowlists, email verification and password-reset delivery. Disable anonymous sign-in. Configure Auth rate limits and a production email sender before launch.
3. Disable public Realtime channels in the project settings. The application subscribes with `private: true`; `realtime.messages` policies authorize only `user:<authenticated UUID>`. Broadcast payloads contain a changed resource name, never journal text.
4. Use the project publishable key in the frontend, and service role plus a TLS-verified PostgreSQL connection in the API and worker. Review and run the migration policy tests against staging with two real customers as well as the local PGlite suite.
5. Register the intended administrator normally, verify email and enroll MFA. Grant `admin` in `account_roles` using a trusted owner database session. Never accept a role from signup metadata. Administrators without verified MFA are sent to authenticator setup.

## Render and Vercel

`render.yaml` proposes three **staging** services with automatic deployment disabled: one API, one voice service, one shared worker. It references environment groups `nila-staging` and `nila-staging-voice`; create them after the workspace is selected. The voice group needs only `API_INTERNAL_URL`, `VOICE_PUBLIC_URL`, `INTERNAL_SERVICE_SECRET`, and `VOICE_SESSION_SECRET`, not the database encryption or Supabase service key. Internal API traffic must use HTTPS with a verified certificate. Database connection TLS must verify its certificate; install the project CA if needed, never disable verification.

Select `apps/web` as the Vercel root, enable access to files outside that directory, and use the root npm lockfile/workspaces. Set frontend public variables independently for staging and production. `apps/web/vercel.json` disables automatic Git deployments until approval. CI builds and tests but does not deploy or migrate a database. Once staging passes and deployment is explicitly approved, configure protected production environments and approval-gated releases. Never copy staging credentials into production.

The Docker daemon is not running on this workstation, so the voice image has not yet been built here. Its source, imports and behavior are tested in Python. The pinned uv image and Render blueprint must be validated during staging deployment.

## Provider setup and acceptance

Each customer connects their own Twilio SID/token and owned caller number, Deepgram key and ElevenLabs key through the authenticated wizard. Secrets are validated on the server and encrypted with AES-256-GCM bound to owner, provider and credential reference. Reconnecting replaces the encrypted reference; disconnecting removes it and pauses scheduling. Twilio destination verification places a separate explicitly requested verification call. A Twilio Trial account is rejected for the production Media Streams path.

The owner's legacy `.env` already contains Twilio, Deepgram, ElevenLabs and ngrok settings. Ngrok is only needed for local telephone testing. The optional developer import command avoids entering existing provider keys into the browser: `npm run import:legacy -- --session-file .local/nila-session.json --owner-id <verified-user-uuid> --confirm`. The temporary ignored session file must contain only the owner's current Nila `access_token`, obtained locally after signing in; never put it in chat or source control, and remove it after import. The command verifies that Supabase's authenticated identity exactly matches the selected owner, submits through the normal authorized API, validates providers and encrypts stored keys. It leaves every existing provider connection unchanged and stops on errors. It does not import ngrok, verify a destination phone, grant consent, enable calling or place a call. Backend configuration must be available before it can run.

## Minimum remaining owner setup

1. Create/select the Render workspace and a Vercel project connected to `ROHITHELAYARAJA/Nila`; provide their names or URLs. Hosting resource creation and deployment still require approval.
2. Put the Supabase service-role key and TLS PostgreSQL connection string in the ignored `.env.calmloop` file or protected Render environment settings. The publishable frontend key cannot authorize the product backend. We will generate the three initial encryption/session/internal-service secrets during backend setup; do not reuse provider keys for these.
3. Once service URLs exist, set `VOICE_PUBLIC_URL`, `API_INTERNAL_URL`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` consistently. Add exact local and deployed `/auth/callback` URLs to the Supabase allowlist for both Google and GitHub. The provider callback remains `https://ilxcwgogkeedqqjmubfc.supabase.co/auth/v1/callback`.
4. Run the read-only `npm run preflight`, then complete provider validation, phone ownership, explicit consent and an authorized staging call. Existing key presence is not proof that the current account supports production streaming.

Jessica is selected by her voice ID when available in the connected ElevenLabs account. Deepgram uses the supported managed `gpt-4.1-mini` without a separate OpenAI key, Flux for supported low-latency languages and Nova-3 for manually selected Tamil. ElevenLabs Turbo 2.5 uses the native Voice Agent external TTS endpoint. Voice settings still need a live provider test with the customer's entitlements; a successful key check alone does not establish audio compatibility.

Calling remains disabled in `platform_settings` until the authorized administrator enables it for a staging test. Complete two independent customers' onboarding and schedules. Authorize a test call, verify both directions of audio, Jessica, interruption, Tamil where selected, consent, review and journal saving. Revoke consent during a call and confirm it ends. Verify private updates in two browser sessions and confirm no cross-account events. Simulate an unanswered call and a timeout after Twilio accepts a request; uncertain requests must never be blindly redialed.

## Costs and privacy gates

An always-running Render background worker and production phone service need a supported paid plan. Deepgram credits apply only to eligible Deepgram usage; Twilio and ElevenLabs have their own charges and entitlements. This architecture cannot promise fully free, reliable cloud telephone operation. Confirm the hosting budget and provider limits before creating resources.

Audio recording is deliberately unavailable in this release. A future recording feature needs a separate consent flow, provider retention and deletion implementation, and regional review. Transcript retention is optional and off by default; temporary in-memory turns are cleared when the call ends. Retained transcripts expire through the worker, can be exported and can be deleted independently. Journals remain until the user deletes them or the account. Audit records expire after 90 days and contain no conversation text or raw keys.

Review the regional privacy, telemarketing, international calling, age eligibility and emergency-support language in `launch-gates.md`. Add the owner's legal contact, processor agreements, retention notice and incident response process before publishing the public product.
