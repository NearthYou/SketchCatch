import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type pg from "pg";

const skippedReleasePlaneMigrationTag = "0044_github_codebuild_release_plane";

export type RuntimeMigration = {
  readonly folderMillis: number;
  readonly hash: string;
  readonly sql: readonly string[];
  readonly tag: string;
};

export type AppliedMigrationRecord = {
  readonly createdAt: number;
  readonly hash: string;
};

export type MigrationRecoveryStore = {
  readonly applyMigration: (migration: RuntimeMigration) => Promise<void>;
  readonly listAppliedMigrations: () => Promise<readonly AppliedMigrationRecord[]>;
};

type PlanKnownSkippedMigrationRepairsInput = {
  readonly appliedMigrations: readonly AppliedMigrationRecord[];
  readonly migrations: readonly RuntimeMigration[];
};

export function planKnownSkippedMigrationRepairs({
  appliedMigrations,
  migrations
}: PlanKnownSkippedMigrationRepairsInput): RuntimeMigration[] {
  const releasePlaneMigration = migrations.find(
    (migration) => migration.tag === skippedReleasePlaneMigrationTag
  );
  if (!releasePlaneMigration || appliedMigrations.length === 0) {
    return [];
  }

  const latestAppliedAt = Math.max(...appliedMigrations.map((migration) => migration.createdAt));
  const wasAlreadyApplied = appliedMigrations.some(
    (migration) =>
      migration.hash === releasePlaneMigration.hash ||
      migration.createdAt === releasePlaneMigration.folderMillis
  );

  if (wasAlreadyApplied || latestAppliedAt <= releasePlaneMigration.folderMillis) {
    return [];
  }

  return [releasePlaneMigration];
}

type RepairKnownSkippedMigrationsInput = {
  readonly migrations: readonly RuntimeMigration[];
  readonly store: MigrationRecoveryStore;
};

export async function repairKnownSkippedMigrations({
  migrations,
  store
}: RepairKnownSkippedMigrationsInput): Promise<string[]> {
  const repairs = planKnownSkippedMigrationRepairs({
    appliedMigrations: await store.listAppliedMigrations(),
    migrations
  });

  for (const migration of repairs) {
    await store.applyMigration(migration);
  }

  return repairs.map((migration) => migration.tag);
}

export function loadRuntimeMigrations(migrationsFolder: string): RuntimeMigration[] {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")
  ) as { entries?: Array<{ tag?: unknown }> };
  const journalEntries = journal.entries;
  const migrationFiles = readMigrationFiles({ migrationsFolder });

  if (!journalEntries || journalEntries.length !== migrationFiles.length) {
    throw new Error("Migration journal does not match the runtime migration files");
  }

  return migrationFiles.map((migration, index) => {
    const tag = journalEntries[index]?.tag;
    if (typeof tag !== "string" || tag.length === 0) {
      throw new Error(`Migration journal entry ${index} does not have a tag`);
    }

    return {
      folderMillis: migration.folderMillis,
      hash: migration.hash,
      sql: migration.sql,
      tag
    };
  });
}

type MigrationRecoveryQueryResult = {
  readonly rows: readonly Record<string, unknown>[];
};

type MigrationRecoveryClient = {
  readonly query: (
    text: string,
    values?: readonly unknown[]
  ) => Promise<MigrationRecoveryQueryResult>;
  readonly release: () => void;
};

type ConnectMigrationRecoveryClient = () => Promise<MigrationRecoveryClient>;

export function createPostgresMigrationRecoveryStore(
  connect: ConnectMigrationRecoveryClient
): MigrationRecoveryStore {
  return {
    async listAppliedMigrations() {
      const client = await connect();
      try {
        const tableResult = await client.query(
          "SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_table"
        );
        if (tableResult.rows[0]?.migration_table == null) {
          return [];
        }

        const result = await client.query(
          "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC"
        );
        return result.rows.map((row) => {
          const createdAt = Number(row.created_at);
          if (typeof row.hash !== "string" || !Number.isSafeInteger(createdAt)) {
            throw new Error("Invalid Drizzle migration history record");
          }

          return { createdAt, hash: row.hash };
        });
      } finally {
        client.release();
      }
    },
    async applyMigration(migration) {
      const client = await connect();
      try {
        await client.query("BEGIN");
        for (const statement of migration.sql) {
          if (statement.trim().length > 0) {
            await client.query(statement);
          }
        }
        await client.query(
          'INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)',
          [migration.hash, migration.folderMillis]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export function createPostgresMigrationRecoveryStoreFromPool(
  pool: Pick<pg.Pool, "connect">
): MigrationRecoveryStore {
  return createPostgresMigrationRecoveryStore(async () => {
    const client = await pool.connect();
    return {
      async query(text, values) {
        const result = await client.query(text, values ? [...values] : undefined);
        return { rows: result.rows };
      },
      release() {
        client.release();
      }
    };
  });
}
