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
  build: {
    rollupOptions: {
      output: {
        // Split the frameworks from the app code. A deploy then keeps the
        // vendor chunk in the browser cache, and no chunk holds everything.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) {
            return "motion";
          }
          // three.js is a large renderer. It loads only when a 3D scene arrives.
          if (id.includes("node_modules/three")) {
            return "three";
          }
          if (id.includes("react")) {
            return "react";
          }
          return "vendor";
        },
      },
    },
  },
});
