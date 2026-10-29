import { expect, test } from "@playwright/test";

test("a connector scans its tools, needs consent, then runs one", async ({ page }) => {
  await page.goto("/settings");

  await page.locator("#connector-name").fill("Local tools");
  await page.locator("#connector-url").fill("http://127.0.0.1:8789/mcp");
  await page.getByRole("button", { name: "Add the connector" }).click();

  const row = page.locator(".settings-item--column").filter({ hasText: "Local tools" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("No consent");

  // The scan reads the tool list and nothing else.
  await row.getByRole("button", { name: "Scan the tools" }).click();
  await expect(row).toContainText("echo");
  await expect(row).toContainText("Allow this server?");

  // Consent is an explicit step, and it names the tools it allows.
  await row.getByRole("button", { name: "Allow 2 tools" }).click();
  await expect(row).toContainText("Allowed");

  // The run sends the arguments to the server and shows the text.
  await row.locator("textarea").fill('{"text":"hello from mcp"}');
  await row.getByRole("button", { name: "Run the tool" }).click();
  await expect(row.locator(".mcp-result")).toContainText("hello from mcp");

  // Revoke returns the row to the consent step.
  await row.getByRole("button", { name: "Revoke consent" }).click();
  await expect(row).toContainText("Allow this server?");
});
