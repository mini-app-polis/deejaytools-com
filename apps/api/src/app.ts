import * as Sentry from "@sentry/node";
import { CommonErrors, createLogger, success } from "common-typescript-utils";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { ZodError } from "zod";
import { db } from "./db/index.js";
import { authRoutes } from "./routes/auth.js";
import { checkinRoutes } from "./routes/checkins.js";
import { eventRoutes } from "./routes/events.js";
import { legacySongRoutes } from "./routes/legacy-songs.js";
import { partnerRoutes } from "./routes/partners.js";
import { sessionRoutes } from "./routes/sessions.js";
import { queueRoutes } from "./routes/queue.js";
import { songRoutes } from "./routes/songs.js";
import { tickSessionStatuses } from "./services/cron.js";

const logger = createLogger("deejaytools-api");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  enabled: !!process.env.SENTRY_DSN,
});

export const app = new Hono();

const origins =
  process.env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? ["http://localhost:5173"];

// Must be first: eagerly drain the request body so Railway's Fastly edge proxy
// never hits its idle write timeout. @hono/node-server wraps IncomingMessage in
// a lazy ReadableStream — if auth or DB work runs before the body is consumed,
// Fastly's write timeout fires on slow connections and the client sees
// ERR_TIMED_OUT. Cloning and draining in the background starts the underlying
// socket flowing immediately without blocking the middleware chain or consuming
// the body for downstream handlers.
app.use("*", async (c, next) => {
  if (c.req.raw.body) {
    try {
      const clone = c.req.raw.clone();
      clone.arrayBuffer().catch(() => {});
    } catch {
      // ignore — drain is best-effort
    }
  }
  await next();
});

app.use(
  "*",
  cors({
    origin: origins,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.use("*", honoLogger());

// Intentionally public — liveness probe for load balancers and uptime monitors.
app.get("/health", (c) => c.json({ status: "ok" }));

// Intentionally unversioned — Railway cron hits this at a stable path.
// Not public: gated by TICK_SECRET header when TICK_SECRET is set.
app.get("/internal/tick", async (c) => {
  const secret = process.env.TICK_SECRET;
  if (secret && c.req.header("x-tick-secret") !== secret) {
    return c.json(CommonErrors.forbidden(), 403);
  }
  await tickSessionStatuses(db);
  return c.json(success({ ticked: true }));
});

// Auth-required — all /v1 sub-routers apply Clerk JWT verification
// via `requireAuth` middleware, except the explicit public paths noted below.
app.route("/v1/auth", authRoutes);
app.route("/v1/events", eventRoutes);
app.route("/v1/sessions", sessionRoutes);
app.route("/v1/checkins", checkinRoutes);
app.route("/v1/queue", queueRoutes);
app.route("/v1/partners", partnerRoutes);
app.route("/v1/songs", songRoutes);
// Intentionally public — read-only historical catalog, no user data.
app.route("/v1/legacy-songs", legacySongRoutes);

app.notFound((c) => c.json(CommonErrors.notFound(), 404));

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json(CommonErrors.validationError(err.issues), 400);
  }
  Sentry.captureException(err);
  logger.error({
    event: "unhandled_error",
    category: "api",
    error: err,
  });
  return c.json(CommonErrors.internalError(), 500);
});
