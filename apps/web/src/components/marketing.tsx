import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  LockKeyIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SparkleIcon,
  BookOpenIcon,
} from "@phosphor-icons/react/ssr";
import { Brand, ThemeToggle } from "./ui";
import {
  VoicePreview,
  MarketingFAQ,
  MarketingMenu,
} from "./marketing-interactions";
const faqs = [
  [
    "Is Nila therapy?",
    "Nila is a self-care and reflection companion for adults. It does not provide therapy, diagnosis, treatment, or emergency response.",
  ],
  [
    "Do I have to answer every call?",
    "No. Calls are optional. You can pause your schedule, skip questions, end a call, or come back another day without losing progress.",
  ],
  [
    "Are my calls recorded?",
    "Recording is off by default. Conversation data is used only with your consent. You control transcript retention and can export or delete your journal.",
  ],
  [
    "What do I need to get started?",
    "Create an account and connect your own Twilio, Deepgram and ElevenLabs provider accounts. Provider charges and hosting availability are separate from Nila. Media Streams requires a supported Twilio account.",
  ],
  [
    "Which languages can I use?",
    "Language choices depend on the transcription and voice providers. Tamil is a manual language option; automatic detection is limited to supported models and is not guaranteed within a fixed time.",
  ],
  [
    "Can I edit a reflection?",
    "Yes. Reflections clearly distinguish AI-written structure from your own words. You can edit, correct, export or delete entries.",
  ],
];
export function Marketing() {
  return (
    <>
      <header className="container marketing-nav">
        <Brand />
        <nav className="marketing-links" aria-label="Main navigation">
          <a href="#experience">Experience</a>
          <a href="#self-care">Self-care</a>
          <a href="#privacy">Privacy</a>
          <Link href="/auth" prefetch={false}>
            Sign in
          </Link>
          <Link
            className="button-link"
            href="/auth?mode=signup"
            prefetch={false}
          >
            Get started <ArrowRightIcon size={16} />
          </Link>
          <ThemeToggle />
        </nav>
        <MarketingMenu />
      </header>
      <main id="main">
        <section className="container hero">
          <div className="hero-copy">
            <div className="eyebrow">A gentler way to check in</div>
            <h1>
              Your feelings deserve <span>a little space.</span>
            </h1>
            <p>
              A gentle voice check-in. A private place to reflect. Small moments
              of care, at your own pace.
            </p>
            <div className="row">
              <Link
                className="button-link"
                href="/auth?mode=signup"
                prefetch={false}
              >
                Get started <ArrowRightIcon size={17} />
              </Link>
              <Link
                className="button-link secondary"
                href="/preview"
                prefetch={false}
              >
                Explore Nila
              </Link>
            </div>
          </div>
          <div className="hero-art">
            <Image
              src="/nila-art.png"
              alt="Lavender paper loop, sage leaves and peach stones in soft light"
              fill
              priority
              sizes="(max-width: 767px) 100vw, 50vw"
            />
          </div>
        </section>
        <div className="container intro-strip">
          <div className="row">
            <PhoneIcon size={19} /> Check in with a friendly AI voice
          </div>
          <div className="row">
            <LockKeyIcon size={19} /> Your reflections stay private
          </div>
          <div className="row">
            <SparkleIcon size={19} /> No pressure to feel a certain way
          </div>
        </div>
        <section id="experience" className="container section">
          <div className="section-heading">
            <h2>Some days, talking is easier.</h2>
            <p>
              Your companion makes room for your day. You choose when to talk,
              what to share, and when to stop.
            </p>
          </div>
          <div className="feature-composition">
            <VoicePreview />
            <div className="feature-copy">
              <PhoneIcon size={29} weight="duotone" />
              <h3>A check-in that meets you where you are.</h3>
              <p>
                Optional scheduled calls help you pause and reflect. A small
                conversation becomes a private written journal, using only what
                you shared.
              </p>
              <Link className="text-link" href="/preview" prefetch={false}>
                See your daily space{" "}
                <ArrowRightIcon style={{ verticalAlign: "middle" }} />
              </Link>
            </div>
          </div>
        </section>
        <section className="container section" style={{ paddingTop: 0 }}>
          <div className="feature-grid">
            <article className="feature-tile tint-sage feature-large">
              <h3>A clearer picture, one day at a time.</h3>
              <p>
                Give your mood a name and a number. See the days you checked in,
                with space for days you didn't.
              </p>
              <div className="mini-visual row wrap">
                {[
                  "A little low",
                  "Unsettled",
                  "Okay",
                  "Good",
                  "Really good",
                ].map((m, i) => (
                  <div
                    key={m}
                    className="badge"
                    style={{
                      padding: "12px 16px",
                      background: "var(--surface)",
                    }}
                  >
                    <span style={{ color: "var(--accent)", fontSize: 20 }}>
                      {i + 1}
                    </span>
                    {m}
                  </div>
                ))}
              </div>
            </article>
            <article className="feature-tile">
              <h3>Notice what comes up.</h3>
              <p>
                Reflect on recurring topics you mentioned. Understand your own
                patterns without labels or diagnoses.
              </p>
              <div className="mini-visual">
                <span className="badge">Your words</span>
                <p style={{ marginTop: 12 }}>
                  “Taking a break between tasks helped.”
                </p>
                <small className="muted">Illustrative reflection</small>
              </div>
            </article>
            <article className="feature-tile tint-peach">
              <h3>A little care goes a long way.</h3>
              <p>
                A softer breath. A gratitude note. A moment outdoors. Choose an
                activity that feels right today.
              </p>
              <div className="mini-visual">
                <SparkleIcon size={48} weight="duotone" />
              </div>
            </article>
            <article className="feature-tile tint-lavender feature-large">
              <h3>Look back with kindness.</h3>
              <p>
                Your weekly recap brings together reported moods, positive
                moments, repeated topics and your own small goals.
              </p>
              <div className="mini-visual row">
                <BookOpenIcon weight="duotone" size={42} />
                <div>
                  <strong>Your week, in your words</strong>
                  <p className="small">No invented scores. No judgment.</p>
                </div>
              </div>
            </article>
          </div>
        </section>
        <section
          id="self-care"
          className="container section"
          style={{ paddingTop: 0 }}
        >
          <div className="challenge-showcase">
            <div>
              <div className="eyebrow">Small steps. Your pace.</div>
              <h2>30 days of a little more you.</h2>
              <p>
                One optional activity each day. Skip, restart, or take a break.
                This is a gentle invitation, never another thing to get right.
              </p>
              <Link
                href="/preview?view=challenge"
                prefetch={false}
                className="button-link"
              >
                Explore the challenge <ArrowRightIcon size={16} />
              </Link>
            </div>
            <div>
              <div
                className="challenge-days"
                aria-label="Illustrative 30 day challenge"
              >
                {Array.from({ length: 30 }, (_, i) => (
                  <div key={i} className={`day-circle ${i < 5 ? "done" : ""}`}>
                    {i < 5 ? <CheckIcon size={17} /> : i + 1}
                  </div>
                ))}
              </div>
              <p
                className="small muted"
                style={{ marginTop: 16, textAlign: "center" }}
              >
                Illustrative progress. Every new start counts.
              </p>
            </div>
          </div>
        </section>
        <section id="privacy" className="container section">
          <div className="privacy-section">
            <div>
              <h2>
                A private space.
                <br />A little peace of mind.
              </h2>
              <p className="muted" style={{ marginTop: 18 }}>
                You choose what to share. You stay in control.
              </p>
              <Link
                className="text-link"
                style={{ display: "inline-block", marginTop: 24 }}
                href="/privacy"
              >
                Read our privacy approach <ArrowRightIcon size={15} />
              </Link>
            </div>
            <div className="privacy-points">
              {[
                [
                  LockKeyIcon,
                  "Just for you",
                  "Private journals and account-specific access. Administrators do not routinely read your personal reflections.",
                ],
                [
                  ShieldCheckIcon,
                  "Consent comes first",
                  "Calls and transcription require your permission. Recording is off, and you can pause calls at any time.",
                ],
                [
                  BookOpenIcon,
                  "Your words, your choice",
                  "Review your reflections. Correct, export, or delete your entries. No guessed mood or hidden clinical assessment.",
                ],
              ].map(([Icon, title, copy]) => {
                const I = Icon as typeof LockKeyIcon;
                return (
                  <div className="privacy-point" key={String(title)}>
                    <I size={26} />
                    <div>
                      <h3>{String(title)}</h3>
                      <p className="muted">{String(copy)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <section className="container section">
          <div
            className="section-heading"
            style={{ margin: "0 auto 24px", textAlign: "center" }}
          >
            <h2>A few things you might wonder.</h2>
          </div>
          <MarketingFAQ faqs={faqs} />
        </section>
        <section className="container section" style={{ paddingTop: 0 }}>
          <div className="closing">
            <h2>
              You don't have to have
              <br />
              the perfect words.
            </h2>
            <Link
              href="/auth?mode=signup"
              prefetch={false}
              className="button-link"
            >
              Get started <ArrowRightIcon size={16} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="container footer">
        <Brand />
        <p>
          Self-care and reflection for adults. Nila is not therapy or an
          emergency response service.
        </p>
        <div className="row">
          <Link href="/privacy">Privacy</Link>
          <ThemeToggle />
        </div>
      </footer>
    </>
  );
}
