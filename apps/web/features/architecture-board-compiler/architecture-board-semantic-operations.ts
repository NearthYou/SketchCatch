import type {
  ArchitectureBoardCompilationSemanticOperation,
  ArchitectureEdge,
  ArchitectureJson,
  ArchitectureNode,
  DiagramJson,
  ResourceConfig
} from "@sketchcatch/types";

export type ArchitectureBoardSemanticOperationIssue = {
  readonly code:
    | "compiler.semantic_operation_duplicate_resource"
    | "compiler.semantic_operation_invalid_presentation"
    | "compiler.semantic_operation_invalid_relationship"
    | "compiler.semantic_operation_missing_target";
  readonly operationId: string;
  readonly relatedResourceIds: readonly string[];
};

export type ArchitectureBoardSemanticOperationResult = {
  readonly appliedOperationIds: readonly string[];
  readonly architecture: ArchitectureJson;
  readonly issues: readonly ArchitectureBoardSemanticOperationIssue[];
  readonly presentationOperations: readonly Extract<
    ArchitectureBoardCompilationSemanticOperation,
    { readonly kind: "presentation-add" | "presentation-remove" }
  >[];
};

export type ArchitectureBoardPresentationOperationResult = {
  readonly appliedOperationIds: readonly string[];
  readonly diagram: DiagramJson;
  readonly issues: readonly ArchitectureBoardSemanticOperationIssue[];
};

/**
 * Applies an explicitly authorized semantic mutation set to an Architecture graph.
 * This function is pure: it never chooses a candidate or mutates the input. The
 * Compiler decides whether the resulting candidate is the one it proposes.
 */
export function applyArchitectureBoardSemanticOperations(
  input: ArchitectureJson,
  operations: readonly ArchitectureBoardCompilationSemanticOperation[]
): ArchitectureBoardSemanticOperationResult {
  const architecture = structuredClone(input);
  const issues: ArchitectureBoardSemanticOperationIssue[] = [];
  const appliedOperationIds: string[] = [];
  const presentationOperations: Extract<
    ArchitectureBoardCompilationSemanticOperation,
    { readonly kind: "presentation-add" | "presentation-remove" }
  >[] = [];

  for (const operation of [...operations].sort(compareOperation)) {
    if (operation.kind === "presentation-add" || operation.kind === "presentation-remove") {
      presentationOperations.push(structuredClone(operation));
      appliedOperationIds.push(operation.id);
      continue;
    }

    const next = applyOperation(architecture, operation, issues);
    if (next) {
      appliedOperationIds.push(operation.id);
    }
  }

  return {
    architecture,
    appliedOperationIds: appliedOperationIds.sort((left, right) => left.localeCompare(right)),
    issues: issues.sort(
      (left, right) => left.code.localeCompare(right.code) || left.operationId.localeCompare(right.operationId)
    ),
    presentationOperations: presentationOperations.sort((left, right) => left.id.localeCompare(right.id))
  };
}

/**
 * Presentation operations are deliberately restricted to design nodes, so a visual
 * Group/Area cannot introduce a Terraform Resource outside the Architecture graph.
 */
