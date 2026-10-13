# Fix Google login and finish the first check-in

## Verified on 13 October 2026

The website at https://nilavoiceai.vercel.app/auth returns HTTP 200. The screenshot's address, https://nilaai-rohith-es-projects.vercel.app, returns Vercel DEPLOYMENT_NOT_FOUND. The deployed OAuth button requests the current website's /auth/callback page; the callback route exists and handles missing codes with a sign-in error. A completed Google login has not been verified during this check.

The deployed website still references the obsolete API address https://nila-api-stage.onrender.com. The working API is https://nila-api-staging.onrender.com, and it allows requests from the current website origin. All four Supabase Cron jobs are active. Platform calling is disabled.

After the owner reported updating Supabase and redeploying Vercel, the production website was checked again: its JavaScript references the correct API address ending in `staging`; the obsolete API and Vercel hostnames are absent from the loaded sign-in bundles. The sign-in page returns HTTP 200, the callback route handles a missing code with a sign-in error redirect, and API health returns HTTP 200 with the scheduler version marker. All four Cron jobs remain active and platform calling remains disabled. A fresh owner Google login is still needed to verify the complete OAuth round trip; Supabase URL settings were not inspected directly.

## 1. Correct Supabase's login destination

Open https://supabase.com/dashboard/project/ilxcwgogkeedqqjmubfc/auth/url-configuration.

Set Site URL to:

```text
https://nilavoiceai.vercel.app
```

Add these exact Redirect URLs for social sign-in, signup confirmation and password recovery:

```text
https://nilavoiceai.vercel.app/auth/callback
https://nilavoiceai.vercel.app/auth/callback?next=/dashboard
https://nilavoiceai.vercel.app/auth/callback?next=/onboarding
https://nilavoiceai.vercel.app/auth/callback?next=/auth?mode=update
```

Save the settings. Retire the obsolete Vercel hostname from this project's Site URL and redirect list. Keep any legitimate local development entries. No new key or Google client secret is needed for this correction. If checking Google Cloud's OAuth settings, its authorized redirect URI remains https://ilxcwgogkeedqqjmubfc.supabase.co/auth/v1/callback.

Supabase falls back to Site URL when a requested redirect is not allowed. The screenshot is consistent with an obsolete Site URL or redirect configuration; dashboard settings were not directly accessible during verification. Documentation: https://supabase.com/docs/guides/auth/redirect-urls.

## 2. Correct the deployed website's API connection

Open the Nila project in Vercel, then Settings → Environment Variables. Set these values for Production:

```text
NEXT_PUBLIC_SITE_URL=https://nilavoiceai.vercel.app
NEXT_PUBLIC_API_URL=https://nila-api-staging.onrender.com
```

Keep the existing public Supabase URL and publishable key. Save the changes, then open Deployments and redeploy the latest production deployment. Public Next.js environment values are included during the build, so changing the settings alone does not update an existing deployment.

## 3. Start a fresh login

Open https://nilavoiceai.vercel.app/auth and select Continue with Google again in the same browser. Do not reuse the previous failed callback URL or its code. Successful sign-in should return to the current website's dashboard.

## 4. Complete account setup before a real call

After login works, complete the provider setup for Twilio, Deepgram and ElevenLabs; verify the destination phone; choose language and voice; and provide explicit call/transcription consent. Recording is optional and remains off by default. Set the local call time and time zone.

The platform calling switch remains disabled. An authorized administrator must enroll MFA and enable calling through the administrator controls before scheduled calls or Test Call Now can run. First verify one explicitly authorized test call while the owner is available to answer, then confirm its private journal and mood results. Automatic scheduling is active, but enabling it does not replace provider setup or consent.
