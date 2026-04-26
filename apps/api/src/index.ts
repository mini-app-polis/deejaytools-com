import "dotenv/config";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "common-typescript-utils";
import { app } from "./app.js";

const logger = createLogger("deejaytools-api");
const port = Number(process.env.PORT ?? "3001");

// Use a raw Node.js HTTP server instead of @hono/node-server so we can
// drain the full request body at the TCP level the instant a connection is
// accepted — before Hono's middleware chain starts. Railway's Fastly edge
// proxy has an idle write timeout (~800ms) on inbound request bodies; any
// async work (auth, DB queries) that runs before the body is consumed causes
// the proxy to drop the connection and the browser to see ERR_TIMED_OUT.
createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Step 1 — drain body immediately.
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
  const bodyBuffer = Buffer.concat(chunks);

  // Step 2 — build a Web API Request for Hono.
  const proto = ((req.headers["x-forwarded-proto"] as string | undefined) ?? "http").split(",")[0].trim();
  const host = req.headers.host ?? `localhost:${port}`;
  const url = `${proto}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const v of val) headers.append(key, v);
    } else {
      headers.set(key, val);
    }
  }

  const webReq = new Request(url, {
    method: req.method ?? "GET",
    headers,
    body: bodyBuffer.length > 0 ? bodyBuffer : null,
    duplex: "half",
  });

  // Step 3 — hand off to Hono.
  let webRes: Response;
  try {
    webRes = await app.fetch(webReq);
  } catch (err) {
    logger.error({ event: "fetch_error", category: "api", error: err });
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }));
    return;
  }

  // Step 4 — write response. Skip headers Node manages automatically.
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "transfer-encoding" || k === "content-length") return;
    res.setHeader(key, value);
  });

  const responseBody = await webRes.arrayBuffer();
  res.end(Buffer.from(responseBody));
}).listen(port, "0.0.0.0", () => {
  logger.start("api_starting", { port });
});