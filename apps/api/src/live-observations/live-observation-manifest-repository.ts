import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import type {
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestStatus,
  DeploymentLiveObservationManifestV2
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { deploymentLiveObservationManifests } from "../db/schema.js";
import { parseDeploymentLiveObservationManifestV2 } from "./live-observation-manifest.js";

const genericInvalidReason = "Live Observation manifest verification failed.";
const persistenceConflictMessage = "Live Observation manifest immutable persistence conflict";

export class LiveObservationManifestPersistenceConflictError extends Error {
  constructor() {
    super(persistenceConflictMessage);
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationManifestPersistenceConflictError"
    });
  }
}

export type DeploymentLiveObservationManifestRepository = {
  findByDeploymentId(deploymentId: string): Promise<DeploymentLiveObservationManifestRecord | null>;
  saveValid(
    manifest: DeploymentLiveObservationManifestV2
  ): Promise<DeploymentLiveObservationManifestRecord>;
  saveInvalid(input: {
    deploymentId: string;
    reason: string;
  }): Promise<DeploymentLiveObservationManifestRecord>;
};

type DeploymentLiveObservationManifestDatabaseRow =
  typeof deploymentLiveObservationManifests.$inferSelect;

type DeploymentLiveObservationManifestPersistenceValues = {
  deploymentId: string;
  schemaVersion: 2;
  status: DeploymentLiveObservationManifestStatus;
  manifest: DeploymentLiveObservationManifestV2 | null;
  invalidReason: string | null;
};

export function createPostgresDeploymentLiveObservationManifestRepository(
  db: Database
): DeploymentLiveObservationManifestRepository {
  async function insertManifestRecord(
    values: DeploymentLiveObservationManifestPersistenceValues
  ): Promise<DeploymentLiveObservationManifestDatabaseRow | undefined> {
    const [row] = await db
      .insert(deploymentLiveObservationManifests)
      .values(values)
      .onConflictDoNothing({
        target: deploymentLiveObservationManifests.deploymentId
      })
      .returning();
    return row;
  }

  async function findDatabaseRow(deploymentId: string) {
    const [row] = await db
      .select()
      .from(deploymentLiveObservationManifests)
      .where(eq(deploymentLiveObservationManifests.deploymentId, deploymentId))
      .limit(1);
    return row;
  }

  async function replaceInvalidWithValid(
    values: DeploymentLiveObservationManifestPersistenceValues
  ): Promise<DeploymentLiveObservationManifestDatabaseRow | undefined> {
    const [row] = await db
      .update(deploymentLiveObservationManifests)
      .set({
        schemaVersion: values.schemaVersion,
        status: values.status,
        manifest: values.manifest,
        invalidReason: values.invalidReason,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(deploymentLiveObservationManifests.deploymentId, values.deploymentId),
          eq(deploymentLiveObservationManifests.status, "manifest_invalid")
        )
      )
      .returning();
    return row;
  }

  return {
    async findByDeploymentId(deploymentId) {
      const row = await findDatabaseRow(deploymentId);

      return row ? toManifestRecord(row) : null;
    },

    async saveValid(manifest) {
      const verifiedManifest = parseDeploymentLiveObservationManifestV2(manifest);
      const values: DeploymentLiveObservationManifestPersistenceValues = {
        deploymentId: verifiedManifest.provenance.deploymentId,
        schemaVersion: 2,
        status: "valid",
        manifest: verifiedManifest,
        invalidReason: null
      };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const replaced = await replaceInvalidWithValid(values);
        if (replaced) return requireManifestRecord(replaced);

        const inserted = await insertManifestRecord(values);
        if (inserted) return requireManifestRecord(inserted);

        const existing = await findDatabaseRow(values.deploymentId);
        if (existing && isIdenticalManifestRecord(existing, values)) {
          return toManifestRecord(existing);
        }
        if (existing && existing.status !== "manifest_invalid") {
          throw new LiveObservationManifestPersistenceConflictError();
        }
      }

      const winner = await findDatabaseRow(values.deploymentId);
      if (winner && isIdenticalManifestRecord(winner, values)) {
        return toManifestRecord(winner);
      }
      throw new LiveObservationManifestPersistenceConflictError();
    },

    async saveInvalid(input) {
      const reason = sanitizeInvalidReason(input.reason);

      if (!reason) {
        throw new Error("Live Observation manifest invalid reason must not be empty");
      }

      const values: DeploymentLiveObservationManifestPersistenceValues = {
        deploymentId: input.deploymentId,
        schemaVersion: 2,
        status: "manifest_invalid",
        manifest: null,
        invalidReason: reason
      };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const [refreshed] = await db
          .update(deploymentLiveObservationManifests)
          .set({ updatedAt: new Date() })
          .where(
            and(
              eq(deploymentLiveObservationManifests.deploymentId, input.deploymentId),
              eq(deploymentLiveObservationManifests.status, "manifest_invalid")
            )
          )
          .returning();
        if (refreshed) return requireManifestRecord(refreshed);

        const inserted = await insertManifestRecord(values);
        if (inserted) return requireManifestRecord(inserted);

        const existing = await findDatabaseRow(values.deploymentId);
        if (existing && isIdenticalManifestRecord(existing, values)) {
          return toManifestRecord(existing);
        }
        if (existing) throw new LiveObservationManifestPersistenceConflictError();
      }

      throw new LiveObservationManifestPersistenceConflictError();
    }
  };
}

function isIdenticalManifestRecord(
  row: DeploymentLiveObservationManifestDatabaseRow,
  values: DeploymentLiveObservationManifestPersistenceValues
): boolean {
  return (
    row.deploymentId === values.deploymentId &&
    row.schemaVersion === values.schemaVersion &&
    row.status === values.status &&
    row.invalidReason === values.invalidReason &&
    isDeepStrictEqual(row.manifest, values.manifest)
  );
}

function sanitizeInvalidReason(reason: string): string {
  if (!reason.trim()) {
    return "";
  }

  return genericInvalidReason;
}

function requireManifestRecord(
  row: DeploymentLiveObservationManifestDatabaseRow | undefined
): DeploymentLiveObservationManifestRecord {
  if (!row) {
    throw new Error("Live Observation manifest upsert returned no row");
  }

  return toManifestRecord(row);
}

function toManifestRecord(
  row: DeploymentLiveObservationManifestDatabaseRow
): DeploymentLiveObservationManifestRecord {
  if (row.schemaVersion !== 2) {
    throw new Error("Live Observation manifest row has an unsupported schema version");
  }

  if (row.status === "valid") {
    if (row.invalidReason !== null) {
      throw new Error("Valid Live Observation manifest row must not have an invalid reason");
    }

    const manifest = parseDeploymentLiveObservationManifestV2(row.manifest);

    if (manifest.provenance.deploymentId !== row.deploymentId) {
      throw new Error("Live Observation manifest deployment provenance does not match its row");
    }

    return {
      deploymentId: row.deploymentId,
      schemaVersion: 2,
      status: "valid",
      manifest,
      invalidReason: null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  const invalidReason = row.invalidReason?.trim() ?? "";

  if (row.manifest !== null || !invalidReason) {
    throw new Error("Invalid Live Observation manifest row violates persistence invariants");
  }

  return {
    deploymentId: row.deploymentId,
    schemaVersion: 2,
    status: "manifest_invalid",
    manifest: null,
    invalidReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
