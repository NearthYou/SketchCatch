import type pg from "pg";
import {
  createPostgresMigrationRecoveryStoreFromPool,
  loadRuntimeMigrations,
  type AppliedMigrationRecord,
  type MigrationRecoveryStore,
  type RuntimeMigration
} from "./migration-recovery.js";

// db:migrate:runtime와 같은 작업 디렉터리를 사용해, 개발 실행과 번들 실행이 같은 journal을 봅니다.
export const runtimeMigrationsFolder = "./drizzle";

export type DatabaseMigrationState = "current" | "behind" | "diverged";

export type DatabaseMigrationStatus = {
  readonly appliedMigrationHead: string | null;
  readonly pendingMigrationCount: number;
  readonly pendingMigrationTags: readonly string[];
  readonly requiredMigrationHead: string | null;
  readonly state: DatabaseMigrationState;
  readonly unexpectedAppliedMigrationCount: number;
};

type ReadDatabaseMigrationStatusInput = {
  readonly migrations?: readonly RuntimeMigration[];
  readonly migrationsFolder?: string;
  readonly store: Pick<MigrationRecoveryStore, "listAppliedMigrations">;
};

type ReadPostgresDatabaseMigrationStatusOptions = Omit<
  ReadDatabaseMigrationStatusInput,
  "store"
>;

export class DatabaseMigrationRequiredError extends Error {
  readonly status: DatabaseMigrationStatus;

  constructor(status: DatabaseMigrationStatus) {
    const message =
      status.state === "behind"
        ? `Database schema is behind this API. Run \`pnpm --filter @sketchcatch/api db:migrate:runtime\` before starting the API. Pending migrations: ${status.pendingMigrationCount}. Required migration head: ${status.requiredMigrationHead ?? "none"}.`
        : `Database migration history does not match this API. Required migration head: ${status.requiredMigrationHead ?? "none"}. Applied contiguous head: ${status.appliedMigrationHead ?? "none"}. Unrecognized records: ${status.unexpectedAppliedMigrationCount}. Deploy the matching API revision or run the approved migration workflow before starting the API.`;

    super(message);
    this.name = "DatabaseMigrationRequiredError";
    this.status = status;
  }
}

export class DatabaseMigrationReadinessError extends Error {
  constructor() {
    super(
      "Database migration readiness could not be verified. Check database connectivity and migration history, then run `pnpm --filter @sketchcatch/api db:migrate:runtime` if migrations are pending."
    );
    this.name = "DatabaseMigrationReadinessError";
  }
}

export function getRequiredDatabaseMigrationHead(
  migrations: readonly RuntimeMigration[] = loadRuntimeMigrations(runtimeMigrationsFolder)
): string | null {
  return migrations.at(-1)?.tag ?? null;
}

export function getDatabaseMigrationStatus({
  appliedMigrations,
  migrations
}: {
  readonly appliedMigrations: readonly AppliedMigrationRecord[];
  readonly migrations: readonly RuntimeMigration[];
}): DatabaseMigrationStatus {
  const pendingMigrations = migrations.filter(
    (migration) => !isMigrationApplied(migration, appliedMigrations)
  );
  const unexpectedAppliedMigrationCount = appliedMigrations.filter(
    (appliedMigration) =>
      !migrations.some((migration) => isMigrationIdentityMatch(migration, appliedMigration))
  ).length;
  const appliedMigrationHead = getContiguousAppliedMigrationHead(migrations, appliedMigrations);
  const state: DatabaseMigrationState =
    pendingMigrations.length > 0
      ? "behind"
      : unexpectedAppliedMigrationCount > 0
        ? "diverged"
        : "current";

  return {
    appliedMigrationHead,
    pendingMigrationCount: pendingMigrations.length,
    pendingMigrationTags: pendingMigrations.map((migration) => migration.tag),
    requiredMigrationHead: getRequiredDatabaseMigrationHead(migrations),
    state,
    unexpectedAppliedMigrationCount
  };
}

export async function readDatabaseMigrationStatus(
  input: ReadDatabaseMigrationStatusInput
): Promise<DatabaseMigrationStatus> {
  const migrations =
    input.migrations ?? loadRuntimeMigrations(input.migrationsFolder ?? runtimeMigrationsFolder);
  const appliedMigrations = await input.store.listAppliedMigrations();

  return getDatabaseMigrationStatus({ appliedMigrations, migrations });
}

export async function readPostgresDatabaseMigrationStatus(
  pool: Pick<pg.Pool, "connect">,
  options: ReadPostgresDatabaseMigrationStatusOptions = {}
): Promise<DatabaseMigrationStatus> {
  return readDatabaseMigrationStatus({
    ...options,
    store: createPostgresMigrationRecoveryStoreFromPool(pool)
  });
}

export function assertDatabaseMigrationStatusCurrent(status: DatabaseMigrationStatus): void {
  if (status.state !== "current") {
    throw new DatabaseMigrationRequiredError(status);
  }
}

export async function assertPostgresDatabaseMigrationsCurrent(
  pool: Pick<pg.Pool, "connect">,
  options: ReadPostgresDatabaseMigrationStatusOptions = {}
): Promise<DatabaseMigrationStatus> {
  try {
    const status = await readPostgresDatabaseMigrationStatus(pool, options);
    assertDatabaseMigrationStatusCurrent(status);
    return status;
  } catch (error) {
    if (error instanceof DatabaseMigrationRequiredError) {
      throw error;
    }

    throw new DatabaseMigrationReadinessError();
  }
}

function getContiguousAppliedMigrationHead(
  migrations: readonly RuntimeMigration[],
  appliedMigrations: readonly AppliedMigrationRecord[]
): string | null {
  let head: string | null = null;

  for (const migration of migrations) {
    if (!isMigrationApplied(migration, appliedMigrations)) {
      break;
    }
    head = migration.tag;
  }

  return head;
}

function isMigrationApplied(
  migration: RuntimeMigration,
  appliedMigrations: readonly AppliedMigrationRecord[]
): boolean {
  return appliedMigrations.some((appliedMigration) =>
    isMigrationIdentityMatch(migration, appliedMigration)
  );
}

function isMigrationIdentityMatch(
  migration: RuntimeMigration,
  appliedMigration: AppliedMigrationRecord
): boolean {
  return (
    migration.hash === appliedMigration.hash || migration.folderMillis === appliedMigration.createdAt
  );
}
