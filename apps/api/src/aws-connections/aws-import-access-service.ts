import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AwsImportAccessCommandResponse,
  AwsImportAccessNextAction,
  AwsImportAccessState,
  AwsImportAccessStatus
} from "@sketchcatch/types";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import type {
  AwsConnectionRecord,
  AwsConnectionRepository
} from "./aws-connection-service.js";
import type {
  AwsImportAccessGateway,
  CleanupInspection,
  ExpectedCurrentImportAccessState,
  ExpectedPolicyStackState,
  ManagerInspection
} from "./aws-import-access-gateway.js";
import { createAwsImportManagerContract } from "./aws-import-access-manager-template.js";
import type {
  AwsImportAccessRecord,
  AwsImportAccessRepository,
  AwsImportCleanupInspectionOperationKind
} from "./aws-import-access-repository.js";
import {
  hasNoAwsImportAccessCompanionArtifacts,
  isDirectAwsImportReadProbeMarker,
  requiresAwsImportAccessCleanup
} from "./aws-import-access-repository.js";
import { AWS_IMPORT_READERS } from "./aws-import-access-catalog.js";
import {
  probeAwsImportAccess,
  type AwsImportProbeResult
} from "./aws-import-access-probe.js";

const approvalTtlMs = 10 * 60 * 1000;
const operationLeaseTtlMs = 2 * 60 * 1000;
const readOperationLeaseTtlMs = 5 * 60 * 1000;

export type AwsImportAccessOwnerInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
};

export type AwsImportAccessApplyPolicyInput = AwsImportAccessOwnerInput & {
  approvalId: string;
  operationId: string;
};

export type AwsImportAccessPreviewResponse = AwsImportAccessCommandResponse & {
  approvalId: string;
};

export type AwsImportAccessServiceGateway = AwsImportAccessGateway;

export type AwsImportAccessService = {
  getState(input: AwsImportAccessOwnerInput): Promise<AwsImportAccessCommandResponse>;
  prepareManager(input: AwsImportAccessOwnerInput): Promise<AwsImportAccessCommandResponse>;
  checkManager(input: AwsImportAccessOwnerInput): Promise<AwsImportAccessCommandResponse>;
  previewPolicy(input: AwsImportAccessOwnerInput): Promise<AwsImportAccessPreviewResponse>;
  applyPolicy(input: AwsImportAccessApplyPolicyInput): Promise<AwsImportAccessCommandResponse>;
  checkImportReads(input: AwsImportAccessOwnerInput): Promise<AwsImportAccessCommandResponse>;
  prepareCleanup(input: AwsImportAccessOwnerInput): Promise<AwsImportAccessCommandResponse>;
  checkCleanup(input: AwsImportAccessOwnerInput): Promise<AwsImportAccessCommandResponse>;
};

export type CreateAwsImportAccessServiceOptions = {
  connectionRepository: AwsConnectionRepository;
  repository: AwsImportAccessRepository;
  gateway: AwsImportAccessServiceGateway;
  templateBucketName: string;
  templateStorageRegion?: string;
  now?: () => Date;
  generateApprovalSecret?: () => string;
  generateOperationId?: () => string;
  probeImportAccess?: (
    input: Parameters<typeof probeAwsImportAccess>[0]
  ) => Promise<AwsImportProbeResult>;
};

