import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type {
  AwsConnection,
  ArchitectureJson,
  DiscoveredResource,
  ReverseEngineeringDraft,
  ReverseEngineeringImportSuggestion,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScan,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanLogLevel,
  ReverseEngineeringScanResult,
  ReverseEngineeringScanStage
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  awsConnections,
  projects,
  reverseEngineeringScanLogs,
  reverseEngineeringScans
} from "../db/schema.js";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";
import { createAwsProviderAdapter, type AwsProviderAdapter } from "./aws-provider-adapter.js";
import { createAwsReverseEngineeringGateway } from "./aws-reverse-engineering-gateway.js";

export type ReverseEngineeringScanRecord = typeof reverseEngineeringScans.$inferSelect;
export type ReverseEngineeringScanLogRecord = typeof reverseEngineeringScanLogs.$inferSelect;

export type CreateReverseEngineeringScanInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  awsConnectionId: string;
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
};

export type CreateReverseEngineeringPreviewScanInput = Omit<
  CreateReverseEngineeringScanInput,
  "projectId"
>;

export type CreateReverseEngineeringScanRecordInput = {
  id: string;
  projectId: string;
  awsConnectionId: string;
  provider: "aws";
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
  status: "running";
  startedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AppendReverseEngineeringScanLogInput = {
  id: string;
  scanId: string;
  sequence: number;
  stage: ReverseEngineeringScanStage;
  level: ReverseEngineeringScanLogLevel;
  message: string;
  createdAt: Date;
};

export type ReverseEngineeringRepository = {
  findAccessibleProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<ProjectRecord | undefined>;
  findVerifiedAwsConnection(
    awsConnectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnection | undefined>;
  createScan(input: CreateReverseEngineeringScanRecordInput): Promise<ReverseEngineeringScanRecord>;
  completeScan(
    scanId: string,
    result: ReverseEngineeringScanResult,
    completedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  failScan(
    scanId: string,
    errorSummary: string,
    failedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  findAccessibleScan(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  listScansByProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<ReverseEngineeringScanRecord[]>;
  requestScanCancellation(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext,
    requestedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  softDeleteScan(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext,
    deletedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  appendScanLog(input: AppendReverseEngineeringScanLogInput): Promise<ReverseEngineeringScanLogRecord>;
  listScanLogs(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext
  ): Promise<ReverseEngineeringScanLogRecord[]>;
};

export type ReverseEngineeringServiceOptions = {
  adapter?: AwsProviderAdapter;
  generateId?: () => string;
  now?: () => Date;
};

export type ReverseEngineeringScanJob = {
  scan: ReverseEngineeringScan;
  run(): Promise<ReverseEngineeringScanResult>;
};

export type PersistedReverseEngineeringScanResult = Omit<
  ReverseEngineeringScanResult,
  "scan" | "reverseEngineeringDraft"
> & {
  scan?: ReverseEngineeringScan | undefined;
  reverseEngineeringDraft?: unknown;
};

const REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS = [
  "providerResourceId",
  "providerResourceType",
  "region",
  "accountId",
  "terraformResourceName",
  "terraformResourceType"
] as const;
const REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS = ["displayName", "description"] as const;

export class ReverseEngineeringNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReverseEngineeringNotFoundError";
  }
}

// JSONB에 저장된 과거 스캔은 draft가 없을 수 있으므로, 읽을 때만 현재 응답 계약으로 보정합니다.
export function normalizeReverseEngineeringScanResult(
  scan: ReverseEngineeringScan,
  persistedResult: PersistedReverseEngineeringScanResult
): ReverseEngineeringScanResult {
  const draft = isUsableReverseEngineeringDraft(persistedResult.reverseEngineeringDraft, scan.id)
    ? persistedResult.reverseEngineeringDraft
    : createReadCompatibilityDraft(scan, persistedResult.architectureJson);

  return {
    ...persistedResult,
    scan,
    reverseEngineeringDraft: draft,
    importSuggestions: sanitizeImportSuggestions(
      persistedResult.discoveredResources,
      persistedResult.importSuggestions
    )
  };
}

function createReadCompatibilityDraft(
  scan: ReverseEngineeringScan,
  architectureJson: ArchitectureJson
): ReverseEngineeringDraft {
  return {
    id: `draft-${scan.id}`,
    scanId: scan.id,
    architectureJson,
    protectedValueKeys: [...REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS],
    editableValueKeys: [...REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS],
    createdAt: scan.completedAt ?? scan.updatedAt
  };
}

function isUsableReverseEngineeringDraft(
  value: unknown,
  scanId: string
): value is ReverseEngineeringDraft {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    value.scanId === scanId &&
    isArchitectureJson(value.architectureJson) &&
    isStringArray(value.protectedValueKeys) &&
    isStringArray(value.editableValueKeys) &&
    isNonEmptyString(value.createdAt)
  );
}

function sanitizeImportSuggestions(
  discoveredResources: DiscoveredResource[],
  importSuggestions: ReverseEngineeringImportSuggestion[]
): ReverseEngineeringImportSuggestion[] {
  const reviewOnlyResourceIds = new Set(
    discoveredResources
      .filter((resource) => resource.resourceType === "UNKNOWN" || resource.analysisExcluded === true)
      .map((resource) => resource.id)
  );

  return importSuggestions.map((suggestion) => {
    if (
      !reviewOnlyResourceIds.has(suggestion.resourceId) ||
      !hasUnsafeImportHandoff(suggestion)
    ) {
      return suggestion;
    }

    return {
      id: suggestion.id,
      resourceId: suggestion.resourceId,
      status: "manual_review",
      handoffReady: false,
      reason: suggestion.reason ?? "검토 전용 Resource는 Terraform import 또는 배포에 사용할 수 없습니다."
    };
  });
}

function hasUnsafeImportHandoff(suggestion: ReverseEngineeringImportSuggestion): boolean {
  return (
    suggestion.status === "ready" ||
    suggestion.handoffReady ||
    suggestion.terraformAddress !== undefined ||
    suggestion.importCommand !== undefined ||
    suggestion.terraformBlockDraft !== undefined
  );
}

function isArchitectureJson(value: unknown): value is ArchitectureJson {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 스캔 row는 있지만 Provider 호출이 실패한 경우 404와 구분하기 위해 따로 던집니다.
export class ReverseEngineeringScanFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReverseEngineeringScanFailedError";
  }
}

class ReverseEngineeringScanCancelledError extends Error {
  constructor() {
    super("Reverse Engineering 스캔이 취소됐습니다.");
    this.name = "ReverseEngineeringScanCancelledError";
  }
}

const PREVIEW_SCAN_PROJECT_ID = "00000000-0000-4000-8000-000000000000";

// 새 프로젝트를 만들기 전 AWS를 먼저 읽기 위한 저장하지 않는 preview scan입니다.
export async function createReverseEngineeringPreviewScan(
  input: CreateReverseEngineeringPreviewScanInput,
  repository: ReverseEngineeringRepository,
  options: ReverseEngineeringServiceOptions = {}
): Promise<{ scan: ReverseEngineeringScan; result: ReverseEngineeringScanResult }> {
  const awsConnection = await repository.findVerifiedAwsConnection(
    input.awsConnectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new ReverseEngineeringNotFoundError("AWS connection not found");
  }

  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? randomUUID;
  const startedAt = now();
  const completedAt = now();
  const scan: ReverseEngineeringScan = {
    id: generateId(),
    projectId: PREVIEW_SCAN_PROJECT_ID,
    awsConnectionId: input.awsConnectionId,
    provider: "aws",
    region: input.region,
    resourceTypes: input.resourceTypes,
    status: "completed",
    createdAt: startedAt.toISOString(),
    updatedAt: completedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };

  try {
    const adapter =
      options.adapter ??
      createAwsProviderAdapter(createAwsReverseEngineeringGateway(awsConnection));
    const adapterResult = await adapter.scan({
      provider: "aws",
      region: input.region,
      resourceTypes: input.resourceTypes
    });
    const result: ReverseEngineeringScanResult = {
      ...adapterResult,
      scan,
      reverseEngineeringDraft: {
        ...adapterResult.reverseEngineeringDraft,
        id: `draft-${scan.id}`,
        scanId: scan.id,
        createdAt: scan.completedAt ?? scan.updatedAt
      }
    };

    return {
      scan,
      result
    };
  } catch (error) {
    throw new ReverseEngineeringScanFailedError(toErrorSummary(error));
  }
}

// 알 수 없는 adapter 오류도 사용자에게 보여줄 수 있는 짧은 실패 문장으로 바꿉니다.
function toErrorSummary(error: unknown): string {
  return error instanceof Error ? error.message : "Reverse Engineering scan failed";
}

// 스캔 생성부터 결과 저장까지 한 번에 처리하는 서비스 진입점입니다.
export async function createReverseEngineeringScan(
  input: CreateReverseEngineeringScanInput,
  repository: ReverseEngineeringRepository,
  options: ReverseEngineeringServiceOptions = {}
): Promise<{ scan: ReverseEngineeringScan; result: ReverseEngineeringScanResult }> {
  const job = await createReverseEngineeringScanJob(input, repository, options);
  const result = await job.run();

  return {
    scan: result.scan,
    result
  };
}

// API가 먼저 running scanId를 돌려주고, 실제 AWS 조회는 별도 작업으로 이어가게 나눕니다.
export async function createReverseEngineeringScanJob(
  input: CreateReverseEngineeringScanInput,
  repository: ReverseEngineeringRepository,
  options: ReverseEngineeringServiceOptions = {}
): Promise<ReverseEngineeringScanJob> {
  const project = await repository.findAccessibleProject(input.projectId, input.accessContext);

  if (!project) {
    throw new ReverseEngineeringNotFoundError("Project not found");
  }

  const awsConnection = await repository.findVerifiedAwsConnection(
    input.awsConnectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new ReverseEngineeringNotFoundError("AWS connection not found");
  }

  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? randomUUID;
  const startedAt = now();
  const scan = await repository.createScan({
    id: generateId(),
    projectId: input.projectId,
    awsConnectionId: input.awsConnectionId,
    provider: "aws",
    region: input.region,
    resourceTypes: input.resourceTypes,
    status: "running",
    startedAt,
    createdAt: startedAt,
    updatedAt: startedAt
  });

  await appendUserFacingLog(repository, scan.id, "Reverse Engineering 스캔을 시작했습니다.", {
    generateId,
    now,
    sequence: 1
  });

  return {
    scan: toReverseEngineeringScan(scan),
    run: () =>
      runReverseEngineeringScanJob({
        awsConnection,
        generateId,
        input,
        now,
        options,
        repository,
        scan
      })
  };
}

// running 상태로 만들어둔 scan을 실제 Provider Adapter로 완료 또는 실패 처리합니다.
async function runReverseEngineeringScanJob({
  awsConnection,
  generateId,
  input,
  now,
  options,
  repository,
  scan
}: {
  awsConnection: AwsConnection;
  generateId: () => string;
  input: CreateReverseEngineeringScanInput;
  now: () => Date;
  options: ReverseEngineeringServiceOptions;
  repository: ReverseEngineeringRepository;
  scan: ReverseEngineeringScanRecord;
}): Promise<ReverseEngineeringScanResult> {
  try {
    const adapter =
      options.adapter ??
      createAwsProviderAdapter(createAwsReverseEngineeringGateway(awsConnection));
    const adapterResult = await adapter.scan({
      provider: "aws",
      region: input.region,
      resourceTypes: input.resourceTypes
    });
    const completedAt = now();
    const completedScan = toReverseEngineeringScan({
      ...scan,
      status: "completed",
      completedAt,
      updatedAt: completedAt
    });
    const result: ReverseEngineeringScanResult = {
      ...adapterResult,
      scan: completedScan,
      reverseEngineeringDraft: {
        ...adapterResult.reverseEngineeringDraft,
        id: `draft-${completedScan.id}`,
        scanId: completedScan.id,
        createdAt: completedScan.completedAt ?? completedScan.updatedAt
      }
    };
    const savedScan = await repository.completeScan(scan.id, result, completedAt);

    if (!savedScan) {
      await throwIfScanWasCancelled(repository, input, scan.id, generateId, now);
      throw new ReverseEngineeringNotFoundError("Reverse Engineering scan not found");
    }

    await appendUserFacingLog(repository, scan.id, "Reverse Engineering 스캔이 완료됐습니다.", {
      generateId,
      now,
      sequence: 2
    });

    return {
      ...result,
      scan: toReverseEngineeringScan(savedScan)
    };
  } catch (error) {
    if (error instanceof ReverseEngineeringScanCancelledError) {
      throw error;
    }

    const failedAt = now();
    const errorSummary = toErrorSummary(error);
    const failedScan = await repository.failScan(scan.id, errorSummary, failedAt);

    await appendUserFacingLog(repository, scan.id, `Reverse Engineering 스캔이 실패했습니다. ${errorSummary}`, {
      generateId,
      now,
      sequence: 2,
      level: "ERROR"
    });

    if (!failedScan) {
      throw new ReverseEngineeringNotFoundError("Reverse Engineering scan not found");
    }

    throw new ReverseEngineeringScanFailedError(errorSummary);
  }
}

export function createPostgresReverseEngineeringRepository(
  db: Database
): ReverseEngineeringRepository {
  return {
    async findAccessibleProject(projectId, accessContext) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, accessContext.userId)));

      return project;
    },

    async findVerifiedAwsConnection(awsConnectionId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, awsConnectionId),
            eq(awsConnections.userId, accessContext.userId),
            eq(awsConnections.status, "verified")
          )
        );

      return awsConnection ? toAwsConnection(awsConnection) : undefined;
    },

    async createScan(input) {
      const [scan] = await db.insert(reverseEngineeringScans).values(input).returning();

      if (!scan) {
        throw new Error("Reverse Engineering scan creation failed");
      }

      return scan;
    },

    async completeScan(scanId, result, completedAt) {
      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          status: "completed",
          result,
          completedAt,
          updatedAt: completedAt
        })
        .where(and(eq(reverseEngineeringScans.id, scanId), eq(reverseEngineeringScans.status, "running")))
        .returning();

      return scan;
    },

    async failScan(scanId, errorSummary, failedAt) {
      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          status: "failed",
          errorSummary,
          completedAt: failedAt,
          updatedAt: failedAt
        })
        .where(eq(reverseEngineeringScans.id, scanId))
        .returning();

      return scan;
    },

    async findAccessibleScan(projectId, scanId, accessContext) {
      const [scan] = await db
        .select()
        .from(reverseEngineeringScans)
        .innerJoin(projects, eq(reverseEngineeringScans.projectId, projects.id))
        .where(
          and(
            eq(reverseEngineeringScans.id, scanId),
            eq(reverseEngineeringScans.projectId, projectId),
            eq(projects.userId, accessContext.userId),
            isNull(reverseEngineeringScans.deletedAt)
          )
        );

      return scan?.reverse_engineering_scans;
    },

    async listScansByProject(projectId, accessContext) {
      const rows = await db
        .select()
        .from(reverseEngineeringScans)
        .innerJoin(projects, eq(reverseEngineeringScans.projectId, projects.id))
        .where(
          and(
            eq(reverseEngineeringScans.projectId, projectId),
            eq(projects.userId, accessContext.userId),
            isNull(reverseEngineeringScans.deletedAt)
          )
        )
        .orderBy(desc(reverseEngineeringScans.createdAt));

      return rows.map((row) => row.reverse_engineering_scans);
    },

    async requestScanCancellation(projectId, scanId, accessContext, requestedAt) {
      const existingScan = await this.findAccessibleScan(projectId, scanId, accessContext);

      if (!existingScan) {
        return undefined;
      }

      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          cancelRequestedAt: requestedAt,
          status: existingScan.status === "running" ? "cancelled" : existingScan.status,
          updatedAt: requestedAt
        })
        .where(eq(reverseEngineeringScans.id, existingScan.id))
        .returning();

      return scan;
    },

    async softDeleteScan(projectId, scanId, accessContext, deletedAt) {
      const existingScan = await this.findAccessibleScan(projectId, scanId, accessContext);

      if (!existingScan) {
        return undefined;
      }

      await db.delete(reverseEngineeringScanLogs).where(eq(reverseEngineeringScanLogs.scanId, existingScan.id));

      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          deletedAt,
          errorSummary: null,
          result: null,
          updatedAt: deletedAt
        })
        .where(eq(reverseEngineeringScans.id, existingScan.id))
        .returning();

      return scan;
    },

    async appendScanLog(input) {
      const [log] = await db.insert(reverseEngineeringScanLogs).values(input).returning();

      if (!log) {
        throw new Error("Reverse Engineering scan log creation failed");
      }

      return log;
    },

    async listScanLogs(projectId, scanId, accessContext) {
      const existingScan = await this.findAccessibleScan(projectId, scanId, accessContext);

      if (!existingScan) {
        return [];
      }

      return db
        .select()
        .from(reverseEngineeringScanLogs)
        .where(eq(reverseEngineeringScanLogs.scanId, existingScan.id))
        .orderBy(asc(reverseEngineeringScanLogs.sequence));
    }
  };
}

