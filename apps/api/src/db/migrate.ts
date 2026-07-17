import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDatabaseClient, getDatabaseClient } from "./client.js";
import { normalizeMigrationJournalFile } from "./migration-metadata.js";
import {
  createPostgresMigrationRecoveryStoreFromPool,
  loadRuntimeMigrations,
  repairKnownSkippedMigrations
} from "./migration-recovery.js";

const migrationsFolder = "./drizzle";

async function runMigrations(): Promise<void> {
  const { db, pool } = getDatabaseClient();

  normalizeMigrationJournalFile();

  const repairedTags = await repairKnownSkippedMigrations({
    migrations: loadRuntimeMigrations(migrationsFolder),
    store: createPostgresMigrationRecoveryStoreFromPool(pool)
  });
  for (const tag of repairedTags) {
    console.log(`Recovered skipped database migration: ${tag}`);
  }

  await migrate(db, {
    migrationsFolder
  });

  await closeDatabaseClient();

  console.log("Database migrations completed");
}

runMigrations().catch(async (error) => {
  console.error(error);
  await closeDatabaseClient();
  process.exit(1);
});
