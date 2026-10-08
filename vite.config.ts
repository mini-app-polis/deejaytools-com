import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const api = process.env.VITE_API_URL ?? "http://localhost:3001";

// Read the repo-root package.json so we can stamp the bundle with the
// version semantic-release bumps on each release. Surfaces in the browser
// via `import.meta.env.VITE_APP_VERSION` and is passed to Sentry as the
// release tag — without it, every error is associated with `unknown@*`.
const rootPkg = JSON.parse(
  readFileSync(resolve(rootDir, "package.json"), "utf8")
) as { version: string };

// Short commit sha for the build, shown in the nav on non-production hosts so a
// dev/preview build can be traced back to an exact commit (the semver version is
// only bumped on release, so it is useless for that). Cloudflare Pages injects
// CF_PAGES_COMMIT_SHA; locally we ask git. Falls back to an empty string, which
// makes the nav fall back to the version.
function commitSha(): string {
  const fromPages = process.env.CF_PAGES_COMMIT_SHA;
  if (fromPages) return fromPages.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  // Sentry DSN keys are named for their Sentry project (ecosystem-standards
  // CD-002), so this one is SENTRY_DSN_DEEJAYTOOLS, not VITE_-prefixed. It is
  // mapped into the bundle here, by name, rather than by widening envPrefix,
  // which would expose every SENTRY_DSN_* in the build environment. Read from
  // process env (Doppler / Pages) or a local .env file.
  const sentryDsn = loadEnv(mode, rootDir, "SENTRY_DSN_").SENTRY_DSN_DEEJAYTOOLS ?? "";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(rootPkg.version),
      "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(commitSha()),
      "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(sentryDsn),
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
  };
});
