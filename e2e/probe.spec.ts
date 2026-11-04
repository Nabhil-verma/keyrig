import { test } from "@playwright/test";

const PASSWORD = "keyrig-probe-password";

test("probe the model list through the workspace", async ({ page }) => {
  page.on("console", (message) => console.log("CONSOLE", message.type(), message.text()));
  page.on("requestfailed", (request) =>
    console.log("FAILED", request.method(), request.url(), request.failure()?.errorText),
  );
  page.on("response", (response) => {
    if (response.url().includes("8788")) {
      console.log("RESPONSE", response.status(), response.url());
    }
  });

  await page.goto("/app");
  await page.getByLabel("Username").fill(`probe${Date.now().toString(36)}`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat the password").fill(PASSWORD);
  await page.locator(".auth-submit").click();

  await page.getByRole("button", { name: "Keys", exact: true }).click();
  await page.locator("#key-provider").selectOption("openai-compatible");
  await page.locator("#key-label").fill("Probe key");
  await page.locator("#key-secret").fill("local-test-key");
  await page.getByRole("button", { name: "Save the key" }).click();
  await page.locator(".ws-shelf-head").getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Provider and model" }).click();
  await page.locator("#provider").selectOption("openai-compatible");
  await page.locator("#base-url").fill("http://127.0.0.1:8788/v1");
  await page.waitForTimeout(4000);

  const status = await page.locator(".ws-popover .hint").allTextContents();
  console.log("HINTS", JSON.stringify(status));
  const entries = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("8788")),
  );
  console.log("RESOURCES", JSON.stringify(entries));
});
