import assert from "node:assert/strict";
import test from "node:test";
import {
  ProjectExecutionLeaseError,
  acquireProjectExecutionLease,
  assertProjectExecutionAvailable,
  assertCurrentProjectExecutionLease,
  heartbeatProjectExecutionLease,
  recordProjectExecutionCoordinates,
  recoverVerifiedTerminalProjectExecutionLease,
  releaseProjectExecutionLease,
  type ProjectExecutionLeaseRecord,
  type ProjectExecutionLeaseRepository
} from "./project-execution-lease-service.js";

const projectId = "12345678-1234-1234-1234-1234567890ab";
const startedAt = new Date("2026-07-15T12:00:00.000Z");

test("lease acquisition rejects projects or AWS connections being deleted", () => {
  assert.throws(
    () =>
      assertProjectExecutionAvailable({
        projectExists: true,
        projectDeletionStartedAt: startedAt,
        targetConnectionId: null,
        awsConnectionStatus: null,
        awsConnectionDeletionStartedAt: null
      }),
    (error: unknown) =>
      error instanceof ProjectExecutionLeaseError &&
      error.code === "PROJECT_RELEASE_UNAVAILABLE"
  );

  assert.throws(
    () =>
      assertProjectExecutionAvailable({
        projectExists: true,
        projectDeletionStartedAt: null,
        targetConnectionId: "connection-id",
        awsConnectionStatus: "verified",
        awsConnectionDeletionStartedAt: startedAt
      }),
    (error: unknown) =>
      error instanceof ProjectExecutionLeaseError &&
      error.code === "PROJECT_RELEASE_UNAVAILABLE"
  );

  assert.throws(
    () =>
      assertProjectExecutionAvailable({
        projectExists: true,
        projectDeletionStartedAt: null,
        targetConnectionId: "connection-id",
        awsConnectionStatus: "verified",
        awsConnectionDeletionStartedAt: null,
        awsCodeConnectionStatus: "DELETING"
      }),
    (error: unknown) =>
      error instanceof ProjectExecutionLeaseError &&
      error.code === "PROJECT_RELEASE_UNAVAILABLE"
  );
});

test("a GitOps execution is blocked while a managed deployment holds the project lease", async () => {
  const repository = createRepository();
  await acquireProjectExecutionLease(
    { projectId, holderId: "deployment-1", source: "direct" },
    repository,
    { now: () => startedAt }
  );

  await assert.rejects(
    acquireProjectExecutionLease(
      { projectId, holderId: "pipeline-1", source: "gitops" },
      repository,
      { now: () => new Date(startedAt.getTime() + 1_000) }
    ),
    (error) =>
      error instanceof ProjectExecutionLeaseError &&
      error.code === "PROJECT_RELEASE_IN_PROGRESS" &&
      error.activeSource === "direct"
  );
});

test("an expired lease can be replaced only after terminal verification", async () => {
  const repository = createRepository();
  const first = await acquireProjectExecutionLease(
    { projectId, holderId: "deployment-1", source: "direct" },
    repository,
    { now: () => startedAt, ttlMs: 1_000 }
  );
  const recoveryTime = new Date(startedAt.getTime() + 1_001);
  await assert.rejects(
    acquireProjectExecutionLease(
      { projectId, holderId: "pipeline-1", source: "gitops" },
      repository,
      { now: () => recoveryTime, ttlMs: 1_000 }
    ),
    (error) =>
      error instanceof ProjectExecutionLeaseError &&
      error.code === "LEASE_RECOVERY_REQUIRED"
  );
  const second = await acquireProjectExecutionLease(
    { projectId, holderId: "pipeline-1", source: "gitops" },
    repository,
    {
      now: () => recoveryTime,
      ttlMs: 1_000,
      inspectExpiredExecution: async () => "terminal"
    }
  );

  assert.equal(first.fencingVersion, 1);
  assert.equal(second.fencingVersion, 2);
});

test("a stale holder cannot heartbeat, save a result, or release a newer lease", async () => {
  const repository = createRepository();
  const first = await acquireProjectExecutionLease(
    { projectId, holderId: "deployment-1", source: "direct" },
    repository,
    { now: () => startedAt, ttlMs: 1_000 }
  );
  await acquireProjectExecutionLease(
    { projectId, holderId: "pipeline-1", source: "gitops" },
    repository,
    {
      now: () => new Date(startedAt.getTime() + 1_001),
      ttlMs: 60_000,
      inspectExpiredExecution: async () => "terminal"
    }
  );

  await assert.rejects(
    heartbeatProjectExecutionLease(
      {
        projectId,
        holderId: first.holderId,
        fencingVersion: first.fencingVersion
      },
      repository,
      { now: () => new Date(startedAt.getTime() + 2_000) }
    ),
    (error) =>
      error instanceof ProjectExecutionLeaseError && error.code === "LEASE_FENCE_REJECTED"
  );
  await assert.rejects(
    assertCurrentProjectExecutionLease(
      {
        projectId,
        holderId: first.holderId,
        fencingVersion: first.fencingVersion
      },
      repository,
      new Date(startedAt.getTime() + 2_000)
    ),
    ProjectExecutionLeaseError
  );
  assert.equal(
    await releaseProjectExecutionLease(
      { projectId, holderId: first.holderId, fencingVersion: first.fencingVersion },
      repository
    ),
    false
  );
});

