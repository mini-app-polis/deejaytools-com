import * as Sentry from "@sentry/node";
import { CommonErrors, createLogger, success } from "common-typescript-utils";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { ZodError } from "zod";
import { db } from "./db/index.js";
import { adminCheckinRoutes } from "./routes/admin-checkins.js";
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
app.route("/v1/admin/checkins", adminCheckinRoutes);
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
