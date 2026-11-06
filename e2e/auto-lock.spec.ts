import { expect, test } from "@playwright/test";

const PASSWORD = "keyrig-auto-lock-password";

test("B8 #4 idle time locks the vault in a real tab", async ({ page }) => {
  const username = `lock${Date.now().toString(36)}`;

  // The clock starts before the app, so the idle interval uses the fake time.
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "keyrig.settings.v1",
        JSON.stringify({
          schemaVersion: 1,
          appliedMigrations: [],
          data: { autoLockMinutes: 1, lockOnHiddenMinutes: 1 },
        }),
      );
    } catch {
      // The first document has no storage. The app document does.
    }
  });

  await page.goto("/app");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await expect(page.locator(".status-chip")).toContainText(username);

  // One minute of no pointer or key activity. The check runs every 15 seconds.
  await page.clock.fastForward(61_000);

  await expect(page.locator(".auth-card")).toBeVisible();
  await expect(
    page.getByText("keyrig locked the key vault after a period of no activity."),
  ).toBeVisible();
});
