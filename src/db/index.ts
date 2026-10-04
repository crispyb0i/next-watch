import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

// `import.meta.env` in Astro, `process.env` when a plain node script (a test,
// a one-off) imports this module.
const databaseUrl = import.meta.env?.DATABASE_URL ?? process.env.DATABASE_URL!;
const testEndpoint = process.env.NEXT_WATCH_E2E_NEON_ENDPOINT;
if (testEndpoint) {
  const endpoint = new URL(testEndpoint);
  const database = new URL(databaseUrl);
  if (
    process.env.NEXT_WATCH_E2E !== "1" ||
    process.env.NODE_ENV === "production" ||
    !(import.meta.env?.DEV || process.env.NODE_ENV === "test") ||
    endpoint.protocol !== "http:" ||
    endpoint.hostname !== "127.0.0.1" ||
    endpoint.username ||
    endpoint.password ||
    database.hostname !== "127.0.0.1" ||
    !/^\/next_watch_e2e_[a-f0-9]{32}$/.test(database.pathname)
  )
    throw new Error(
      "The E2E database transport requires an isolated local test",
    );
  neonConfig.fetchEndpoint = testEndpoint;
}
const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });
