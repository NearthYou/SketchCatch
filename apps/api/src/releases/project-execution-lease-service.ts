import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type {
  ProjectExecutionLease,
  ProjectExecutionLeaseSource
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  awsConnections,
  projectDeploymentTargets,
  projectExecutionLeases,
  projects
} from "../db/schema.js";

const defaultLeaseTtlMs = 120_000;

export type ProjectExecutionLeaseRecord = typeof projectExecutionLeases.$inferSelect;

export type ProjectExecutionLeaseRepository = {
  acquire(input: {
    projectId: string;
    holderId: string;
    source: ProjectExecutionLeaseSource;
    now: Date;
    expiresAt: Date;
  }): Promise<ProjectExecutionLeaseRecord | undefined>;
  find(projectId: string): Promise<ProjectExecutionLeaseRecord | undefined>;
  recoverExpired?(input: {
    projectId: string;
    expectedHolderId: string;
    expectedFencingVersion: number;
    holderId: string;
    source: ProjectExecutionLeaseSource;
    now: Date;
    expiresAt: Date;
  }): Promise<ProjectExecutionLeaseRecord | undefined>;
  recoverVerifiedTerminal?(input: {
    projectId: string;
    expectedHolderId: string;
    expectedFencingVersion: number;
    expectedActiveCodeBuildId: string | null;
    expectedActiveWorkerTaskArn: string | null;
    holderId: string;
    source: ProjectExecutionLeaseSource;
    now: Date;
    expiresAt: Date;
  }): Promise<ProjectExecutionLeaseRecord | undefined>;
  heartbeat(input: LeaseFence & { now: Date; expiresAt: Date }): Promise<ProjectExecutionLeaseRecord | undefined>;
  setExecutionCoordinates(input: LeaseFence & {
    now: Date;
    activeCodeBuildId?: string | null;
    activeWorkerTaskArn?: string | null;
  }): Promise<ProjectExecutionLeaseRecord | undefined>;
  release(input: LeaseFence & { now: Date }): Promise<boolean>;
};

export type LeaseFence = {
  projectId: string;
  holderId: string;
  fencingVersion: number;
};

export type ProjectExecutionLeaseOptions = {
  now?: () => Date;
  ttlMs?: number;
  inspectExpiredExecution?: (
    lease: ProjectExecutionLeaseRecord
  ) => Promise<"terminal" | "active" | "unknown">;
};

export type ProjectExecutionLeaseErrorCode =
  | "PROJECT_RELEASE_IN_PROGRESS"
  | "PROJECT_RELEASE_UNAVAILABLE"
  | "LEASE_RECOVERY_REQUIRED"
  | "LEASE_FENCE_REJECTED";

export class ProjectExecutionLeaseError extends Error {
  constructor(
    readonly code: ProjectExecutionLeaseErrorCode,
    message: string,
    readonly activeSource: ProjectExecutionLeaseSource | null = null
  ) {
    super(message);
    this.name = "ProjectExecutionLeaseError";
  }
}

