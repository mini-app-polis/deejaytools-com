import "dotenv/config";
import * as Sentry from "@sentry/node";
import { serve } from "@hono/node-server";
import {
  CommonErrors,
  createLogger,
  success,
} from "@deejaytools/ts-utils";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { ZodError } from "zod";
import { db } from "./db/index.js";
import { authRoutes } from "./routes/auth.js";
import { checkinRoutes } from "./routes/checkins.js";
import { eventRoutes } from "./routes/events.js";
import { partnerRoutes } from "./routes/partners.js";
import { sessionRoutes } from "./routes/sessions.js";
import { slotRoutes } from "./routes/slots.js";
import { songRoutes } from "./routes/songs.js";
import { tickSessionStatuses } from "./services/cron.js";

const logger = createLogger("deejaytools-api");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  enabled: !!process.env.SENTRY_DSN,
});

const app = new Hono();

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

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/internal/tick", async (c) => {
  const secret = process.env.TICK_SECRET;
  if (secret && c.req.header("x-tick-secret") !== secret) {
    return c.json(CommonErrors.forbidden(), 403);
  }
  await tickSessionStatuses(db);
  return c.json(success({ ticked: true }));
});

app.route("/v1/auth", authRoutes);
app.route("/v1/events", eventRoutes);
app.route("/v1/sessions", sessionRoutes);
app.route("/v1/checkins", checkinRoutes);
app.route("/v1/slots", slotRoutes);
app.route("/v1/partners", partnerRoutes);
app.route("/v1/songs", songRoutes);

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

const port = Number(process.env.PORT ?? "3001");
logger.start("api_starting", { port });
serve({ fetch: app.fetch, port });
