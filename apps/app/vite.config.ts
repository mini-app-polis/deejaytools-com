import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const api = process.env.VITE_API_URL ?? "http://localhost:3001";

// Read the monorepo-root package.json so we can stamp the bundle with the
// version semantic-release bumps on each release. Surfaces in the browser
// via `import.meta.env.VITE_APP_VERSION` and is passed to Sentry as the
// release tag — without it, every error is associated with `unknown@*`.
const rootPkg = JSON.parse(
  readFileSync(resolve(rootDir, "../../package.json"), "utf8")
) as { version: string };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(rootPkg.version),
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: api,
        changeOrigin: true,
      },
    },
  },
});