/** gg: 승인·lease·상태 전이를 한 command boundary에 모아 기존 배포 연결을 건드리지 않습니다. */
export function createAwsImportAccessService(
  options: CreateAwsImportAccessServiceOptions
): AwsImportAccessService {
  const now = options.now ?? (() => new Date());
  const generateApprovalSecret =
    options.generateApprovalSecret ?? (() => randomBytes(32).toString("base64url"));
  const generateOperationId = options.generateOperationId ?? randomUUID;
  const probeImportAccess = options.probeImportAccess ?? probeAwsImportAccess;

  /** gg: 직접·기존 경로 모두 같은 bounded probe를 사용하고 provider 원문은 결과에 남기지 않습니다. */
  async function runImportReadProbe(
    connection: Parameters<typeof probeAwsImportAccess>[0]["connection"]
  ): Promise<AwsImportProbeResult> {
    try {
      return await probeImportAccess({ connection });
    } catch {
      return {
        status: "retry_required",
        coreReady: false,
        serviceResults: [],
        limitedServiceLabels: [],
        safeErrorCode: "probe_retry"
      };
    }
  }

  /** gg: cleanup read는 AWS 호출 전에 lease를 claim하고 같은 operation CAS로만 결과를 저장합니다. */
  async function runCleanupInspection(
    input: AwsImportAccessOwnerInput,
    operationKind: AwsImportCleanupInspectionOperationKind
  ): Promise<AwsImportAccessCommandResponse> {
    const connection = await requireOwnedConnection(input, options.connectionRepository);
    const contract = createContract(
      connection,
      options.templateBucketName,
      options.templateStorageRegion
    );
    const commandNow = now();
    const current = await options.repository.getOrCreate({
      connectionId: input.connectionId,
      now: commandNow
    });
    const operationId = generateOperationId();
    // gg: 직접 읽기 확인 marker는 AWS 보조 artifact가 없으므로 정리 흐름을 만들지 않습니다.
    if (isDirectAwsImportReadProbeMarker(current)) {
      return toCommandResponse(current, current.operationId ?? operationId);
    }
    if (current.status === "cleanup_complete") {
      return toCommandResponse(current, current.operationId ?? operationId);
    }
    const claim = await options.repository.claimCleanupInspection({
      connectionId: input.connectionId,
      operationId,
      operationKind,
      now: commandNow,
      leaseExpiresAt: new Date(commandNow.getTime() + operationLeaseTtlMs)
    });
    if (claim.kind === "leased") {
      throw new AwsImportAccessLeaseError("다른 정리 확인이 진행 중입니다.");
    }
    if (claim.kind === "rejected") {
      throw new AwsImportAccessLeaseError("정리 상태가 변경되었습니다.");
    }
    if (claim.kind === "complete") {
      return toCommandResponse(claim.record, claim.record.operationId ?? operationId);
    }

    const inspection = await options.gateway.inspectCleanup({
      connection,
      contract,
      expectedCurrent: createExpectedCurrentState(claim.record)
    });
    const cleanup = deriveCleanupState(inspection);
    const completion = await options.repository.finishCleanupInspection({
      connectionId: input.connectionId,
      operationId,
      operationKind,
      now: now(),
      changes: {
        ...(operationKind === "prepare_cleanup" ? contractFields(contract) : {}),
        ...trustedCleanupInspectionFields(inspection),
        status: cleanup.status,
        operationId,
        operationKind,
        ...(operationKind === "prepare_cleanup"
          ? { cleanupStartedAt: commandNow }
          : { lastCheckedAt: commandNow }),
        safeErrorCode: cleanup.errorCode,
        safeErrorSummary: cleanup.summary
      }
    });
    if (completion.kind === "stale") {
      throw new AwsImportAccessLeaseError("정리 확인 상태가 변경되었습니다.");
    }
    return toCommandResponse(
      completion.record,
      operationId,
      cleanup.stackName
        ? createStackConsoleUrl(
            connection.region,
            cleanup.stackName === "policy"
              ? contract.policyStackName
              : contract.managerStackName
          )
        : undefined
    );
  }

  return {
    // gg: 상태 조회는 소유권만 확인하고 row가 없으면 공개 초기 상태를 합성해 삭제를 막지 않습니다.
    async getState(input) {
      await requireOwnedConnection(input, options.connectionRepository);
      const record = await options.repository.find(input.connectionId);
      return record
        ? toCommandResponse(record, record.operationId ?? generateOperationId())
        : createInitialStateResponse(input.connectionId, generateOperationId());
    },

    // gg: Manager 준비는 고객 AWS를 바꾸지 않고 private immutable Template Console URL만 만듭니다.
    async prepareManager(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const contract = createContract(
        connection,
        options.templateBucketName,
        options.templateStorageRegion
      );
      const operationId = generateOperationId();
      const current = await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      // gg: 정리 중이거나 완료된 연결은 기존 artifact를 건너뛰지 않으며, identity 없는 retry만 Console 재준비로 복구합니다.
      if (isCleanupLifecycleState(current.status) && !isRecoverableCleanupRetry(current)) {
        return toCommandResponse(current, current.operationId ?? operationId);
      }
      const inspection = await options.gateway.inspectManager({
        connection,
        contract,
        expectedCurrent: createExpectedCurrentState(current)
      });
      const managerReady = inspection.verified && inspection.managerStatus === "target";
      // gg: CloudFormation 읽기 권한이 없던 연결은 empty retry일 때만 새 Manager 승인 화면을 다시 엽니다.
      const canBootstrapCreate = canBootstrapManagerPreparation(current, inspection);
      const canCreate = (inspection.managerStatus === "absent" &&
        inspection.policyStatus === "absent") || canBootstrapCreate;
      const canUpdate = inspection.managerStatus === "owned_older" &&
        inspection.managerStackId !== null && inspection.policyStatus !== "invalid";
      const prepared = canCreate
        ? await options.gateway.prepareManager({
            connection,
            contract,
            mode: { kind: "create" }
          })
        : canUpdate
          ? await options.gateway.prepareManager({
              connection,
              contract,
              mode: { kind: "update", stackId: inspection.managerStackId! }
            })
          : undefined;
      const status: AwsImportAccessStatus = managerReady
        ? "policy_approval_required"
        : prepared
          ? "manager_approval_required"
          : inspection.reason === "retry" || (!canCreate && !canUpdate)
            ? "retry_required"
            : "manager_approval_required";
      const next = await saveCommandOrThrow(options.repository, {
        connectionId: input.connectionId,
        now: now(),
        changes: {
          ...contractFields(contract),
          ...trustedInspectionFields(current, inspection),
          status,
          operationId,
          operationKind: "prepare_manager",
          safeErrorCode: managerReady || prepared ? null : inspection.reason ?? "manager_drifted",
          safeErrorSummary: managerReady
            ? "가져오기 권한 추가를 확인해 주세요."
            : prepared
              ? "AWS Console에서 Manager 준비를 확인해 주세요."
              : "Manager 준비 상태를 다시 확인해 주세요."
        }
      });
      return toCommandResponse(
        next,
        operationId,
        prepared?.consoleUrl,
        prepared?.managerTemplateUrl
      );
    },

    // gg: Manager는 tag/output만이 아니라 exact Template hash까지 확인한 뒤에만 승인 단계로 갑니다.
    async checkManager(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const contract = createContract(
        connection,
        options.templateBucketName,
        options.templateStorageRegion
      );
      const current = await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      const operationId = generateOperationId();
      const inspection = await options.gateway.inspectManager({
        connection,
        contract,
        expectedCurrent: createExpectedCurrentState(current)
      });
      const status: AwsImportAccessStatus = inspection.verified
        ? "policy_approval_required"
        : inspection.reason === "retry"
          ? "retry_required"
          : "manager_approval_required";
      const saved = await saveCommandOrThrow(options.repository, {
        connectionId: input.connectionId,
        now: now(),
        changes: {
          ...contractFields(contract),
          ...trustedInspectionFields(current, inspection),
          status,
          operationId,
          operationKind: "check_manager",
          lastCheckedAt: now(),
          safeErrorCode: inspection.verified ? null : inspection.reason ?? "manager_not_ready",
          safeErrorSummary: inspection.verified
            ? "가져오기 권한 추가를 확인해 주세요."
            : "Manager 준비 상태를 다시 확인해 주세요."
        }
      });
      return toCommandResponse(saved, operationId);
    },

    // gg: raw approval secret은 응답으로 한 번만 내보내고 DB에는 binding SHA-256만 저장합니다.
    async previewPolicy(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const contract = createContract(
        connection,
        options.templateBucketName,
        options.templateStorageRegion
      );
      const current = await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      const inspection = await options.gateway.inspectManager({
        connection,
        contract,
        expectedCurrent: createExpectedCurrentState(current)
      });
      if (
        !inspection.verified ||
        inspection.managerStatus !== "target" ||
        !inspection.managerStackId ||
        !inspection.managerContractVersion ||
        !inspection.managerTemplateSha256
      ) {
        throw new AwsImportAccessApprovalError("Manager 상태를 다시 확인해 주세요.");
      }
      const approvalId = generateApprovalSecret();
      const operationId = generateOperationId();
      const approvalFingerprint = createApprovalFingerprint(
        approvalId,
        createApprovalBinding(connection, contract, approvalStateFromInspection(inspection))
      );
      const issuedAt = now();
      const issued = await options.repository.issueApproval({
        connectionId: input.connectionId,
        now: issuedAt,
        changes: {
          ...contractFields(contract),
          ...trustedInspectionFields(current, inspection),
          status: "policy_approval_required",
          approvalFingerprint,
          approvalExpiresAt: new Date(issuedAt.getTime() + approvalTtlMs),
          approvalConsumedAt: null,
          operationId,
          operationKind: "preview_policy",
          leaseExpiresAt: null,
          safeErrorCode: null,
          safeErrorSummary: "가져오기 권한 추가를 확인해 주세요."
        }
      });
      if (issued.kind === "leased") {
        throw new AwsImportAccessLeaseError("다른 권한 작업이 진행 중입니다.");
      }
      return { ...toCommandResponse(issued.record, operationId), approvalId };
    },

    // gg: 같은 operation은 먼저 저장 결과를 돌려주고 새 operation만 승인을 소비합니다.
    async applyPolicy(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const current = await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      if (current.operationId === input.operationId && current.approvalConsumedAt !== null) {
        return toCommandResponse(current, input.operationId);
      }

      const contract = createContract(
        connection,
        options.templateBucketName,
        options.templateStorageRegion
      );
      const approvalFingerprint = createApprovalFingerprint(
        input.approvalId,
        createApprovalBinding(connection, contract, approvalStateFromRecord(current))
      );
      if (
        !current.approvalFingerprint ||
        !safeDigestEqual(current.approvalFingerprint, approvalFingerprint)
      ) {
        throw new AwsImportAccessApprovalError("승인 정보가 달라졌습니다. 다시 확인해 주세요.");
      }

      const claimedAt = now();
      const claim = await options.repository.claimPolicyApply({
        connectionId: input.connectionId,
        operationId: input.operationId,
        approvalFingerprint,
        now: claimedAt,
        leaseExpiresAt: new Date(claimedAt.getTime() + operationLeaseTtlMs)
      });
      if (claim.kind === "idempotent") {
        return toCommandResponse(claim.record, input.operationId);
      }
      if (claim.kind === "leased") {
        throw new AwsImportAccessLeaseError("다른 권한 작업이 진행 중입니다.");
      }
      if (claim.kind === "rejected") {
        throw new AwsImportAccessApprovalError("승인이 만료되었거나 이미 사용되었습니다.");
      }
      if (claim.kind !== "claimed") {
        throw new AwsImportAccessApprovalError("승인 상태를 다시 확인해 주세요.");
      }

      const inspection = await options.gateway.inspectManager({
        connection,
        contract,
        expectedCurrent: createExpectedCurrentState(claim.record)
      });
      if (!inspectionMatchesApprovedState(claim.record, inspection)) {
        await options.repository.finishPolicyApply({
          connectionId: input.connectionId,
          operationId: input.operationId,
          now: now(),
          changes: {
            status: "policy_approval_required",
            leaseExpiresAt: null,
            safeErrorCode: "approval_state_changed",
            safeErrorSummary: "AWS 상태가 달라졌습니다. 다시 확인해 주세요."
          }
        });
        throw new AwsImportAccessApprovalError("AWS 상태가 달라졌습니다. 다시 확인해 주세요.");
      }
      const expectedPolicy = expectedPolicyStateFromRecord(claim.record);

      let result;
      try {
        result = await options.gateway.createOrUpdatePolicyStack({
          connection,
          contract,
          operationId: input.operationId,
          expectedPolicy
        });
      } catch {
        await options.repository.finishPolicyApply({
          connectionId: input.connectionId,
          operationId: input.operationId,
          now: now(),
          changes: {
            status: "retry_required",
            leaseExpiresAt: null,
            safeErrorCode: "policy_stack_retry",
            safeErrorSummary: "권한 준비를 마치지 못했습니다. 다시 시도해 주세요."
          }
        });
        throw new AwsImportAccessOperationError("권한 준비를 마치지 못했습니다.");
      }

      const completion = await options.repository.finishPolicyApply({
        connectionId: input.connectionId,
        operationId: input.operationId,
        now: now(),
        changes: {
          status: "checking_reads",
          policyStackId: result.policyStackId,
          leaseExpiresAt: null,
          safeErrorCode: null,
          safeErrorSummary: "가져오기 권한을 확인하고 있습니다."
        }
      });
      if (completion.kind === "stale") {
        throw new AwsImportAccessLeaseError("권한 작업 상태가 변경되었습니다.");
      }
      return toCommandResponse(completion.record, input.operationId);
    },

    // gg: 보조 Stack이 없는 신규 연결은 먼저 읽기만 확인하고, 부족할 때만 기존 Console 승인 흐름으로 돌아갑니다.
    async checkImportReads(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const current = await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      const canDirectlyProbe = hasNoAwsImportAccessCompanionArtifacts(current) &&
        (current.status === "check_required" || isDirectAwsImportReadProbeMarker(current));
      const operationId = generateOperationId();
      const claimedAt = now();
      const claim = await options.repository.claimImportReads({
        connectionId: input.connectionId,
        operationId,
        now: claimedAt,
        leaseExpiresAt: new Date(claimedAt.getTime() + readOperationLeaseTtlMs)
      });
      if (claim.kind === "leased") {
        throw new AwsImportAccessLeaseError("다른 권한 작업이 진행 중입니다.");
      }
      const contract = createContract(
        connection,
        options.templateBucketName,
        options.templateStorageRegion
      );
      const inspection = await options.gateway.inspectManager({
        connection,
        contract,
        expectedCurrent: createExpectedCurrentState(claim.record)
      });
      const hasNoAwsCompanionArtifacts = inspection.managerStatus === "absent" &&
        inspection.policyStatus === "absent";
      if (canDirectlyProbe && hasNoAwsCompanionArtifacts) {
        const probe = await runImportReadProbe(connection);
        const coreReadSummary = Object.fromEntries(
          probe.serviceResults
            .filter((result) => result.tier === "core")
            .map((result) => [result.serviceKey, result.outcome])
        );
        const expandedReadSummary = Object.fromEntries(
          probe.serviceResults
            .filter((result) => result.tier === "expanded")
            .map((result) => [result.serviceKey, result.outcome])
        );
        const status: AwsImportAccessStatus = probe.status === "update_required"
          ? "check_required"
          : probe.status;
        const completion = await options.repository.finishImportReads({
          connectionId: input.connectionId,
          operationId,
          now: now(),
          changes: {
            status,
            operationId,
            operationKind: "check_reads",
            coreReadSummary,
            expandedReadSummary,
            leaseExpiresAt: null,
            lastCheckedAt: now(),
            safeErrorCode: probe.safeErrorCode,
            safeErrorSummary: probe.status === "update_required"
              ? "AWS 구조를 읽는 데 필요한 권한을 준비해 주세요."
              : safeSummaryForProbeStatus(probe.status)
          }
        });
        if (completion.kind === "stale") {
          throw new AwsImportAccessLeaseError("권한 작업 상태가 변경되었습니다.");
        }
        return toCommandResponse(completion.record, operationId);
      }
      if (
        !inspection.verified || inspection.managerStatus !== "target" ||
        inspection.policyStatus !== "target"
      ) {
        const connectionUnavailable = inspection.reason === "connection";
        const completion = await options.repository.finishImportReads({
          connectionId: input.connectionId,
          operationId,
          now: now(),
          changes: {
            ...trustedInspectionFields(claim.record, inspection),
            status: connectionUnavailable ? "connection_required" : "retry_required",
            leaseExpiresAt: null,
            lastCheckedAt: now(),
            safeErrorCode: connectionUnavailable ? "target_role_unavailable" : "policy_not_ready",
            safeErrorSummary: connectionUnavailable
              ? "AWS 연결 설정을 다시 확인해 주세요."
              : "가져오기 Policy 준비 상태를 다시 확인해 주세요."
          }
        });
        if (completion.kind === "stale") {
          throw new AwsImportAccessLeaseError("권한 작업 상태가 변경되었습니다.");
        }
        return toCommandResponse(completion.record, operationId);
      }
      const probe = await runImportReadProbe(connection);
      const coreReadSummary = Object.fromEntries(
        probe.serviceResults
          .filter((result) => result.tier === "core")
          .map((result) => [result.serviceKey, result.outcome])
      );
      const expandedReadSummary = Object.fromEntries(
        probe.serviceResults
          .filter((result) => result.tier === "expanded")
          .map((result) => [result.serviceKey, result.outcome])
      );
      const completion = await options.repository.finishImportReads({
        connectionId: input.connectionId,
        operationId,
        now: now(),
        changes: {
          ...trustedInspectionFields(claim.record, inspection),
          status: probe.status,
          operationId,
          operationKind: "check_reads",
          coreReadSummary,
          expandedReadSummary,
          leaseExpiresAt: null,
          lastCheckedAt: now(),
          safeErrorCode: probe.safeErrorCode,
          safeErrorSummary: safeSummaryForProbeStatus(probe.status)
        }
      });
      if (completion.kind === "stale") {
        throw new AwsImportAccessLeaseError("권한 작업 상태가 변경되었습니다.");
      }
      return toCommandResponse(completion.record, operationId);
    },

    // gg: 정리 준비는 exact Stack 존재만 확인하고 고객 대신 삭제하지 않습니다.
    async prepareCleanup(input) {
      return runCleanupInspection(input, "prepare_cleanup");
    },

    // gg: 정리 확인도 read-only이며 Policy Stack 다음 Manager Stack 순서를 유지합니다.
    async checkCleanup(input) {
      return runCleanupInspection(input, "check_cleanup");
    }
  };
}

