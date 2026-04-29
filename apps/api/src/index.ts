import "dotenv/config";
import { serve } from "@hono/node-server";
import { createLogger } from "common-typescript-utils";
import { app } from "./app.js";

const logger = createLogger("deejaytools-api");
const port = Number(process.env.PORT ?? "3001");
logger.start("api_starting", { port });

const server = serve({ fetch: app.fetch, port });

// Graceful shutdown for Railway / container orchestrators.
// On SIGTERM we stop accepting new connections, wait for in-flight requests
// to drain, then exit cleanly so the platform can route traffic elsewhere
// before tearing down the old instance.
process.on("SIGTERM", () => {
  logger.info({ event: "sigterm_received", category: "api" });
  server.close(() => {
    logger.info({ event: "server_closed", category: "api" });
    process.exit(0);
  });
});