export function applyArchitectureBoardPresentationOperations(
  input: DiagramJson,
  operations: readonly Extract<
    ArchitectureBoardCompilationSemanticOperation,
    { readonly kind: "presentation-add" | "presentation-remove" }
  >[]
): ArchitectureBoardPresentationOperationResult {
  const diagram = structuredClone(input);
  const issues: ArchitectureBoardSemanticOperationIssue[] = [];
  const appliedOperationIds: string[] = [];

  for (const operation of [...operations].sort((left, right) => left.id.localeCompare(right.id))) {
    if (operation.kind === "presentation-add") {
      if (operation.node.kind !== "design" || diagram.nodes.some((node) => node.id === operation.node.id)) {
        issues.push({
          code: "compiler.semantic_operation_invalid_presentation",
          operationId: operation.id,
          relatedResourceIds: [operation.node.id]
        });
        continue;
      }
      diagram.nodes.push(structuredClone(operation.node));
      appliedOperationIds.push(operation.id);
      continue;
    }

    const node = diagram.nodes.find((candidate) => candidate.id === operation.targetId);
    if (!node || node.kind !== "design") {
      issues.push({
        code: "compiler.semantic_operation_invalid_presentation",
        operationId: operation.id,
        relatedResourceIds: [operation.targetId]
      });
      continue;
    }

    diagram.nodes = diagram.nodes.filter((candidate) => candidate.id !== operation.targetId);
    diagram.edges = diagram.edges.filter(
      (edge) => edge.sourceNodeId !== operation.targetId && edge.targetNodeId !== operation.targetId
    );
    appliedOperationIds.push(operation.id);
  }

  return {
    diagram,
    appliedOperationIds,
    issues: issues.sort(
      (left, right) => left.code.localeCompare(right.code) || left.operationId.localeCompare(right.operationId)
    )
  };
}

function applyOperation(
  architecture: ArchitectureJson,
  operation: Exclude<
    ArchitectureBoardCompilationSemanticOperation,
    { readonly kind: "presentation-add" | "presentation-remove" }
  >,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  switch (operation.kind) {
    case "resource-add":
      return addResource(architecture, operation.node, operation.id, issues);
    case "resource-remove":
      return removeResource(architecture, operation.targetId, operation.id, issues);
    case "resource-replace":
      return replaceResource(architecture, operation.targetId, operation.node, operation.id, issues);
    case "relationship-add":
      return addRelationship(architecture, operation.edge, operation.id, issues);
    case "relationship-remove":
      return removeRelationship(architecture, operation.targetId, operation.id, issues);
    case "relationship-replace":
      return replaceRelationship(architecture, operation.targetId, operation.edge, operation.id, issues);
    case "configuration-merge":
      return updateConfiguration(architecture, operation.targetId, operation.values, true, operation.id, issues);
    case "configuration-replace":
      return updateConfiguration(architecture, operation.targetId, operation.values, false, operation.id, issues);
    case "containment-set":
      return setContainment(architecture, operation.targetId, operation.parentAreaNodeId, operation.id, issues);
  }
}

function addResource(
  architecture: ArchitectureJson,
  node: ArchitectureNode,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  if (architecture.nodes.some((candidate) => candidate.id === node.id)) {
    issues.push({
      code: "compiler.semantic_operation_duplicate_resource",
      operationId,
      relatedResourceIds: [node.id]
    });
    return false;
  }

  architecture.nodes.push(structuredClone(node));
  return true;
}

function removeResource(
  architecture: ArchitectureJson,
  targetId: string,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  if (!hasNode(architecture, targetId)) {
    addMissingTargetIssue(issues, operationId, targetId);
    return false;
  }

  architecture.nodes = architecture.nodes.filter((node) => node.id !== targetId);
  architecture.edges = architecture.edges.filter(
    (edge) => edge.sourceId !== targetId && edge.targetId !== targetId
  );
  return true;
}

function replaceResource(
  architecture: ArchitectureJson,
  targetId: string,
  node: ArchitectureNode,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  const index = architecture.nodes.findIndex((candidate) => candidate.id === targetId);
  if (index < 0) {
    addMissingTargetIssue(issues, operationId, targetId);
    return false;
  }
  if (node.id !== targetId && hasNode(architecture, node.id)) {
    issues.push({
      code: "compiler.semantic_operation_duplicate_resource",
      operationId,
      relatedResourceIds: [targetId, node.id]
    });
    return false;
  }

  architecture.nodes[index] = structuredClone(node);
  if (node.id !== targetId) {
    architecture.edges = architecture.edges.map((edge) => ({
      ...edge,
      ...(edge.sourceId === targetId ? { sourceId: node.id } : {}),
      ...(edge.targetId === targetId ? { targetId: node.id } : {})
    }));
  }
  return true;
}