export function createPostgresProjectExecutionLeaseRepository(
  db: Database
): ProjectExecutionLeaseRepository {
  return {
    async acquire(input) {
      return db.transaction(async (transaction) => {
        const [project] = await transaction
          .select({
            id: projects.id,
            deletionStartedAt: projects.deletionStartedAt
          })
          .from(projects)
          .where(eq(projects.id, input.projectId))
          .for("update");
        const [target] = project
          ? await transaction
              .select({ connectionId: projectDeploymentTargets.connectionId })
              .from(projectDeploymentTargets)
              .where(eq(projectDeploymentTargets.projectId, input.projectId))
          : [];
        const [connection] = target?.connectionId
          ? await transaction
              .select({
                status: awsConnections.status,
                deletionStartedAt: awsConnections.deletionStartedAt
              })
              .from(awsConnections)
              .where(eq(awsConnections.id, target.connectionId))
              .for("key share")
          : [];
        assertProjectExecutionAvailable({
          projectExists: Boolean(project),
          projectDeletionStartedAt: project?.deletionStartedAt ?? null,
          targetConnectionId: target?.connectionId ?? null,
          awsConnectionStatus: connection?.status ?? null,
          awsConnectionDeletionStartedAt: connection?.deletionStartedAt ?? null
        });

        const [lease] = await transaction
          .insert(projectExecutionLeases)
          .values({
            projectId: input.projectId,
            holderId: input.holderId,
            source: input.source,
            fencingVersion: 1,
            status: "active",
            activeCodeBuildId: null,
            activeWorkerTaskArn: null,
            heartbeatAt: input.now,
            expiresAt: input.expiresAt,
            createdAt: input.now,
            updatedAt: input.now
          })
          .onConflictDoUpdate({
            target: projectExecutionLeases.projectId,
            set: {
              holderId: input.holderId,
              source: input.source,
              fencingVersion: sql<number>`case
                when ${projectExecutionLeases.status} = 'active'
                  and ${projectExecutionLeases.holderId} = ${input.holderId}
                then ${projectExecutionLeases.fencingVersion}
                else ${projectExecutionLeases.fencingVersion} + 1
              end`,
              status: "active",
              activeCodeBuildId: sql<string | null>`case
                when ${projectExecutionLeases.status} = 'active'
                  and ${projectExecutionLeases.holderId} = ${input.holderId}
                then ${projectExecutionLeases.activeCodeBuildId}
                else null
              end`,
              activeWorkerTaskArn: sql<string | null>`case
                when ${projectExecutionLeases.status} = 'active'
                  and ${projectExecutionLeases.holderId} = ${input.holderId}
                then ${projectExecutionLeases.activeWorkerTaskArn}
                else null
              end`,
              heartbeatAt: input.now,
              expiresAt: input.expiresAt,
              updatedAt: input.now
            },
            setWhere: sql`${projectExecutionLeases.status} = 'released'
              or (${projectExecutionLeases.status} = 'active'
                and ${projectExecutionLeases.holderId} = ${input.holderId})`
          })
          .returning();
        return lease;
      });
    },

    async find(projectId) {
      const [lease] = await db
        .select()
        .from(projectExecutionLeases)
        .where(eq(projectExecutionLeases.projectId, projectId));
      return lease;
    },

    async recoverExpired(input) {
      const [lease] = await db
        .update(projectExecutionLeases)
        .set({
          holderId: input.holderId,
          source: input.source,
          fencingVersion: sql`${projectExecutionLeases.fencingVersion} + 1`,
          status: "active",
          activeCodeBuildId: null,
          activeWorkerTaskArn: null,
          heartbeatAt: input.now,
          expiresAt: input.expiresAt,
          updatedAt: input.now
        })
        .where(
          and(
            eq(projectExecutionLeases.projectId, input.projectId),
            eq(projectExecutionLeases.holderId, input.expectedHolderId),
            eq(projectExecutionLeases.fencingVersion, input.expectedFencingVersion),
            lte(projectExecutionLeases.expiresAt, input.now)
          )
        )
        .returning();
      return lease;
    },

    async recoverVerifiedTerminal(input) {
      const [lease] = await db
        .update(projectExecutionLeases)
        .set({
          holderId: input.holderId,
          source: input.source,
          fencingVersion: sql`${projectExecutionLeases.fencingVersion} + 1`,
          status: "active",
          activeCodeBuildId: null,
          activeWorkerTaskArn: null,
          heartbeatAt: input.now,
          expiresAt: input.expiresAt,
          updatedAt: input.now
        })
        .where(
          and(
            eq(projectExecutionLeases.projectId, input.projectId),
            eq(projectExecutionLeases.holderId, input.expectedHolderId),
            eq(projectExecutionLeases.fencingVersion, input.expectedFencingVersion),
            eq(projectExecutionLeases.status, "active"),
            input.expectedActiveCodeBuildId === null
              ? isNull(projectExecutionLeases.activeCodeBuildId)
              : eq(
                  projectExecutionLeases.activeCodeBuildId,
                  input.expectedActiveCodeBuildId
                ),
            input.expectedActiveWorkerTaskArn === null
              ? isNull(projectExecutionLeases.activeWorkerTaskArn)
              : eq(
                  projectExecutionLeases.activeWorkerTaskArn,
                  input.expectedActiveWorkerTaskArn
                )
          )
        )
        .returning();
      return lease;
    },

    async heartbeat(input) {
      const [lease] = await db
        .update(projectExecutionLeases)
        .set({
          heartbeatAt: input.now,
          expiresAt: input.expiresAt,
          updatedAt: input.now
        })
        .where(currentFenceWhere(input, input.now))
        .returning();
      return lease;
    },

    async setExecutionCoordinates(input) {
      const [lease] = await db
        .update(projectExecutionLeases)
        .set({
          ...(input.activeCodeBuildId === undefined
            ? {}
            : { activeCodeBuildId: input.activeCodeBuildId }),
          ...(input.activeWorkerTaskArn === undefined
            ? {}
            : { activeWorkerTaskArn: input.activeWorkerTaskArn }),
          updatedAt: input.now
        })
        .where(currentFenceWhere(input, input.now))
        .returning();
      return lease;
    },

    async release(input) {
      const released = await db
        .update(projectExecutionLeases)
        .set({
          status: "released",
          activeCodeBuildId: null,
          activeWorkerTaskArn: null,
          heartbeatAt: input.now,
          expiresAt: input.now,
          updatedAt: input.now
        })
        .where(
          and(
            eq(projectExecutionLeases.projectId, input.projectId),
            eq(projectExecutionLeases.holderId, input.holderId),
            eq(projectExecutionLeases.fencingVersion, input.fencingVersion),
            eq(projectExecutionLeases.status, "active")
          )
        )
        .returning({ projectId: projectExecutionLeases.projectId });
      return released.length === 1;
    }
  };
}

