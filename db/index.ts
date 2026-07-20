import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Neon serverless (HTTP) driver + Drizzle. Suitable for Vercel serverless
 * functions: each query is a stateless HTTP round-trip, so there's no
 * connection pool to exhaust across many concurrent invocations.
 *
 * Instantiated lazily via a Proxy so that merely importing `db` never touches
 * `DATABASE_URL` — only actual query calls do. This keeps `next build` and
 * modules that import the schema working even when env vars aren't present.
 */
let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const sql = neon(env.DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const instance = getDb();
    const value = instance[prop as keyof typeof instance];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
