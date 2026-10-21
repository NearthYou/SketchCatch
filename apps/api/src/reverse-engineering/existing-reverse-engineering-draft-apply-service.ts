import { isDeepStrictEqual } from "node:util";
import {
  createBoardAutoOrganizeSourceFingerprint,
  hasSameBoardAutoOrganizeSemantics,
  isBoardAutoPresentationFrameNode,
  serializeBoardAutoOrganizeSource,
  type ApplyReverseEngineeringDraftRequest,
  type ArchitectureJson,
  type DiagramEdge,
  type DiagramJson,
  type DiagramNode
} from "@sketchcatch/types";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { projectDrafts } from "../db/schema.js";
import {
  saveServerConfirmedReverseEngineeringDraftRevision,
  type SaveProjectDraftRevisionResult
} from "../modules/projects/project-draft-save-service.js";
import type { ProjectDraftRow } from "../modules/projects/project-drafts.js";
import { sanitizeAwsProjectDiagramRead } from "./aws-project-read-sanitizer.js";
import { validateAndStampReverseEngineeringImportDecisions } from "./reverse-engineering-import-decision.js";
import {
  createPostgresReverseEngineeringRepository,
  normalizeReverseEngineeringScanResult,
  toReverseEngineeringScan,
  type ReverseEngineeringScanRecord
} from "./reverse-engineering-service.js";

const SOURCE_PROVENANCE_KEYS = [
  "reverseEngineeringSourceScanId",
  "reverseEngineeringDraftId",
  "reverseEngineeringSourceKind"
] as const;

export type ExistingReverseEngineeringDraftApplyInput = ApplyReverseEngineeringDraftRequest & {
  readonly db: Database;
  readonly projectId: string;
  readonly userId: string;
};

export type ExistingReverseEngineeringDraftApplyDependencies = {
  readonly readDraft?: (input: {
    readonly db: Database;
    readonly projectId: string;
  }) => Promise<ProjectDraftRow | null>;
  readonly findAccessibleScan?: (input: {
    readonly db: Database;
    readonly projectId: string;
    readonly scanId: string;
    readonly userId: string;
  }) => Promise<ReverseEngineeringScanRecord | undefined>;
  readonly saveServerConfirmedDraft?: typeof saveServerConfirmedReverseEngineeringDraftRevision;
};

export type ExistingReverseEngineeringDraftMismatchReason =
  | "invalid_request"
  | "source_mismatch"
  | "scan_mismatch"
  | "candidate_mismatch";

const MISMATCH_MESSAGE_BY_REASON: Readonly<
  Record<ExistingReverseEngineeringDraftMismatchReason, string>
> = {
  invalid_request: "가져오기 적용 요청을 확인할 수 없습니다.",
  source_mismatch: "미리보기를 만든 뒤 프로젝트 초안이 바뀌었습니다.",
  scan_mismatch: "가져온 AWS 원본을 확인할 수 없습니다. 다시 가져와 주세요.",
  candidate_mismatch: "적용할 보드가 가져온 AWS 원본과 일치하지 않습니다."
};

export class ExistingReverseEngineeringDraftMismatchError extends Error {
  readonly reason: ExistingReverseEngineeringDraftMismatchReason;

  /** gg: private Scan ID나 내부 비교값 없이 사용자가 다시 시도할 행동만 알려줍니다. */
  constructor(reason: ExistingReverseEngineeringDraftMismatchReason) {
    super(MISMATCH_MESSAGE_BY_REASON[reason]);
    this.name = "ExistingReverseEngineeringDraftMismatchError";
    this.reason = reason;
  }
}

