import "dotenv/config";
import { serve } from "@hono/node-server";
import { createLogger } from "common-typescript-utils";
import { app } from "./app.js";

const logger = createLogger("deejaytools-api");
const port = Number(process.env.PORT ?? "3001");
logger.start("api_starting", { port });
serve({ fetch: app.fetch, port });