export class AwsImportAccessNotFoundError extends Error {
  /** gg: 소유하지 않은 connection도 존재 여부를 숨기고 같은 404로 응답합니다. */
  constructor(message = "AWS 연결을 찾을 수 없습니다.") {
    super(message);
    this.name = "AwsImportAccessNotFoundError";
  }
}

export class AwsImportAccessApprovalError extends Error {
  /** gg: approval mismatch는 AWS를 호출하기 전에 새 확인을 요구합니다. */
  constructor(message: string) {
    super(message);
    this.name = "AwsImportAccessApprovalError";
  }
}

export class AwsImportAccessLeaseError extends Error {
  /** gg: connection별 동시 Stack 작업은 짧은 충돌 응답으로 막습니다. */
  constructor(message: string) {
    super(message);
    this.name = "AwsImportAccessLeaseError";
  }
}

export class AwsImportAccessOperationError extends Error {
  /** gg: provider 원문 없이 재시도 가능한 사용자 메시지만 전달합니다. */
  constructor(message: string) {
    super(message);
    this.name = "AwsImportAccessOperationError";
  }
}

/** gg: 기존 repository의 user-scoped 조회를 모든 command의 첫 경계로 사용합니다. */
async function requireOwnedConnection(
  input: AwsImportAccessOwnerInput,
  repository: AwsConnectionRepository
): Promise<AwsConnectionRecord & { accountId: string; roleArn: string }> {
  const connection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );
  if (
    !connection ||
    connection.status !== "verified" ||
    !connection.accountId ||
    !connection.roleArn
  ) {
    throw new AwsImportAccessNotFoundError();
  }
  return connection as AwsConnectionRecord & { accountId: string; roleArn: string };
}

