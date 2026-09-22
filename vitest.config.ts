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
    },
  },
});
