"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  HouseIcon,
  MoonStarsIcon,
  GearSixIcon,
  SignOutIcon,
  ShieldCheckIcon,
  FlowerLotusIcon,
} from "@phosphor-icons/react";
import { Brand, Modal, ThemeToggle, Notice, Button } from "./ui";
import { useProduct } from "./product-context";
import { browserClient } from "@/lib/supabase";
import { SettingsView } from "./settings";
import { ScheduleForm } from "./setup";

export function AppShell({ children }: { children: ReactNode; view?: string }) {
  const { data, error, liveUpdateError, preview, refresh, loading } =
    useProduct();
  const [panel, setPanel] = useState<
    "profile" | "settings" | "schedule" | null
  >(null);
  const name = data?.profile.display_name || "You";
  const home = preview ? "/preview" : "/dashboard";
  return (
    <>
      {preview && (
        <div className="preview-ribbon">
          Design preview · Sample check-ins ·{" "}
          <Link className="text-link" href="/auth?mode=signup">
            Create your private space
          </Link>
        </div>
      )}
      <div className="snapshot-shell">
        <aside className="snapshot-rail" aria-label="Nila navigation">
          <Link
            href={home}
            aria-label="Your Nila dashboard"
            className="rail-brand"
          >
            <FlowerLotusIcon size={30} weight="duotone" />
          </Link>
          <nav>
            <Link
              href={home}
              aria-label="Dashboard"
              className="rail-button active"
            >
              <HouseIcon size={23} weight="duotone" />
            </Link>
            <button
              className="rail-button"
              aria-label="Nightly schedule"
              onClick={() => setPanel("schedule")}
            >
              <MoonStarsIcon size={23} />
            </button>
            <button
              className="rail-button"
              aria-label="Settings and privacy"
              onClick={() => setPanel("settings")}
            >
              <GearSixIcon size={23} />
            </button>
          </nav>
          <Link
            className="rail-button rail-privacy"
            href="/privacy"
            aria-label="Privacy approach"
          >
            <ShieldCheckIcon size={23} />
          </Link>
        </aside>
        <div className="snapshot-workspace">
          <header className="snapshot-header">
            <Brand />
            <span className="header-note">Your private little universe</span>
            <div className="header-actions">
              <ThemeToggle />
              <button
                className="profile-trigger"
                aria-label={`Open profile for ${name}`}
                onClick={() => setPanel("profile")}
              >
                <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
                <span>{name}</span>
              </button>
            </div>
          </header>
          <main id="main" className="snapshot-main">
            {data && (error || liveUpdateError) && (
              <Notice error>
                {error || liveUpdateError}
                <Button
                  className="secondary"
                  disabled={loading}
                  onClick={() => void refresh()}
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </Button>
              </Notice>
            )}
            {data && !data.profile.onboarding_complete && !preview && (
              <Notice>
                Your nightly check-ins need connection and consent setup.{" "}
                <Link className="text-link" href="/onboarding">
                  Finish setup
                </Link>
              </Notice>
            )}
            {children}
          </main>
          <nav className="snapshot-mobile-nav" aria-label="Mobile navigation">
            <Link href={home} aria-label="Dashboard">
              <HouseIcon size={23} />
            </Link>
            <button
              aria-label="Nightly schedule"
              onClick={() => setPanel("schedule")}
            >
              <MoonStarsIcon size={23} />
            </button>
            <button
              aria-label="Settings and privacy"
              onClick={() => setPanel("settings")}
            >
              <GearSixIcon size={23} />
            </button>
            <button
              aria-label="Your profile"
              onClick={() => setPanel("profile")}
            >
              <span className="avatar">{name.slice(0, 1)}</span>
            </button>
          </nav>
        </div>
      </div>
      <Modal
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title={
          panel === "profile"
            ? "Your space, your name"
            : panel === "schedule"
              ? "Your nightly call"
              : "Settings & privacy"
        }
        description={
          panel === "profile"
            ? "Your account and private check-in preferences."
            : "Change configuration here. Daily wellness comes from your phone conversations."
        }
      >
        {panel === "profile" && (
          <div className="profile-card">
            <span className="profile-avatar">{name.slice(0, 1)}</span>
            <h3>{name}</h3>
            <span className="muted">
              {data?.profile.email ||
                (preview ? "Preview account" : "Signed-in account")}
            </span>
            <dl>
              <div>
                <dt>Time zone</dt>
                <dd>{data?.profile.timezone}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{data?.phones[0]?.masked_number ?? "Not connected"}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{data?.preferences?.language ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Audio recording</dt>
                <dd>Off</dd>
              </div>
            </dl>
            <div className="profile-providers">
              {(["twilio", "deepgram", "elevenlabs"] as const).map(
                (provider) => (
                  <span key={provider} className="small-chip">
                    {provider}
                    <i
                      aria-label={
                        data?.connections.some(
                          (c) =>
                            c.provider === provider && c.status === "connected",
                        )
                          ? "Connected"
                          : "Not connected"
                      }
                    >
                      {data?.connections.some(
                        (c) =>
                          c.provider === provider && c.status === "connected",
                      )
                        ? "✓"
                        : "—"}
                    </i>
                  </span>
                ),
              )}
            </div>
            <div className="button-row">
              <button className="button" onClick={() => setPanel("settings")}>
                Settings & privacy
              </button>
              <button
                className="button secondary"
                onClick={() => setPanel("schedule")}
              >
                Nightly schedule
              </button>
            </div>
            {!preview && (
              <button
                className="text-button signout-button"
                onClick={() =>
                  void browserClient()
                    .auth.signOut()
                    .then(() => window.location.assign("/auth"))
                }
              >
                <SignOutIcon size={18} />
                Sign out
              </button>
            )}
          </div>
        )}
        {panel === "settings" && <SettingsView />}
        {panel === "schedule" && <ScheduleForm />}
      </Modal>
    </>
  );
}
