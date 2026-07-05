import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type {
  AwsConnection,
  ResourceType,
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
  resourceTypes: ResourceType[];
};

export type CreateReverseEngineeringScanRecordInput = {
  id: string;
  projectId: string;
  awsConnectionId: string;
  provider: "aws";
  region: string;
  resourceTypes: ResourceType[];
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

export class ReverseEngineeringNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReverseEngineeringNotFoundError";
  }
}

// 스캔 생성부터 결과 저장까지 한 번에 처리하는 서비스 진입점입니다.
export async function createReverseEngineeringScan(
  input: CreateReverseEngineeringScanInput,
  repository: ReverseEngineeringRepository,
  options: ReverseEngineeringServiceOptions = {}
): Promise<{ scan: ReverseEngineeringScan; result: ReverseEngineeringScanResult }> {
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

    await appendUserFacingLog(repository, scan.id, "Reverse Engineering 스캔이 완료됐습니다.", {
      generateId,
      now,
      sequence: 2
    });

    return {
      scan: toReverseEngineeringScan(savedScan ?? { ...scan, status: "completed", completedAt }),
      result
    };
  } catch (error) {
    const failedAt = now();
    const errorSummary = error instanceof Error ? error.message : "Reverse Engineering scan failed";
    const failedScan = await repository.failScan(scan.id, errorSummary, failedAt);

    await appendUserFacingLog(repository, scan.id, `Reverse Engineering 스캔이 실패했습니다. ${errorSummary}`, {
      generateId,
      now,
      sequence: 2,
      level: "ERROR"
    });

    throw new ReverseEngineeringNotFoundError(
      failedScan ? errorSummary : "Reverse Engineering scan not found"
    );
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
        .where(eq(reverseEngineeringScans.id, scanId))
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

      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          deletedAt,
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
