import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("marketing preview, keyboard FAQ and reduced motion", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your feelings deserve a little space.",
  );
  await page.getByRole("button", { name: "Try the preview" }).click();
  await expect(
    page.getByText("A little busy, but a walk outside helped me slow down.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Is Nila therapy?" }).click();
  await expect(
    page.getByText("Nila is a self-care and reflection companion for adults.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `outputs/nila-${info.project.name}-landing.png`,
    fullPage: true,
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /journals");
  await page
    .locator(".hero-copy")
    .getByRole("link", { name: "Get started", exact: false })
    .click();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
});

test("social login keeps provider choice, PKCE callback and adult signup confirmation", async ({
  page,
}) => {
  await page.goto("/auth?mode=signup");
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(
    page.getByText("Please confirm that you are 18 or older", { exact: false }),
  ).toBeVisible();
  if (process.env.NILA_AUTH_CONFIGURED !== "1") return;
  for (const provider of ["google", "github"]) {
    await page.goto("/auth?error=callback");
    await expect(
      page.getByText("Sign-in could not finish. Please try again."),
    ).toBeVisible();
    let authorization: URL | undefined;
    await page.route("**/auth/v1/authorize?**", async (route) => {
      authorization = new URL(route.request().url());
      await route.fulfill({
        contentType: "text/html",
        body: "<h1>Provider sign-in test</h1>",
      });
    });
    await page
      .getByRole("button", {
        name: `Continue with ${provider === "github" ? "GitHub" : "Google"}`,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Provider sign-in test" }),
    ).toBeVisible();
    expect(authorization?.searchParams.get("provider")).toBe(provider);
    expect(authorization?.searchParams.get("code_challenge_method")).toBe(
      "s256",
    );
    const callback = new URL(authorization!.searchParams.get("redirect_to")!);
    expect(callback.origin).toBe(
      new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000")
        .origin,
    );
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/dashboard");
    await page.unroute("**/auth/v1/authorize?**");
  }
});
test("preview mood, journal editor and challenge actions work", async ({
  page,
}, info) => {
  await page.goto("/preview");
  await page
    .getByRole("button", { name: "Mood 8 out of 10", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mood 8 out of 10", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: `outputs/nila-${info.project.name}-dashboard.png`,
    fullPage: true,
  });
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.goto("/preview?view=journals");
  await page
    .getByRole("button", { name: "Write a reflection", exact: false })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("A quiet moment");
  await page
    .getByLabel("Your reflection", { exact: true })
    .fill("A walk helped me slow down today.");
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(
    page.getByRole("heading", { name: "A quiet moment" }),
  ).toBeVisible();
  await page.goto("/preview?view=challenge");
  await page.getByRole("button", { name: "I've done this" }).click();
  await expect(
    page.getByLabel("Day 6: completed", { exact: true }),
  ).toBeVisible();
});
test("dark appearance, mobile navigation and setup gate", async ({
  page,
}, info) => {
  await page.goto("/preview");
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({
    path: `outputs/nila-${info.project.name}-dark.png`,
    fullPage: true,
  });
  if (info.project.name === "mobile") {
    await page
      .getByRole("button", { name: "Open your space navigation" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Mood calendar" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Mood calendar" }),
    ).toBeVisible();
  }
  await page.goto("/dashboard");
  if (process.env.NILA_AUTH_CONFIGURED === "1") {
    await expect(page).toHaveURL(/\/auth/);
    await page.route("**/auth/v1/token?grant_type=password", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "invalid_credentials",
          message: "Invalid login credentials",
        }),
      }),
    );
  } else {
    await expect(
      page.getByText("The local app needs its Supabase connection", {
        exact: false,
      }),
    ).toBeVisible();
  }
  await page.goto("/auth");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("example@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText(
      process.env.NILA_AUTH_CONFIGURED === "1"
        ? "Invalid login credentials"
        : "Account services are not connected yet",
      { exact: false },
    ),
  ).toBeVisible();
});