/** gg: 현재 Draft·저장 Scan·공개 후보를 서버에서 다시 맞춘 뒤 전용 CAS 저장만 호출합니다. */
export async function applyExistingReverseEngineeringDraft(
  input: ExistingReverseEngineeringDraftApplyInput,
  dependencies: ExistingReverseEngineeringDraftApplyDependencies = {}
): Promise<SaveProjectDraftRevisionResult> {
  validateRequestEnvelope(input);
  const serializedSource = serializeBoardAutoOrganizeSource(input.sourceDiagram);

  if (createBoardAutoOrganizeSourceFingerprint(input.sourceDiagram) !== input.sourceFingerprint) {
    throw new ExistingReverseEngineeringDraftMismatchError("source_mismatch");
  }

  const readDraft = dependencies.readDraft ?? readProjectDraft;
  const persistedDraft = await readDraft({ db: input.db, projectId: input.projectId });

  if (!persistedDraft) {
    throw new ExistingReverseEngineeringDraftMismatchError("source_mismatch");
  }

  if (persistedDraft.revision !== input.expectedRevision) {
    return { status: "conflict", currentDraft: persistedDraft };
  }

  const publicPersistedDiagram = sanitizeAwsProjectDiagramRead(persistedDraft.diagramJson);
  if (
    serializeBoardAutoOrganizeSource(publicPersistedDiagram) !== serializedSource ||
    !hasSameBoardAutoOrganizeSemantics(publicPersistedDiagram, input.sourceDiagram) ||
    !isDeepStrictEqual(persistedDraft.terraformFiles ?? [], input.terraformFiles ?? [])
  ) {
    throw new ExistingReverseEngineeringDraftMismatchError("source_mismatch");
  }

  const findAccessibleScan = dependencies.findAccessibleScan ?? readAccessibleScan;
  const scanRow = await findAccessibleScan({
    db: input.db,
    projectId: input.projectId,
    scanId: input.sourceScanId,
    userId: input.userId
  });
  const storedScanResult = validateStoredScanIdentity(input, scanRow);
  const publicScanResult = normalizeStoredScanResult(scanRow!, storedScanResult);

  validateCandidateAgainstPublicScan({
    candidateArchitectureJson: input.candidateArchitectureJson,
    candidateDiagram: input.candidateDiagram,
    publicArchitecture: publicScanResult.reverseEngineeringDraft.architectureJson,
    sourceDiagram: input.sourceDiagram,
    sourceEdgeIds: input.sourceEdgeIds,
    sourceNodeIds: input.sourceNodeIds
  });

  const sourceStampedDiagram = stampCandidateSourceNodes({
    candidateDiagram: input.candidateDiagram,
    publicArchitecture: publicScanResult.reverseEngineeringDraft.architectureJson,
    protectedValueKeys: publicScanResult.reverseEngineeringDraft.protectedValueKeys,
    editableValueKeys: publicScanResult.reverseEngineeringDraft.editableValueKeys,
    sourceDraftId: input.sourceDraftId,
    sourceNodeIds: input.sourceNodeIds,
    sourceScanId: input.sourceScanId
  });
  const diagramJson = validateAndStampReverseEngineeringImportDecisions({
    request: input.importDecision,
    diagramJson: sourceStampedDiagram,
    appliedSourceNodeIds: input.sourceNodeIds,
    storedScanResult
  });
  const saveServerConfirmedDraft =
    dependencies.saveServerConfirmedDraft ?? saveServerConfirmedReverseEngineeringDraftRevision;

  return saveServerConfirmedDraft({
    allowedImportDecisionStampNodeIds: [...input.sourceNodeIds],
    db: input.db,
    input: {
      diagramJson,
      expectedRevision: input.expectedRevision,
      ...(persistedDraft.terraformFiles === null
        ? {}
        : { terraformFiles: structuredClone(persistedDraft.terraformFiles) })
    },
    projectId: input.projectId,
    userId: input.userId
  });
}

/** gg: schema 밖에서 호출돼도 revision과 source 소유권 목록을 모호하게 받지 않습니다. */
function validateRequestEnvelope(input: ExistingReverseEngineeringDraftApplyInput): void {
  if (
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision <= 0 ||
    !/^[0-9a-f]{8}$/u.test(input.sourceFingerprint) ||
    !isNonEmptyUniqueStringArray(input.sourceNodeIds, true) ||
    !isNonEmptyUniqueStringArray(input.sourceEdgeIds, false) ||
    !isNonEmptyString(input.sourceScanId) ||
    !isNonEmptyString(input.sourceDraftId)
  ) {
    throw new ExistingReverseEngineeringDraftMismatchError("invalid_request");
  }
}