export function assertProjectExecutionAvailable(input: {
  projectExists: boolean;
  projectDeletionStartedAt: Date | null;
  targetConnectionId: string | null;
  awsConnectionStatus: "pending" | "verified" | "failed" | null;
  awsConnectionDeletionStartedAt: Date | null;
}): void {
  if (!input.projectExists || input.projectDeletionStartedAt) {
    throw new ProjectExecutionLeaseError(
      "PROJECT_RELEASE_UNAVAILABLE",
      "The project is missing or being deleted"
    );
  }
  if (
    input.targetConnectionId &&
    (input.awsConnectionStatus !== "verified" || input.awsConnectionDeletionStartedAt)
  ) {
    throw new ProjectExecutionLeaseError(
      "PROJECT_RELEASE_UNAVAILABLE",
      "The selected AWS connection is disconnected or being deleted"
    );
  }
}

export async function acquireProjectExecutionLease(
  input: { projectId: string; holderId: string; source: ProjectExecutionLeaseSource },
  repository: ProjectExecutionLeaseRepository,
  options: ProjectExecutionLeaseOptions = {}
): Promise<ProjectExecutionLease> {
  const now = options.now?.() ?? new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? defaultLeaseTtlMs));
  const acquired = await repository.acquire({ ...input, now, expiresAt });
  if (acquired) return toProjectExecutionLease(acquired);
  const active = await repository.find(input.projectId);
  if (active && active.expiresAt <= now && active.holderId !== input.holderId) {
    const inspection = options.inspectExpiredExecution
      ? await options.inspectExpiredExecution(active)
      : "unknown";
    if (inspection === "terminal" && repository.recoverExpired) {
      const recovered = await repository.recoverExpired({
        projectId: active.projectId,
        expectedHolderId: active.holderId,
        expectedFencingVersion: active.fencingVersion,
        holderId: input.holderId,
        source: input.source,
        now,
        expiresAt
      });
      if (recovered) return toProjectExecutionLease(recovered);
    }
    throw new ProjectExecutionLeaseError(
      "LEASE_RECOVERY_REQUIRED",
      inspection === "active"
        ? "The previous project release is still running and must be stopped first"
        : "The previous project release could not be verified as stopped; cleanup is required",
      active.source
    );
  }
  throw new ProjectExecutionLeaseError(
    "PROJECT_RELEASE_IN_PROGRESS",
    active
      ? `${active.source === "direct" ? "Direct deployment" : "GitHub release"} is already running for this project`
      : "Another release acquired this project at the same time",
    active?.source ?? null
  );
}

