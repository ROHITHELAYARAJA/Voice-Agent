import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("outputs", { recursive: true });
const browser = await chromium.launch();
for (const [name, options] of [
  ["desktop", { viewport: { width: 1440, height: 1000 } }],
  ["mobile", { ...devices["iPhone 13"] }],
]) {
  const context = await browser.newContext({
    ...options,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const [route, label] of [
    ["/", "landing"],
    ["/preview", "dashboard"],
  ]) {
    await page.goto(`http://127.0.0.1:3001${route}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page
      .locator("img")
      .evaluateAll((images) =>
        Promise.all(images.map((image) => image.decode().catch(() => {}))),
      );
    await page.screenshot({
      path: `outputs/nila-${name}-${label}-viewport.png`,
    });
  }
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await page.screenshot({ path: `outputs/nila-${name}-dark-viewport.png` });
  await context.close();
}
await browser.close();
