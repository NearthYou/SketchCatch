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
  ManagerInspection
} from "./aws-import-access-gateway.js";
import { createAwsImportManagerContract } from "./aws-import-access-manager-template.js";
import type {
  AwsImportAccessRecord,
  AwsImportAccessRepository
} from "./aws-import-access-repository.js";

const approvalTtlMs = 10 * 60 * 1000;
const operationLeaseTtlMs = 2 * 60 * 1000;

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
  now?: () => Date;
  generateApprovalSecret?: () => string;
  generateOperationId?: () => string;
};

/** gg: 승인·lease·상태 전이를 한 command boundary에 모아 기존 배포 연결을 건드리지 않습니다. */
export function createAwsImportAccessService(
  options: CreateAwsImportAccessServiceOptions
): AwsImportAccessService {
  const now = options.now ?? (() => new Date());
  const generateApprovalSecret =
    options.generateApprovalSecret ?? (() => randomBytes(32).toString("base64url"));
  const generateOperationId = options.generateOperationId ?? randomUUID;

  return {
    // gg: 상태 조회도 먼저 현재 사용자의 connection 소유권을 확인합니다.
    async getState(input) {
      await requireOwnedConnection(input, options.connectionRepository);
      const record = await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      return toCommandResponse(record, record.operationId ?? generateOperationId());
    },

    // gg: Manager 준비는 고객 AWS를 바꾸지 않고 private immutable Template Console URL만 만듭니다.
    async prepareManager(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const contract = createContract(connection, options.templateBucketName);
      const operationId = generateOperationId();
      const prepared = await options.gateway.prepareManager({ connection, contract });
      await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      const next = await saveCommandOrThrow(options.repository, {
        connectionId: input.connectionId,
        now: now(),
        changes: {
          ...contractFields(contract),
          status: "manager_approval_required",
          operationId,
          operationKind: "prepare_manager",
          safeErrorCode: null,
          safeErrorSummary: "AWS Console에서 Manager 준비를 확인해 주세요."
        }
      });
      return toCommandResponse(next, operationId, prepared.consoleUrl);
    },

    // gg: Manager는 tag/output만이 아니라 exact Template hash까지 확인한 뒤에만 승인 단계로 갑니다.
    async checkManager(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const contract = createContract(connection, options.templateBucketName);
      await options.repository.getOrCreate({ connectionId: input.connectionId, now: now() });
      const operationId = generateOperationId();
      const inspection = await options.gateway.inspectManager({ connection, contract });
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
          managerStackId: inspection.managerStackId,
          policyStackId: inspection.policyStackId,
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
      const contract = createContract(connection, options.templateBucketName);
      await options.repository.getOrCreate({
        connectionId: input.connectionId,
        now: now()
      });
      const inspection = await options.gateway.inspectManager({ connection, contract });
      if (!inspection.verified || !inspection.managerStackId) {
        throw new AwsImportAccessApprovalError("Manager 상태를 다시 확인해 주세요.");
      }
      const approvalId = generateApprovalSecret();
      const operationId = generateOperationId();
      const approvalFingerprint = createApprovalFingerprint(
        approvalId,
        createApprovalBinding(connection, contract, inspection)
      );
      const issuedAt = now();
      const issued = await options.repository.issueApproval({
        connectionId: input.connectionId,
        now: issuedAt,
        changes: {
          ...contractFields(contract),
          managerStackId: inspection.managerStackId,
          policyStackId: inspection.policyStackId,
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

      const contract = createContract(connection, options.templateBucketName);
      const inspection = await options.gateway.inspectManager({ connection, contract });
      if (!inspection.verified || !inspection.managerStackId) {
        throw new AwsImportAccessApprovalError("AWS 상태가 달라졌습니다. 다시 확인해 주세요.");
      }
      const approvalFingerprint = createApprovalFingerprint(
        input.approvalId,
        createApprovalBinding(connection, contract, inspection)
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

      let result;
      try {
        result = await options.gateway.createOrUpdatePolicyStack({
          connection,
          contract,
          operationId: input.operationId
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

    // gg: Task 4의 실제 probe가 연결될 때까지 읽기 확인 중 상태만 안전하게 기록합니다.
    async checkImportReads(input) {
      await requireOwnedConnection(input, options.connectionRepository);
      await options.repository.getOrCreate({ connectionId: input.connectionId, now: now() });
      const operationId = generateOperationId();
      const saved = await saveCommandOrThrow(options.repository, {
        connectionId: input.connectionId,
        now: now(),
        changes: {
          status: "checking_reads",
          operationId,
          operationKind: "check_reads",
          lastCheckedAt: now(),
          safeErrorCode: null,
          safeErrorSummary: "가져오기 권한을 확인하고 있습니다."
        }
      });
      return toCommandResponse(saved, operationId);
    },

    // gg: 정리 준비는 exact Stack 존재만 확인하고 고객 대신 삭제하지 않습니다.
    async prepareCleanup(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const contract = createContract(connection, options.templateBucketName);
      await options.repository.getOrCreate({ connectionId: input.connectionId, now: now() });
      const operationId = generateOperationId();
      const inspection = await options.gateway.inspectCleanup({ connection, contract });
      const cleanup = deriveCleanupState(inspection);
      const saved = await saveCommandOrThrow(options.repository, {
        connectionId: input.connectionId,
        now: now(),
        changes: {
          ...contractFields(contract),
          status: cleanup.status,
          operationId,
          operationKind: "prepare_cleanup",
          cleanupStartedAt: now(),
          safeErrorCode: cleanup.errorCode,
          safeErrorSummary: cleanup.summary
        }
      });
      return toCommandResponse(
        saved,
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
    },

    // gg: 정리 확인도 read-only이며 Policy Stack 다음 Manager Stack 순서를 유지합니다.
    async checkCleanup(input) {
      const connection = await requireOwnedConnection(input, options.connectionRepository);
      const contract = createContract(connection, options.templateBucketName);
      await options.repository.getOrCreate({ connectionId: input.connectionId, now: now() });
      const operationId = generateOperationId();
      const inspection = await options.gateway.inspectCleanup({ connection, contract });
      const cleanup = deriveCleanupState(inspection);
      const saved = await saveCommandOrThrow(options.repository, {
        connectionId: input.connectionId,
        now: now(),
        changes: {
          status: cleanup.status,
          operationId,
          operationKind: "check_cleanup",
          lastCheckedAt: now(),
          safeErrorCode: cleanup.errorCode,
          safeErrorSummary: cleanup.summary
        }
      });
      return toCommandResponse(
        saved,
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
  templateBucketName: string
) {
  return createAwsImportManagerContract({
    connectionId: connection.id,
    accountId: connection.accountId,
    region: connection.region,
    targetRoleArn: connection.roleArn,
    templateBucketName
  });
}

type ImportContract = ReturnType<typeof createContract>;

/** gg: 내부 검증에 필요한 exact identity만 import-access row에 저장합니다. */
function contractFields(contract: ImportContract) {
  return {
    managerStackName: contract.managerStackName,
    managerContractVersion: contract.contractVersion,
    managerTemplateHash: contract.templateSha256,
    policyStackName: contract.policyStackName,
    policyContractVersion: contract.policyContractVersion,
    targetRoleArn: contract.targetRoleArn,
    serviceRoleArn: contract.serviceRoleArn,
    readPolicyArn: contract.readManagedPolicyArn,
    controlPolicyArn: contract.controlPolicyArn,
    cleanupVerificationPolicyArn: contract.cleanupVerificationPolicyArn,
    policyFingerprint: contract.policyFingerprint
  };
}

/** gg: approval은 두 Stack identity, 두 Role, contract version과 hash 전체에 묶습니다. */
function createApprovalBinding(
  connection: AwsConnectionRecord & { accountId: string; roleArn: string },
  contract: ImportContract,
  inspection: ManagerInspection
): string {
  return JSON.stringify({
    connectionId: connection.id,
    managerStackIdentity: inspection.managerStackId,
    policyStackIdentity: inspection.policyStackId ?? contract.policyStackArn,
    targetRoleArn: contract.targetRoleArn,
    serviceRoleArn: contract.serviceRoleArn,
    currentManagerContractVersion: contract.contractVersion,
    targetManagerContractVersion: contract.contractVersion,
    currentManagerTemplateSha256: contract.templateSha256,
    targetManagerTemplateSha256: contract.templateSha256,
    currentPolicyContractVersion: inspection.policyStackExists
      ? contract.policyContractVersion
      : null,
    targetPolicyContractVersion: contract.policyContractVersion,
    currentPolicyTemplateSha256: inspection.policyStackExists
      ? contract.policyTemplateSha256
      : null,
    targetPolicyTemplateSha256: contract.policyTemplateSha256,
    currentPolicyFingerprint: inspection.policyStackExists
      ? contract.policyFingerprint
      : null,
    targetPolicyFingerprint: contract.policyFingerprint
  });
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

/** gg: Task 4가 artifact 확인을 강화하기 전에도 Policy-first 삭제 순서를 고정합니다. */
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
  if (inspection.policyStackExists) {
    return {
      status: "cleanup_policy_required",
      summary: "AWS Console에서 가져오기 Policy를 먼저 정리해 주세요.",
      errorCode: null,
      stackName: "policy"
    };
  }
  if (inspection.managerStackExists) {
    return {
      status: "cleanup_manager_required",
      summary: "AWS Console에서 Manager를 정리해 주세요.",
      errorCode: null,
      stackName: "manager"
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
    nextAction: nextActionForStatus(record.status),
    coreReady: Object.values(record.coreReadSummary ?? {}).every(
      (outcome) => outcome === "success"
    ) && Object.keys(record.coreReadSummary ?? {}).length > 0,
    limitedServiceLabels: Object.entries(record.expandedReadSummary ?? {})
      .filter(([, outcome]) => outcome !== "success")
      .map(([label]) => label),
    lastCheckedAt: record.lastCheckedAt?.toISOString() ?? null,
    operationId: record.operationId,
    safeSummary: record.safeErrorSummary
  };
}

/** gg: mutation 응답은 현재 상태와 사용자의 다음 행동만 전달합니다. */
function toCommandResponse(
  record: AwsImportAccessRecord,
  operationId: string,
  consoleUrl?: string
): AwsImportAccessCommandResponse {
  const state = toPublicState(record);
  return {
    operationId,
    state,
    nextAction: state.nextAction,
    ...(consoleUrl ? { consoleUrl } : {})
  };
}

/** gg: 상태마다 Settings가 실행할 수 있는 한 단계만 공개합니다. */
function nextActionForStatus(status: AwsImportAccessStatus): AwsImportAccessNextAction | null {
  switch (status) {
    case "check_required": return "prepare_manager";
    case "manager_approval_required": return "check_manager";
    case "manager_checking": return "check_manager";
    case "policy_approval_required": return "preview_policy";
    case "policy_working": return "check_reads";
    case "checking_reads": return "check_reads";
    case "ready": return null;
    case "limited": return "check_reads";
    case "update_required": return "preview_policy";
    case "retry_required": return "retry";
    case "cleanup_policy_required": return "delete_policy_stack";
    case "cleanup_manager_required": return "delete_manager_stack";
    case "cleanup_checking": return "check_cleanup";
    case "cleanup_required": return "check_cleanup";
    case "cleanup_complete": return null;
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
