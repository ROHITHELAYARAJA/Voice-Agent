import Link from "next/link";
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  MoonStarsIcon,
} from "@phosphor-icons/react/ssr";
import { Brand, ThemeToggle } from "./ui";
import { MarketingFAQ, MarketingMenu } from "./marketing-interactions";
const faqs = [
  [
    "Is Nila therapy?",
    "Nila is a self-care and reflection companion for adults. It does not provide therapy, diagnosis, treatment or emergency response.",
  ],
  [
    "Do I enter anything every day?",
    "No. Your optional nightly phone conversation supplies the wellness information. The dashboard shows only answers you approved.",
  ],
  [
    "Do I have to answer every question?",
    "No. Skip a question, pause your schedule or end the call whenever you like. Unreported days remain empty.",
  ],
  [
    "Are calls recorded?",
    "Audio recording is disabled. Speech processing requires consent, each summary needs approval, and long-term memory requires separate permission.",
  ],
  [
    "Are telephone calls free forever?",
    "No. Provider trial limits and charges apply. Nila cannot extend trial allowances or unlock unsupported telephone features.",
  ],
  [
    "Can I remove my information?",
    "Yes. You can delete approved summaries, forget saved memories, export your data or delete your account in privacy settings.",
  ],
];
export function Marketing() {
  return (
    <>
      <header className="container marketing-nav">
        <Brand />
        <nav className="marketing-links" aria-label="Main navigation">
          <a href="#experience">How it feels</a>
          <a href="#privacy">Privacy</a>
          <Link href="/auth">Sign in</Link>
          <Link href="/auth?mode=signup" className="button-link">
            Your little space <ArrowRightIcon size={16} />
          </Link>
          <ThemeToggle />
        </nav>
        <MarketingMenu />
      </header>
      <main id="main">
        <section className="container voice-first-hero">
          <div className="voice-first-copy">
            <span className="eyebrow">A NIGHTLY CALL. A LITTLE CLARITY.</span>
            <h1>
              Your day has a story.
              <br />
              <em>Let it unfold.</em>
            </h1>
            <p>
              A phone conversation tonight. A softer picture of your wellbeing
              tomorrow. Nila listens, then turns your approved words into a
              private visual snapshot.
            </p>
            <div className="button-row">
              <Link href="/auth?mode=signup" className="button-link">
                Find your space <ArrowRightIcon size={17} />
              </Link>
              <Link href="/preview" className="button-link secondary">
                See the dashboard
              </Link>
            </div>
            <span className="caption">
              For adults · No daily forms · Your approval comes first
            </span>
          </div>
          <div
            className="landing-snapshot"
            aria-label="Illustrative wellness snapshot"
          >
            <div className="panel-top">
              <span>🌙 A little view of your day</span>
              <span className="small-chip">Sample</span>
            </div>
            <div className="landing-mood">
              <span aria-hidden="true">🙂</span>
              <strong>
                7 <small>/ 10</small>
              </strong>
            </div>
            <div className="landing-metrics">
              <span>
                💧
                <strong>
                  1.8 <small>L</small>
                </strong>
              </span>
              <span>
                😴
                <strong>
                  7 <small>h</small>
                </strong>
              </span>
              <span>
                ⚡
                <strong>
                  8 <small>/ 10</small>
                </strong>
              </span>
            </div>
            <div
              className="landing-days"
              aria-label="Illustrative mood history"
            >
              😐 🙂 ◌ 😄 🙂 🙂
            </div>
            <p>
              “I completed my project.” <span aria-hidden="true">🏆</span>
            </p>
          </div>
        </section>
        <section id="experience" className="container section">
          <div className="section-title">
            <div>
              <span className="eyebrow">LESS LOGGING. MORE LIVING.</span>
              <h2>A conversation becomes a constellation.</h2>
            </div>
          </div>
          <div className="landing-steps">
            <article>
              <span>01 · 📞</span>
              <h3>An evening hello</h3>
              <p>
                Choose your nightly time. Six to ten relevant topics, one
                question at a time, at your pace.
              </p>
            </article>
            <article>
              <span>02 · 🔐</span>
              <h3>Only with your yes</h3>
              <p>
                Hear a short summary. Correct it, skip it or approve it. Nothing
                is remembered long-term without separate permission.
              </p>
            </article>
            <article>
              <span>03 · 😊</span>
              <h3>Your days take shape</h3>
              <p>
                Mood faces, sleep rhythms, water and small achievements appear
                together. See seven days, last week or a month.
              </p>
            </article>
          </div>
        </section>
        <section id="self-care" className="container section">
          <div className="landing-feature-strip">
            <MoonStarsIcon size={40} weight="duotone" />
            <div>
              <span className="eyebrow">32 WAYS TO NOTICE YOURSELF</span>
              <h2>All the little parts. One private place.</h2>
              <p>
                Mood, rest, energy, gratitude, movement, connections and more.
                Topics rotate across calls. Your dashboard stays a place to see,
                never another list of things to do.
              </p>
            </div>
            <Link href="/preview" className="button-link secondary">
              Take a look <ArrowRightIcon size={16} />
            </Link>
          </div>
        </section>
        <section id="privacy" className="container section">
          <div className="privacy-section">
            <ShieldCheckIcon size={42} weight="duotone" />
            <div>
              <span className="eyebrow">YOUR SPACE BELONGS TO YOU</span>
              <h2>Private by design. Gentle by choice.</h2>
              <p>
                Consent before conversation. No audio recording. Separate memory
                permission. Private account data, with export and deletion
                controls.
              </p>
              <Link className="text-link" href="/privacy">
                Our privacy approach <ArrowRightIcon size={16} />
              </Link>
            </div>
          </div>
        </section>
        <section className="container section">
          <div className="section-title">
            <h2>A few things you might wonder</h2>
          </div>
          <MarketingFAQ faqs={faqs} />
        </section>
        <section className="container section">
          <div className="landing-final">
            <span aria-hidden="true">☾</span>
            <h2>A little room for the day you've had.</h2>
            <Link className="button-link" href="/auth?mode=signup">
              Begin with Nila <ArrowRightIcon size={17} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="container marketing-footer">
        <Brand />
        <span className="muted">Self-care, at your pace.</span>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </>
  );
}
