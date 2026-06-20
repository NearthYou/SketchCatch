import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getRuntimeEnv, requireDatabaseUrl } from "../config/env.js";
import * as schema from "./schema.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseClient = {
  db: Database;
  pool: pg.Pool;
};

let client: DatabaseClient | undefined;

export function getDatabaseClient(): DatabaseClient {
  if (client) {
    return client;
  }

  const env = getRuntimeEnv();
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined
  });

  client = {
    db: drizzle(pool, { schema }),
    pool
  };

  return client;
}

export async function closeDatabaseClient(): Promise<void> {
  if (!client) {
    return;
  }

  await client.pool.end();
  client = undefined;
}
