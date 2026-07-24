import { and, eq } from "drizzle-orm";
import type { AwsImportAccessStatus } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { awsImportAccess } from "../db/schema.js";

export type AwsImportAccessRecord = typeof awsImportAccess.$inferSelect;

/** gg: cleanup 시작 뒤에는 read check가 상태를 ready/limited로 되돌리지 못하게 합니다. */
export function isAwsImportReadCheckBlockedByCleanup(
  record: Pick<AwsImportAccessRecord, "status" | "operationKind" | "safeErrorCode">
): boolean {
  return record.status === "cleanup_policy_required" ||
    record.status === "cleanup_manager_required" ||
    record.status === "cleanup_checking" ||
    record.status === "cleanup_required" ||
    record.status === "cleanup_complete" ||
    (record.status === "retry_required" &&
      (record.operationKind === "prepare_cleanup" ||
        record.operationKind === "check_cleanup" ||
        record.safeErrorCode === "cleanup_retry" ||
        record.safeErrorCode === "cleanup_policy_artifact_pending" ||
        record.safeErrorCode === "cleanup_manager_artifact_pending"));
}

type AwsImportAccessCompanionArtifactRecord = Pick<
  AwsImportAccessRecord,
  | "status"
  | "operationKind"
  | "managerStackName"
  | "managerStackId"
  | "managerContractVersion"
  | "managerTemplateHash"
  | "policyStackName"
  | "policyStackId"
  | "policyContractVersion"
  | "policyTemplateHash"
  | "targetRoleArn"
  | "serviceRoleArn"
  | "readPolicyArn"
  | "controlPolicyArn"
  | "cleanupVerificationPolicyArn"
  | "policyFingerprint"
>;

/** gg: 보조 Stack·Policy 계약을 아직 시작하지 않은 연결만 직접 읽기 확인으로 처리합니다. */
export function hasNoAwsImportAccessCompanionArtifacts(
  record: AwsImportAccessCompanionArtifactRecord
): boolean {
  return [
    record.managerStackName,
    record.managerStackId,
    record.managerContractVersion,
    record.managerTemplateHash,
    record.policyStackName,
    record.policyStackId,
    record.policyContractVersion,
    record.policyTemplateHash,
    record.targetRoleArn,
    record.serviceRoleArn,
    record.readPolicyArn,
    record.controlPolicyArn,
    record.cleanupVerificationPolicyArn,
    record.policyFingerprint
  ].every((value) => value === null);
}

/** gg: 직접 읽기 확인 marker는 AWS 보조 Stack·Policy를 만들지 않았으므로 연결 해제 정리를 요구하지 않습니다. */
export function isDirectAwsImportReadProbeMarker(
  record: AwsImportAccessCompanionArtifactRecord
): boolean {
  const hasNoCompanionArtifact = hasNoAwsImportAccessCompanionArtifacts(record);
  return record.operationKind === "check_reads" &&
    hasNoCompanionArtifact &&
    (record.status === "check_required" ||
      record.status === "ready" ||
      record.status === "limited" ||
      record.status === "retry_required" ||
      record.status === "connection_required");
}

/** gg: 실제 보조 artifact가 남은 경우만 기존 정리·연결 해제 보호선을 유지합니다. */
export function requiresAwsImportAccessCleanup(
  record: AwsImportAccessCompanionArtifactRecord
): boolean {
  return record.status !== "cleanup_complete" && !isDirectAwsImportReadProbeMarker(record);
}

export type AwsImportAccessRecordChanges = Partial<
  Omit<AwsImportAccessRecord, "awsConnectionId" | "createdAt" | "updatedAt">
>;

export type ClaimAwsImportAccessPolicyApplyResult =
  | { kind: "claimed" | "idempotent"; record: AwsImportAccessRecord }
  | { kind: "leased" | "rejected" };

export type IssueAwsImportAccessApprovalResult =
  | { kind: "issued"; record: AwsImportAccessRecord }
  | { kind: "leased" };