/** gg: 소유권을 확인한 완료 Scan과 그 안의 실제 Project·Draft identity만 사용합니다. */
function validateStoredScanIdentity(
  input: ExistingReverseEngineeringDraftApplyInput,
  scanRow: ReverseEngineeringScanRecord | undefined
): NonNullable<ReverseEngineeringScanRecord["result"]> {
  const storedResult = scanRow?.result;

  if (
    !scanRow ||
    scanRow.id !== input.sourceScanId ||
    scanRow.projectId !== input.projectId ||
    scanRow.status !== "completed" ||
    scanRow.deletedAt !== null ||
    !storedResult ||
    storedResult.scan.id !== input.sourceScanId ||
    storedResult.scan.projectId !== input.projectId ||
    storedResult.scan.status !== "completed" ||
    storedResult.reverseEngineeringDraft.id !== input.sourceDraftId ||
    storedResult.reverseEngineeringDraft.scanId !== input.sourceScanId
  ) {
    throw new ExistingReverseEngineeringDraftMismatchError("scan_mismatch");
  }

  return storedResult;
}

/** gg: 서버 공개 Resource·관계와 같은 의미만 후보의 AWS 소유 영역으로 인정합니다. */
function validateCandidateAgainstPublicScan({
  candidateArchitectureJson,
  candidateDiagram,
  publicArchitecture,
  sourceDiagram,
  sourceEdgeIds,
  sourceNodeIds
}: {
  readonly candidateArchitectureJson: ArchitectureJson;
  readonly candidateDiagram: DiagramJson;
  readonly publicArchitecture: ArchitectureJson;
  readonly sourceDiagram: DiagramJson;
  readonly sourceEdgeIds: readonly string[];
  readonly sourceNodeIds: readonly string[];
}): void {
  const publicNodeById = createUniqueMap(publicArchitecture.nodes);
  const candidateArchitectureNodeById = createUniqueMap(candidateArchitectureJson.nodes);
  const candidateDiagramNodeById = createUniqueMap(candidateDiagram.nodes);
  const ownedNodeIds = new Set(sourceNodeIds);

  for (const sourceNodeId of sourceNodeIds) {
    const publicNode = publicNodeById.get(sourceNodeId);
    const candidateArchitectureNode = candidateArchitectureNodeById.get(sourceNodeId);
    const candidateDiagramNode = candidateDiagramNodeById.get(sourceNodeId);

    if (
      !publicNode ||
      !candidateArchitectureNode ||
      !candidateDiagramNode ||
      !hasSameArchitectureNodeSemantics(publicNode, candidateArchitectureNode) ||
      !hasSameDiagramNodeSemantics(publicNode, candidateDiagramNode)
    ) {
      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }
  }

  const publicEdgeById = createUniqueMap(publicArchitecture.edges);
  const candidateArchitectureEdgeById = createUniqueMap(candidateArchitectureJson.edges);
  const candidateDiagramEdgeById = createUniqueMap(candidateDiagram.edges);
  const ownedEdgeIds = new Set(sourceEdgeIds);
  const sourceEdgeById = createUniqueMap(sourceDiagram.edges);

  for (const publicEdge of publicArchitecture.edges) {
    const isApplicablePublicEdge =
      touchesOwnedNode(publicEdge.sourceId, publicEdge.targetId, ownedNodeIds) &&
      candidateArchitectureNodeById.has(publicEdge.sourceId) &&
      candidateArchitectureNodeById.has(publicEdge.targetId) &&
      candidateDiagramNodeById.has(publicEdge.sourceId) &&
      candidateDiagramNodeById.has(publicEdge.targetId);
    const existingSourceEdge = sourceEdgeById.get(publicEdge.id);
    const isAlreadyPreservedSourceEdge =
      existingSourceEdge !== undefined &&
      isDeepStrictEqual(toDiagramEdgeSemantics(existingSourceEdge), publicEdge);

    if (
      isApplicablePublicEdge &&
      !isAlreadyPreservedSourceEdge &&
      !ownedEdgeIds.has(publicEdge.id)
    ) {
      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }
  }

  for (const sourceEdgeId of sourceEdgeIds) {
    const publicEdge = publicEdgeById.get(sourceEdgeId);
    const candidateArchitectureEdge = candidateArchitectureEdgeById.get(sourceEdgeId);
    const candidateDiagramEdge = candidateDiagramEdgeById.get(sourceEdgeId);

    if (
      !publicEdge ||
      !candidateArchitectureEdge ||
      !candidateDiagramEdge ||
      !touchesOwnedNode(publicEdge.sourceId, publicEdge.targetId, ownedNodeIds) ||
      !isDeepStrictEqual(toArchitectureEdgeSemantics(candidateArchitectureEdge), publicEdge) ||
      !isDeepStrictEqual(toDiagramEdgeSemantics(candidateDiagramEdge), publicEdge)
    ) {
      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }
  }

  validateEdgesTouchingOwnedNodes({
    candidateArchitectureJson,
    candidateDiagram,
    ownedEdgeIds,
    ownedNodeIds,
    sourceDiagram
  });
  validateNonOwnedCandidateNodes({
    candidateDiagram,
    ownedNodeIds,
    publicNodeById,
    sourceDiagram
  });
}