export async function heartbeatProjectExecutionLease(
  input: LeaseFence,
  repository: ProjectExecutionLeaseRepository,
  options: ProjectExecutionLeaseOptions = {}
): Promise<ProjectExecutionLease> {
  const now = options.now?.() ?? new Date();
  const lease = await repository.heartbeat({
    ...input,
    now,
    expiresAt: new Date(now.getTime() + (options.ttlMs ?? defaultLeaseTtlMs))
  });
  if (!lease) throw fenceRejected();
  return toProjectExecutionLease(lease);
}

export async function recoverVerifiedTerminalProjectExecutionLease(
  input: {
    projectId: string;
    expectedHolderId: string;
    expectedFencingVersion: number;
    expectedActiveCodeBuildId: string | null;
    expectedActiveWorkerTaskArn: string | null;
    holderId: string;
    source: ProjectExecutionLeaseSource;
  },
  repository: ProjectExecutionLeaseRepository,
  options: Pick<ProjectExecutionLeaseOptions, "now" | "ttlMs"> = {}
): Promise<ProjectExecutionLease> {
  if (!repository.recoverVerifiedTerminal) {
    throw new ProjectExecutionLeaseError(
      "LEASE_RECOVERY_REQUIRED",
      "The interrupted execution cannot be fenced after terminal verification"
    );
  }
  const now = options.now?.() ?? new Date();
  const recovered = await repository.recoverVerifiedTerminal({
    ...input,
    now,
    expiresAt: new Date(now.getTime() + (options.ttlMs ?? defaultLeaseTtlMs))
  });
  if (!recovered) {
    throw new ProjectExecutionLeaseError(
      "LEASE_RECOVERY_REQUIRED",
      "The interrupted execution changed while terminal recovery was being verified"
    );
  }
  return toProjectExecutionLease(recovered);
}

export async function recordProjectExecutionCoordinates(
  input: LeaseFence & {
    activeCodeBuildId?: string | null;
    activeWorkerTaskArn?: string | null;
  },
  repository: ProjectExecutionLeaseRepository,
  now = new Date()
): Promise<ProjectExecutionLease> {
  const lease = await repository.setExecutionCoordinates({ ...input, now });
  if (!lease) throw fenceRejected();
  return toProjectExecutionLease(lease);
}

export async function assertCurrentProjectExecutionLease(
  input: LeaseFence,
  repository: ProjectExecutionLeaseRepository,
  now = new Date()
): Promise<ProjectExecutionLease> {
  const lease = await repository.find(input.projectId);
  if (
    !lease ||
    lease.holderId !== input.holderId ||
    lease.fencingVersion !== input.fencingVersion ||
    lease.status !== "active" ||
    lease.expiresAt <= now
  ) {
    throw fenceRejected();
  }
  return toProjectExecutionLease(lease);
}

export function releaseProjectExecutionLease(
  input: LeaseFence,
  repository: ProjectExecutionLeaseRepository,
  now = new Date()
): Promise<boolean> {
  return repository.release({ ...input, now });
}

function currentFenceWhere(input: LeaseFence, now: Date) {
  return and(
    eq(projectExecutionLeases.projectId, input.projectId),
    eq(projectExecutionLeases.holderId, input.holderId),
    eq(projectExecutionLeases.fencingVersion, input.fencingVersion),
    eq(projectExecutionLeases.status, "active"),
    gt(projectExecutionLeases.expiresAt, now)
  );
}

function fenceRejected(): ProjectExecutionLeaseError {
  return new ProjectExecutionLeaseError(
    "LEASE_FENCE_REJECTED",
    "This execution no longer owns the project release lease"
  );
}

function toProjectExecutionLease(record: ProjectExecutionLeaseRecord): ProjectExecutionLease {
  return {
    projectId: record.projectId,
    holderId: record.holderId,
    source: record.source,
    fencingVersion: record.fencingVersion,
    status: record.status,
    activeCodeBuildId: record.activeCodeBuildId,
    activeWorkerTaskArn: record.activeWorkerTaskArn,
    heartbeatAt: record.heartbeatAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}