/** gg: connection의 저장 account·region·Role만 Task 2 contract 입력으로 사용합니다. */
function createContract(
  connection: AwsConnectionRecord & { accountId: string; roleArn: string },
  templateBucketName: string,
  templateStorageRegion?: string
) {
  return createAwsImportManagerContract({
    connectionId: connection.id,
    accountId: connection.accountId,
    region: connection.region,
    targetRoleArn: connection.roleArn,
    templateBucketName,
    ...(templateStorageRegion ? { templateStorageRegion } : {})
  });
}

type ImportContract = ReturnType<typeof createContract>;

/** gg: 내부 검증에 필요한 exact identity만 import-access row에 저장합니다. */
function contractFields(contract: ImportContract) {
  return {
    managerStackName: contract.managerStackName,
    policyStackName: contract.policyStackName,
    targetRoleArn: contract.targetRoleArn,
    serviceRoleArn: contract.serviceRoleArn,
    readPolicyArn: contract.readManagedPolicyArn,
    controlPolicyArn: contract.controlPolicyArn,
    cleanupVerificationPolicyArn: contract.cleanupVerificationPolicyArn
  };
}

type ApprovalCurrentState = {
  managerStackId: string;
  managerContractVersion: string;
  managerTemplateSha256: string;
  policyStackId: string | null;
  policyContractVersion: string | null;
  policyTemplateSha256: string | null;
  policyFingerprint: string | null;
};

