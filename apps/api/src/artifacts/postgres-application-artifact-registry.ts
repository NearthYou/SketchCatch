import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ApplicationArtifact } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { applicationArtifacts } from "../db/schema.js";
import type {
  ApplicationArtifactClaim,
  ApplicationArtifactRegistryRepository
} from "./application-artifact-registry.js";

export type ApplicationArtifactRecord = typeof applicationArtifacts.$inferSelect;

export class ApplicationArtifactRegistryPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationArtifactRegistryPersistenceError";
  }
}

export function createPostgresApplicationArtifactRegistryRepository(
  db: Database,
  generateId: () => string = randomUUID,
  generateClaimToken: () => string = randomUUID
): ApplicationArtifactRegistryRepository {
  return {
    async acquire(input) {
      return db.transaction(async (transaction) => {
        const [active] = await transaction
          .select()
          .from(applicationArtifacts)
          .where(
            and(
              eq(applicationArtifacts.projectId, input.projectId),
              eq(applicationArtifacts.artifactFingerprint, input.identity.artifactFingerprint),
              inArray(applicationArtifacts.status, ["building", "available"])
            )
          )
          .orderBy(desc(applicationArtifacts.createdAt), desc(applicationArtifacts.id))
          .limit(1)
          .for("update");

        if (active) {
          return resolveActiveRecord({
            record: active,
            sourceRepositoryId: input.sourceRepositoryId,
            identity: input.identity,
            now: input.now,
            leaseDurationMs: input.leaseDurationMs,
            generateClaimToken,
            update: async (values) => {
              const [updated] = await transaction
                .update(applicationArtifacts)
                .set(values)
                .where(
                  and(
                    eq(applicationArtifacts.id, active.id),
                    eq(applicationArtifacts.projectId, input.projectId),
                    eq(applicationArtifacts.status, "building")
                  )
                )
                .returning();
              return updated;
            }
          });
        }

        const artifactId = generateId();
        const claimToken = generateClaimToken();
        const leaseExpiresAt = new Date(input.now.getTime() + input.leaseDurationMs);
        const [inserted] = await transaction
          .insert(applicationArtifacts)
          .values({
            id: artifactId,
            projectId: input.projectId,
            sourceRepositoryId: input.sourceRepositoryId,
            ...input.identity,
            status: "building",
            claimTokenSha256: hashClaimToken(claimToken),
            claimExpiresAt: leaseExpiresAt,
            createdAt: input.now,
            updatedAt: input.now
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          return {
            outcome: "claimed" as const,
            claim: toClaim(inserted, claimToken)
          };
        }

        const [concurrent] = await transaction
          .select()
          .from(applicationArtifacts)
          .where(
            and(
              eq(applicationArtifacts.projectId, input.projectId),
              eq(applicationArtifacts.artifactFingerprint, input.identity.artifactFingerprint),
              inArray(applicationArtifacts.status, ["building", "available"])
            )
          )
          .limit(1)
          .for("update");
        if (!concurrent) {
          throw new ApplicationArtifactRegistryPersistenceError(
            "Application artifact claim conflicted without an active row"
          );
        }

        return resolveActiveRecord({
          record: concurrent,
          sourceRepositoryId: input.sourceRepositoryId,
          identity: input.identity,
          now: input.now,
          leaseDurationMs: input.leaseDurationMs,
          generateClaimToken,
          update: async (values) => {
            const [updated] = await transaction
              .update(applicationArtifacts)
              .set(values)
              .where(
                and(
                  eq(applicationArtifacts.id, concurrent.id),
                  eq(applicationArtifacts.projectId, input.projectId),
                  eq(applicationArtifacts.status, "building")
                )
              )
              .returning();
            return updated;
          }
        });
      });
    },

    async invalidate(input) {
      const [updated] = await db
        .update(applicationArtifacts)
        .set({
          status: "invalid",
          failureReason: input.reason.slice(0, 512),
          updatedAt: input.invalidatedAt
        })
        .where(
          and(
            eq(applicationArtifacts.id, input.artifactId),
            eq(applicationArtifacts.projectId, input.projectId),
            eq(applicationArtifacts.status, "available")
          )
        )
        .returning({ id: applicationArtifacts.id });
      requireWrittenRecord(updated, "Application artifact was not invalidated");
    },

    async renew(input) {
      const leaseExpiresAt = new Date(input.renewedAt.getTime() + input.leaseDurationMs);
      const [updated] = await db
        .update(applicationArtifacts)
        .set({ claimExpiresAt: leaseExpiresAt, updatedAt: input.renewedAt })
        .where(
          and(
            eq(applicationArtifacts.id, input.claim.artifactId),
            eq(applicationArtifacts.projectId, input.claim.projectId),
            eq(applicationArtifacts.status, "building"),
            eq(applicationArtifacts.claimTokenSha256, hashClaimToken(input.claim.claimToken))
          )
        )
        .returning();
      const record = requireWrittenRecord(updated, "Application artifact claim was not renewed");
      return toClaim(record, input.claim.claimToken);
    },

    async complete(input) {
      const [updated] = await db
        .update(applicationArtifacts)
        .set({
          digestAlgorithm: "sha256",
          digest: input.built.digest,
          provider: input.built.location.provider,
          providerAccountId: input.built.location.accountId,
          providerRegion: input.built.location.region,
          storageNamespace: input.built.location.storageNamespace,
          artifactReference: input.built.location.artifactReference,
          ownershipScope: input.built.location.ownershipScope,
          status: "available",
          claimTokenSha256: null,
          claimExpiresAt: null,
          failureReason: null,
          verifiedAt: input.completedAt,
          updatedAt: input.completedAt
        })
        .where(
          and(
            eq(applicationArtifacts.id, input.claim.artifactId),
            eq(applicationArtifacts.projectId, input.claim.projectId),
            eq(applicationArtifacts.status, "building"),
            eq(applicationArtifacts.claimTokenSha256, hashClaimToken(input.claim.claimToken))
          )
        )
        .returning();
      return toAvailableArtifact(
        requireWrittenRecord(updated, "Application artifact claim was not completed")
      );
    },

    async fail(input) {
      const [updated] = await db
        .update(applicationArtifacts)
        .set({
          status: "failed",
          claimTokenSha256: null,
          claimExpiresAt: null,
          failureReason: input.reason.slice(0, 512),
          updatedAt: input.failedAt
        })
        .where(
          and(
            eq(applicationArtifacts.id, input.claim.artifactId),
            eq(applicationArtifacts.projectId, input.claim.projectId),
            eq(applicationArtifacts.status, "building"),
            eq(applicationArtifacts.claimTokenSha256, hashClaimToken(input.claim.claimToken))
          )
        )
        .returning({ id: applicationArtifacts.id });
      requireWrittenRecord(updated, "Application artifact claim was not failed");
    },

    async recordVerified(input) {
      const [updated] = await db
        .update(applicationArtifacts)
        .set({ verifiedAt: input.verifiedAt, updatedAt: input.verifiedAt })
        .where(
          and(
            eq(applicationArtifacts.id, input.artifact.id),
            eq(applicationArtifacts.projectId, input.artifact.projectId),
            eq(applicationArtifacts.status, "available")
          )
        )
        .returning();
      return toAvailableArtifact(
        requireWrittenRecord(updated, "Application artifact verification was not recorded")
      );
    }
  };
}

async function resolveActiveRecord(input: {
  record: ApplicationArtifactRecord;
  sourceRepositoryId: string;
  identity: ApplicationArtifactClaim["identity"];
  now: Date;
  leaseDurationMs: number;
  generateClaimToken: () => string;
  update: (
    values: Partial<typeof applicationArtifacts.$inferInsert>
  ) => Promise<ApplicationArtifactRecord | undefined>;
}): Promise<
  | { outcome: "available"; artifact: ApplicationArtifact }
  | { outcome: "claimed"; claim: ApplicationArtifactClaim }
  | { outcome: "busy"; leaseExpiresAt: Date }
> {
  if (input.record.status === "available") {
    return { outcome: "available", artifact: toAvailableArtifact(input.record) };
  }
  if (!input.record.claimExpiresAt) {
    throw new ApplicationArtifactRegistryPersistenceError(
      "Building application artifact has no lease expiry"
    );
  }
  if (input.record.claimExpiresAt.getTime() > input.now.getTime()) {
    return { outcome: "busy", leaseExpiresAt: input.record.claimExpiresAt };
  }

  const claimToken = input.generateClaimToken();
  const leaseExpiresAt = new Date(input.now.getTime() + input.leaseDurationMs);
  const updated = await input.update({
    sourceRepositoryId: input.sourceRepositoryId,
    ...input.identity,
    claimTokenSha256: hashClaimToken(claimToken),
    claimExpiresAt: leaseExpiresAt,
    failureReason: null,
    updatedAt: input.now
  });
  if (!updated) {
    throw new ApplicationArtifactRegistryPersistenceError(
      "Expired application artifact claim was not reclaimed"
    );
  }
  return { outcome: "claimed", claim: toClaim(updated, claimToken) };
}

function toClaim(record: ApplicationArtifactRecord, claimToken: string): ApplicationArtifactClaim {
  if (!record.sourceRepositoryId || !record.claimExpiresAt || record.status !== "building") {
    throw new ApplicationArtifactRegistryPersistenceError(
      "Application artifact claim row is incomplete"
    );
  }
  return {
    artifactId: record.id,
    projectId: record.projectId,
    sourceRepositoryId: record.sourceRepositoryId,
    identity: {
      artifactFingerprint: record.artifactFingerprint,
      repositoryIdentity: record.repositoryIdentity,
      commitSha: record.commitSha,
      kind: record.kind,
      buildConfigSha256: record.buildConfigSha256,
      buildContractVersion: record.buildContractVersion,
      targetOs: record.targetOs,
      targetArchitecture: record.targetArchitecture,
      buildInputIdentitySha256: record.buildInputIdentitySha256
    },
    claimToken,
    leaseExpiresAt: record.claimExpiresAt
  };
}

export function toAvailableArtifact(record: ApplicationArtifactRecord): ApplicationArtifact {
  if (
    record.status !== "available" ||
    record.digestAlgorithm !== "sha256" ||
    !record.digest ||
    !record.provider ||
    !record.providerAccountId ||
    !record.providerRegion ||
    !record.storageNamespace ||
    !record.artifactReference ||
    !record.ownershipScope
  ) {
    throw new ApplicationArtifactRegistryPersistenceError(
      "Available application artifact metadata is incomplete"
    );
  }
  return {
    id: record.id,
    projectId: record.projectId,
    sourceRepositoryId: record.sourceRepositoryId,
    kind: record.kind,
    artifactFingerprint: record.artifactFingerprint,
    repositoryIdentity: record.repositoryIdentity,
    commitSha: record.commitSha,
    buildConfigSha256: record.buildConfigSha256,
    buildContractVersion: record.buildContractVersion,
    targetOs: record.targetOs,
    targetArchitecture: record.targetArchitecture,
    buildInputIdentitySha256: record.buildInputIdentitySha256,
    digestAlgorithm: record.digestAlgorithm,
    digest: record.digest,
    location: {
      provider: record.provider,
      accountId: record.providerAccountId,
      region: record.providerRegion,
      storageNamespace: record.storageNamespace,
      artifactReference: record.artifactReference,
      ownershipScope: record.ownershipScope
    },
    status: record.status,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function hashClaimToken(token: string): string {
  if (!token.trim()) {
    throw new ApplicationArtifactRegistryPersistenceError(
      "Application artifact claim token must be non-empty"
    );
  }
  return createHash("sha256").update(token).digest("hex");
}

function requireWrittenRecord<T>(record: T | undefined, message: string): T {
  if (!record) throw new ApplicationArtifactRegistryPersistenceError(message);
  return record;
}
