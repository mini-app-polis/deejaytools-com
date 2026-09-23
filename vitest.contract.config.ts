import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The live contract suite (src/contract). Separate from the unit config:
 * it needs a running API and credentials, writes data, and must run its
 * steps in order — so it is never part of `pnpm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/contract/**/*.contract.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
