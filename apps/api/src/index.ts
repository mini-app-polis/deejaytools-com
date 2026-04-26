import "dotenv/config";
import { createAdaptorServer } from "@hono/node-server";
import { createServer as httpCreateServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "common-typescript-utils";
import { app } from "./app.js";

const logger = createLogger("deejaytools-api");
const port = Number(process.env.PORT ?? "3001");

// Use createAdaptorServer with a custom createServer so we can drain the full
// request body at the TCP level the instant a connection is accepted — before
// @hono/node-server's middleware chain starts. Railway's Fastly edge proxy has
// an idle write timeout on inbound request bodies; any async work (auth, DB
// queries) that runs before the body is consumed causes backpressure that makes
// Fastly drop the connection and the browser see ERR_TIMED_OUT.
//
// @hono/node-server checks for `incoming.rawBody` (a Buffer) and uses it
// directly instead of reading from the (now-exhausted) stream, so headers,
// URL construction, and auth all continue to work exactly as normal.
const server = createAdaptorServer({
  fetch: app.fetch,
  createServer: (_options: object, requestListener: (req: IncomingMessage, res: ServerResponse) => void) => {
    return httpCreateServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Drain body immediately at TCP level.
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

      // Stash buffer so @hono/node-server uses it instead of the exhausted stream.
      if (chunks.length > 0) {
        (req as IncomingMessage & { rawBody: Buffer }).rawBody = Buffer.concat(chunks);
      }

      requestListener(req, res);
    });
  },
});

server.listen(port, "0.0.0.0", () => {
  logger.start("api_starting", { port });
});
