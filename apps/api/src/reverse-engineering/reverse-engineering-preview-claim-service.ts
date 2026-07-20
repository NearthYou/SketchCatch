import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, gt, isNull } from "drizzle-orm";
import type {
  ArchitectureJson,
  DiagramJson,
  ProjectDraft,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScan,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  architectures,
  projectDrafts,
  projects,
  reverseEngineeringScanPreviews,
  reverseEngineeringScans
} from "../db/schema.js";
import { toProjectDraft } from "../modules/projects/project-drafts.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";

const PREVIEW_SCAN_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
const SOURCE_PROVENANCE_KEYS = [
  "reverseEngineeringSourceScanId",
  "reverseEngineeringDraftId",
  "reverseEngineeringSourceKind"
] as const;

export type ReverseEngineeringPreviewRecord = {
  id: string;
  userId: string;
  awsConnectionId: string | null;
  provider: "aws";
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
  rawResult: ReverseEngineeringScanResult;
  expiresAt: Date;
  claimedAt: Date | null;
  claimedProjectId: string | null;
  claimedScanId: string | null;
  claimedDraftId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectRecord = typeof projects.$inferSelect;
type ProjectDraftRecord = typeof projectDrafts.$inferSelect;
type ArchitectureRecord = typeof architectures.$inferSelect;
type ReverseEngineeringScanRecord = typeof reverseEngineeringScans.$inferSelect;

export type ReverseEngineeringPreviewClaimTransaction = {
  lockOwnedPreview(
    previewId: string,
    userId: string
  ): Promise<ReverseEngineeringPreviewRecord | undefined>;
  insertProject(input: {
    id: string;
    userId: string;
    name: string;
    description: string | null;
  }): Promise<ProjectRecord>;
  insertDraft(input: {
    id: string;
    projectId: string;
    diagramJson: DiagramJson;
    terraformFiles: null;
    revision: number;
  }): Promise<ProjectDraftRecord>;
  insertArchitecture(input: {
    id: string;
    projectId: string;
    version: number;
    source: "imported";
    architectureJson: ArchitectureJson;
  }): Promise<ArchitectureRecord>;
  insertCompletedScan(input: {
    id: string;
    projectId: string;
    awsConnectionId: string | null;
    provider: "aws";
    region: string;
    resourceTypes: ReverseEngineeringResourceSelection[];
    status: "completed";
    result: ReverseEngineeringScanResult;
    errorSummary: null;
    startedAt: Date;
    completedAt: Date;
    cancelRequestedAt: null;
    deletedAt: null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<ReverseEngineeringScanRecord>;
  claimPreview(input: {
    previewId: string;
    userId: string;
    claimedAt: Date;
    projectId: string;
    scanId: string;
    draftId: string;
  }): Promise<boolean>;
};

export type ReverseEngineeringPreviewClaimRepository = {
  transaction<T>(
    callback: (tx: ReverseEngineeringPreviewClaimTransaction) => Promise<T>
  ): Promise<T>;
};

export type ReverseEngineeringPreviewClaimInput = {
  userId: string;
  name: string;
  description: string | null;
  diagramJson: DiagramJson;
  architectureJson: ArchitectureJson;
  reverseEngineering: {
    previewId: string;
    publicDraftId: string;
    sourceNodeIds: string[];
  };
};

export type ReverseEngineeringPreviewClaimResult = {
  project: ProjectRecord;
  draft: ProjectDraft;
  architecture: ArchitectureRecord;
};

// gg: row lock·insert·conditional claim을 같은 Postgres transaction으로 묶습니다.
export function createPostgresReverseEngineeringPreviewClaimRepository(
  db: Database
): ReverseEngineeringPreviewClaimRepository {
  return {
    // gg: callback이 던지면 Project·Draft·Architecture·Scan·claim을 전부 rollback합니다.
    async transaction(callback) {
      return db.transaction(async (tx) =>
        callback({
          // gg: owner와 preview ID가 같은 row만 FOR UPDATE로 잠깁니다.
          async lockOwnedPreview(previewId, userId) {
            const [preview] = await tx
              .select()
              .from(reverseEngineeringScanPreviews)
              .where(
                and(
                  eq(reverseEngineeringScanPreviews.id, previewId),
                  eq(reverseEngineeringScanPreviews.userId, userId)
                )
              )
              .for("update");

            return preview;
          },
          // gg: claim이 성공할 transaction 안에서만 새 Project row를 만듭니다.
          async insertProject(input) {
            const [project] = await tx.insert(projects).values(input).returning();

            if (!project) {
              throw new Error("Reverse Engineering project creation failed");
            }

            return project;
          },
          // gg: server-stamped provenance가 든 Diagram을 실제 Project Draft로 저장합니다.
          async insertDraft(input) {
            const [draft] = await tx.insert(projectDrafts).values(input).returning();

            if (!draft) {
              throw new Error("Reverse Engineering project draft creation failed");
            }

            return draft;
          },
          // gg: 공개 source 의미와 실제 provenance가 든 Snapshot만 저장합니다.
          async insertArchitecture(input) {
            const [architecture] = await tx.insert(architectures).values(input).returning();

            if (!architecture) {
              throw new Error("Reverse Engineering architecture creation failed");
            }

            return architecture;
          },
          // gg: AWS/import 원본은 browser Board가 아닌 completed Scan result에만 연결합니다.
          async insertCompletedScan(input) {
            const [scan] = await tx
              .insert(reverseEngineeringScans)
              .values(input)
              .returning();

            if (!scan) {
              throw new Error("Reverse Engineering completed scan creation failed");
            }

            return scan;
          },
          // gg: 만료되지 않은 unclaimed owner row만 조건부로 1회 소비합니다.
          async claimPreview(input) {
            const [claimed] = await tx
              .update(reverseEngineeringScanPreviews)
              .set({
                claimedAt: input.claimedAt,
                claimedProjectId: input.projectId,
                claimedScanId: input.scanId,
                claimedDraftId: input.draftId,
                updatedAt: input.claimedAt
              })
              .where(
                and(
                  eq(reverseEngineeringScanPreviews.id, input.previewId),
                  eq(reverseEngineeringScanPreviews.userId, input.userId),
                  isNull(reverseEngineeringScanPreviews.claimedAt),
                  gt(reverseEngineeringScanPreviews.expiresAt, input.claimedAt)
                )
              )
              .returning({ id: reverseEngineeringScanPreviews.id });

            return claimed !== undefined;
          }
        })
      );
    }
  };
}

export type ReverseEngineeringPreviewClaimConflictReason =
  | "expired"
  | "claimed"
  | "public_draft_mismatch";

export class ReverseEngineeringPreviewClaimNotFoundError extends Error {
  // gg: owner가 다른 preview도 같은 404로 숨겨 식별자 탐색을 막습니다.
  constructor() {
    super("Reverse Engineering preview를 찾을 수 없습니다.");
    this.name = "ReverseEngineeringPreviewClaimNotFoundError";
  }
}

export class ReverseEngineeringPreviewClaimConflictError extends Error {
  readonly reason: ReverseEngineeringPreviewClaimConflictReason;

  // gg: browser에는 private 원인 없이 다시 스캔해야 하는 상태만 구분해 줍니다.
  constructor(reason: ReverseEngineeringPreviewClaimConflictReason) {
    super(
      reason === "expired"
        ? "Reverse Engineering preview가 만료됐습니다. 다시 스캔해 주세요."
        : reason === "claimed"
          ? "이미 적용한 Reverse Engineering preview입니다."
          : "Reverse Engineering preview와 적용할 Board가 일치하지 않습니다."
    );
    this.name = "ReverseEngineeringPreviewClaimConflictError";
    this.reason = reason;
  }
}

// gg: preview lock부터 실제 Scan 연결까지 하나의 transaction 안에서만 완료합니다.
export async function claimReverseEngineeringPreviewProject(
  input: ReverseEngineeringPreviewClaimInput,
  repository: ReverseEngineeringPreviewClaimRepository,
  options: {
    generateId?: () => string;
    now?: () => Date;
  } = {}
): Promise<ReverseEngineeringPreviewClaimResult> {
  const generateId = options.generateId ?? randomUUID;
  const now = options.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const claimedAt = now();
    const preview = await tx.lockOwnedPreview(
      input.reverseEngineering.previewId,
      input.userId
    );

    if (!preview) {
      throw new ReverseEngineeringPreviewClaimNotFoundError();
    }

    if (preview.expiresAt <= claimedAt) {
      throw new ReverseEngineeringPreviewClaimConflictError("expired");
    }

    if (preview.claimedAt !== null) {
      throw new ReverseEngineeringPreviewClaimConflictError("claimed");
    }

    const publicResult = createPublicReverseEngineeringPreviewResult(preview);
    validatePublicDraftConsistency(input, publicResult);

    const projectId = generateId();
    const draftId = generateId();
    const architectureId = generateId();
    const scanId = generateId();
    const architectureJson = stampSelectedArchitectureNodes({
      architectureJson: input.architectureJson,
      publicResult,
      sourceNodeIds: input.reverseEngineering.sourceNodeIds,
      scanId,
      draftId
    });
    const diagramJson = stampSelectedDiagramNodes({
      diagramJson: input.diagramJson,
      publicResult,
      sourceNodeIds: input.reverseEngineering.sourceNodeIds,
      scanId,
      draftId
    });
    const persistedResult = createPersistedScanResult({
      preview,
      projectId,
      scanId,
      draftId
    });
    const project = await tx.insertProject({
      id: projectId,
      userId: input.userId,
      name: input.name,
      description: input.description
    });
    const [draft, architecture] = await Promise.all([
      tx.insertDraft({
        id: draftId,
        projectId,
        diagramJson,
        terraformFiles: null,
        revision: 1
      }),
      tx.insertArchitecture({
        id: architectureId,
        projectId,
        version: 1,
        source: "imported",
        architectureJson
      })
    ]);

    await tx.insertCompletedScan({
      id: scanId,
      projectId,
      awsConnectionId: preview.awsConnectionId,
      provider: "aws",
      region: preview.region,
      resourceTypes: preview.resourceTypes,
      status: "completed",
      result: persistedResult,
      errorSummary: null,
      startedAt: preview.createdAt,
      completedAt: preview.updatedAt,
      cancelRequestedAt: null,
      deletedAt: null,
      createdAt: preview.createdAt,
      updatedAt: claimedAt
    });

    const claimed = await tx.claimPreview({
      previewId: preview.id,
      userId: input.userId,
      claimedAt,
      projectId,
      scanId,
      draftId
    });

    if (!claimed) {
      throw new ReverseEngineeringPreviewClaimConflictError("claimed");
    }

    return {
      project,
      draft: toProjectDraft(draft),
      architecture
    };
  });
}

// gg: raw_result를 매번 같은 공개 scan/draft identity로 정규화해 중복 공개 JSON을 저장하지 않습니다.
export function createPublicReverseEngineeringPreviewResult(
  preview: ReverseEngineeringPreviewRecord
): ReverseEngineeringScanResult {
  const scan = createPreviewScan(preview);
  const publicResult = normalizeReverseEngineeringScanResult(scan, preview.rawResult);

  return {
    ...publicResult,
    scan,
    reverseEngineeringDraft: {
      ...publicResult.reverseEngineeringDraft,
      id: `draft-${preview.id}`,
      scanId: preview.id,
      createdAt: scan.completedAt ?? scan.updatedAt
    }
  };
}

// gg: 공개 preview용 가상 project ID는 실제 Project provenance로 저장하지 않습니다.
function createPreviewScan(preview: ReverseEngineeringPreviewRecord): ReverseEngineeringScan {
  return {
    id: preview.id,
    projectId: PREVIEW_SCAN_PROJECT_ID,
    awsConnectionId: preview.awsConnectionId,
    provider: "aws",
    region: preview.region,
    resourceTypes: preview.resourceTypes,
    status: "completed",
    createdAt: preview.createdAt.toISOString(),
    updatedAt: preview.updatedAt.toISOString(),
    startedAt: preview.createdAt.toISOString(),
    completedAt: preview.updatedAt.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
}

// gg: browser가 보낸 draft와 source node가 서버가 공개했던 의미와 정확히 맞는지 확인합니다.
function validatePublicDraftConsistency(
  input: ReverseEngineeringPreviewClaimInput,
  publicResult: ReverseEngineeringScanResult
): void {
  if (input.reverseEngineering.publicDraftId !== publicResult.reverseEngineeringDraft.id) {
    throw new ReverseEngineeringPreviewClaimConflictError("public_draft_mismatch");
  }

  const sourceNodeIds = input.reverseEngineering.sourceNodeIds;
  const uniqueSourceNodeIds = new Set(sourceNodeIds);

  if (sourceNodeIds.length === 0 || uniqueSourceNodeIds.size !== sourceNodeIds.length) {
    throw new ReverseEngineeringPreviewClaimConflictError("public_draft_mismatch");
  }

  const publicNodeById = createUniqueNodeMap(
    publicResult.reverseEngineeringDraft.architectureJson
  );
  const architectureNodeById = createUniqueNodeMap(input.architectureJson);
  const diagramNodeById = createUniqueDiagramNodeMap(input.diagramJson);

  for (const sourceNodeId of sourceNodeIds) {
    const publicNode = publicNodeById.get(sourceNodeId);
    const architectureNode = architectureNodeById.get(sourceNodeId);
    const diagramNode = diagramNodeById.get(sourceNodeId);

    if (!publicNode || !architectureNode || !diagramNode?.parameters) {
      throw new ReverseEngineeringPreviewClaimConflictError("public_draft_mismatch");
    }

    const architectureSemantics = {
      type: architectureNode.type,
      label: architectureNode.label,
      config: omitSourceProvenance(architectureNode.config)
    };
    const publicSemantics = {
      type: publicNode.type,
      label: publicNode.label,
      config: publicNode.config
    };

    if (
      !isDeepStrictEqual(architectureSemantics, publicSemantics) ||
      !isDeepStrictEqual(
        omitSourceProvenance(diagramNode.parameters.values),
        publicNode.config
      )
    ) {
      throw new ReverseEngineeringPreviewClaimConflictError("public_draft_mismatch");
    }
  }

  validateSelectedSourceEdges({
    input,
    publicArchitecture:
      publicResult.reverseEngineeringDraft.architectureJson,
    sourceNodeIds: uniqueSourceNodeIds
  });
}

// gg: 선택 source 사이의 관계도 공개 draft와 다르면 private Scan provenance로 인정하지 않습니다.
function validateSelectedSourceEdges({
  input,
  publicArchitecture,
  sourceNodeIds
}: {
  input: ReverseEngineeringPreviewClaimInput;
  publicArchitecture: ArchitectureJson;
  sourceNodeIds: ReadonlySet<string>;
}): void {
  const selectsBothEnds = (sourceId: string, targetId: string) =>
    sourceNodeIds.has(sourceId) && sourceNodeIds.has(targetId);
  const publicEdges = publicArchitecture.edges
    .filter((edge) => selectsBothEnds(edge.sourceId, edge.targetId))
    .map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.label
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const architectureEdges = input.architectureJson.edges
    .filter((edge) => selectsBothEnds(edge.sourceId, edge.targetId))
    .map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.label
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const diagramEdges = input.diagramJson.edges
    .filter((edge) => selectsBothEnds(edge.sourceNodeId, edge.targetNodeId))
    .map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      label: edge.label
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (
    !isDeepStrictEqual(architectureEdges, publicEdges) ||
    !isDeepStrictEqual(diagramEdges, publicEdges)
  ) {
    throw new ReverseEngineeringPreviewClaimConflictError("public_draft_mismatch");
  }
}

// gg: 중복 node ID는 어느 공개 source를 가리키는지 모호하므로 fail closed 합니다.
function createUniqueNodeMap(
  architectureJson: ArchitectureJson
): ReadonlyMap<string, ArchitectureJson["nodes"][number]> {
  const nodes = new Map<string, ArchitectureJson["nodes"][number]>();

  for (const node of architectureJson.nodes) {
    if (nodes.has(node.id)) {
      throw new ReverseEngineeringPreviewClaimConflictError("public_draft_mismatch");
    }

    nodes.set(node.id, node);
  }

  return nodes;
}

// gg: Diagram에도 같은 ID가 둘이면 source ownership을 안전하게 정할 수 없습니다.
function createUniqueDiagramNodeMap(
  diagramJson: DiagramJson
): ReadonlyMap<string, DiagramJson["nodes"][number]> {
  const nodes = new Map<string, DiagramJson["nodes"][number]>();

  for (const node of diagramJson.nodes) {
    if (nodes.has(node.id)) {
      throw new ReverseEngineeringPreviewClaimConflictError("public_draft_mismatch");
    }

    nodes.set(node.id, node);
  }

  return nodes;
}

// gg: 비교할 때 browser가 임시로 붙인 preview provenance는 신뢰하거나 의미 비교에 쓰지 않습니다.
function omitSourceProvenance(
  values: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...values };

  for (const key of SOURCE_PROVENANCE_KEYS) {
    delete result[key];
  }

  return result;
}

// gg: Architecture source node의 의미는 서버 공개본으로 복원하고 위치만 사용자 선택을 따릅니다.
function stampSelectedArchitectureNodes({
  architectureJson,
  publicResult,
  sourceNodeIds,
  scanId,
  draftId
}: {
  architectureJson: ArchitectureJson;
  publicResult: ReverseEngineeringScanResult;
  sourceNodeIds: readonly string[];
  scanId: string;
  draftId: string;
}): ArchitectureJson {
  const sourceNodeIdSet = new Set(sourceNodeIds);
  const publicNodeById = createUniqueNodeMap(
    publicResult.reverseEngineeringDraft.architectureJson
  );

  return {
    ...architectureJson,
    nodes: architectureJson.nodes.map((node) => {
      if (!sourceNodeIdSet.has(node.id)) {
        return node;
      }

      const publicNode = publicNodeById.get(node.id)!;

      return {
        ...structuredClone(publicNode),
        positionX: node.positionX,
        positionY: node.positionY,
        config: {
          ...structuredClone(publicNode.config),
          reverseEngineeringSourceScanId: scanId,
          reverseEngineeringDraftId: draftId,
          reverseEngineeringSourceKind: "saved_scan"
        }
      };
    })
  };
}

// gg: Diagram source node도 공개 config에서 다시 만들고 실제 persisted provenance만 붙입니다.
function stampSelectedDiagramNodes({
  diagramJson,
  publicResult,
  sourceNodeIds,
  scanId,
  draftId
}: {
  diagramJson: DiagramJson;
  publicResult: ReverseEngineeringScanResult;
  sourceNodeIds: readonly string[];
  scanId: string;
  draftId: string;
}): DiagramJson {
  const sourceNodeIdSet = new Set(sourceNodeIds);
  const publicNodeById = createUniqueNodeMap(
    publicResult.reverseEngineeringDraft.architectureJson
  );

  return {
    ...diagramJson,
    nodes: diagramJson.nodes.map((node) => {
      if (!sourceNodeIdSet.has(node.id) || !node.parameters) {
        return node;
      }

      const publicNode = publicNodeById.get(node.id)!;
      const terraformResourceType = readNonEmptyString(
        publicNode.config["terraformResourceType"]
      );
      const terraformResourceName = readNonEmptyString(
        publicNode.config["terraformResourceName"]
      );
      const terraformFileName = readNonEmptyString(publicNode.config["terraformFileName"]);
      const terraformBlockType = readTerraformBlockType(
        publicNode.config["terraformBlockType"]
      );
      const { terraformBlockType: _browserBlockType, ...browserParameters } = node.parameters;

      return {
        ...node,
        type: terraformResourceType ?? publicNode.type,
        label: publicNode.label ?? node.id,
        parameters: {
          ...browserParameters,
          ...(terraformBlockType ? { terraformBlockType } : {}),
          resourceType: terraformResourceType ?? "",
          resourceName: terraformResourceName ?? "",
          fileName: terraformFileName ?? "",
          values: {
            ...structuredClone(publicNode.config),
            reverseEngineeringSourceScanId: scanId,
            reverseEngineeringDraftId: draftId,
            reverseEngineeringSourceKind: "saved_scan"
          }
        }
      };
    })
  };
}

// gg: raw_result에는 실제 Project·Scan·Draft identity만 덧씌우고 AWS 원본은 그대로 보존합니다.
function createPersistedScanResult({
  preview,
  projectId,
  scanId,
  draftId
}: {
  preview: ReverseEngineeringPreviewRecord;
  projectId: string;
  scanId: string;
  draftId: string;
}): ReverseEngineeringScanResult {
  const scan: ReverseEngineeringScan = {
    id: scanId,
    projectId,
    awsConnectionId: preview.awsConnectionId,
    provider: "aws",
    region: preview.region,
    resourceTypes: preview.resourceTypes,
    status: "completed",
    createdAt: preview.createdAt.toISOString(),
    updatedAt: preview.updatedAt.toISOString(),
    startedAt: preview.createdAt.toISOString(),
    completedAt: preview.updatedAt.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };

  return {
    ...structuredClone(preview.rawResult),
    scan,
    reverseEngineeringDraft: {
      ...structuredClone(preview.rawResult.reverseEngineeringDraft),
      id: draftId,
      scanId,
      architectureJson: structuredClone(preview.rawResult.architectureJson),
      createdAt: scan.completedAt ?? scan.updatedAt
    }
  };
}

// gg: 빈 문자열은 server-owned Terraform identity로 승격하지 않습니다.
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// gg: raw config가 명시한 Terraform block 종류 외에는 browser 값을 버립니다.
function readTerraformBlockType(value: unknown): "resource" | "data" | undefined {
  return value === "resource" || value === "data" ? value : undefined;
}
