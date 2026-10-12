# Verification and launch gates

Local source implementation is ready for review. A mock passing does not certify an external integration. Cloud verification remains pending.

| Gate             | Evidence required                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Build            | Strict TypeScript, frontend production build and Python tests                                    |
| Tenant isolation | Two users, JWT/RLS reads and writes, private channels, owner-bound credentials                   |
| Queue            | Duplicate claim, DST gap/overlap, suspended user, withdrawn consent, crash reconciliation        |
| Auth             | Google, verified email, reset, MFA enrollment/challenge and administrator aal2                   |
| BYOK             | Validation, replacement, masking, revocation and two independent provider accounts               |
| Phone            | Explicitly authorized answered end-to-end Media Streams call, audio, interruption, saved journal |
| Privacy          | No recording default, transcript retention, export and deletion                                  |
| Frontend         | Desktop/mobile light/dark, keyboard, errors, loading, empty states and reduced motion            |
| Performance      | Improve simulated mobile performance beyond the current 78; verify deployed device measurements  |
| Cloud            | Approved staging deploy; worker executes while laptop is off                                     |

Cloud projects and secrets will be provided at the end by the owner. No migration is applied to a remote database without the named target. Production deployment and destructive migrations require explicit approval.

## Regional review before public launch

Determine the initial countries, adults-only eligibility, data controller, subprocessors, transfer arrangements, retention periods, deletion process, consent wording and customer provider terms. Review India's DPDP Act and staged DPDP Rules commencement with qualified counsel; do not treat all provisions as already commenced. Review phone calling, unwanted commercial communications, automated/AI disclosure and recording consent for each destination. Twilio's India guidelines require international caller numbers for outbound calls to India. EU/UK launch requires GDPR/UK GDPR review; US launch requires state privacy, automated-call and recording-consent review. These are launch gates, not a claim of legal compliance.

Official references checked 12 October 2026:

- https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa
- https://www.twilio.com/en-us/guidelines/in/voice
- https://www.twilio.com/docs/usage/trials/try-out-voice
- https://developers.deepgram.com/docs/voice-agent-stt-models
- https://developers.deepgram.com/docs/voice-agent-llm-models
- https://developers.deepgram.com/docs/voice-agent-tts-models
- https://supabase.com/docs/guides/realtime/authorization
- https://render.com/docs/background-workers

## Local verification, 12 October 2026

- Strict TypeScript and the Next.js production build pass.
- 25 TypeScript backend tests pass, including authentication, enrolled MFA, customer ownership, masked provider validation, encryption binding, independent customer schedules, no blind redial and DST behavior.
- The schema executes in embedded PostgreSQL (PGlite). Two-user RLS, credential references, protected roles, journal attribution, private channel policy and queue claims pass. Realtime fixtures test SQL authorization; they do not simulate the live Supabase network.
- 73 Python tests pass after the two existing Tamil regressions were repaired. The new tenant voice tests check signed TwiML, the correct caller/destination, 8 kHz mu-law settings, managed model configuration, Tamil Nova-3, native ElevenLabs, interruption order and review approval.
- Desktop/mobile browser tests check marketing, preview moods, journal editing, challenge actions, dark mode, mobile navigation, missing-service errors and no horizontal overflow. Automated axe checks cover tested landing/dashboard pages in light/dark. They do not certify every onboarding, MFA or authenticated state.
- The supplied Supabase project has the initial schema applied, all 20 application tables have RLS enabled, and anonymous profile access is denied. The security advisor reports no warning or error: two informational notices describe the intentionally inaccessible credential and transcript tables without customer policies.
- Live Supabase SQL checks with two temporary identities verify isolated profile/mood reads and denied cross-owner writes, role escalation and credential access. The entire fixture transaction was rolled back. These checks do not certify real login sessions or browser Realtime delivery.
- Google/email delivery, live MFA, two real BYOK accounts, live provider audio, cloud scheduling, private Realtime delivery and laptop-off execution are unverified. No new real call was placed in this build session.
- Production source configuration is prepared; no application deployment has been executed. Docker image build awaits a running Docker daemon or the approved staging host.

Initial local checks used the development browser server. Final production browser and performance results are recorded separately in `verification-results.md`.