/** gg: approval은 두 Stack identity, 두 Role, contract version과 hash 전체에 묶습니다. */
function createApprovalBinding(
  connection: AwsConnectionRecord & { accountId: string; roleArn: string },
  contract: ImportContract,
  current: ApprovalCurrentState
): string {
  return JSON.stringify({
    connectionId: connection.id,
    managerStackIdentity: current.managerStackId,
    policyStackIdentity: current.policyStackId,
    targetRoleArn: contract.targetRoleArn,
    serviceRoleArn: contract.serviceRoleArn,
    currentManagerContractVersion: current.managerContractVersion,
    targetManagerContractVersion: contract.contractVersion,
    currentManagerTemplateSha256: current.managerTemplateSha256,
    targetManagerTemplateSha256: contract.templateSha256,
    currentPolicyContractVersion: current.policyContractVersion,
    targetPolicyContractVersion: contract.policyContractVersion,
    currentPolicyTemplateSha256: current.policyTemplateSha256,
    targetPolicyTemplateSha256: contract.policyTemplateSha256,
    currentPolicyFingerprint: current.policyFingerprint,
    targetPolicyFingerprint: contract.policyFingerprint
  });
}

/** gg: trusted inspection metadata만 current-state columns에 기록해 target 값으로 덮지 않습니다. */
function trustedInspectionFields(
  current: AwsImportAccessRecord,
  inspection: ManagerInspection
) {
  const managerTrusted = inspection.managerStatus === "target" ||
    inspection.managerStatus === "owned_older";
  const managerAbsent = inspection.managerStatus === "absent";
  const policyTrusted = inspection.policyStatus === "target" ||
    inspection.policyStatus === "owned_older";
  const policyAbsent = inspection.policyStatus === "absent";
  return {
    managerStackId: managerTrusted
      ? inspection.managerStackId
      : managerAbsent ? null : current.managerStackId,
    managerContractVersion: managerTrusted
      ? inspection.managerContractVersion
      : managerAbsent ? null : current.managerContractVersion,
    managerTemplateHash: managerTrusted
      ? inspection.managerTemplateSha256
      : managerAbsent ? null : current.managerTemplateHash,
    policyStackId: policyTrusted
      ? inspection.policyStackId
      : policyAbsent ? null : current.policyStackId,
    policyContractVersion: policyTrusted
      ? inspection.policyContractVersion
      : policyAbsent ? null : current.policyContractVersion,
    policyTemplateHash: policyTrusted
      ? inspection.policyTemplateSha256
      : policyAbsent ? null : current.policyTemplateHash,
    policyFingerprint: policyTrusted
      ? inspection.policyFingerprint
      : policyAbsent ? null : current.policyFingerprint
  };
}

