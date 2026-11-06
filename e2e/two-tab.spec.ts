import { expect, test } from "@playwright/test";

const PASSWORD = "keyrig-two-tab-password";

test("B8 another tab cannot keep a stale key vault", async ({ page, context }) => {
  const username = `tab${Date.now().toString(36)}`;

  await page.goto("/app");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();

  // Tab B signs in to the same account and holds its own vault in memory.
  const second = await context.newPage();
  await second.goto("/app");
  await second.getByRole("button", { name: "Sign in", exact: true }).click();
  await second.getByLabel("Username").fill(username);
  await second.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await second.locator(".auth-submit").click();
  await expect(second.locator(".status-chip")).toContainText(username);

  // Tab A adds a key. The write moves the vault generation.
  await page.getByRole("button", { name: "Keys", exact: true }).click();
  await page.locator("#key-provider").selectOption("openai-compatible");
  await page.locator("#key-label").fill("first tab key");
  await page.locator("#key-secret").fill("local-test-key");
  await page.getByRole("button", { name: "Save the key" }).click();
  await expect(page.locator("#vault-body .key-card")).toHaveCount(1);

  // Tab B must lock, not overwrite tab A with its older blob.
  await expect(second.locator(".auth-card")).toBeVisible();
  await expect(second.getByText("Another tab changed the key vault.")).toBeVisible();
});
