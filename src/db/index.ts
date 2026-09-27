import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

config({ path: ".env.local" });
config({ path: ".env" });

function connectionString(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "Missing DATABASE_URL. Copy .env.example to .env and paste the Neon connection string.",
    );
  }
  return value;
}

// Next.js hot reload re-evaluates modules, so the client is cached on
// globalThis to avoid opening a new connection pool on every edit.
const globalForDb = globalThis as unknown as { snapvibeSql?: postgres.Sql };

const sql = globalForDb.snapvibeSql ?? postgres(connectionString(), {
  max: 5,
  // Neon requires TLS; prepared statements keep repeated queries cheap.
  prepare: true,
  idle_timeout: 20,
  connect_timeout: 15,
});

if (process.env.NODE_ENV !== "production") {
  globalForDb.snapvibeSql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
