import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "keyrig-duplicate-password";

/** The key vault lives in the setup drawer. Opening it proves the session is live. */
async function openKeys(page: Page): Promise<void> {
  if ((await page.locator(".ws-shelf").count()) === 0) {
    await page.getByRole("button", { name: "Keys", exact: true }).click();
  }
  await expect(page.locator("#key-provider")).toBeVisible();
}

/** The drawer dims the page, so the top bar is reachable once it closes. */
async function closeDrawer(page: Page): Promise<void> {
  await page.locator(".ws-shelf-head").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".ws-shelf")).toHaveCount(0);
}

test("a second account with the same username is refused on this origin", async ({ page }) => {
  const username = `dupe${Date.now().toString(36)}`;
  await page.goto("/app");

  // 1. Create the first account.
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await openKeys(page);
  await closeDrawer(page);

  // 2. Sign out. The form opens on Create account again.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator(".auth-card")).toBeVisible();

  // 3. The same name is refused, even with the same password.
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await expect(page.getByText("already in use on this device")).toBeVisible();
  await expect(page.locator(".auth-card")).toBeVisible();

  // 4. Signing in still opens the first account.
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await openKeys(page);
  await expect(page.locator(".status-chip")).toContainText(username);
});
