import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("visual dashboard reads phone data, switches periods and opens the profile", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/preview");
  await expect(
    page.getByRole("heading", { name: "Your days, in a softer light." }),
  ).toBeVisible();
  await expect(page.locator(".constellation button")).toHaveCount(32);
  await expect(page.locator("main input, main textarea")).toHaveCount(0);
  await expect(
    page.locator(".metric-panel.water .metric-number"),
  ).toContainText("1.8");
  await expect(
    page.locator(".metric-panel.sleep .metric-number"),
  ).toContainText("7");
  await expect(page.locator(".mood-day")).toHaveCount(7);
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await expect(page.locator(".mood-day")).toHaveCount(30);
  await page.getByRole("button", { name: "Last week", exact: true }).click();
  await expect(page.locator(".mood-day")).toHaveCount(7);
  const days = page.locator(".mood-day");
  await days.first().click();
  await expect(days.first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await page.getByRole("button", { name: "Open profile for Rohith" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Rohith", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Asia/Kolkata");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open profile for Rohith" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Nightly call settings", exact: true })
    .click();
  await expect(page.getByLabel("Evening calling time")).toHaveValue("20:00");
  await expect(page.getByLabel("Evening calling time")).toHaveAttribute(
    "min",
    "18:00",
  );
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `outputs/nila-${info.project.name}-dashboard.png`,
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `outputs/nila-${info.project.name}-dark.png`,
    fullPage: true,
  });
});

test("old feature URLs present the unified view without manual actions", async ({
  page,
}) => {
  for (const view of [
    "journals",
    "moods",
    "insights",
    "challenge",
    "self-care",
    "recap",
  ]) {
    await page.goto(`/preview?view=${view}`);
    await expect(
      page.getByRole("heading", { name: "Your days, in a softer light." }),
    ).toBeVisible();
    await expect(page.locator("main input, main textarea")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "I've done this" }),
    ).toHaveCount(0);
  }
});

test("landing shows a visual example and keeps account access", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your day has a story.",
  );
  await expect(
    page.getByRole("button", { name: "Try the preview" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Do I enter anything every day?" })
    .click();
  await expect(
    page.getByText("The dashboard shows only answers you approved.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `outputs/nila-${info.project.name}-landing.png`,
    fullPage: true,
  });
  await page.goto("/auth?mode=signup");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
});
