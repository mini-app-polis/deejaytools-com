import * as Sentry from "@sentry/node";
import { CommonErrors, createLogger, error, success } from "common-typescript-utils";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { ZodError } from "zod";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { adminCheckinRoutes } from "./routes/admin-checkins.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { authRoutes } from "./routes/auth.js";
import { checkinRoutes } from "./routes/checkins.js";
import { eventRoutes } from "./routes/events.js";
import { legacySongRoutes } from "./routes/legacy-songs.js";
import { pairRoutes } from "./routes/pairs.js";
import { partnerRoutes } from "./routes/partners.js";
import { sessionRoutes } from "./routes/sessions.js";
import { queueRoutes } from "./routes/queue.js";
import { runRoutes } from "./routes/runs.js";
import { songRoutes } from "./routes/songs.js";
import { tickSessionStatuses } from "./services/cron.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { timeoutMiddleware } from "./middleware/timeout.js";

const logger = createLogger("deejaytools-api");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  enabled: !!process.env.SENTRY_DSN,
  // Tag every event with the deployed version so errors link back to a
  // specific release. Railway sets RAILWAY_DEPLOYMENT_ID per deploy; the
  // npm fallback uses the version semantic-release bumps in package.json.
  release:
    process.env.RAILWAY_DEPLOYMENT_ID ??
    process.env.npm_package_version,
});

export const app = new Hono();

const origins =
  process.env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? ["http://localhost:5173"];

app.use(
  "*",
  cors({
    origin: origins,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.use("*", honoLogger());

// Global request body cap — 11 MB covers the maximum song-chunk upload (10 MB
// of binary data + multipart envelope overhead) while rejecting truly oversized
// requests before any handler allocates memory for them.
app.use(
  "*",
  bodyLimit({
    maxSize: 11 * 1024 * 1024,
    onError: (c) => c.json(error("payload_too_large", "Request body exceeds the 11 MB limit."), 413),
  })
);

// Rate limiting: 300 requests per minute per IP across all /v1 routes.
// The /health and /internal/tick endpoints are exempt — they're not
// user-facing and would skew the counters unfairly.
// 300/min is ~5 req/s sustained, well above any normal polling pattern
// (admin page: ~23 req/min; regular user polling: ~6–12 req/min) but stops
// runaway clients or scripts from hammering the DB.
app.use("/v1/*", rateLimitMiddleware(300, 60_000));

// Hard 30-second deadline on all API routes.  Prevents a slow DB query or
// upstream call from holding the connection open indefinitely.
app.use("/v1/*", timeoutMiddleware(30_000));

// Liveness + readiness probe for Railway / uptime monitors.
// Returns 200 when the DB is reachable, 503 when it is not.
app.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "degraded", detail: "db_unreachable" }, 503);
  }
});

// Intentionally unversioned — Railway cron hits this at a stable path.
// Not public: gated by TICK_SECRET header when TICK_SECRET is set.
app.get("/internal/tick", async (c) => {
  // Guard against an empty-string TICK_SECRET: `secret && ...` would be falsy
  // for an empty string, bypassing the check entirely. Use `!== undefined`
  // so any defined value — including "" — is treated as a required secret.
  const secret = process.env.TICK_SECRET;
  if (secret !== undefined && c.req.header("x-tick-secret") !== secret) {
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
app.route("/v1/admin/checkins", adminCheckinRoutes);
app.route("/v1/admin/users", adminUserRoutes);
app.route("/v1/queue", queueRoutes);
app.route("/v1/runs", runRoutes);
app.route("/v1/pairs", pairRoutes);
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
