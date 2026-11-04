import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "keyrig-pages-password";

/** The local day, in the same shape that the streak record uses. */
function localDay(date: Date): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

async function signIn(page: Page, username: string): Promise<void> {
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await expect(page.locator(".status-chip")).toContainText(username);
}

test("the marketplace and the requests pages work without the backend", async ({ page }) => {
  await page.goto("/marketplace");

  // 1. The page opens and says plainly that the list needs the backend.
  await expect(page.getByRole("heading", { name: /Tools from other rigs/ })).toBeVisible();
  await expect(page.getByText("The marketplace needs the optional backend.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Publish one of your tools" })).toBeVisible();

  // 2. The header moves to the requests page, not a reload.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Requests", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Ask for the next part/ })).toBeVisible();
  await expect(page.getByText("The backend is off on this site.")).toBeVisible();

  // 3. A request works on this device and its vote is visible.
  await page.getByLabel("Title").fill("Export the week cost as CSV");
  await page.getByRole("button", { name: "Send the request" }).click();
  await expect(page.getByText("Saved on this device.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vote for Export the week cost as CSV" }),
  ).toBeVisible();
  await expect(page.getByText("Export the week cost as CSV")).toBeVisible();
});

test("the dashboard shows the streak of this device", async ({ page }) => {
  const username = `streak${Date.now().toString(36)}`;
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);

  await page.goto("/app");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await expect(page.locator(".status-chip")).toContainText(username);

  // The streak record is a device record, so this test can seed it directly.
  await page.evaluate(
    ({ key, days, best }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ schemaVersion: 1, appliedMigrations: [], data: { days, best } }),
      );
    },
    {
      key: "keyrig.streak.v1",
      days: [localDay(yesterday), localDay(today)],
      best: 2,
    },
  );

  await page.reload();
  await signIn(page, username);

  await expect(page.locator(".dash-streak-number")).toHaveText("2");
  await expect(page.locator(".dash-streak-meta")).toContainText("Best 2");
  await expect(page.locator(".dash-streak-meta")).toContainText("today counts");
});

test("a deleted chat can be undone", async ({ page }) => {
  const username = `undo${Date.now().toString(36)}`;

  await page.goto("/app");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await expect(page.locator(".status-chip")).toContainText(username);

  // The chat record is a device record, so this test can seed it directly.
  await page.evaluate(
    ({ key, at }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 1,
          appliedMigrations: [],
          data: [
            {
              id: "thread_undo",
              title: "Keep me",
              createdAt: at,
              updatedAt: at,
              messages: [{ id: "m1", role: "user", content: "Keep me", at }],
            },
          ],
        }),
      );
    },
    { key: `keyrig.account.${username}.keyrig.threads.v1`, at: new Date().toISOString() },
  );

  await page.reload();
  await signIn(page, username);

  await expect(page.locator(".ws-thread-title", { hasText: "Keep me" })).toHaveCount(1);

  // 1. Deleting the chat hides it and offers the undo.
  await page.getByRole("button", { name: "Delete Keep me" }).click();
  await expect(page.locator(".ws-thread-title", { hasText: "Keep me" })).toHaveCount(0);
  await expect(page.locator(".ws-undo")).toContainText("Keep me");

  // 2. Undo puts it back and closes the bar.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".ws-undo")).toHaveCount(0);
  await expect(page.locator(".ws-thread-title", { hasText: "Keep me" })).toHaveCount(1);
});
