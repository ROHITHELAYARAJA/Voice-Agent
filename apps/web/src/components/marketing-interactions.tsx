"use client";
import Link from "next/link";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ArrowRightIcon,
  CaretDownIcon,
  WaveformIcon,
  ListIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Modal, ThemeToggle } from "./ui";
export function VoicePreview() {
  const [step, setStep] = useState(0);
  const lines = [
    "Hey, I'm your Nila companion. How has today felt for you?",
    "A little busy, but a walk outside helped me slow down.",
    "I'm glad you found a little breathing room. Want to tell me about that moment?",
  ];
  return (
    <div className="voice-preview">
      <div className="row between">
        <div className="row">
          <div className="voice-orb">
            <WaveformIcon size={36} weight="duotone" />
          </div>
          <div>
            <strong>Your gentle check-in</strong>
            <p className="muted small">Illustrative conversation</p>
          </div>
        </div>
        <span className="badge">AI companion</span>
      </div>
      <blockquote aria-live="polite">“{lines[step]}”</blockquote>
      <div className="row between">
        <div className={`wave ${step > 0 ? "playing" : ""}`} aria-hidden="true">
          {Array.from({ length: 19 }, (_, i) => (
            <span
              key={i}
              style={
                {
                  "--bar": `${10 + ((i * 13) % 29)}px`,
                  "--i": i,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <Button
          className="secondary"
          onClick={() => setStep((step + 1) % lines.length)}
        >
          {step === 0
            ? "Try the preview"
            : step === 2
              ? "Start again"
              : "Next response"}
          <ArrowRightIcon size={15} />
        </Button>
      </div>
    </div>
  );
}

export function MarketingFAQ({ faqs }: { faqs: string[][] }) {
  return (
    <Accordion.Root type="single" collapsible className="faq">
      {faqs.map(([q, a], i) => (
        <Accordion.Item key={q} value={String(i)} className="faq-item">
          <Accordion.Header>
            <Accordion.Trigger className="faq-trigger">
              {q}
              <CaretDownIcon size={18} />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="faq-content">{a}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
export function MarketingMenu() {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div className="mobile-menu">
        <button
          className="icon-button"
          aria-label="Open navigation"
          onClick={() => setMenu(true)}
        >
          <ListIcon size={22} />
        </button>
      </div>
      <Modal
        open={menu}
        onOpenChange={setMenu}
        title="A little space to explore"
        description="Choose where you would like to go."
      >
        <nav className="page-stack" style={{ marginTop: 24 }}>
          <a href="#experience" onClick={() => setMenu(false)}>
            Experience
          </a>
          <a href="#self-care" onClick={() => setMenu(false)}>
            Self-care
          </a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/auth">Sign in</Link>
          <Link
            className="button-link"
            href="/auth?mode=signup"
            prefetch={false}
          >
            Get started
          </Link>
          <ThemeToggle />
        </nav>
      </Modal>
    </>
  );
}