// 취소 요청이 들어온 scan은 완료 결과로 저장하지 않고 cancelled 상태를 유지합니다.
async function throwIfScanWasCancelled(
  repository: ReverseEngineeringRepository,
  input: CreateReverseEngineeringScanInput,
  scanId: string,
  generateId: () => string,
  now: () => Date
): Promise<void> {
  const latestScan = await repository.findAccessibleScan(input.projectId, scanId, input.accessContext);

  if (latestScan?.status !== "cancelled") {
    return;
  }

  await appendUserFacingLog(repository, scanId, "Reverse Engineering 스캔이 취소됐습니다.", {
    generateId,
    now,
    sequence: 2,
    level: "WARN"
  });
  throw new ReverseEngineeringScanCancelledError();
}

export function toReverseEngineeringScan(row: ReverseEngineeringScanRecord): ReverseEngineeringScan {
  return {
    id: row.id,
    projectId: row.projectId,
    awsConnectionId: row.awsConnectionId,
    provider: "aws",
    region: row.region,
    resourceTypes: row.resourceTypes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    errorSummary: row.errorSummary
  };
}

export function toReverseEngineeringScanLogLine(
  row: ReverseEngineeringScanLogRecord
): ReverseEngineeringScanLogLine {
  return {
    id: row.id,
    scanId: row.scanId,
    sequence: row.sequence,
    stage: row.stage,
    level: row.level,
    message: row.message,
    createdAt: row.createdAt.toISOString()
  };
}

function toAwsConnection(row: typeof awsConnections.$inferSelect): AwsConnection {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    roleArn: row.roleArn,
    externalId: row.externalId,
    region: row.region,
    status: row.status,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function appendUserFacingLog(
  repository: ReverseEngineeringRepository,
  scanId: string,
  message: string,
  options: {
    generateId: () => string;
    now: () => Date;
    sequence: number;
    level?: ReverseEngineeringScanLogLevel;
  }
): Promise<ReverseEngineeringScanLogRecord> {
  return repository.appendScanLog({
    id: options.generateId(),
    scanId,
    sequence: options.sequence,
    stage: "provider_api",
    level: options.level ?? "INFO",
    message,
    createdAt: options.now()
  });
}