/** gg: cleanup이 전체 검증한 owned Manager identity만 다음 exact-state 확인에 저장합니다. */
function trustedCleanupInspectionFields(inspection: CleanupInspection) {
  const identity = inspection.verifiedManagerIdentity;
  if (
    !inspection.verified ||
    inspection.manager.stack.status !== "owned_present" ||
    !identity
  ) {
    return {};
  }
  return {
    managerStackId: identity.stackId,
    managerContractVersion: identity.contractVersion,
    managerTemplateHash: identity.templateSha256
  };
}

type ImportStackIdentityFields = Pick<
  AwsImportAccessRecord,
  | "managerStackId"
  | "managerContractVersion"
  | "managerTemplateHash"
  | "policyStackId"
  | "policyContractVersion"
  | "policyTemplateHash"
  | "policyFingerprint"
>;

/** gg: 저장된 exact identity가 하나라도 있으면 미확인 cleanup artifact가 있을 수 있어 재준비를 막습니다. */
function hasNoStoredImportStackIdentity(record: Partial<ImportStackIdentityFields>): boolean {
  return record.managerStackId === null &&
    record.managerContractVersion === null &&
    record.managerTemplateHash === null &&
    record.policyStackId === null &&
    record.policyContractVersion === null &&
    record.policyTemplateHash === null &&
    record.policyFingerprint === null;
}

/** gg: cleanup 확인이 CloudFormation read 거부로 멈춘 empty legacy row만 사용자의 새 Console 승인을 허용합니다. */
function isRecoverableCleanupRetry(
  record: Pick<AwsImportAccessRecord, "status" | "safeErrorCode"> &
    Partial<ImportStackIdentityFields>
): boolean {
  return record.status === "cleanup_required" &&
    (record.safeErrorCode === "retry" || record.safeErrorCode === "cleanup_retry") &&
    hasNoStoredImportStackIdentity(record);
}

/** gg: cleanup lifecycle는 삭제 가능 상태를 포함하므로 recovery 외 Manager 준비 요청을 상태 변경 없이 돌려보냅니다. */
function isCleanupLifecycleState(status: AwsImportAccessStatus): boolean {
  return status === "cleanup_policy_required" ||
    status === "cleanup_manager_required" ||
    status === "cleanup_checking" ||
    status === "cleanup_required" ||
    status === "cleanup_complete";
}

/** gg: legacy bootstrap은 초기 연결 또는 empty cleanup retry에서만 Console create URL을 발급합니다. */
function canBootstrapManagerPreparation(
  current: AwsImportAccessRecord,
  inspection: ManagerInspection
): boolean {
  return (current.status === "check_required" || isRecoverableCleanupRetry(current)) &&
    hasNoStoredImportStackIdentity(current) &&
    inspection.reason === "retry" &&
    inspection.managerStackId === null &&
    inspection.policyStackId === null;
}

/** gg: DB의 prior verified identity만 older Stack 분류에 제공하며 incomplete 값은 신뢰하지 않습니다. */
function createExpectedCurrentState(
  record: AwsImportAccessRecord
): ExpectedCurrentImportAccessState {
  return {
    ...(record.managerStackId && record.managerContractVersion && record.managerTemplateHash
      ? {
          manager: {
            stackId: record.managerStackId,
            contractVersion: record.managerContractVersion,
            templateSha256: record.managerTemplateHash
          }
        }
      : {}),
    ...(record.policyStackId && record.policyContractVersion && record.policyTemplateHash &&
        record.policyFingerprint
      ? {
          policy: {
            kind: "present" as const,
            stackId: record.policyStackId,
            contractVersion: record.policyContractVersion,
            templateSha256: record.policyTemplateHash,
            policyFingerprint: record.policyFingerprint
          }
        }
      : {})
  };
}

function approvalStateFromInspection(inspection: ManagerInspection): ApprovalCurrentState {
  if (
    !inspection.managerStackId ||
    !inspection.managerContractVersion ||
    !inspection.managerTemplateSha256
  ) {
    throw new AwsImportAccessApprovalError("Manager 상태를 다시 확인해 주세요.");
  }
  if (inspection.policyStatus === "absent") {
    return {
      managerStackId: inspection.managerStackId,
      managerContractVersion: inspection.managerContractVersion,
      managerTemplateSha256: inspection.managerTemplateSha256,
      policyStackId: null,
      policyContractVersion: null,
      policyTemplateSha256: null,
      policyFingerprint: null
    };
  }
  if (
    !inspection.policyStackId ||
    !inspection.policyContractVersion ||
    !inspection.policyTemplateSha256 ||
    !inspection.policyFingerprint
  ) {
    throw new AwsImportAccessApprovalError("Policy 상태를 다시 확인해 주세요.");
  }
  return {
    managerStackId: inspection.managerStackId,
    managerContractVersion: inspection.managerContractVersion,
    managerTemplateSha256: inspection.managerTemplateSha256,
    policyStackId: inspection.policyStackId,
    policyContractVersion: inspection.policyContractVersion,
    policyTemplateSha256: inspection.policyTemplateSha256,
    policyFingerprint: inspection.policyFingerprint
  };
}

