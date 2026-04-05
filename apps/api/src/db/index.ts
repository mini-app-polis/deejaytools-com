import { createLogger } from "common-typescript-utils";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const logger = createLogger("deejaytools-api");

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}

const client = postgres(url, { max: 10 });
export const db = drizzle(client, { schema });
export { schema };

logger.start("db_connected", { max_connections: 10 });
