import { createLogger } from "common-typescript-utils";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const logger = createLogger("deejaytools-api");

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}

const poolMax = Number(process.env.DB_POOL_MAX ?? "20");

// connect_timeout: abort if a new connection isn't established within N seconds.
// idle_timeout:    close connections that have been idle for N seconds, freeing
//                  DB-side resources during quiet periods (e.g. overnight).
// Both are overridable via env so Railway / local dev can tune without redeploy.
const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT ?? "10");
const idleTimeout = Number(process.env.DB_IDLE_TIMEOUT ?? "30");

const client = postgres(url, {
  max: poolMax,
  connect_timeout: connectTimeout,
  idle_timeout: idleTimeout,
});
export const db = drizzle(client, { schema });
export { schema };

logger.start("db_connected", {
  max_connections: poolMax,
  connect_timeout: connectTimeout,
  idle_timeout: idleTimeout,
});
