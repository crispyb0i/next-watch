import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

// `import.meta.env` in Astro, `process.env` when a plain node script (a test,
// a one-off) imports this module.
const sql = neon(import.meta.env?.DATABASE_URL ?? process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