function addRelationship(
  architecture: ArchitectureJson,
  edge: ArchitectureEdge,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  if (
    architecture.edges.some((candidate) => candidate.id === edge.id) ||
    !hasNode(architecture, edge.sourceId) ||
    !hasNode(architecture, edge.targetId)
  ) {
    issues.push({
      code: "compiler.semantic_operation_invalid_relationship",
      operationId,
      relatedResourceIds: [edge.sourceId, edge.targetId]
    });
    return false;
  }

  architecture.edges.push(structuredClone(edge));
  return true;
}

function removeRelationship(
  architecture: ArchitectureJson,
  targetId: string,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  const index = architecture.edges.findIndex((edge) => edge.id === targetId);
  if (index < 0) {
    addMissingTargetIssue(issues, operationId, targetId);
    return false;
  }

  architecture.edges.splice(index, 1);
  return true;
}

function replaceRelationship(
  architecture: ArchitectureJson,
  targetId: string,
  edge: ArchitectureEdge,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  const index = architecture.edges.findIndex((candidate) => candidate.id === targetId);
  if (index < 0) {
    addMissingTargetIssue(issues, operationId, targetId);
    return false;
  }
  if (
    (edge.id !== targetId && architecture.edges.some((candidate) => candidate.id === edge.id)) ||
    !hasNode(architecture, edge.sourceId) ||
    !hasNode(architecture, edge.targetId)
  ) {
    issues.push({
      code: "compiler.semantic_operation_invalid_relationship",
      operationId,
      relatedResourceIds: [edge.sourceId, edge.targetId]
    });
    return false;
  }

  architecture.edges[index] = structuredClone(edge);
  return true;
}

function updateConfiguration(
  architecture: ArchitectureJson,
  targetId: string,
  values: ResourceConfig,
  merge: boolean,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  const node = architecture.nodes.find((candidate) => candidate.id === targetId);
  if (!node) {
    addMissingTargetIssue(issues, operationId, targetId);
    return false;
  }

  node.config = merge ? { ...node.config, ...structuredClone(values) } : structuredClone(values);
  return true;
}

function setContainment(
  architecture: ArchitectureJson,
  targetId: string,
  parentAreaNodeId: string | undefined,
  operationId: string,
  issues: ArchitectureBoardSemanticOperationIssue[]
): boolean {
  const node = architecture.nodes.find((candidate) => candidate.id === targetId);
  if (!node) {
    addMissingTargetIssue(issues, operationId, targetId);
    return false;
  }
  if (parentAreaNodeId && !hasNode(architecture, parentAreaNodeId)) {
    addMissingTargetIssue(issues, operationId, parentAreaNodeId);
    return false;
  }

  const config = { ...node.config };
  if (parentAreaNodeId) {
    config.parentAreaNodeId = parentAreaNodeId;
  } else {
    delete config.parentAreaNodeId;
  }
  node.config = config;
  return true;
}

function hasNode(architecture: ArchitectureJson, id: string): boolean {
  return architecture.nodes.some((node) => node.id === id);
}

function addMissingTargetIssue(
  issues: ArchitectureBoardSemanticOperationIssue[],
  operationId: string,
  targetId: string
): void {
  issues.push({
    code: "compiler.semantic_operation_missing_target",
    operationId,
    relatedResourceIds: [targetId]
  });
}

function compareOperation(
  left: ArchitectureBoardCompilationSemanticOperation,
  right: ArchitectureBoardCompilationSemanticOperation
): number {
  return operationPriority(left.kind) - operationPriority(right.kind) || left.id.localeCompare(right.id);
}

function operationPriority(operation: ArchitectureBoardCompilationSemanticOperation["kind"]): number {
  switch (operation) {
    case "resource-add":
    case "resource-replace":
      return 10;
    case "resource-remove":
      return 20;
    case "configuration-merge":
    case "configuration-replace":
      return 30;
    case "containment-set":
      return 40;
    case "relationship-add":
    case "relationship-remove":
    case "relationship-replace":
      return 50;
    case "presentation-add":
    case "presentation-remove":
      return 60;
  }
}
