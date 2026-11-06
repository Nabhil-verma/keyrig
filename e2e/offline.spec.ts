import { expect, test } from "@playwright/test";

const PREVIEW = "http://127.0.0.1:5200";

test("PV-01 a production build starts offline from the shell", async ({ page, context }) => {
  await page.goto(`${PREVIEW}/`);
  await expect(page.getByRole("heading", { name: /One key/ })).toBeVisible();

  // Wait for the worker, then reload once so it controls the page and caches
  // the hashed scripts. The install step caches only the shell.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const cached = await page.evaluate(async () => {
    const cache = await caches.open("keyrig-shell-v1");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cached).toContain("/index.html");
  expect(cached.some((path) => path.startsWith("/api/"))).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /One key/ })).toBeVisible();
  await context.setOffline(false);
});
