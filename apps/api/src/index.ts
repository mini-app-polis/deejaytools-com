import "dotenv/config";
import { serve } from "@hono/node-server";
import { createLogger } from "common-typescript-utils";
import { app } from "./app.js";

const logger = createLogger("deejaytools-api");
const port = Number(process.env.PORT ?? "3001");
logger.start("api_starting", { port });

const server = serve({ fetch: app.fetch, port });

// Graceful shutdown for Railway / container orchestrators.
// On SIGTERM we stop accepting new connections and wait for in-flight requests
// to drain.  A hard-kill timer fires after 10 s so the process never hangs
// indefinitely — Railway (and most orchestrators) send SIGKILL after their own
// grace period anyway, but this ensures a clean exit code and final log flush.
process.on("SIGTERM", () => {
  logger.info({ event: "sigterm_received", category: "api" });

  const hardKill = setTimeout(() => {
    logger.warn({ event: "sigterm_hard_kill", category: "api" });
    process.exit(1);
  }, 10_000);
  // Don't let this timer keep the event loop alive if everything drains fast.
  hardKill.unref();

  server.close(() => {
    logger.info({ event: "server_closed", category: "api" });
    clearTimeout(hardKill);
    process.exit(0);
  });
});