export type SaveAwsImportAccessCommandResult =
  | { kind: "saved"; record: AwsImportAccessRecord }
  | { kind: "leased" };

export type FinishAwsImportAccessPolicyApplyResult =
  | { kind: "saved"; record: AwsImportAccessRecord }
  | { kind: "stale" };

export type ClaimAwsImportAccessReadsResult =
  | { kind: "claimed"; record: AwsImportAccessRecord }
  | { kind: "leased" }
  | { kind: "rejected" };

export type FinishAwsImportAccessReadsResult =
  | { kind: "saved"; record: AwsImportAccessRecord }
  | { kind: "stale" };

export type AwsImportCleanupInspectionOperationKind =
  | "prepare_cleanup"
  | "check_cleanup";

export type ClaimAwsImportCleanupInspectionResult =
  | { kind: "claimed"; record: AwsImportAccessRecord }
  | { kind: "complete"; record: AwsImportAccessRecord }
  | { kind: "leased" }
  | { kind: "rejected" };

export type FinishAwsImportCleanupInspectionResult =
  | { kind: "saved"; record: AwsImportAccessRecord }
  | { kind: "stale" };

export type AwsImportAccessRepository = {
  find(connectionId: string): Promise<AwsImportAccessRecord | undefined>;
  getOrCreate(input: { connectionId: string; now: Date }): Promise<AwsImportAccessRecord>;
  issueApproval(input: {
    connectionId: string;
    changes: AwsImportAccessRecordChanges;
    now: Date;
  }): Promise<IssueAwsImportAccessApprovalResult>;
  saveCommand(input: {
    connectionId: string;
    changes: AwsImportAccessRecordChanges;
    now: Date;
  }): Promise<SaveAwsImportAccessCommandResult>;
  finishPolicyApply(input: {
    connectionId: string;
    operationId: string;
    changes: AwsImportAccessRecordChanges;
    now: Date;
  }): Promise<FinishAwsImportAccessPolicyApplyResult>;
  claimPolicyApply(input: {
    connectionId: string;
    operationId: string;
    approvalFingerprint: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<ClaimAwsImportAccessPolicyApplyResult>;
  claimImportReads(input: {
    connectionId: string;
    operationId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<ClaimAwsImportAccessReadsResult>;
  finishImportReads(input: {
    connectionId: string;
    operationId: string;
    changes: AwsImportAccessRecordChanges;
    now: Date;
  }): Promise<FinishAwsImportAccessReadsResult>;
  claimCleanupInspection(input: {
    connectionId: string;
    operationId: string;
    operationKind: AwsImportCleanupInspectionOperationKind;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<ClaimAwsImportCleanupInspectionResult>;
  finishCleanupInspection(input: {
    connectionId: string;
    operationId: string;
    operationKind: AwsImportCleanupInspectionOperationKind;
    changes: AwsImportAccessRecordChanges;
    now: Date;
  }): Promise<FinishAwsImportCleanupInspectionResult>;
};

/** gg: 가져오기 상태는 배포 연결 row와 분리하고 connection별 한 row만 만듭니다. */
export function createPostgresAwsImportAccessRepository(
  db: Database
): AwsImportAccessRepository {
  return {
    // gg: Settings GET은 import row를 만들지 않아 엄격한 연결 삭제 guard에 간섭하지 않습니다.
    async find(connectionId) {
      const [record] = await db
        .select()
        .from(awsImportAccess)
        .where(eq(awsImportAccess.awsConnectionId, connectionId));
      return record;
    },

    // gg: 기존 연결에는 자동 AWS 변경 없이 check_required 상태만 처음 만듭니다.
    async getOrCreate(input) {
      const [created] = await db
        .insert(awsImportAccess)
        .values({
          awsConnectionId: input.connectionId,
          status: "check_required",
          createdAt: input.now,
          updatedAt: input.now
        })
        .onConflictDoNothing({ target: awsImportAccess.awsConnectionId })
        .returning();
      if (created) return created;

      const [existing] = await db
        .select()
        .from(awsImportAccess)
        .where(eq(awsImportAccess.awsConnectionId, input.connectionId));
      if (!existing) throw new Error("AWS import access state could not be created");
      return existing;
    },

    // gg: preview 발급도 row lock을 잡아 active apply의 operation identity를 덮지 않습니다.
    async issueApproval(input) {
      return db.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(awsImportAccess)
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .for("update");
        if (!current) throw new Error("AWS import access state was not found");
        if (
          current.leaseExpiresAt !== null &&
          current.leaseExpiresAt.getTime() > input.now.getTime()
        ) {
          return { kind: "leased" } as const;
        }
        const [issued] = await transaction
          .update(awsImportAccess)
          .set({ ...input.changes, updatedAt: input.now })
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .returning();
        if (!issued) throw new Error("AWS import access approval could not be issued");
        return { kind: "issued", record: issued } as const;
      });
    },

    // gg: apply 외 command도 row lock에서 lease를 확인해 operation 상태를 덮지 않습니다.
    async saveCommand(input) {
      return db.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(awsImportAccess)
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .for("update");
        if (!current) throw new Error("AWS import access state was not found");
        if (
          current.leaseExpiresAt !== null &&
          current.leaseExpiresAt.getTime() > input.now.getTime()
        ) {
          return { kind: "leased" } as const;
        }
        const [saved] = await transaction
          .update(awsImportAccess)
          .set({ ...input.changes, updatedAt: input.now })
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .returning();
        if (!saved) throw new Error("AWS import access command state could not be saved");
        return { kind: "saved", record: saved } as const;
      });
    },

    // gg: AWS 응답이 늦게 와도 자신이 claim한 operation row만 완료할 수 있습니다.
    async finishPolicyApply(input) {
      const [saved] = await db
        .update(awsImportAccess)
        .set({ ...input.changes, updatedAt: input.now })
        .where(
          and(
            eq(awsImportAccess.awsConnectionId, input.connectionId),
            eq(awsImportAccess.operationId, input.operationId),
            eq(awsImportAccess.operationKind, "apply_policy")
          )
        )
        .returning();
      return saved
        ? { kind: "saved", record: saved } as const
        : { kind: "stale" } as const;
    },

    // gg: 승인 소비와 lease 획득은 한 row lock 안에서 처리해 AWS 작업 중복을 막습니다.
    async claimPolicyApply(input) {
      return db.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(awsImportAccess)
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .for("update");

        if (!current) return { kind: "rejected" } as const;
        if (
          current.operationId === input.operationId &&
          current.approvalConsumedAt !== null
        ) {
          return { kind: "idempotent", record: current } as const;
        }
        if (
          current.operationId !== input.operationId ||
          current.approvalFingerprint !== input.approvalFingerprint ||
          current.approvalConsumedAt !== null ||
          !current.approvalExpiresAt ||
          current.approvalExpiresAt.getTime() <= input.now.getTime()
        ) {
          return { kind: "rejected" } as const;
        }
        if (
          current.leaseExpiresAt !== null &&
          current.leaseExpiresAt.getTime() > input.now.getTime()
        ) {
          return { kind: "leased" } as const;
        }

        const [claimed] = await transaction
          .update(awsImportAccess)
          .set({
            approvalConsumedAt: input.now,
            status: "policy_working" satisfies AwsImportAccessStatus,
            operationKind: "apply_policy",
            leaseExpiresAt: input.leaseExpiresAt,
            updatedAt: input.now
          })
          .where(
            and(
              eq(awsImportAccess.awsConnectionId, input.connectionId),
              eq(awsImportAccess.operationId, input.operationId),
              eq(awsImportAccess.approvalFingerprint, input.approvalFingerprint)
            )
          )
          .returning();

        return claimed
          ? ({ kind: "claimed", record: claimed } as const)
          : ({ kind: "rejected" } as const);
      });
    },

    // gg: read probe operation identity와 lease를 한 row lock에서 먼저 확정합니다.
    async claimImportReads(input) {
      return db.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(awsImportAccess)
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .for("update");
        if (!current) throw new Error("AWS import access state was not found");
        if (isAwsImportReadCheckBlockedByCleanup(current)) {
          return { kind: "rejected" } as const;
        }
        if (current.leaseExpiresAt && current.leaseExpiresAt.getTime() > input.now.getTime()) {
          return { kind: "leased" } as const;
        }
        const [claimed] = await transaction
          .update(awsImportAccess)
          .set({
            status: "checking_reads",
            operationId: input.operationId,
            operationKind: "check_reads",
            leaseExpiresAt: input.leaseExpiresAt,
            coreReadSummary: null,
            expandedReadSummary: null,
            safeErrorCode: null,
            safeErrorSummary: "가져오기 권한을 확인하고 있습니다.",
            updatedAt: input.now
          })
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .returning();
        if (!claimed) throw new Error("AWS import read probe could not be claimed");
        return { kind: "claimed", record: claimed } as const;
      });
    },

    // gg: 늦은 probe 결과는 자신이 claim한 read operation에만 CAS 저장합니다.
    async finishImportReads(input) {
      const [saved] = await db
        .update(awsImportAccess)
        .set({ ...input.changes, updatedAt: input.now })
        .where(and(
          eq(awsImportAccess.awsConnectionId, input.connectionId),
          eq(awsImportAccess.operationId, input.operationId),
          eq(awsImportAccess.operationKind, "check_reads")
        ))
        .returning();
      return saved
        ? { kind: "saved", record: saved } as const
        : { kind: "stale" } as const;
    },

    // gg: cleanup AWS read도 row lease를 먼저 가져 중복 호출과 늦은 overwrite를 막습니다.
    async claimCleanupInspection(input) {
      return db.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(awsImportAccess)
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .for("update");
        if (!current) throw new Error("AWS import access state was not found");
        if (current.status === "cleanup_complete") {
          return { kind: "complete", record: current } as const;
        }
        if (
          input.operationKind === "check_cleanup" &&
          !isCleanupCheckSource(current)
        ) {
          return { kind: "rejected" } as const;
        }
        if (
          current.leaseExpiresAt !== null &&
          current.leaseExpiresAt.getTime() > input.now.getTime()
        ) {
          return { kind: "leased" } as const;
        }

        const [claimed] = await transaction
          .update(awsImportAccess)
          .set({
            status: "cleanup_checking" satisfies AwsImportAccessStatus,
            operationId: input.operationId,
            operationKind: input.operationKind,
            leaseExpiresAt: input.leaseExpiresAt,
            safeErrorCode: null,
            safeErrorSummary: "AWS 권한 정리 상태를 확인하고 있습니다.",
            updatedAt: input.now
          })
          .where(eq(awsImportAccess.awsConnectionId, input.connectionId))
          .returning();
        if (!claimed) throw new Error("AWS import cleanup inspection could not be claimed");
        return { kind: "claimed", record: claimed } as const;
      });
    },

    // gg: AWS read 결과는 같은 operation ID와 kind를 claim한 row에만 CAS 저장합니다.
    async finishCleanupInspection(input) {
      const [saved] = await db
        .update(awsImportAccess)
        .set({ ...input.changes, leaseExpiresAt: null, updatedAt: input.now })
        .where(and(
          eq(awsImportAccess.awsConnectionId, input.connectionId),
          eq(awsImportAccess.operationId, input.operationId),
          eq(awsImportAccess.operationKind, input.operationKind)
        ))
        .returning();
      return saved
        ? { kind: "saved", record: saved } as const
        : { kind: "stale" } as const;
    }
  };
}

/** gg: 확인 command는 이미 시작된 cleanup 흐름만 이어가고 setup 상태를 건너뛰지 않습니다. */
function isCleanupCheckSource(record: AwsImportAccessRecord): boolean {
  switch (record.status) {
    case "cleanup_policy_required":
    case "cleanup_manager_required":
    case "cleanup_required":
      return true;
    case "cleanup_checking":
    case "retry_required":
      return record.operationKind === "prepare_cleanup" ||
        record.operationKind === "check_cleanup";
    default:
      return false;
  }
}
