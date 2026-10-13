import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import type { Environment } from "./config.ts";
export function database(env: Environment) {
  const connection = new URL(env.DATABASE_URL);
  if (env.NODE_ENV === "production")
    for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      connection.searchParams.delete(parameter);
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pool = new Pool({
    connectionString: connection.toString(),
    max: 8,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    ssl:
      env.NODE_ENV === "production"
        ? {
            rejectUnauthorized: true,
            ca: readFileSync(
              new URL(
                "../../../certs/supabase-prod-ca-2021.crt",
                import.meta.url,
              ),
              "utf8",
            ),
          }
        : undefined,
  });
  const scoped = (token: string) =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return { admin, pool, scoped };
}
