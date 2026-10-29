import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@keyrig/shared": `${root}packages/shared/src/index.ts`,
      "@keyrig/providers": `${root}packages/providers/src/index.ts`,
      "@keyrig/core": `${root}packages/core/src/index.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/src/tests/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    restoreMocks: true,
  },
});
