import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDatabaseClient, getDatabaseClient } from "./client.js";

async function runMigrations(): Promise<void> {
  const { db } = getDatabaseClient();

  await migrate(db, {
    migrationsFolder: "./drizzle"
  });

  await closeDatabaseClient();

  console.log("Database migrations completed");
}

runMigrations().catch(async (error) => {
  console.error(error);
  await closeDatabaseClient();
  process.exit(1);
});
