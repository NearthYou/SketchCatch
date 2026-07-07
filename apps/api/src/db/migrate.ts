import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDatabaseClient, getDatabaseClient } from "./client.js";
import { normalizeMigrationJournalFile } from "./migration-metadata.js";

async function runMigrations(): Promise<void> {
  const { db } = getDatabaseClient();

  normalizeMigrationJournalFile();

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
