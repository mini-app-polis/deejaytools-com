import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Default to node — pure-function tests don't need a DOM and run faster.
    // Component tests opt into jsdom with `// @vitest-environment jsdom` at
    // the top of each file. This keeps the suite light when DOM isn't needed
    // and the optional jsdom + Testing Library deps still installed for the
    // component tests that actually need them.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      // A floor, not a target: `pnpm test:coverage` fails if coverage drops
      // below where it already is. When a change raises it, running the same
      // command locally rewrites these numbers (rounded down) — commit them,
      // and the floor has moved up for good. Every API endpoint the app calls
      // is separately required to be exercised by the live contract suite
      // (src/contract), and the core journeys by the e2e suite (e2e/).
      thresholds: {
        statements: 91,
        branches: 81,
        functions: 90,
        lines: 93,
        autoUpdate: (next: number) => Math.floor(next),
      },
    },
  },
});
