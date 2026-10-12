"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  HouseIcon,
  BookOpenIcon,
  CalendarDotsIcon,
  ChartLineUpIcon,
  FlowerLotusIcon,
  CheckCircleIcon,
  PhoneIcon,
  GearSixIcon,
  ListIcon,
  SignOutIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import { Brand, Modal, ThemeToggle, Notice, Button } from "./ui";
import { useProduct } from "./product-context";
import { browserClient } from "@/lib/supabase";
const navigation = [
  { path: "dashboard", label: "My space", icon: HouseIcon },
  { path: "journals", label: "My journal", icon: BookOpenIcon },
  { path: "moods", label: "Mood calendar", icon: CalendarDotsIcon },
  { path: "insights", label: "My patterns", icon: ChartLineUpIcon },
  { path: "self-care", label: "Self-care", icon: FlowerLotusIcon },
  { path: "challenge", label: "30-day challenge", icon: CheckCircleIcon },
  { path: "recap", label: "Weekly recap", icon: BookOpenIcon },
  { path: "calls", label: "My check-ins", icon: PhoneIcon },
  { path: "schedule", label: "Call schedule", icon: CalendarDotsIcon },
  { path: "settings", label: "Settings & privacy", icon: GearSixIcon },
];
export function AppShell({
  children,
  view,
}: {
  children: ReactNode;
  view?: string;
}) {
  const path = usePathname();
  const { data, error, liveUpdateError, preview, refresh, loading } =
    useProduct();
  const [menu, setMenu] = useState(false);
  const active = view ?? path.split("/")[1] ?? "dashboard";
  const href = (p: string) => (preview ? `/preview?view=${p}` : `/${p}`);
  const nav = (
    <nav aria-label="Your private space">
      {navigation.map((n) => (
        <Link
          className={`nav-item ${active === n.path ? "active" : ""}`}
          key={n.path}
          href={href(n.path)}
          onClick={() => setMenu(false)}
        >
          <n.icon
            size={20}
            weight={active === n.path ? "duotone" : "regular"}
          />
          {n.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <>
      {preview && (
        <div className="preview-ribbon">
          Public design preview · Illustrative data only ·{" "}
          <Link className="text-link" href="/auth?mode=signup">
            Create your private space
          </Link>
        </div>
      )}
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          {nav}
          <div className="sidebar-bottom">
            <div className="sidebar-care">
              <FlowerLotusIcon size={25} weight="duotone" />
              <p>A little care, one day at a time.</p>
              <Link className="text-link" href={href("self-care")}>
                Take a small pause <ArrowRightIcon size={12} />
              </Link>
            </div>
            <Link className="nav-item" href="/privacy">
              Privacy approach
            </Link>
          </div>
        </aside>
        <div className="workspace">
          <header className="app-header">
            <span className="breadcrumbs">
              Your space /{" "}
              <span style={{ color: "var(--ink)" }}>
                {navigation.find((n) => n.path === active)?.label ?? "Welcome"}
              </span>
            </span>
            <div className="mobile-app-nav">
              <button
                className="icon-button"
                aria-label="Open your space navigation"
                onClick={() => setMenu(true)}
              >
                <ListIcon size={20} />
              </button>
            </div>
            <div className="row" style={{ marginLeft: "auto" }}>
              <ThemeToggle />
              <div className="avatar" aria-label="Your account">
                {(data?.profile.display_name ?? "You")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              {!preview && (
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={() =>
                    void browserClient()
                      .auth.signOut()
                      .then(() => window.location.assign("/auth"))
                  }
                >
                  <SignOutIcon size={17} />
                </button>
              )}
            </div>
          </header>
          <main id="main" className="app-main">
            {data && (error || liveUpdateError) && (
              <Notice error>
                {error || liveUpdateError}{" "}
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
                Your space is ready for setup.{" "}
                <Link className="text-link" href="/onboarding">
                  Finish connecting your check-ins
                </Link>
              </Notice>
            )}
            {children}
          </main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Mobile quick navigation">
        {navigation
          .filter((n) =>
            ["dashboard", "journals", "self-care", "settings"].includes(n.path),
          )
          .map((n) => (
            <Link
              href={href(n.path)}
              key={n.path}
              className={active === n.path ? "active" : ""}
            >
              <n.icon
                size={22}
                weight={active === n.path ? "duotone" : "regular"}
              />
              {n.path === "dashboard"
                ? "My space"
                : n.path === "settings"
                  ? "Settings"
                  : n.label}
            </Link>
          ))}
      </nav>
      <Modal
        open={menu}
        onOpenChange={setMenu}
        title="Your space"
        description="A little room for every part of your day."
      >
        {nav}
      </Modal>
    </>
  );
}