/** gg: 손상된 저장 결과의 내부 오류 대신 다시 가져오라는 고정 메시지만 반환합니다. */
function normalizeStoredScanResult(
  scanRow: ReverseEngineeringScanRecord,
  storedScanResult: NonNullable<ReverseEngineeringScanRecord["result"]>
) {
  try {
    return normalizeReverseEngineeringScanResult(
      toReverseEngineeringScan(scanRow),
      storedScanResult
    );
  } catch {
    throw new ExistingReverseEngineeringDraftMismatchError("scan_mismatch");
  }
}

/** gg: 이번 Scan 밖 node의 import 결정을 전용 저장 경계로 만들거나 바꾸지 못하게 합니다. */
function validateNonOwnedCandidateNodes({
  candidateDiagram,
  ownedNodeIds,
  publicNodeById,
  sourceDiagram
}: {
  readonly candidateDiagram: DiagramJson;
  readonly ownedNodeIds: ReadonlySet<string>;
  readonly publicNodeById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>;
  readonly sourceDiagram: DiagramJson;
}): void {
  const sourceNodeById = createUniqueMap(sourceDiagram.nodes);

  for (const candidateNode of candidateDiagram.nodes) {
    if (ownedNodeIds.has(candidateNode.id)) {
      continue;
    }

    const candidateDecision = candidateNode.metadata?.reverseEngineering?.importDecision;
    const sourceNode = sourceNodeById.get(candidateNode.id);
    const sourceDecision = sourceNode?.metadata?.reverseEngineering?.importDecision;

    if (!sourceNode) {
      if (
        candidateDecision === undefined &&
        (candidateNode.kind === "design" || isBoardAutoPresentationFrameNode(candidateNode))
      ) {
        continue;
      }

      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }

    if (
      publicNodeById.has(candidateNode.id) &&
      !hasSameSingleNodeSemantics(sourceNode, candidateNode)
    ) {
      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }

    if (
      (candidateDecision !== undefined || sourceDecision !== undefined) &&
      !isDeepStrictEqual(candidateDecision, sourceDecision)
    ) {
      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }
  }
}