function approvalStateFromRecord(record: AwsImportAccessRecord): ApprovalCurrentState {
  if (!record.managerStackId || !record.managerContractVersion || !record.managerTemplateHash) {
    throw new AwsImportAccessApprovalError("승인 정보를 다시 확인해 주세요.");
  }
  const expectedPolicy = expectedPolicyStateFromRecord(record);
  return {
    managerStackId: record.managerStackId,
    managerContractVersion: record.managerContractVersion,
    managerTemplateSha256: record.managerTemplateHash,
    policyStackId: expectedPolicy.kind === "present" ? expectedPolicy.stackId : null,
    policyContractVersion: expectedPolicy.kind === "present"
      ? expectedPolicy.contractVersion
      : null,
    policyTemplateSha256: expectedPolicy.kind === "present"
      ? expectedPolicy.templateSha256
      : null,
    policyFingerprint: expectedPolicy.kind === "present"
      ? expectedPolicy.policyFingerprint
      : null
  };
}

function expectedPolicyStateFromRecord(
  record: AwsImportAccessRecord
): ExpectedPolicyStackState {
  if (
    record.policyStackId === null &&
    record.policyContractVersion === null &&
    record.policyTemplateHash === null &&
    record.policyFingerprint === null
  ) return { kind: "absent" };
  if (
    record.policyStackId &&
    record.policyContractVersion &&
    record.policyTemplateHash &&
    record.policyFingerprint
  ) {
    return {
      kind: "present",
      stackId: record.policyStackId,
      contractVersion: record.policyContractVersion,
      templateSha256: record.policyTemplateHash,
      policyFingerprint: record.policyFingerprint
    };
  }
  throw new AwsImportAccessApprovalError("승인 정보를 다시 확인해 주세요.");
}

/** gg: claim 뒤 재검사 결과가 승인 시 current identity와 exact 일치할 때만 AWS mutation으로 갑니다. */
function inspectionMatchesApprovedState(
  record: AwsImportAccessRecord,
  inspection: ManagerInspection
): boolean {
  if (!inspection.verified || inspection.managerStatus !== "target") return false;
  try {
    return JSON.stringify(approvalStateFromInspection(inspection)) ===
      JSON.stringify(approvalStateFromRecord(record));
  } catch {
    return false;
  }
}

/** gg: raw secret과 bound contract를 함께 hash해 DB fingerprint를 만듭니다. */
function createApprovalFingerprint(approvalId: string, binding: string): string {
  return sha256(`${approvalId}\0${binding}`);
}

/** gg: digest 비교는 길이가 맞을 때 timing-safe 비교를 사용합니다. */
function safeDigestEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/** gg: exact Policy artifact가 모두 사라진 뒤 Manager로, Manager artifact가 모두 사라진 뒤 완료로 갑니다. */
function deriveCleanupState(inspection: CleanupInspection): {
  status: AwsImportAccessStatus;
  summary: string;
  errorCode: string | null;
  stackName?: "policy" | "manager";
} {
  if (!inspection.verified) {
    return {
      status: "cleanup_required",
      summary: "AWS 권한 정리 상태를 다시 확인해 주세요.",
      errorCode: inspection.reason ?? "cleanup_retry"
    };
  }
  if (inspection.policy.stack.status === "owned_present") {
    return {
      status: "cleanup_policy_required",
      summary: "AWS Console에서 가져오기 Policy를 먼저 정리해 주세요.",
      errorCode: null,
      stackName: "policy"
    };
  }
  if (
    inspection.policy.readPolicy.status !== "absent" ||
    inspection.policy.targetAttachment.status !== "absent"
  ) {
    return {
      status: "cleanup_required",
      summary: "Policy Stack 정리 뒤 남은 가져오기 Policy를 다시 확인해 주세요.",
      errorCode: "cleanup_policy_artifact_pending"
    };
  }
  if (inspection.manager.stack.status === "owned_present") {
    return {
      status: "cleanup_manager_required",
      summary: "AWS Console에서 Manager를 정리해 주세요.",
      errorCode: null,
      stackName: "manager"
    };
  }
  if (
    inspection.manager.serviceRole.status !== "absent" ||
    inspection.manager.controlPolicy.status !== "absent" ||
    inspection.manager.controlAttachment.status !== "absent" ||
    inspection.manager.cleanupPolicy.status !== "absent" ||
    inspection.manager.cleanupAttachment.status !== "absent"
  ) {
    return {
      status: "cleanup_required",
      summary: "Manager Stack 정리 뒤 남은 AWS 권한 항목을 다시 확인해 주세요.",
      errorCode: "cleanup_manager_artifact_pending"
    };
  }
  return {
    status: "cleanup_complete",
    summary: "AWS 가져오기 권한 정리가 끝났습니다.",
    errorCode: null
  };
}

/** gg: 공개 상태는 ARN·Policy·provider 원문을 제외한 안전한 요약만 만듭니다. */
function toPublicState(record: AwsImportAccessRecord): AwsImportAccessState {
  return {
    connectionId: record.awsConnectionId,
    status: record.status,
    nextAction: nextActionForRecord(record),
    cleanupAvailable: requiresAwsImportAccessCleanup(record),
    coreReady: Object.values(record.coreReadSummary ?? {}).every(
      (outcome) => outcome === "success"
    ) && Object.keys(record.coreReadSummary ?? {}).length > 0,
    limitedServiceLabels: Object.entries(record.expandedReadSummary ?? {})
      .filter(([, outcome]) => outcome !== "success")
      .flatMap(([serviceKey]) => {
        const reader = AWS_IMPORT_READERS.find((candidate) => candidate.serviceKey === serviceKey);
        return reader ? [reader.displayName] : [];
      }),
    lastCheckedAt: record.lastCheckedAt?.toISOString() ?? null,
    operationId: record.operationId,
    safeSummary: record.safeErrorSummary
  };
}