test("verified terminal recovery fences an active abandoned holder before lease expiry", async () => {
  const repository = createRepository();
  const first = await acquireProjectExecutionLease(
    { projectId, holderId: "pipeline-1", source: "gitops" },
    repository,
    { now: () => startedAt, ttlMs: 60_000 }
  );
  await recordProjectExecutionCoordinates(
    {
      projectId,
      holderId: first.holderId,
      fencingVersion: first.fencingVersion,
      activeCodeBuildId: "build:terminal"
    },
    repository,
    new Date(startedAt.getTime() + 1_000)
  );

  const recovered = await recoverVerifiedTerminalProjectExecutionLease(
    {
      projectId,
      expectedHolderId: first.holderId,
      expectedFencingVersion: first.fencingVersion,
      expectedActiveCodeBuildId: "build:terminal",
      expectedActiveWorkerTaskArn: null,
      holderId: "recovery:pipeline-1",
      source: "gitops"
    },
    repository,
    { now: () => new Date(startedAt.getTime() + 2_000), ttlMs: 60_000 }
  );

  assert.equal(recovered.holderId, "recovery:pipeline-1");
  assert.equal(recovered.fencingVersion, first.fencingVersion + 1);
  await assert.rejects(
    heartbeatProjectExecutionLease(
      {
        projectId,
        holderId: first.holderId,
        fencingVersion: first.fencingVersion
      },
      repository,
      { now: () => new Date(startedAt.getTime() + 3_000) }
    ),
    (error) =>
      error instanceof ProjectExecutionLeaseError && error.code === "LEASE_FENCE_REJECTED"
  );
});

test("a released project lease keeps a monotonic fencing generation", async () => {
  const repository = createRepository();
  const first = await acquireProjectExecutionLease(
    { projectId, holderId: "deployment-1", source: "direct" },
    repository,
    { now: () => startedAt }
  );
  assert.equal(
    await releaseProjectExecutionLease(
      { projectId, holderId: first.holderId, fencingVersion: first.fencingVersion },
      repository,
      new Date(startedAt.getTime() + 1_000)
    ),
    true
  );

  const second = await acquireProjectExecutionLease(
    { projectId, holderId: "deployment-1", source: "direct" },
    repository,
    { now: () => new Date(startedAt.getTime() + 2_000) }
  );
  assert.equal(second.fencingVersion, first.fencingVersion + 1);
});

function createRepository(): ProjectExecutionLeaseRepository {
  let record: ProjectExecutionLeaseRecord | undefined;
  return {
    async acquire(input) {
      if (!record) {
        record = {
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
        };
        return record;
      }
      if (record.status === "released" || record.holderId === input.holderId) {
        const sameActiveHolder =
          record.status === "active" && record.holderId === input.holderId;
        record = {
          ...record,
          holderId: input.holderId,
          source: input.source,
          fencingVersion: sameActiveHolder
            ? record.fencingVersion
            : record.fencingVersion + 1,
          status: "active",
          activeCodeBuildId: sameActiveHolder ? record.activeCodeBuildId : null,
          activeWorkerTaskArn: sameActiveHolder ? record.activeWorkerTaskArn : null,
          heartbeatAt: input.now,
          expiresAt: input.expiresAt,
          updatedAt: input.now
        };
        return record;
      }
      return undefined;
    },
    async find() {
      return record;
    },
    async recoverExpired(input) {
      if (
        !record ||
        record.projectId !== input.projectId ||
        record.holderId !== input.expectedHolderId ||
        record.fencingVersion !== input.expectedFencingVersion ||
        record.expiresAt > input.now
      ) {
        return undefined;
      }
      record = {
        ...record,
        holderId: input.holderId,
        source: input.source,
        fencingVersion: record.fencingVersion + 1,
        activeCodeBuildId: null,
        activeWorkerTaskArn: null,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      };
      return record;
    },
    async recoverVerifiedTerminal(input) {
      if (
        !record ||
        record.projectId !== input.projectId ||
        record.holderId !== input.expectedHolderId ||
        record.fencingVersion !== input.expectedFencingVersion ||
        record.activeCodeBuildId !== input.expectedActiveCodeBuildId ||
        record.activeWorkerTaskArn !== input.expectedActiveWorkerTaskArn
      ) {
        return undefined;
      }
      record = {
        ...record,
        holderId: input.holderId,
        source: input.source,
        fencingVersion: record.fencingVersion + 1,
        activeCodeBuildId: null,
        activeWorkerTaskArn: null,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      };
      return record;
    },
    async heartbeat(input) {
      if (!matches(record, input)) return undefined;
      record = { ...record, heartbeatAt: input.now, expiresAt: input.expiresAt, updatedAt: input.now };
      return record;
    },
    async setExecutionCoordinates(input) {
      if (!matches(record, input)) return undefined;
      record = {
        ...record,
        ...(input.activeCodeBuildId === undefined
          ? {}
          : { activeCodeBuildId: input.activeCodeBuildId }),
        ...(input.activeWorkerTaskArn === undefined
          ? {}
          : { activeWorkerTaskArn: input.activeWorkerTaskArn }),
        updatedAt: input.now
      };
      return record;
    },
    async release(input) {
      if (!matches(record, input)) return false;
      record = {
        ...record,
        status: "released",
        activeCodeBuildId: null,
        activeWorkerTaskArn: null,
        heartbeatAt: input.now,
        expiresAt: input.now,
        updatedAt: input.now
      };
      return true;
    }
  };
}

function matches(
  record: ProjectExecutionLeaseRecord | undefined,
  input: { holderId: string; fencingVersion: number; now?: Date }
): record is ProjectExecutionLeaseRecord {
  return Boolean(
      record &&
      record.status === "active" &&
      record.holderId === input.holderId &&
      record.fencingVersion === input.fencingVersion &&
      (input.now === undefined || record.expiresAt > input.now)
  );
}
