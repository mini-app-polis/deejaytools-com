const isProd = process.env.NODE_ENV === "production";

type Level = "debug" | "info" | "warn" | "error";

function ts() {
  return new Date().toISOString();
}

function formatDev(level: Level, message: string, meta?: Record<string, unknown>) {
  const prefix =
    level === "debug"
      ? "🔍 debug"
      : level === "info"
        ? "📋 info"
        : level === "warn"
          ? "⚠️ warn"
          : "❌ error";
  const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${prefix} ${message}${extra}`;
}

function logLine(level: Level, message: string, meta?: Record<string, unknown>) {
  if (isProd) {
    const line = JSON.stringify({
      level,
      message,
      timestamp: ts(),
      ...meta,
    });
    if (level === "error") console.error(line);
    else console.log(line);
  } else {
    const text = formatDev(level, message, meta);
    if (level === "error") console.error(text);
    else console.log(text);
  }
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    logLine("debug", message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    logLine("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    logLine("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    logLine("error", message, meta);
  },
  start(message: string, meta?: Record<string, unknown>) {
    if (isProd) logLine("info", message, { ...meta, lifecycle: "start" });
    else console.log(`🚀 ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
  },
  success(message: string, meta?: Record<string, unknown>) {
    if (isProd) logLine("info", message, { ...meta, lifecycle: "success" });
    else console.log(`✅ ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
  },
  failure(message: string, meta?: Record<string, unknown>) {
    if (isProd) logLine("error", message, { ...meta, lifecycle: "failure" });
    else console.error(`❌ ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
  },
};
