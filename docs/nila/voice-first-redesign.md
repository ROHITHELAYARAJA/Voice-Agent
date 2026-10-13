# Nila: a nightly conversation, a visual day

## Skills evaluated

| Skill | Decision |
| --- | --- |
| frontend-ui-engineering | Primary: responsive product UI, states, accessibility, reference-led design |
| 21st-ui-build | Primary: reference search, installed primitives, design contract |
| 21st-cli-use | Catalog access; authenticated search unavailable locally |
| 21st-ui-review | Deterministic review plus real browser verification |
| 21st-ui-explore | Not needed: user already chose a visual, single-dashboard direction |
| 21st-ai | Not used: generation access not verified |
| 21st-design-sync | Not needed: no publishing of design libraries |
| 21st-registry | Not needed: no public component publishing |
| design-taste-frontend | Landing-page guidance only; explicitly excludes dashboards |
| design-taste-frontend-v1 | Supporting visual guidance; avoid competing primary systems |
| brandkit | Brand consistency; existing Nila identity preserved |
| high-end-visual-design | Optional visual refinement |
| minimalist-ui | Low text density and restrained navigation |
| image-to-code | Not used: no pixel-for-pixel copying |
| imagegen-frontend-web | Not needed: data visuals do not need generated artwork |
| browser-testing-with-devtools | Runtime verification; Playwright already installed |
| web-design-guidelines | Applied: refreshed Vercel guidance, keyboard focus, safe overflow and reduced motion |
| scroll-craft | Evaluated: full cinematic scroll scenes would distract from the requested data dashboard |
| stitch-design-taste | Evaluated: supporting responsive hierarchy; no separate generated design system |
| industrial-brutalist-ui | Evaluated: tactical aesthetics conflict with the requested welcoming mood design |

## Design contract

One dashboard explains the latest approved phone conversation and its history. No microphone, web conversation, wellness input form, task list, or completion button. Settings, consent, export and deletion remain accessible. Emoji visuals have text equivalents for assistive technology. Clinical scores, diagnoses and invented missing values are prohibited.

Cream canvas, ink typography, lavender mood island, sage activity, peach reflection and blue hydration. Manrope remains self-hosted. Desktop uses a narrow icon rail, a wide mood timeline and an asymmetric snapshot grid. Mobile uses a compact header and a single reading flow, with range controls that remain usable at 320px. Reduced motion disables nonessential animation. Profile opens a keyboard-accessible Radix dialog with name, timezone, phone and provider status, settings and nightly schedule.

References: [Nixtio Mood Tracker](https://dribbble.com/shots/25101266-Mood-Tracker-App-UI), [Sereno](https://dribbble.com/shots/27280313-Mood-Tracker-Mobile-App-Design-Sereno), [21st Origin UI tabs](https://21st.dev/originui/tabs), [21st dialog collection](https://21st.dev/community/components/explore/shadcn-sidebar). Structure and palette inspire an original Nila interface; artwork is not copied. The 21st CLI initialized project context but catalog search returned Not signed in. No hosted generation or component code retrieval is claimed.

## Stack and migration

Additional reference requested during implementation: [SM Rubel mood tracker](https://dribbble.com/shots/27545870-Mental-Health-Mood-Tracker-Mobile-App-Wellness-UI-Design). Inspected in the browser: lilac surfaces, an editorial serif heading, expressive mood illustrations and a clear summary hierarchy. Adapt these patterns into a horizontal web timeline and original asymmetric dashboard; omit mobile mood-input prompts, saturated neon and copied artwork.

Keep Next.js 16.4, React 19, TypeScript, Tailwind 4, Radix, Node product API, Python voice service, Supabase Auth/Postgres/private Realtime and Supabase Cron. No chart framework is needed for the small visualizations. Existing signed call associations and tenant isolation remain authoritative.

Add validated wellness observations to approved voice journals. Each observation carries a topic, value, unit where needed and an exact user quote. Numbers must be explicitly associated with their topic and unit; unresolved values remain absent. Long-term memory needs an additional exact permission quote. The API resolves user_id from the call session, writes the journal and wellness observations in one transaction and broadcasts the existing owner-private changed event. The browser refetches its authenticated dashboard. Numeric bars and diagrams render from those values.

Rotate a small topic selection by the user's local date. Ask 6–10 topics at most, one question per turn, fewer when the user stops or skips. The 32-feature catalog defines all supported topics; operational features such as calls, privacy and reports derive from their authoritative records. Reminder times are reflected in the dashboard and may be mentioned on future nightly calls; this release does not send additional reminder calls or medication advice.

Old feature links resolve to the unified dashboard. Historic records are retained. Existing manual data is not relabeled as voice data. New wellness capture uses only the approved voice ingestion path. Provider setup and privacy settings still accept configuration, not daily wellness input.

Production rollout requires the additive migration, both service builds and the website build, followed by an authorized real telephone check-in. Trial calling limitations still apply; changing the UI cannot enable Twilio Media Streams or guarantee indefinite free calls. No real call is authorized by this redesign request.

## Validation and delivery

The 32 topics are represented in the visual dashboard and approved structured capture contract. This is not 32 independently deployed integrations. General health information is non-clinical; medication reminders remain user requests, and support cannot dispatch emergency responders. Provider limits, supported languages and trial restrictions remain enforced.

Automated verification covers tenant-bound JSON ingestion, stale speech generations, exact supporting quotes, numeric topic/unit matching, separate memory permission, Postgres RLS, owner-private Realtime subscription, keyboard focus, desktop/mobile layouts and light/dark accessibility. Preview values are explicitly illustrative; real accounts have no seeded wellness data. Production migration, deployed Realtime delivery and a new real telephone check-in are pending approval and cannot be claimed as verified by these tests.

Deploy in this order after approval: apply `202610130001_voice_wellness.sql` to the chosen Supabase environment, release the API and voice services, then release the website. Keep the prior voice deployment available for rollback. Test with an explicitly authorized user before enabling nightly schedules. The additive migration retains historic data but intentionally revokes customer-side wellness creation and editing; deletion and configuration remain available.
