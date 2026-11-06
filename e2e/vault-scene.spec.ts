import { expect, test } from "@playwright/test";

test("backlog #10 the first-run vault scene renders and the skip stays on this device", async ({ page }) => {
  await page.goto("/app");

  const scene = page.locator(".vault-scene");
  const host = page.locator(".vault-scene-canvas");
  await expect(scene).toBeVisible();
  await expect(host.locator("canvas")).toBeVisible();
  await expect(host).not.toHaveAttribute("data-failed", "true");

  // The buffer stays small for an integrated GPU.
  const ratio = await host.locator("canvas").evaluate((item) => {
    const canvas = item as HTMLCanvasElement;
    return canvas.width / Math.max(1, canvas.clientWidth);
  });
  expect(ratio).toBeLessThanOrEqual(1.55);

  await page.getByRole("button", { name: "Skip the scene" }).click();
  await expect(scene).toHaveCount(0);

  // The skip belongs to this browser, so a reload keeps the scene hidden.
  await page.reload();
  await expect(page.locator(".auth-card")).toBeVisible();
  await expect(page.locator(".vault-scene")).toHaveCount(0);
});

test("backlog #10 the scene holds a still frame when the user asks for less motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app");

  const host = page.locator(".vault-scene-canvas");
  await expect(host).toHaveAttribute("data-motion", "still");
  await expect(host).toHaveAttribute("data-running", "false");
  await expect(host.locator("canvas")).toBeVisible();
});

test("backlog #10 the scene stops when the tab is hidden", async ({ page }) => {
  await page.goto("/app");

  const host = page.locator(".vault-scene-canvas");
  await expect(host).toHaveAttribute("data-running", "true");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(host).toHaveAttribute("data-running", "false");

  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(host).toHaveAttribute("data-running", "true");
});