/** gg: mutation 응답은 현재 상태와 사용자의 다음 행동만 전달합니다. */
function toCommandResponse(
  record: AwsImportAccessRecord,
  operationId: string,
  consoleUrl?: string,
  managerTemplateUrl?: string
): AwsImportAccessCommandResponse {
  const state = toPublicState(record);
  return {
    operationId,
    state,
    nextAction: state.nextAction,
    ...(consoleUrl ? { consoleUrl } : {}),
    ...(managerTemplateUrl ? { managerTemplateUrl } : {})
  };
}

/** gg: 아직 command를 시작하지 않은 연결은 저장 없이 같은 check_required 공개 계약을 반환합니다. */
function createInitialStateResponse(
  connectionId: string,
  operationId: string
): AwsImportAccessCommandResponse {
  const state: AwsImportAccessState = {
    connectionId,
    status: "check_required",
    nextAction: "prepare_manager",
    cleanupAvailable: false,
    coreReady: false,
    limitedServiceLabels: [],
    lastCheckedAt: null,
    operationId: null,
    safeSummary: null
  };
  return {
    operationId,
    state,
    nextAction: state.nextAction
  };
}

const RETRY_NEXT_ACTION_BY_OPERATION_KIND: Readonly<Record<string, AwsImportAccessNextAction>> = {
  prepare_manager: "prepare_manager",
  check_manager: "check_manager",
  preview_policy: "preview_policy",
  apply_policy: "preview_policy",
  check_reads: "check_reads",
  prepare_cleanup: "check_cleanup",
  check_cleanup: "check_cleanup"
};

const RETRY_NEXT_ACTION_BY_SAFE_ERROR_CODE: Readonly<
  Record<string, AwsImportAccessNextAction>
> = {
  approval_state_changed: "preview_policy",
  policy_stack_retry: "preview_policy",
  policy_not_ready: "check_reads",
  probe_retry: "check_reads",
  manager_drifted: "prepare_manager",
  manager_not_ready: "check_manager",
  cleanup_retry: "check_cleanup",
  cleanup_policy_artifact_pending: "check_cleanup",
  cleanup_manager_artifact_pending: "check_cleanup"
};

/** gg: retry_required는 operation metadata를 우선하고 safe code는 legacy fallback으로만 사용합니다. */
export function nextActionForRecord(
  record: Pick<AwsImportAccessRecord, "status" | "operationKind" | "safeErrorCode"> &
    Partial<ImportStackIdentityFields>
): AwsImportAccessNextAction | null {
  if (record.status === "retry_required") {
    return (record.operationKind
      ? RETRY_NEXT_ACTION_BY_OPERATION_KIND[record.operationKind]
      : undefined) ?? (record.safeErrorCode
      ? RETRY_NEXT_ACTION_BY_SAFE_ERROR_CODE[record.safeErrorCode]
      : undefined) ?? null;
  }
  switch (record.status) {
    case "check_required": return "prepare_manager";
    case "manager_approval_required": return "check_manager";
    case "manager_checking": return "check_manager";
    case "policy_approval_required": return "preview_policy";
    case "policy_working": return "check_reads";
    case "checking_reads": return "check_reads";
    case "ready": return null;
    case "limited": return "check_reads";
    case "update_required": return "preview_policy";
    case "connection_required": return "open_settings";
    case "cleanup_policy_required": return "delete_policy_stack";
    case "cleanup_manager_required": return "delete_manager_stack";
    case "cleanup_checking": return "check_cleanup";
    case "cleanup_required": return isRecoverableCleanupRetry(record)
      ? "prepare_manager"
      : "check_cleanup";
    case "cleanup_complete": return null;
  }
}

/** gg: probe status마다 provider 원문 없는 fixed Korean summary만 DB와 API에 제공합니다. */
function safeSummaryForProbeStatus(status: AwsImportProbeResult["status"]): string {
  switch (status) {
    case "ready": return "AWS 가져오기 읽기 권한이 준비되었습니다.";
    case "limited": return "일부 선택 서비스는 가져오기가 제한됩니다.";
    case "update_required": return "핵심 서비스 읽기 권한을 업데이트해 주세요.";
    case "retry_required": return "AWS 읽기 상태를 잠시 후 다시 확인해 주세요.";
    case "connection_required": return "AWS 연결 설정을 다시 확인해 주세요.";
  }
}

/** gg: active lease가 있으면 다른 command가 operation state를 덮기 전에 409로 멈춥니다. */
async function saveCommandOrThrow(
  repository: AwsImportAccessRepository,
  input: Parameters<AwsImportAccessRepository["saveCommand"]>[0]
): Promise<AwsImportAccessRecord> {
  const result = await repository.saveCommand(input);
  if (result.kind === "leased") {
    throw new AwsImportAccessLeaseError("다른 권한 작업이 진행 중입니다.");
  }
  return result.record;
}

/** gg: Console URL에는 Stack 이름만 넣고 ARN이나 Template 내용을 공개하지 않습니다. */
function createStackConsoleUrl(region: string, stackName: string): string {
  const query = new URLSearchParams({ stackId: stackName });
  return `https://console.aws.amazon.com/cloudformation/home?region=${region}` +
    `#/stacks/stackinfo?${query.toString()}`;
}

/** gg: approval과 Template fingerprint에 lowercase SHA-256을 공통 사용합니다. */
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
