import { defineConfig, devices } from "@playwright/test";

/**
 * The end-to-end test drives the real web app against the local fake provider.
 * It needs no key and no network.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5199",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tools/fake-provider.mjs",
      url: "http://127.0.0.1:8788/v1/models",
      reuseExistingServer: true,
      timeout: 20_000,
      stdout: "pipe",
    },
    {
      command: "node tools/fake-mcp.mjs",
      url: "http://127.0.0.1:8789/health",
      reuseExistingServer: true,
      timeout: 20_000,
      stdout: "pipe",
    },
    {
      command: "npm run dev --workspace @keyrig/web",
      url: "http://127.0.0.1:5199",
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
    },
  ],
});
