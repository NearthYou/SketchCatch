import type { DiagramJson } from "@sketchcatch/types";

const SOURCE_VALIDATION_FINDING_CODES = [
  "node.missing_geometry",
  "node.invalid_geometry",
  "area.missing_geometry",
  "area.invalid_geometry",
  "edge.missing_endpoint",
  "edge.dangling_endpoint",
  "edge.duplicate_id",
  "viewport.missing",
  "viewport.invalid"
] as const;

const AREA_RESOURCE_TYPES = new Set([
  "aws_region",
  "aws_availability_zone",
  "aws_autoscaling_group",
  "aws_vpc",
  "aws_subnet",
  "aws_security_group"
]);

export type ArchitectureBoardCompilerEvidenceSource = "brainboard" | "repository";
export type ArchitectureBoardCompilerEvidenceSourceValidationFindingCode =
  (typeof SOURCE_VALIDATION_FINDING_CODES)[number];

export type ArchitectureBoardCompilerEvidenceSourceValidationFinding = {
  readonly code: ArchitectureBoardCompilerEvidenceSourceValidationFindingCode;
  readonly message: string;
  readonly targetId: string;
};

export type ArchitectureBoardCompilerEvidenceSourceValidationTemplate = {
  readonly findings: readonly ArchitectureBoardCompilerEvidenceSourceValidationFinding[];
  readonly id: string;
  readonly source: ArchitectureBoardCompilerEvidenceSource;
  readonly title: string;
};

export type ArchitectureBoardCompilerEvidenceSourceValidationUnavailableTemplate = {
  readonly id: string;
  readonly reason: string;
  readonly source: ArchitectureBoardCompilerEvidenceSource;
  readonly title: string;
};

export type ArchitectureBoardCompilerEvidenceSourceValidationReport = {
  readonly summary: {
    readonly availableTemplateCount: number;
    readonly findingCounts: Readonly<
      Record<ArchitectureBoardCompilerEvidenceSourceValidationFindingCode, number>
    >;
    readonly invalidAvailableTemplateCount: number;
    readonly sourceEvidenceCount: number;
    readonly unavailableTemplateCount: number;
    readonly validAvailableTemplateCount: number;
  };
  readonly templates: readonly ArchitectureBoardCompilerEvidenceSourceValidationTemplate[];
  readonly unavailableTemplates: readonly ArchitectureBoardCompilerEvidenceSourceValidationUnavailableTemplate[];
};

type ArchitectureBoardCompilerEvidenceSourceValidationInput = {
  readonly availableTemplates: readonly {
    readonly id: string;
    readonly source: ArchitectureBoardCompilerEvidenceSource;
    readonly sourceDiagram: DiagramJson;
    readonly title: string;
  }[];
  readonly unavailableTemplates: readonly ArchitectureBoardCompilerEvidenceSourceValidationUnavailableTemplate[];
};

/**
 * Raw Template fixture는 Compiler의 입력 근거이므로, Compiler를 실행하기 전에 도형·간선·viewport
 * 무결성을 따로 기록한다. 이 검증은 fixture를 고치거나 배치를 정규화하지 않는다.
 */
