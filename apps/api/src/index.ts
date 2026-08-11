import "dotenv/config";
import { createAdaptorServer } from "@hono/node-server";
import { createServer as httpCreateServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "common-typescript-utils";
import { app } from "./app.js";

const logger = createLogger("deejaytools-api");
const port = Number(process.env.PORT ?? "3001");

// Railway routes requests through Fastly, which has an idle write-timeout on
// inbound request bodies.  Any async work that happens before the Node.js
// server starts consuming the body (e.g. the Clerk JWKS network call inside
// requireAuth) causes backpressure in the Fastly buffer.  Once the idle
// deadline passes Fastly closes the TCP connection and the browser sees
// "TypeError: Failed to fetch" — no HTTP response is ever sent.
//
// Fix: drain the full body into memory the instant the TCP connection arrives,
// before @hono/node-server's middleware chain runs.  We stash the buffer on
// `req.rawBody`; @hono/node-server detects that property and uses it directly
// instead of re-reading the (now-exhausted) stream, so all existing body
// parsing (c.req.parseBody, c.req.json, etc.) continues to work unchanged.
const server = createAdaptorServer({
  fetch: app.fetch,
  createServer: ((_options: unknown, requestListener: (req: IncomingMessage, res: ServerResponse) => void) => {
    return httpCreateServer(async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      try {
        await new Promise<void>((resolve, reject) => {
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", resolve);
          req.on("error", reject);
        });
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (chunks.length > 0) {
        (req as IncomingMessage & { rawBody: Buffer }).rawBody = Buffer.concat(chunks);
      }
      requestListener(req, res);
    });
  }) as typeof httpCreateServer,
});

server.listen(port, "0.0.0.0", () => {
  logger.start("api_starting", { port });
});

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
