import { expect, test, type Page } from "@playwright/test";

const USERNAME = `smoke${Date.now().toString(36)}`;
const PASSWORD = "keyrig-smoke-password";
const FAKE_BASE_URL = "http://127.0.0.1:8788/v1";
const REPLY = "local test provider";

/** The key vault and the profile live behind the rail, not on the chat itself. */
async function openKeys(page: Page): Promise<void> {
  if ((await page.locator(".ws-shelf").count()) === 0) {
    await page.getByRole("button", { name: "Keys", exact: true }).click();
  }
  await expect(page.locator("#key-provider")).toBeVisible();
}

async function closeDrawer(page: Page): Promise<void> {
  await page.locator(".ws-shelf-head").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".ws-shelf")).toHaveCount(0);
}

/** The route sits in one popover, so the chat keeps its width. */
async function openRoute(page: Page): Promise<void> {
  if ((await page.locator(".ws-popover").count()) === 0) {
    await page.getByRole("button", { name: "Provider and model" }).click();
  }
  await expect(page.locator("#provider")).toBeVisible();
}

async function closeRoute(page: Page): Promise<void> {
  await page.locator(".ws-popover").getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".ws-popover")).toHaveCount(0);
}

async function signIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator(".auth-submit").click();
  await expect(page.locator(".status-chip")).toContainText(USERNAME);
}

test("a chat and an arena run against the fake provider", async ({ page }) => {
  await page.goto("/app");

  // 1. Create an account on this device. The password makes the vault key.
  await expect(page.getByRole("heading", { name: "Create your keyrig account" })).toBeVisible();
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();

  // 2. Add a key for the OpenAI-compatible pack.
  await openKeys(page);
  await page.locator("#key-provider").selectOption("openai-compatible");
  await page.locator("#key-label").fill("Local test key");
  await page.locator("#key-secret").fill("local-test-key");
  await page.getByRole("button", { name: "Save the key" }).click();
  await expect(page.locator("#vault-body .key-card")).toHaveCount(1);
  await closeDrawer(page);

  // 3. Point the route at the fake provider and choose its model.
  await openRoute(page);
  await page.locator("#provider").selectOption("openai-compatible");
  await page.locator("#base-url").fill(FAKE_BASE_URL);
  await expect(page.locator("#model option[value='fake-model']")).toHaveCount(1);
  await page.locator("#model").selectOption("fake-model");
  await expect(page.locator("#key option")).toContainText("Local test key");
  await closeRoute(page);

  // 4. Sign out and sign in again. The saved route comes back.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator(".auth-card")).toBeVisible();
  await signIn(page);
  await openRoute(page);
  await expect(page.locator("#provider")).toHaveValue("openai-compatible");
  await expect(page.locator("#model")).toHaveValue("fake-model");
  await expect(page.locator("#base-url")).toHaveValue(FAKE_BASE_URL);
  await closeRoute(page);

  // 5. Send a chat and check the answer card.
  await page.getByLabel("Prompt").fill("Say hello to the smoke test.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const answer = page.locator(".ws-msg--ai").last();
  await expect(answer.locator(".ws-body")).toContainText(REPLY);
  await expect(answer.locator(".ws-meta")).toContainText("fake-model");
  await expect(answer.locator(".ws-meta")).toContainText("42 in · 11 out");
  await expect(answer.locator(".ws-meta")).toContainText("Local test key");

  // 6. Run the same provider in the arena with two models.
  await page.getByRole("tab", { name: "Arena" }).click();
  const manual = page.locator("#arena-models");
  if (await manual.isVisible()) {
    await manual.fill("fake-model\nfake-model-small");
  }
  for (const model of ["fake-model", "fake-model-small"]) {
    const option = page.locator(".model-option").filter({ has: page.getByText(model, { exact: true }) });
    await option.locator("input").check();
  }
  await page.locator("#arena-prompt").fill("Compare the two answers.");
  await page.getByRole("button", { name: "Run 2 models" }).click();

  await expect(page.locator(".arena-result")).toHaveCount(2);
  await expect(page.locator(".arena-result").first()).toContainText(REPLY);
  await expect(page.locator(".arena-result").last()).toContainText(REPLY);
  await expect(page.getByRole("button", { name: "Continue with this answer" })).toHaveCount(2);
});
