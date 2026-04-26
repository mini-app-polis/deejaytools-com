/**
 * Browser-side structured logger.
 *
 * Mirrors the event shape used by common-typescript-utils' Node logger
 * (timestamp, service, level, category, event, context) but writes to
 * console.* under the hood since the npm logger is Node-only.
 *
 * logger.error additionally forwards to Sentry — captureException when an
 * Error instance is present in `error`, captureMessage otherwise. This
 * gives logger.error parity with API-side createLogger, which routes
 * through Sentry via Sentry.captureException in app.ts onError.
 *
 * Do not call console.* directly anywhere else in apps/app/src — use
 * this wrapper.
 */
import * as Sentry from "@sentry/react";

export type LogCategory = "infra" | "pipeline" | "data" | "api";

export interface LogEvent {
  event: string;
  category: LogCategory;
  context?: Record<string, unknown>;
  error?: unknown;
}

export interface BrowserLogger {
  info: (e: LogEvent) => void;
  warn: (e: LogEvent) => void;
  error: (e: LogEvent) => void;
}

export function createLogger(service: string): BrowserLogger {
  const emit = (level: "INFO" | "WARN" | "ERROR", e: LogEvent) => {
    const payload = {
      timestamp: new Date().toISOString(),
      service,
      level,
      category: e.category,
      event: e.event,
      ...(e.context ? { context: e.context } : {}),
      ...(e.error !== undefined ? { error: e.error } : {}),
    };
    const fn = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.info;
    fn(payload);

    if (level === "ERROR") {
      const tags = { service, category: e.category, event: e.event };
      if (e.error instanceof Error) {
        Sentry.captureException(e.error, {
          tags,
          extra: e.context,
        });
      } else {
        Sentry.captureMessage(e.event, {
          level: "error",
          tags,
          extra: { ...(e.context ?? {}), ...(e.error !== undefined ? { error: e.error } : {}) },
        });
      }
    }
  };

  return {
    info: (e) => emit("INFO", e),
    warn: (e) => emit("WARN", e),
    error: (e) => emit("ERROR", e),
  };
}
