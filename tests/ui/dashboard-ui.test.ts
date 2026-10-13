import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../../apps/web/src/components/product-context", () => ({
  useProduct: () => state.value,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({ default: "a" }));
import { ViewBoundary } from "../../apps/web/src/components/product-views.tsx";
import { AppShell } from "../../apps/web/src/components/app-shell.tsx";
describe("dashboard service recovery", () => {
  beforeEach(() => {
    state.value = {
      data: null,
      loading: false,
      error: "The private data service could not be reached.",
      liveUpdateError: "Live updates are reconnecting.",
      preview: false,
      refresh: vi.fn(),
    };
  });
  it("shows one actionable API error instead of repeated live-update banners", () => {
    const html = renderToStaticMarkup(
      createElement(
        AppShell,
        {},
        createElement(ViewBoundary, {}, "Private dashboard"),
      ),
    );
    expect(html).toContain("reconnect your space");
    expect(
      html.match(/The private data service could not be reached/g),
    ).toHaveLength(1);
    expect(html).not.toContain("Live updates are reconnecting");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Private dashboard");
  });
  it("keeps previously loaded information visible during a refresh", () => {
    state.value.data = {
      profile: { display_name: "Test", onboarding_complete: true },
    };
    state.value.loading = true;
    const html = renderToStaticMarkup(
      createElement(
        AppShell,
        {},
        createElement(ViewBoundary, {}, "Saved reflection"),
      ),
    );
    expect(html).toContain("Saved reflection");
    expect(html).toContain("Refreshing");
    expect(html).not.toContain("Let's reconnect");
  });
  it("shows the live-update warning only after the private dashboard has loaded", () => {
    state.value.data = {
      profile: { display_name: "Test", onboarding_complete: true },
    };
    state.value.error = "";
    const html = renderToStaticMarkup(
      createElement(
        AppShell,
        {},
        createElement(ViewBoundary, {}, "Saved reflection"),
      ),
    );
    expect(html.match(/Live updates are reconnecting/g)).toHaveLength(1);
    expect(html).toContain("Saved reflection");
  });
});
