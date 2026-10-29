import { expect, test } from "@playwright/test";

const PASSWORD = "keyrig-move-password";

test("exports the encrypted vault and imports it on a cleared origin", async ({ page }) => {
  const username = `move${Date.now().toString(36)}`;
  await page.goto("/app");

  // 1. Create an account and a key.
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await expect(page.locator("#key-provider")).toBeVisible();

  await page.locator("#key-provider").selectOption("openai-compatible");
  await page.locator("#key-label").fill("Moved key");
  await page.locator("#key-secret").fill("local-test-key");
  await page.getByRole("button", { name: "Save the key" }).click();
  await expect(page.locator("#vault-body .key-card")).toHaveCount(1);

  // 2. Export the encrypted vault.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export the vault" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`keyrig-vault-${username}.json`);
  const file = await download.path();
  expect(file).toBeTruthy();

  // 3. Clear the storage to act as a different web address.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".auth-card")).toBeVisible();
  await expect(page.locator("#key-provider")).toHaveCount(0);

  // 4. Import the file with the same password.
  await page.getByRole("button", { name: "Import vault" }).click();
  await page.locator("#auth-vault-file").setInputFiles(file as string);
  await page.getByLabel("Vault password").fill(PASSWORD);
  await page.locator(".auth-submit").click();

  await expect(page.locator("#key-provider")).toBeVisible();
  await expect(page.locator(".status-chip")).toContainText(username);
  await expect(page.locator("#vault-body .key-card")).toHaveCount(1);
  await expect(page.locator("#vault-body .key-card")).toContainText("Moved key");
});
