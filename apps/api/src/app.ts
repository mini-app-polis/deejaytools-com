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
import { adminEventSubmissionRoutes } from "./routes/admin-event-submissions.js";
import { adminSongRoutes } from "./routes/admin-songs.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { authRoutes } from "./routes/auth.js";
import { checkinRoutes } from "./routes/checkins.js";
import { eventRoutes } from "./routes/events.js";
import { pairRoutes } from "./routes/pairs.js";
import { partnerRoutes } from "./routes/partners.js";
import { sessionRoutes } from "./routes/sessions.js";
import { queueRoutes } from "./routes/queue.js";
import { runRoutes } from "./routes/runs.js";
import { songRoutes } from "./routes/songs.js";
import { teamsRoutes } from "./routes/teams.js";
import { managedPartnershipsRoutes } from "./routes/managed-partnerships.js";
import { eventSongSubmissionRoutes } from "./routes/event-song-submissions.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { fillRunningSessions, tickSessionStatuses } from "./services/cron.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { timeoutMiddleware } from "./middleware/timeout.js";

const logger = createLogger("deejaytools-api");

// Sentry is initialised in instrument.ts, loaded via `node --import`
// before this module runs.  This import is kept here only for captureException.

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
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
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

// Hard deadline on all API routes.  Prevents a slow DB query or upstream call
// from holding the connection open indefinitely.  Upload routes get a 5-minute
// budget because the final chunk triggers a Google Drive upload that can
// legitimately take longer than 30 s for large files.  All other routes get 30 s.
//
// IMPORTANT: register as a single middleware on /v1/* so that only one timeout
// is ever in the middleware chain for a given request.  Two separate app.use()
// registrations (one for uploads, one for /v1/*) would BOTH match upload paths
// and the inner 30-second rule would still win, defeating the longer budget.
app.use("/v1/*", (c, next) => {
  const ms = c.req.path.startsWith("/v1/songs/upload/") ? 300_000 : 30_000;
  return timeoutMiddleware(ms)(c, next);
});

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
  await fillRunningSessions(db);
  return c.json(success({ ticked: true }));
});

// Auth-required — all /v1 sub-routers apply Clerk JWT verification
// via `requireAuth` middleware, except the explicit public paths noted below.
app.route("/v1/auth", authRoutes);
app.route("/v1/events", eventRoutes);
app.route("/v1/sessions", sessionRoutes);
app.route("/v1/checkins", checkinRoutes);
app.route("/v1/admin/checkins", adminCheckinRoutes);
  app.route("/v1/admin/songs", adminSongRoutes);
  app.route("/v1/admin/event-song-submissions", adminEventSubmissionRoutes);
  app.route("/v1/admin/users", adminUserRoutes);
app.route("/v1/queue", queueRoutes);
app.route("/v1/runs", runRoutes);
app.route("/v1/pairs", pairRoutes);
app.route("/v1/partners", partnerRoutes);
app.route("/v1/teams", teamsRoutes);
app.route("/v1/managed-partnerships", managedPartnershipsRoutes);
app.route("/v1/event-song-submissions", eventSongSubmissionRoutes);
app.route("/v1/songs", songRoutes);
// Intentionally public — unauthenticated feedback submissions.
app.route("/v1/feedback", feedbackRoutes);

app.notFound((c) => c.json(CommonErrors.notFound(), 404));

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json(CommonErrors.validationError(err.issues), 400);
  }
  Sentry.captureException(err);
  logger.error({
    event: "unhandled_error",
    category: "api",
    context: { path: c.req.path, method: c.req.method },
    error: err,
  });
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : String(err);
  return c.json(CommonErrors.internalError(message), 500);
});
