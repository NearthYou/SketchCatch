import type { FastifyInstance } from "fastify";
import { getDatabaseClient } from "../db/client.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok"
  }));

  app.get("/health/db", async () => {
    const { pool } = getDatabaseClient();
    await pool.query("select 1");

    return {
      status: "ok"
    };
  });
}
