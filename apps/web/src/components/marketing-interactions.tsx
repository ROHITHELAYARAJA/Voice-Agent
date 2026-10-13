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
import { Modal, ThemeToggle } from "./ui";
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
