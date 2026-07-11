import { eq } from "drizzle-orm";
import type {
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestStatus,
  DeploymentLiveObservationManifestV2
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  deploymentLiveObservationManifests,
  touchUpdatedAt
} from "../db/schema.js";
import { parseDeploymentLiveObservationManifestV2 } from "./live-observation-manifest.js";

const genericInvalidReason = "Live Observation manifest verification failed.";

export type DeploymentLiveObservationManifestRepository = {
  findByDeploymentId(
    deploymentId: string
  ): Promise<DeploymentLiveObservationManifestRecord | null>;
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
  async function upsertManifestRecord(
    values: DeploymentLiveObservationManifestPersistenceValues
  ): Promise<DeploymentLiveObservationManifestRecord> {
    const [row] = await db
      .insert(deploymentLiveObservationManifests)
      .values(values)
      .onConflictDoUpdate({
        target: deploymentLiveObservationManifests.deploymentId,
        set: {
          schemaVersion: values.schemaVersion,
          status: values.status,
          manifest: values.manifest,
          invalidReason: values.invalidReason,
          ...touchUpdatedAt
        }
      })
      .returning();

    return requireManifestRecord(row);
  }

  return {
    async findByDeploymentId(deploymentId) {
      const [row] = await db
        .select()
        .from(deploymentLiveObservationManifests)
        .where(eq(deploymentLiveObservationManifests.deploymentId, deploymentId))
        .limit(1);

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

      return upsertManifestRecord(values);
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

      return upsertManifestRecord(values);
    }
  };
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