/** gg: 중복으로 남긴 기존 node는 배치만 움직일 수 있고 설정·결정은 바꿀 수 없습니다. */
function hasSameSingleNodeSemantics(sourceNode: DiagramNode, candidateNode: DiagramNode): boolean {
  const createSingleNodeDiagram = (node: DiagramNode): DiagramJson => ({
    nodes: [node],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  return hasSameBoardAutoOrganizeSemantics(
    createSingleNodeDiagram(sourceNode),
    createSingleNodeDiagram(candidateNode)
  );
}

/** gg: 공개 Architecture의 type·label·config 외에는 위치만 후보가 정할 수 있습니다. */
function hasSameArchitectureNodeSemantics(
  publicNode: ArchitectureJson["nodes"][number],
  candidateNode: ArchitectureJson["nodes"][number]
): boolean {
  return isDeepStrictEqual(
    {
      type: candidateNode.type,
      label: candidateNode.label,
      config: omitSourceProvenance(candidateNode.config)
    },
    {
      type: publicNode.type,
      label: publicNode.label,
      config: omitSourceProvenance(publicNode.config)
    }
  );
}

/** gg: Diagram의 Terraform identity와 값도 공개 Architecture에서 파생한 값만 허용합니다. */
function hasSameDiagramNodeSemantics(
  publicNode: ArchitectureJson["nodes"][number],
  candidateNode: DiagramNode
): boolean {
  const parameters = candidateNode.parameters;

  if (!parameters || candidateNode.kind !== "resource") {
    return false;
  }

  const terraformBlockType = readTerraformBlockType(publicNode.config["terraformBlockType"]);
  const terraformResourceType = readNonEmptyString(publicNode.config["terraformResourceType"]);
  const terraformResourceName = readNonEmptyString(publicNode.config["terraformResourceName"]);
  const terraformFileName = readNonEmptyString(publicNode.config["terraformFileName"]);

  return isDeepStrictEqual(
    {
      type: candidateNode.type,
      label: candidateNode.label,
      terraformBlockType: parameters.terraformBlockType,
      resourceType: parameters.resourceType,
      resourceName: parameters.resourceName,
      fileName: parameters.fileName,
      invalid: parameters.invalid,
      values: omitSourceProvenance(parameters.values)
    },
    {
      type: terraformResourceType ?? publicNode.type,
      label: publicNode.label ?? publicNode.id,
      terraformBlockType,
      resourceType: terraformResourceType ?? "",
      resourceName: terraformResourceName ?? "",
      fileName: terraformFileName ?? "",
      invalid:
        terraformResourceType === undefined || terraformResourceName === undefined
          ? true
          : undefined,
      values: omitSourceProvenance(publicNode.config)
    }
  );
}

/** gg: AWS 소유 node에 닿는 새 edge는 공개 Scan edge이거나 기존 Board edge여야 합니다. */
function validateEdgesTouchingOwnedNodes({
  candidateArchitectureJson,
  candidateDiagram,
  ownedEdgeIds,
  ownedNodeIds,
  sourceDiagram
}: {
  readonly candidateArchitectureJson: ArchitectureJson;
  readonly candidateDiagram: DiagramJson;
  readonly ownedEdgeIds: ReadonlySet<string>;
  readonly ownedNodeIds: ReadonlySet<string>;
  readonly sourceDiagram: DiagramJson;
}): void {
  const sourceEdgeSemanticsById = new Map(
    sourceDiagram.edges.map((edge) => [edge.id, toDiagramEdgeSemantics(edge)])
  );
  const touchingDiagramEdges = candidateDiagram.edges
    .filter((edge) => touchesOwnedNode(edge.sourceNodeId, edge.targetNodeId, ownedNodeIds))
    .map(toDiagramEdgeSemantics)
    .sort(compareEdgeSemantics);
  const touchingArchitectureEdges = candidateArchitectureJson.edges
    .filter((edge) => touchesOwnedNode(edge.sourceId, edge.targetId, ownedNodeIds))
    .map(toArchitectureEdgeSemantics)
    .sort(compareEdgeSemantics);

  if (!isDeepStrictEqual(touchingArchitectureEdges, touchingDiagramEdges)) {
    throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
  }

  for (const edge of touchingDiagramEdges) {
    if (ownedEdgeIds.has(edge.id)) {
      continue;
    }

    if (!isDeepStrictEqual(sourceEdgeSemanticsById.get(edge.id), edge)) {
      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }
  }
}

/** gg: 검증한 공개 config와 실제 저장 Scan provenance로 AWS 소유 node를 다시 만듭니다. */
function stampCandidateSourceNodes({
  candidateDiagram,
  editableValueKeys,
  protectedValueKeys,
  publicArchitecture,
  sourceDraftId,
  sourceNodeIds,
  sourceScanId
}: {
  readonly candidateDiagram: DiagramJson;
  readonly editableValueKeys: readonly string[];
  readonly protectedValueKeys: readonly string[];
  readonly publicArchitecture: ArchitectureJson;
  readonly sourceDraftId: string;
  readonly sourceNodeIds: readonly string[];
  readonly sourceScanId: string;
}): DiagramJson {
  const sourceNodeIdSet = new Set(sourceNodeIds);
  const publicNodeById = createUniqueMap(publicArchitecture.nodes);

  return {
    ...candidateDiagram,
    nodes: candidateDiagram.nodes.map((node) => {
      if (!sourceNodeIdSet.has(node.id)) {
        return node;
      }

      const publicNode = publicNodeById.get(node.id)!;
      const terraformResourceType = readNonEmptyString(publicNode.config["terraformResourceType"]);
      const terraformResourceName = readNonEmptyString(publicNode.config["terraformResourceName"]);
      const terraformFileName = readNonEmptyString(publicNode.config["terraformFileName"]);
      const terraformBlockType = readTerraformBlockType(publicNode.config["terraformBlockType"]);
      const { terraformBlockType: _candidateBlockType, ...candidateParameters } = node.parameters!;

      return {
        ...node,
        type: terraformResourceType ?? publicNode.type,
        label: publicNode.label ?? node.id,
        metadata: {
          ...node.metadata,
          reverseEngineering: {
            source: "aws_scan",
            protectedValueKeys: [...protectedValueKeys],
            editableValueKeys: [...editableValueKeys]
          }
        },
        parameters: {
          ...candidateParameters,
          ...(terraformBlockType ? { terraformBlockType } : {}),
          resourceType: terraformResourceType ?? "",
          resourceName: terraformResourceName ?? "",
          fileName: terraformFileName ?? "",
          values: {
            ...structuredClone(publicNode.config),
            reverseEngineeringSourceScanId: sourceScanId,
            reverseEngineeringDraftId: sourceDraftId,
            reverseEngineeringSourceKind: "saved_scan"
          }
        }
      };
    })
  };
}

/** gg: 적용 직전 ProjectDraft row를 읽어 revision과 공개 source를 비교합니다. */
async function readProjectDraft({
  db,
  projectId
}: {
  readonly db: Database;
  readonly projectId: string;
}): Promise<ProjectDraftRow | null> {
  const [draft] = await db
    .select()
    .from(projectDrafts)
    .where(eq(projectDrafts.projectId, projectId));

  return draft ?? null;
}

/** gg: 프로젝트 owner에게 공개 가능한 저장 Scan만 기존 repository 경계로 읽습니다. */
async function readAccessibleScan({
  db,
  projectId,
  scanId,
  userId
}: {
  readonly db: Database;
  readonly projectId: string;
  readonly scanId: string;
  readonly userId: string;
}): Promise<ReverseEngineeringScanRecord | undefined> {
  return createPostgresReverseEngineeringRepository(db).findAccessibleScan(projectId, scanId, {
    kind: "user",
    userId
  });
}

/** gg: provenance 세 값은 browser 후보 의미가 아니라 서버가 다시 찍는 추적 정보입니다. */
function omitSourceProvenance(values: Record<string, unknown>): Record<string, unknown> {
  const result = { ...values };

  for (const key of SOURCE_PROVENANCE_KEYS) {
    delete result[key];
  }

  return result;
}

/** gg: 중복 ID는 AWS 원본과 후보의 대응을 모호하게 하므로 즉시 거부합니다. */
function createUniqueMap<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();

  for (const item of items) {
    if (!isNonEmptyString(item.id) || result.has(item.id)) {
      throw new ExistingReverseEngineeringDraftMismatchError("candidate_mismatch");
    }
    result.set(item.id, item);
  }

  return result;
}

/** gg: Architecture edge 비교에서는 위치 표현 없이 관계 의미 네 값만 남깁니다. */
function toArchitectureEdgeSemantics(
  edge: ArchitectureJson["edges"][number]
): ArchitectureJson["edges"][number] {
  return {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    ...(edge.label === undefined ? {} : { label: edge.label })
  };
}

/** gg: Diagram edge의 handle·route는 배치 값이므로 Architecture 관계 비교에서 제외합니다. */
function toDiagramEdgeSemantics(edge: DiagramEdge): ArchitectureJson["edges"][number] {
  return {
    id: edge.id,
    sourceId: edge.sourceNodeId,
    targetId: edge.targetNodeId,
    ...(edge.label === undefined ? {} : { label: edge.label })
  };
}

/** gg: 같은 edge 집합을 배열 순서와 무관하게 비교하도록 ID로 정렬합니다. */
function compareEdgeSemantics(
  left: ArchitectureJson["edges"][number],
  right: ArchitectureJson["edges"][number]
): number {
  return left.id.localeCompare(right.id);
}

/** gg: 관계의 어느 한쪽이라도 이번 Scan 소유 Resource인지 확인합니다. */
function touchesOwnedNode(
  sourceId: string,
  targetId: string,
  ownedNodeIds: ReadonlySet<string>
): boolean {
  return ownedNodeIds.has(sourceId) || ownedNodeIds.has(targetId);
}

/** gg: schema 우회 호출에서도 공백·중복 source ID를 받지 않습니다. */
function isNonEmptyUniqueStringArray(value: unknown, requireOne: boolean): value is string[] {
  return (
    Array.isArray(value) &&
    (!requireOne || value.length > 0) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

/** gg: source identity에는 공백뿐인 문자열을 허용하지 않습니다. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

/** gg: 공개 Terraform identity는 공백 문자열을 유효한 값으로 사용하지 않습니다. */
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** gg: 저장 Scan이 명시한 Terraform block 종류만 후보 identity로 사용합니다. */
function readTerraformBlockType(value: unknown): "resource" | "data" | undefined {
  return value === "resource" || value === "data" ? value : undefined;
}
