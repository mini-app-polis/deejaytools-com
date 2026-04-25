/**
 * Browser-side structured logger.
 *
 * Mirrors the event shape used by common-typescript-utils' Node logger
 * (timestamp, service, level, category, event, context) but writes to
 * console.* under the hood since the npm logger is Node-only.
 *
 * This is the single place to swap in Sentry breadcrumbs / @sentry/react
 * capture once frontend observability is wired. Do not call console.*
 * directly anywhere else in apps/app/src — use this wrapper.
 */
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
  };

  return {
    info: (e) => emit("INFO", e),
    warn: (e) => emit("WARN", e),
    error: (e) => emit("ERROR", e),
  };
}
