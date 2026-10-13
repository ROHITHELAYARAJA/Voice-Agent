# Nila design system and page plan

Original direction: a calm, expressive adult wellness product. The supplied image is an architecture reference. No Behance or Dribbble artwork was supplied, so their specific layouts have not been inspected or copied.

## Foundation

Lavender is the action color; sage, peach and cream distinguish supportive surfaces. Primary ink #292638, secondary ink #666075, cream canvas #FAF8F4, lavender surface #EEE9F8, action #655183, sage surface #E7EDE5, peach surface #F7E6DD. Dark mode uses #201E28 canvas, #2B2836 surfaces and #D6C5F1 actions. Colors are semantic CSS tokens, not scattered literals.

Typography: locally bundled Manrope for interface and display, with optical size and weight hierarchy. Headlines have short line lengths. Body copy is plain, welcoming and non-clinical. No invented testimonials, usage statistics or product outcomes.

Radius: 28px feature panels, 20px cards, 12px controls, pill buttons. Spacing: 4, 8, 12, 16, 24, 32, 48, 64 and 96px. Maximum marketing width 1240px; app workspace 1180px. Motion is 160-240ms for state feedback; reduced motion disables entrance and breathing animation. Focus rings, labels, touch targets and text alternatives are mandatory.

Use Radix accessible primitives with owned Tailwind components and Phosphor icons. Charts use actual reported data with gaps for missing days and accessible text equivalents. Generated decorative illustration is separate from product data. Marketing preview data is explicitly illustrative; customer dashboards start empty.

## Website

Navigation: wordmark, Experience, Self-care, Privacy, Sign in, Get started. Mobile has a compact menu with the same destinations.

Hero: asymmetric editorial composition, requested headline “Your feelings deserve a little space”, brief supportive copy and signup CTA. A real interactive voice preview demonstrates a sample conversation and never dials a telephone. Original calm illustration supplies emotional character.

Five feature sections use distinct compositions: voice check-in preview, mood calendar, stress topic associations, self-care activity selector, and weekly recap. Follow with a 30-day challenge showcase, privacy explanation, accessible FAQ accordion and signup CTA. No clinical promises.

## Application

Desktop: restrained navigation rail, workspace header, mood panel spanning two columns, next call and challenge in the supporting column. Journals and trends take larger areas than status metrics. Mobile: greeting and mood first, next call second, then journal and weekly trend. A bottom navigation offers Home, Journal, Self-care and Settings; remaining areas live in a labelled menu.

Routes: /, /auth, /auth/callback, /onboarding, /dashboard, /journal, /mood, /insights, /self-care, /challenge, /recap, /calls, /schedule, /settings, /admin, /privacy.

Mood: expressive selectable faces, named emotional tags and explicit 1-10 rating. Save requires a user choice; no preset score is silently recorded. Calendar distinguishes recorded, empty, future and skipped days. Charts never fill missing mood points.

Onboarding: adult eligibility, providers, verified destination, separate consent, language/voice and schedule. Credential values disappear after submission. Connection errors offer a retry. Incomplete onboarding prevents calls while allowing repair and privacy controls.

Every page has a composed empty state, skeleton, recoverable error and keyboard focus. Dashboard mutations persist through the authenticated product API; private Realtime events refresh the current user's data. Preview is a separate public, labelled sample with no account writes or real calls.

## Emotional and privacy rules

Support the user's own words. Never show guessed mood, clinical labels or guilt for missed days. Distinguish AI reflections from edited user text. Recording defaults off. Transcripts are transient for journal processing unless separately retained. Consent can be withdrawn, calls paused and personal data exported or deleted.

The design-taste marketing preset is variance 6, motion 3, density 3. Product layouts follow usability and data requirements rather than the marketing skill's layout restrictions.