export function validateArchitectureBoardCompilerEvidenceSources(
  input: ArchitectureBoardCompilerEvidenceSourceValidationInput
): ArchitectureBoardCompilerEvidenceSourceValidationReport {
  const templates = [...input.availableTemplates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((template) => validateTemplate(template));
  const unavailableTemplates = [...input.unavailableTemplates].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const invalidAvailableTemplateCount = templates.filter(
    (template) => template.findings.length > 0
  ).length;

  return {
    summary: {
      sourceEvidenceCount: templates.length + unavailableTemplates.length,
      availableTemplateCount: templates.length,
      unavailableTemplateCount: unavailableTemplates.length,
      validAvailableTemplateCount: templates.length - invalidAvailableTemplateCount,
      invalidAvailableTemplateCount,
      findingCounts: countFindings(templates)
    },
    templates,
    unavailableTemplates
  };
}

function validateTemplate(
  template: ArchitectureBoardCompilerEvidenceSourceValidationInput["availableTemplates"][number]
): ArchitectureBoardCompilerEvidenceSourceValidationTemplate {
  const nodes = Array.isArray(template.sourceDiagram.nodes) ? template.sourceDiagram.nodes : [];
  const edges = Array.isArray(template.sourceDiagram.edges) ? template.sourceDiagram.edges : [];
  const findings = [
    ...validateNodeGeometry(nodes),
    ...validateEdges(edges, nodes),
    ...validateViewport(template.sourceDiagram)
  ].sort(compareFindings);

  return {
    id: template.id,
    title: template.title,
    source: template.source,
    findings
  };
}

function validateNodeGeometry(
  nodes: readonly unknown[]
): ArchitectureBoardCompilerEvidenceSourceValidationFinding[] {
  const findings: ArchitectureBoardCompilerEvidenceSourceValidationFinding[] = [];

  for (const [index, node] of nodes.entries()) {
    const record = asRecord(node);
    const targetId = readNonEmptyString(record?.id) ?? `node:${index}`;
    const geometryState = getGeometryState(record);

    if (geometryState === "missing") {
      findings.push({
        code: "node.missing_geometry",
        targetId,
        message: `Node ${targetId}에 position 또는 양수 size가 없습니다.`
      });
    } else if (geometryState === "invalid") {
      findings.push({
        code: "node.invalid_geometry",
        targetId,
        message: `Node ${targetId}의 position 또는 size가 유한한 화면 좌표가 아닙니다.`
      });
    }

    if (!isPresentationArea(record) || geometryState === "valid") continue;
    findings.push({
      code: geometryState === "missing" ? "area.missing_geometry" : "area.invalid_geometry",
      targetId,
      message:
        geometryState === "missing"
          ? `Area ${targetId}에 position 또는 양수 size가 없습니다.`
          : `Area ${targetId}의 position 또는 size가 유한한 화면 좌표가 아닙니다.`
    });
  }

  return findings;
}

function validateEdges(
  edges: readonly unknown[],
  nodes: readonly unknown[]
): ArchitectureBoardCompilerEvidenceSourceValidationFinding[] {
  const nodeIds = new Set(
    nodes
      .map((node) => readNonEmptyString(asRecord(node)?.id))
      .filter((id): id is string => Boolean(id))
  );
  const edgeIdCounts = new Map<string, number>();
  const findings: ArchitectureBoardCompilerEvidenceSourceValidationFinding[] = [];

  for (const [index, edge] of edges.entries()) {
    const record = asRecord(edge);
    const targetId = readNonEmptyString(record?.id) ?? `edge:${index}`;
    const sourceNodeId = readNonEmptyString(record?.sourceNodeId);
    const targetNodeId = readNonEmptyString(record?.targetNodeId);
    edgeIdCounts.set(targetId, (edgeIdCounts.get(targetId) ?? 0) + 1);

    if (!sourceNodeId || !targetNodeId) {
      findings.push({
        code: "edge.missing_endpoint",
        targetId,
        message: `Edge ${targetId}에 sourceNodeId 또는 targetNodeId가 없습니다.`
      });
      continue;
    }

    if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) {
      findings.push({
        code: "edge.dangling_endpoint",
        targetId,
        message: `Edge ${targetId}가 존재하지 않는 Node endpoint를 참조합니다.`
      });
    }
  }

  for (const [edgeId, count] of edgeIdCounts) {
    if (count < 2) continue;
    findings.push({
      code: "edge.duplicate_id",
      targetId: edgeId,
      message: `Edge ID ${edgeId}가 ${count}회 중복됩니다.`
    });
  }

  return findings;
}

function validateViewport(
  diagram: DiagramJson
): ArchitectureBoardCompilerEvidenceSourceValidationFinding[] {
  const viewport = asRecord((diagram as unknown as Record<string, unknown>).viewport);
  if (!viewport || !hasOwn(viewport, "x") || !hasOwn(viewport, "y") || !hasOwn(viewport, "zoom")) {
    return [
      {
        code: "viewport.missing",
        targetId: "viewport",
        message: "Viewport에 x, y, zoom이 모두 없습니다."
      }
    ];
  }

  if (
    !isFiniteNumber(viewport.x) ||
    !isFiniteNumber(viewport.y) ||
    !isFiniteNumber(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    return [
      {
        code: "viewport.invalid",
        targetId: "viewport",
        message: "Viewport의 x, y는 유한해야 하고 zoom은 0보다 커야 합니다."
      }
    ];
  }

  return [];
}

function getGeometryState(record: Record<string, unknown> | undefined): "missing" | "invalid" | "valid" {
  const position = asRecord(record?.position);
  const size = asRecord(record?.size);
  if (
    !position ||
    !size ||
    !hasOwn(position, "x") ||
    !hasOwn(position, "y") ||
    !hasOwn(size, "width") ||
    !hasOwn(size, "height")
  ) {
    return "missing";
  }

  if (
    !isFiniteNumber(position.x) ||
    !isFiniteNumber(position.y) ||
    !isFiniteNumber(size.width) ||
    !isFiniteNumber(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    return "invalid";
  }

  return "valid";
}

function isPresentationArea(record: Record<string, unknown> | undefined): boolean {
  if (!record) return false;
  const kind = readNonEmptyString(record.kind);
  if (kind === "design") return true;

  const metadata = asRecord(record.metadata);
  if (metadata?.presentationArea === true) return true;

  const parameters = asRecord(record.parameters);
  const resourceType = readNonEmptyString(parameters?.resourceType) ?? readNonEmptyString(record.type);
  return kind === "resource" && Boolean(resourceType && AREA_RESOURCE_TYPES.has(resourceType));
}

function countFindings(
  templates: readonly ArchitectureBoardCompilerEvidenceSourceValidationTemplate[]
): Record<ArchitectureBoardCompilerEvidenceSourceValidationFindingCode, number> {
  const counts = Object.fromEntries(
    SOURCE_VALIDATION_FINDING_CODES.map((code) => [code, 0])
  ) as Record<ArchitectureBoardCompilerEvidenceSourceValidationFindingCode, number>;

  for (const template of templates) {
    for (const finding of template.findings) {
      counts[finding.code] += 1;
    }
  }

  return counts;
}

function compareFindings(
  left: ArchitectureBoardCompilerEvidenceSourceValidationFinding,
  right: ArchitectureBoardCompilerEvidenceSourceValidationFinding
): number {
  return (
    SOURCE_VALIDATION_FINDING_CODES.indexOf(left.code) -
      SOURCE_VALIDATION_FINDING_CODES.indexOf(right.code) ||
    left.targetId.localeCompare(right.targetId)
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
