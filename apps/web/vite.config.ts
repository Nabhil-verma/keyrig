import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@keyrig/shared": `${root}packages/shared/src/index.ts`,
      "@keyrig/providers": `${root}packages/providers/src/index.ts`,
      "@keyrig/core": `${root}packages/core/src/index.ts`,
    },
  },
  server: {
    port: 5199,
    strictPort: true,
  },
});
