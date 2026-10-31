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
      // Every source file counts, imported by a test or not, so an untested
      // file shows up as uncovered instead of missing from the report. Left
      // out: the tests themselves, the live contract suite (its own
      // config), the entry point (it mounts the app on import), the global
      // setup and the Vite type declarations.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/contract/**",
        "src/main.tsx",
        "src/test/setup.ts",
        "src/vite-env.d.ts",
      ],
      // A floor, not a target: `pnpm test:coverage` fails if coverage drops
      // below where it already is. When a change raises it, running the same
      // command locally rewrites these numbers (rounded down) — commit them,
      // and the floor has moved up for good. Every API endpoint the app calls
      // is separately required to be exercised by the live contract suite
      // (src/contract), and the core journeys by the e2e suite (e2e/).
      thresholds: {
        statements: 93,
        branches: 84,
        functions: 93,
        lines: 95,
        autoUpdate: (next: number) => Math.floor(next),
      },
    },
  },
});
