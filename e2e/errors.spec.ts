import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "keyrig-error-password";
const FAKE_BASE_URL = "http://127.0.0.1:8788/v1";

interface TestKey {
  label: string;
  secret: string;
}

async function closeShelf(page: Page): Promise<void> {
  await page.locator(".ws-shelf-head").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".ws-shelf")).toHaveCount(0);
}

/** A new account, its keys and the route to the local fake provider. */
async function setup(page: Page, username: string, keys: TestKey[]): Promise<void> {
  await page.goto("/app");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();

  await page.getByRole("button", { name: "Keys", exact: true }).click();
  for (const [index, key] of keys.entries()) {
    await page.locator("#key-provider").selectOption("openai-compatible");
    await page.locator("#key-label").fill(key.label);
    await page.locator("#key-secret").fill(key.secret);
    await page.getByRole("button", { name: "Save the key" }).click();
    await expect(page.locator("#vault-body .key-card")).toHaveCount(index + 1);
  }
  await closeShelf(page);

  await page.getByRole("button", { name: "Provider and model" }).click();
  await page.locator("#provider").selectOption("openai-compatible");
  await page.locator("#base-url").fill(FAKE_BASE_URL);
  await expect(page.locator("#model option[value='fake-model']")).toHaveCount(1);
  await page.locator("#model").selectOption("fake-model");
  await page.locator(".ws-popover").getByRole("button", { name: "Close" }).click();
}

async function send(page: Page, prompt: string): Promise<void> {
  await page.getByLabel("Prompt").fill(prompt);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("a rejected key shows the auth card and a way out", async ({ page }) => {
  await setup(page, `err${Date.now().toString(36)}`, [{ label: "Rejected key", secret: "bad-key-0001" }]);
  await send(page, "This request fails.");

  const card = page.locator(".error-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".error-category")).toHaveText("auth");
  await expect(card.getByRole("button", { name: "Open keys" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Use another key" })).toHaveCount(0);

  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".error-card")).toHaveCount(0);
});

test("a second key takes over a rejected request", async ({ page }) => {
  await setup(page, `rot${Date.now().toString(36)}`, [
    { label: "Rejected key", secret: "bad-key-0001" },
    { label: "Another key", secret: "local-test-key" },
  ]);
  await send(page, "This request moves to the other key.");

  const card = page.locator(".error-card");
  await expect(card.getByRole("button", { name: "Use another key" })).toBeVisible();
  await card.getByRole("button", { name: "Use another key" }).click();

  const answer = page.locator(".ws-msg--ai").last();
  await expect(answer.locator(".ws-body")).toContainText("local test provider");
  await expect(answer.locator(".ws-key")).toContainText("Another key");
  await expect(page.locator(".error-card")).toHaveCount(0);
});

test("a rate limit holds the retry until the wait ends", async ({ page }) => {
  await setup(page, `wait${Date.now().toString(36)}`, [{ label: "Local test key", secret: "local-test-key" }]);
  await send(page, "rate-limit please");

  const card = page.locator(".error-card");
  await expect(card.locator(".error-category")).toHaveText("rate limit");
  const wait = card.getByRole("button", { name: /^Wait/ });
  await expect(wait).toBeDisabled();
  await expect(card.getByRole("button", { name: "Wait", exact: true })).toBeEnabled({ timeout: 6000 });
});

test("a server failure offers a retry", async ({ page }) => {
  await setup(page, `retry${Date.now().toString(36)}`, [{ label: "Local test key", secret: "local-test-key" }]);
  await send(page, "server-error please");

  const card = page.locator(".error-card");
  await expect(card.locator(".error-category")).toHaveText("server");
  await card.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".error-card")).toHaveCount(1);
});

test("an overflow in a short chat offers a larger model", async ({ page }) => {
  await setup(page, `ctx${Date.now().toString(36)}`, [{ label: "Local test key", secret: "local-test-key" }]);
  await send(page, "context-overflow please");

  const card = page.locator(".error-card");
  await expect(card.locator(".error-category")).toHaveText("context overflow");
  await card.getByRole("button", { name: "Shorten the chat" }).click();

  const notice = page.locator(".error-card").last();
  await expect(notice).toContainText("no older exchange to remove");
  await expect(notice.getByRole("button", { name: "Change model" })).toBeVisible();
});

test("a good key answers and keeps the facts in view", async ({ page }) => {
  await setup(page, `ok${Date.now().toString(36)}`, [{ label: "Local test key", secret: "local-test-key" }]);
  await send(page, "Say hello to the error test.");

  const answer = page.locator(".ws-msg--ai").last();
  await expect(answer.locator(".ws-body")).toContainText("local test provider");
  await expect(answer.locator(".ws-meta")).toContainText("42 in · 11 out");
  await expect(answer.getByRole("button", { name: "Copy this answer" })).toBeVisible();
});
