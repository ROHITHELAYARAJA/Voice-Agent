# Nila verification, 12 October 2026

## Verified implementation

The Voice-Agent backend checkout and the separate Nila website checkout both produce successful Next.js production builds. Strict TypeScript passes. The website checkout contains only frontend dependencies and shared browser-safe packages, with 104 audited packages and no reported npm vulnerabilities.

25 TypeScript tests pass across credential encryption, session capabilities, API authorization, provider validation, independent schedules, uncertain call creation and embedded PostgreSQL tenant policies. 73 Python tests pass, including the preserved prototype and new tenant-bound voice adapter. The existing Starlette test-client deprecation warning remains. A first Python rerun encountered a Windows temporary-directory cleanup permission error after its assertions; the subsequent run in a dedicated workspace temporary directory finished successfully.

Six production browser tests pass in the separate website checkout: desktop and mobile landing/FAQ/signup navigation, robots policy, mood interaction, journal editing, challenge completion, dark appearance, mobile navigation, unauthenticated access gates and mocked invalid-login feedback. Tested landing and dashboard states have no axe WCAG 2 A/AA or 2.1 AA violations. This is not an audit of every authenticated onboarding, MFA or account-deletion state.

Production viewport screenshots were visually inspected in light and dark modes. The decorative illustration is an original generated image at `apps/web/public/nila-art.png`, used in project mode. Manrope font files include their SIL Open Font License and are locally preloaded through Next.js.

## Supabase evidence

The owner-selected Voice_Agent project, `ilxcwgogkeedqqjmubfc`, was initially empty. The `nila_initial_tenant_schema` migration applied successfully. All 18 public and two private application tables have RLS enabled. Anonymous profile reads return HTTP 401 with no visible rows. Auth settings report email enabled and Google disabled.

A live SQL transaction created two temporary Auth identities, verified isolated profile and mood reads under the authenticated role, denied cross-owner mood insertion, denied administrator role assignment and denied encrypted-credential reads. The transaction was rolled back, leaving no test identities or mood entries. This tests PostgreSQL policy behavior; it does not certify signed browser sessions or provider accounts.

The Supabase security advisor returned no warning or error. Its two informational notices describe RLS without customer policies on `private.encrypted_credentials` and `private.call_transcripts`, which deliberately have no customer grants. See the [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Outstanding external checks

The Google OAuth client ID and provider setup, backend service key and database connection, Render workspace, Vercel project and deployment approval remain pending. Secrets must be entered directly in backend/provider settings. Replace the Google OAuth secret shared in chat before configuring the provider. Use `https://ilxcwgogkeedqqjmubfc.supabase.co/auth/v1/callback` as the Google authorized redirect URI and allow the website's exact `/auth/callback` URLs in Supabase.

No application deployment, recording, new live telephone call or customer provider-key replacement was performed. Native Deepgram/Jessica settings and managed-model configuration are tested as code; live audio, Tamil quality, private Realtime delivery, email delivery, MFA, two real provider accounts and laptop-off scheduling still require staging acceptance. Docker image compilation is pending a running Docker daemon or an approved host.

## Follow-up verification, 12 October 2026

The owner reported a successful Google login and enabled GitHub in Supabase. The live Auth settings now report email, Google and GitHub enabled. The frontend includes both provider buttons with PKCE and the same approved callback route. Eight production browser tests pass, including intercepted Google/GitHub redirects, provider selection, callback origin and adult signup confirmation. They do not constitute a real GitHub account login.

Strict TypeScript and both frontend production builds pass after the authentication and dashboard changes. 31 TypeScript and UI tests pass, including an unavailable backend, one recovery message, preservation of cached information during refresh, and guarded legacy provider import. The initial HTML-render assertion was corrected to account for HTML escaping. No Python source changed during this follow-up; the preceding 73-test Python result applies to the preserved voice implementation.

Realtime failures now have their own state and cannot overwrite the API error. Subscription starts after private data is loaded, includes the session token and clears the warning on successful reconnection. Initial service failures show one actionable recovery card; successful cached data stays visible during refresh. Full live dashboard data and Realtime still require the deferred backend credentials.

The original `.env` contains all requested provider keys. A prepared owner-bound import command validates the authenticated identity, skips existing connections and uses the normal API validation/encryption path. It has not imported keys or placed a call. Source scanning in both checkouts found no configured private provider/backend secrets or Google client secrets. Secret and session files remain ignored. The final publication result is reported with verified repository links in the task handoff.

## Performance measurements

Local Lighthouse reports and screenshots are stored in the Voice-Agent checkout's ignored `outputs` directory. These are synthetic local measurements, not field Core Web Vitals or a promise about deployed performance.

| Production landing page | Performance | Accessibility | Best practices | SEO | LCP   | Total blocking time | Layout shift |
| ----------------------- | ----------- | ------------- | -------------- | --- | ----- | ------------------- | ------------ |
| Desktop                 | 99          | 100           | 100            | 100 | 0.7 s | 90 ms               | 0            |
| Simulated mobile        | 78          | 100           | 100            | 100 | 3.3 s | 550 ms              | 0            |

The final reports are `lighthouse-nila-desktop-final.json` and `lighthouse-nila-mobile-idle.json`. Mobile performance remains a release gate: reduce initial JavaScript execution and verify the deployed page on representative devices before public launch. Earlier measurements varied under concurrent local workloads; the mobile result above was collected after stopping the development server.
