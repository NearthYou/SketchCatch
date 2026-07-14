#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { parseRotation, parseViewBox } from "./normalize-capture.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = path.resolve(scriptDirectory, "../..");
export const DEFAULT_INDEX_PATH = path.join(
  DEFAULT_REPOSITORY_ROOT,
  "docs/gg/feat-infrastructure-template/brainboard-capture-index.json"
);
export const DEFAULT_CAPTURES_DIRECTORY = path.join(
  DEFAULT_REPOSITORY_ROOT,
  "docs/gg/feat-infrastructure-template/brainboard-captures"
);
export const DEFAULT_STATUS_PATH = path.join(
  DEFAULT_REPOSITORY_ROOT,
  "docs/gg/feat-infrastructure-template/brainboard-capture-status.json"
);
export const ENDPOINT_BOUNDARY_TOLERANCE = 5;

const SOURCE_MANIFEST_RELATIVE_PATH = "packages/types/src/brainboard-templates/manifest.ts";
const SOURCE_IDS_RELATIVE_PATH = "packages/types/src/brainboard-templates/ids.ts";
const EXPECTED_AUTHOR = "Chafik Belhaoues";
const EXPECTED_PROVIDER = "aws";
const EXPECTED_CAPTURED_AT = "2026-07-14";
const EXPECTED_FAILED_ATTEMPTS = [
  {
    architectureName: "AWS instance and DB with multiple networks #381 09fd3420",
    result: "HTTP 400 ERR_BAD_REQUEST"
  },
  {
    architectureName: "#381 multi-network 09fd3420",
    result: "HTTP 400 ERR_BAD_REQUEST"
  },
  {
    architectureName: "#381 09fd3420",
    project: "Project 1",
    environment: "Development",
    result: "HTTP 400 ERR_BAD_REQUEST"
  },
  {
    architectureName: "#381 recovery 09fd3420",
    project: "ai-workout-board-production",
    environment: "Production",
    action: "Clone into current architecture",
    result:
      "No UI response; after a second verified click and 12-second wait the modal remained open, the canvas stayed empty, undo stayed disabled, and main.tf stayed at one blank line"
  }
];
const EXPECTED_FAILED_PREVIEW_WIDTH = 3840;
const EXPECTED_FAILED_PREVIEW_HEIGHT = 2160;

export function validateCaptureCorpus({
  indexPath = DEFAULT_INDEX_PATH,
  capturesDirectory = DEFAULT_CAPTURES_DIRECTORY,
  expectedManifest,
  repositoryRoot: suppliedRepositoryRoot
} = {}) {
  const indexBytes = readFileSync(indexPath);
  const index = JSON.parse(indexBytes);
  const repositoryRoot = suppliedRepositoryRoot ?? findRepositoryRoot(indexPath);
  const manifest = expectedManifest ?? readSourceManifest(repositoryRoot);
  const errors = [];
  const counters = {
    metadataMismatches: 0,
    rawShaMismatches: 0,
    diagramShaMismatches: 0,
    terraformAggregateShaMismatches: 0,
    terraformFileShaMismatches: 0,
    idOrOrderErrors: 0,
    danglingReferenceErrors: 0,
    viewBoxErrors: 0,
    endpointErrors: 0
  };
  const findings = createEmptyFindings();

  const addError = (counter, code, file, errorPath, message) => {
    counters[counter] += 1;
    errors.push({ code, file, path: errorPath, message });
  };

  validateIndexMetadata(index, manifest, capturesDirectory, addError);

  let capturedTemplates = 0;
  let failedTemplates = 0;
  let explicitEndpointPairs = 0;
  let visualAwsNodes = 0;
  let terraformResourceAddresses = 0;
  let exactTitleNameMatches = 0;
  let singleTypeCandidateMatches = 0;
  let unresolvedNodeAddressTypeGroups = 0;

  for (const entry of index.templates ?? []) {
    const capturePath = path.join(capturesDirectory, entry.file ?? "");
    if (!existsSync(capturePath)) {
      addError(
        "metadataMismatches",
        "brainboard.capture.missing_file",
        entry.file ?? null,
        "file",
        `Capture file does not exist: ${capturePath}`
      );
      continue;
    }

    const rawBytes = readFileSync(capturePath);
    const file = path.basename(capturePath);
    if (sha256(rawBytes) !== entry.captureSha256) {
      addError(
        "rawShaMismatches",
        "brainboard.capture.raw_sha_mismatch",
        file,
        "captureSha256",
        "Raw capture SHA-256 does not match the immutable index evidence"
      );
    }

    let capture;
    try {
      capture = JSON.parse(rawBytes);
    } catch (error) {
      addError(
        "metadataMismatches",
        "brainboard.capture.invalid_json",
        file,
        "",
        error instanceof Error ? error.message : String(error)
      );
      continue;
    }

    validateCaptureMetadata(capture, entry, file, addError);

    if (capture.status === "failed") {
      failedTemplates += 1;
      validateFailedEvidence(capture, entry, index.capturedAt, file, addError);
      continue;
    }
    if (capture.status !== "captured") {
      addError(
        "metadataMismatches",
        "brainboard.capture.invalid_status",
        file,
        "status",
        `Raw capture status must be captured or failed, got ${JSON.stringify(capture.status)}`
      );
      continue;
    }

    capturedTemplates += 1;
    const audit = validateCapturedEvidence(capture, entry, file, addError, findings);
    explicitEndpointPairs += audit.explicitEndpointPairs;
    visualAwsNodes += audit.visualAwsNodes;
    terraformResourceAddresses += audit.terraformResourceAddresses;
    exactTitleNameMatches += audit.exactTitleNameMatches;
    singleTypeCandidateMatches += audit.singleTypeCandidateMatches;
    unresolvedNodeAddressTypeGroups += audit.unresolvedNodeAddressTypeGroups;
  }

  validateIndexSummary(index, capturedTemplates, failedTemplates, addError);

  return {
    schemaVersion: 1,
    valid: errors.length === 0,
    errors,
    summary: {
      totalTemplates: (index.templates ?? []).length,
      capturedTemplates,
      failedTemplates,
      ...counters,
      rawParentTwoNodeCycles: findings.rawParentTwoNodeCycles.length,
      invertedParentLinks: findings.invertedParentLinks.length,
      semanticDuplicateEdgePairs: findings.semanticDuplicateEdgePairs.length,
      nonzeroRotations: findings.nonzeroRotations.length,
      explicitEndpointPairs,
      emptyTextNodes: findings.emptyTextNodes.length,
      shapeStyleGaps: findings.shapeStyleGaps.length,
      emptyUndefinedTerraformFiles: findings.emptyUndefinedTerraformFiles.length,
      visualAwsNodes,
      terraformResourceAddresses,
      visualAddressCountDelta: visualAwsNodes - terraformResourceAddresses,
      visualNodesWithoutAddressType: findings.visualNodesWithoutAddressType.length,
      oneAddressMultipleVisualGroups: findings.oneAddressMultipleVisualGroups.length
    },
    mappingAudit: {
      policy: "evidence-only-no-array-index-matching",
      exactTitleNameMatches,
      singleTypeCandidateMatches,
      unresolvedNodeAddressTypeGroups
    },
    findings,
    source: {
      index: path.relative(repositoryRoot, indexPath),
      indexSha256: sha256(indexBytes),
      capturesDirectory: path.relative(repositoryRoot, capturesDirectory),
      rawEvidenceImmutable: true
    }
  };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildCaptureStatus({
  indexPath = DEFAULT_INDEX_PATH,
  capturesDirectory = DEFAULT_CAPTURES_DIRECTORY
} = {}) {
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const templates = index.templates.map((entry) => {
    const raw = JSON.parse(readFileSync(path.join(capturesDirectory, entry.file), "utf8"));
    const status = {
      rank: entry.rank,
      id: entry.id,
      sourceTemplateId: entry.sourceTemplateId,
      title: entry.title,
      downloads: entry.downloads,
      file: entry.file,
      status: entry.status,
      cloneBoardUrl: entry.cloneBoardUrl,
      error: entry.error
    };
    if (entry.status === "failed") {
      return {
        ...status,
        attemptedAt: raw.attemptedAt,
        previewUrl: raw.origin.previewUrl,
        previewWidth: raw.origin.previewWidth,
        previewHeight: raw.origin.previewHeight,
        attempts: raw.attempts.map((attempt) => ({ ...attempt }))
      };
    }
    return status;
  });

  return {
    schemaVersion: 1,
    sourceIndex: path.basename(indexPath),
    capturedAt: index.capturedAt,
    summary: {
      total: templates.length,
      captured: templates.filter(({ status }) => status === "captured").length,
      failed: templates.filter(({ status }) => status === "failed").length
    },
    templates
  };
}

function validateIndexMetadata(index, manifest, capturesDirectory, addError) {
  if (index.schemaVersion !== 1) {
    addError(
      "metadataMismatches",
      "brainboard.capture.index_schema",
      null,
      "schemaVersion",
      "Capture index schemaVersion must be 1"
    );
  }
  if (index.author !== EXPECTED_AUTHOR || index.provider !== EXPECTED_PROVIDER) {
    addError(
      "metadataMismatches",
      "brainboard.capture.index_origin",
      null,
      "author/provider",
      `Capture index must target ${EXPECTED_AUTHOR} AWS templates`
    );
  }
  if (index.capturedAt !== EXPECTED_CAPTURED_AT) {
    addError(
      "metadataMismatches",
      "brainboard.capture.index_captured_at_invalid",
      null,
      "capturedAt",
      `Capture index capturedAt must preserve the reviewed date ${EXPECTED_CAPTURED_AT}`
    );
  }
  if (!Array.isArray(index.templates) || index.templates.length !== 24) {
    addError(
      "metadataMismatches",
      "brainboard.capture.index_count",
      null,
      "templates",
      `Capture index must contain exactly 24 templates, got ${index.templates?.length ?? "non-array"}`
    );
  }
  if (manifest.length !== 24) {
    addError(
      "metadataMismatches",
      "brainboard.capture.manifest_count",
      null,
      SOURCE_MANIFEST_RELATIVE_PATH,
      `Source manifest must contain exactly 24 templates, got ${manifest.length}`
    );
  }

  const templateIds = new Set();
  const sourceTemplateIds = new Set();
  const fileNames = new Set();
  for (const [indexPosition, entry] of (index.templates ?? []).entries()) {
    const expected = manifest[indexPosition];
    const expectedMetadata = expected
      ? {
          rank: indexPosition + 1,
          id: expected.id,
          sourceTemplateId: expected.sourceTemplateId,
          title: expected.title,
          downloads: expected.downloads
        }
      : null;
    const actualMetadata = {
      rank: entry.rank,
      id: entry.id,
      sourceTemplateId: entry.sourceTemplateId,
      title: entry.title,
      downloads: entry.downloads
    };
    if (!expectedMetadata || JSON.stringify(actualMetadata) !== JSON.stringify(expectedMetadata)) {
      addError(
        "metadataMismatches",
        "brainboard.capture.manifest_metadata_mismatch",
        entry.file ?? null,
        `templates[${indexPosition}]`,
        `Index metadata ${JSON.stringify(actualMetadata)} does not match source manifest ${JSON.stringify(expectedMetadata)}`
      );
    }
    if (templateIds.has(entry.id)) {
      addError(
        "idOrOrderErrors",
        "brainboard.capture.duplicate_template_id",
        entry.file ?? null,
        `templates[${indexPosition}].id`,
        `Duplicate template ID: ${entry.id}`
      );
    }
    if (sourceTemplateIds.has(entry.sourceTemplateId)) {
      addError(
        "idOrOrderErrors",
        "brainboard.capture.duplicate_source_template_id",
        entry.file ?? null,
        `templates[${indexPosition}].sourceTemplateId`,
        `Duplicate source template ID: ${entry.sourceTemplateId}`
      );
    }
    if (fileNames.has(entry.file)) {
      addError(
        "idOrOrderErrors",
        "brainboard.capture.duplicate_file",
        entry.file ?? null,
        `templates[${indexPosition}].file`,
        `Duplicate capture file: ${entry.file}`
      );
    }
    templateIds.add(entry.id);
    sourceTemplateIds.add(entry.sourceTemplateId);
    fileNames.add(entry.file);
    if (indexPosition > 0 && entry.downloads > index.templates[indexPosition - 1].downloads) {
      addError(
        "idOrOrderErrors",
        "brainboard.capture.download_order",
        entry.file ?? null,
        `templates[${indexPosition}].downloads`,
        "Capture index is not in non-increasing download order"
      );
    }
  }

  const diskFiles = readdirSync(capturesDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const indexedFiles = [...fileNames].sort();
  if (JSON.stringify(diskFiles) !== JSON.stringify(indexedFiles)) {
    addError(
      "metadataMismatches",
      "brainboard.capture.file_set_mismatch",
      null,
      "templates[].file",
      `Indexed files ${JSON.stringify(indexedFiles)} do not match capture files ${JSON.stringify(diskFiles)}`
    );
  }
}

function validateCaptureMetadata(capture, entry, file, addError) {
  for (const key of ["id", "sourceTemplateId", "title", "downloads", "status", "error"]) {
    if (capture[key] !== entry[key]) {
      addError(
        "metadataMismatches",
        "brainboard.capture.raw_metadata_mismatch",
        file,
        key,
        `Raw ${key} ${JSON.stringify(capture[key])} does not match index ${JSON.stringify(entry[key])}`
      );
    }
  }
  if (capture.origin?.author !== EXPECTED_AUTHOR) {
    addError(
      "metadataMismatches",
      "brainboard.capture.raw_author_mismatch",
      file,
      "origin.author",
      `Raw capture author must be ${EXPECTED_AUTHOR}`
    );
  }
}

function validateFailedEvidence(capture, entry, capturedAt, file, addError) {
  const forbiddenCompleteFields = ["viewport", "nodes", "edges", "terraform", "provider"];
  for (const key of forbiddenCompleteFields) {
    if (Object.hasOwn(capture, key)) {
      addError(
        "metadataMismatches",
        "brainboard.capture.failed_fabricated_source",
        file,
        key,
        `Failed evidence must not contain fabricated ${key}`
      );
    }
  }
  if (!hasExactFailedAttempts(capture.attempts)) {
    addError(
      "metadataMismatches",
      "brainboard.capture.failed_attempts_invalid",
      file,
      "attempts",
      "Failed evidence must preserve the four reviewed attempts and final Clone into current architecture action"
    );
  }
  if (typeof capture.attemptedAt !== "string" || capture.attemptedAt !== capturedAt) {
    addError(
      "metadataMismatches",
      "brainboard.capture.failed_attempted_at_invalid",
      file,
      "attemptedAt",
      `Failed attemptedAt must equal the capture index date ${JSON.stringify(capturedAt)}`
    );
  }
  const expectedSourceUrl = `https://app.brainboard.co/templates/${entry.sourceTemplateId}`;
  if (
    capture.origin?.platform !== "brainboard" ||
    capture.origin?.sourceUrl !== expectedSourceUrl ||
    capture.sourceTemplateId !== entry.sourceTemplateId
  ) {
    addError(
      "metadataMismatches",
      "brainboard.capture.failed_source_url_invalid",
      file,
      "origin.sourceUrl",
      `Failed source URL must be exactly linked to ${entry.sourceTemplateId}`
    );
  }
  if (!isLinkedHttpsPreviewUrl(capture.origin?.previewUrl, entry)) {
    addError(
      "metadataMismatches",
      "brainboard.capture.failed_preview_url_invalid",
      file,
      "origin.previewUrl",
      "Failed preview URL must be HTTPS, match the index, and contain the source template UUID"
    );
  }
  if (
    capture.origin?.previewWidth !== EXPECTED_FAILED_PREVIEW_WIDTH ||
    capture.origin?.previewHeight !== EXPECTED_FAILED_PREVIEW_HEIGHT
  ) {
    addError(
      "metadataMismatches",
      "brainboard.capture.failed_preview_dimensions_invalid",
      file,
      "origin.previewWidth/origin.previewHeight",
      `Failed preview dimensions must be exactly ${EXPECTED_FAILED_PREVIEW_WIDTH}x${EXPECTED_FAILED_PREVIEW_HEIGHT}`
    );
  }
  if (typeof capture.error !== "string" || capture.error.trim() === "") {
    addError(
      "metadataMismatches",
      "brainboard.capture.failed_error_missing",
      file,
      "error",
      "Failed evidence must preserve a non-empty final error"
    );
  }
  if (
    entry.cloneBoardUrl !== null ||
    entry.diagramSha256 !== null ||
    entry.terraformSha256 !== null ||
    entry.nodeCount !== 0 ||
    entry.edgeCount !== 0 ||
    entry.terraformFileCount !== 0 ||
    entry.resourceAddressCount !== 0
  ) {
    addError(
      "metadataMismatches",
      "brainboard.capture.failed_index_fabrication",
      file,
      "cloneBoardUrl/counts/hashes",
      "Failed index evidence cannot claim a clone, graph, Terraform source, or complete-source hash"
    );
  }
}

function hasExactFailedAttempts(attempts) {
  if (!Array.isArray(attempts) || attempts.length !== EXPECTED_FAILED_ATTEMPTS.length) {
    return false;
  }
  return attempts.every((attempt, index) => {
    const expected = EXPECTED_FAILED_ATTEMPTS[index];

    if (!attempt || typeof attempt !== "object" || !expected) {
      return false;
    }

    const expectedEntries = Object.entries(expected);
    return (
      Object.keys(attempt).length === expectedEntries.length &&
      expectedEntries.every(([key, value]) => attempt[key] === value)
    );
  });
}

function isLinkedHttpsPreviewUrl(rawPreviewUrl, entry) {
  if (typeof rawPreviewUrl !== "string" || rawPreviewUrl !== entry.previewUrl) return false;
  try {
    const previewUrl = new URL(rawPreviewUrl);
    return (
      previewUrl.protocol === "https:" &&
      previewUrl.pathname.endsWith(`/architecture/${entry.sourceTemplateId}.webp`)
    );
  } catch {
    return false;
  }
}

function validateCapturedEvidence(capture, entry, file, addError, findings) {
  if (capture.provider !== EXPECTED_PROVIDER) {
    addError(
      "metadataMismatches",
      "brainboard.capture.raw_provider_mismatch",
      file,
      "provider",
      "Captured evidence provider must be aws"
    );
  }
  if (
    capture.origin?.sourceTemplateId !== entry.sourceTemplateId ||
    capture.origin?.downloads !== entry.downloads ||
    capture.origin?.cloneBoardUrl !== entry.cloneBoardUrl
  ) {
    addError(
      "metadataMismatches",
      "brainboard.capture.raw_origin_mismatch",
      file,
      "origin",
      "Captured origin metadata does not match the index"
    );
  }
  if (
    !/^https:\/\/app\.brainboard\.co\/a\/[0-9a-f-]{36}\/design(?:[/?#]|$)/i.test(
      entry.cloneBoardUrl ?? ""
    )
  ) {
    addError(
      "metadataMismatches",
      "brainboard.capture.invalid_clone_url",
      file,
      "origin.cloneBoardUrl",
      "Captured evidence requires a Brainboard clone board URL"
    );
  }

  try {
    parseViewBox(capture.viewport?.viewBox);
  } catch (error) {
    addError(
      "viewBoxErrors",
      "brainboard.capture.invalid_viewbox",
      file,
      "viewport.viewBox",
      error instanceof Error ? error.message : String(error)
    );
  }

  if (!Array.isArray(capture.nodes) || !Array.isArray(capture.edges)) {
    addError(
      "metadataMismatches",
      "brainboard.capture.graph_missing",
      file,
      "nodes/edges",
      "Captured evidence requires node and edge arrays"
    );
    return emptyCaptureAudit();
  }

  validateOrderedCollection(capture.nodes, "sourceNodeId", "node", file, addError);
  validateOrderedCollection(capture.edges, "id", "edge", file, addError);
  if (capture.nodes.length !== entry.nodeCount || capture.edges.length !== entry.edgeCount) {
    addError(
      "metadataMismatches",
      "brainboard.capture.graph_count_mismatch",
      file,
      "nodeCount/edgeCount",
      "Raw graph counts do not match the index"
    );
  }

  const nodesById = new Map(capture.nodes.map((node) => [node.sourceNodeId, node]));
  for (const [nodeIndex, node] of capture.nodes.entries()) {
    if (
      !finitePoint(node.position) ||
      !Number.isFinite(node.width) ||
      !Number.isFinite(node.height) ||
      node.width <= 0 ||
      node.height <= 0
    ) {
      addError(
        "idOrOrderErrors",
        "brainboard.capture.invalid_node_geometry",
        file,
        `nodes[${nodeIndex}]`,
        "Node position and positive size must be finite"
      );
    }
    let rotation;
    try {
      rotation = parseRotation(node.transform);
    } catch (error) {
      addError(
        "idOrOrderErrors",
        "brainboard.capture.invalid_rotation",
        file,
        `nodes[${nodeIndex}].transform`,
        error instanceof Error ? error.message : String(error)
      );
    }
    if (Number.isFinite(rotation) && rotation !== 0) {
      findings.nonzeroRotations.push({
        file,
        sourceNodeId: node.sourceNodeId,
        rotation,
        rawTransform: node.transform
      });
    }
    if (node.parentSourceNodeId !== null && !nodesById.has(node.parentSourceNodeId)) {
      addError(
        "danglingReferenceErrors",
        "brainboard.capture.dangling_parent",
        file,
        `nodes[${nodeIndex}].parentSourceNodeId`,
        `Missing parent node ${node.parentSourceNodeId}`
      );
    }
    const parent = nodesById.get(node.parentSourceNodeId);
    if (parent && area(parent) < area(node)) {
      findings.invertedParentLinks.push({
        file,
        sourceNodeId: node.sourceNodeId,
        parentSourceNodeId: parent.sourceNodeId,
        childArea: area(node),
        parentArea: area(parent)
      });
    }
    if (parent && nodesById.get(parent.parentSourceNodeId)?.sourceNodeId === node.sourceNodeId) {
      if (node.order < parent.order) {
        findings.rawParentTwoNodeCycles.push({
          file,
          sourceNodeIds: [node.sourceNodeId, parent.sourceNodeId]
        });
      }
    }
    if (node.resourceType === "text" && node.title === "") {
      findings.emptyTextNodes.push({ file, sourceNodeId: node.sourceNodeId });
    }
    if (
      node.resourceType === "brainboard_shape" &&
      node.fill === undefined &&
      node.stroke === undefined
    ) {
      findings.shapeStyleGaps.push({ file, sourceNodeId: node.sourceNodeId });
    }
  }

  let explicitEndpointPairs = 0;
  for (const [edgeIndex, edge] of capture.edges.entries()) {
    const sourceNode = nodesById.get(edge.sourceNodeId);
    const targetNode = nodesById.get(edge.targetNodeId);
    if (!sourceNode) {
      addError(
        "danglingReferenceErrors",
        "brainboard.capture.dangling_edge_source",
        file,
        `edges[${edgeIndex}].sourceNodeId`,
        `Missing edge source node ${edge.sourceNodeId}`
      );
    }
    if (!targetNode) {
      addError(
        "danglingReferenceErrors",
        "brainboard.capture.dangling_edge_target",
        file,
        `edges[${edgeIndex}].targetNodeId`,
        `Missing edge target node ${edge.targetNodeId}`
      );
    }
    const endpointError = validateEdgeEndpoints(edge, sourceNode, targetNode);
    if (endpointError) {
      addError(
        "endpointErrors",
        "brainboard.capture.invalid_edge_endpoint",
        file,
        `edges[${edgeIndex}]`,
        endpointError
      );
    } else {
      explicitEndpointPairs += 1;
    }
  }

  for (const edges of groupBy(capture.edges, semanticEdgeSignature).values()) {
    if (edges.length < 2) continue;
    for (let left = 0; left < edges.length - 1; left += 1) {
      for (let right = left + 1; right < edges.length; right += 1) {
        findings.semanticDuplicateEdgePairs.push({
          file,
          edgeIds: [edges[left].id, edges[right].id]
        });
      }
    }
  }

  if (!capture.terraform || !Array.isArray(capture.terraform.files)) {
    addError(
      "metadataMismatches",
      "brainboard.capture.terraform_missing",
      file,
      "terraform",
      "Captured evidence requires Terraform files and addresses"
    );
    return emptyCaptureAudit({ explicitEndpointPairs });
  }
  if (
    capture.terraform.files.length !== entry.terraformFileCount ||
    capture.terraform.resourceAddresses.length !== entry.resourceAddressCount
  ) {
    addError(
      "metadataMismatches",
      "brainboard.capture.terraform_count_mismatch",
      file,
      "terraform",
      "Raw Terraform counts do not match the index"
    );
  }
  validateUniqueStrings(
    capture.terraform.files.map((terraformFile) => terraformFile.fileName),
    "duplicate_terraform_file",
    file,
    "terraform.files",
    addError
  );
  validateUniqueStrings(
    capture.terraform.resourceAddresses,
    "duplicate_resource_address",
    file,
    "terraform.resourceAddresses",
    addError
  );

  for (const [fileIndex, terraformFile] of capture.terraform.files.entries()) {
    if (sha256(terraformFile.code) !== terraformFile.sha256) {
      addError(
        "terraformFileShaMismatches",
        "brainboard.capture.terraform_file_sha_mismatch",
        file,
        `terraform.files[${fileIndex}].sha256`,
        `Terraform SHA-256 mismatch for ${terraformFile.fileName}`
      );
    }
    if (typeof terraformFile.includeInWorkspace !== "boolean") {
      addError(
        "metadataMismatches",
        "brainboard.capture.invalid_workspace_flag",
        file,
        `terraform.files[${fileIndex}].includeInWorkspace`,
        "Terraform includeInWorkspace must be boolean"
      );
    }
    if (terraformFile.fileName === "undefined.tf" && terraformFile.code === "") {
      findings.emptyUndefinedTerraformFiles.push({ file, fileName: terraformFile.fileName });
    }
  }

  const diagramSha = sha256(
    JSON.stringify({
      viewport: capture.viewport,
      nodes: capture.nodes,
      edges: capture.edges
    })
  );
  if (diagramSha !== entry.diagramSha256) {
    addError(
      "diagramShaMismatches",
      "brainboard.capture.diagram_sha_mismatch",
      file,
      "diagramSha256",
      "Diagram aggregate SHA-256 does not match the index"
    );
  }
  const terraformSha = sha256(
    JSON.stringify(
      capture.terraform.files.map(({ fileName, sha256: fileSha256, includeInWorkspace }) => ({
        fileName,
        sha256: fileSha256,
        includeInWorkspace
      }))
    )
  );
  if (terraformSha !== entry.terraformSha256) {
    addError(
      "terraformAggregateShaMismatches",
      "brainboard.capture.terraform_sha_mismatch",
      file,
      "terraformSha256",
      "Terraform aggregate SHA-256 does not match the index"
    );
  }

  const visualNodes = capture.nodes.filter((node) => node.resourceType.startsWith("aws_"));
  const parsedAddresses = capture.terraform.resourceAddresses.map(parseResourceAddress);
  const addressesByType = groupBy(parsedAddresses, (address) => address.resourceType);
  const visualNodesByType = groupBy(visualNodes, (node) => node.resourceType);
  let exactTitleNameMatches = 0;
  let singleTypeCandidateMatches = 0;
  let unresolvedNodeAddressTypeGroups = 0;

  for (const node of visualNodes) {
    const addressCandidates = addressesByType.get(node.resourceType) ?? [];
    if (addressCandidates.length === 0) {
      findings.visualNodesWithoutAddressType.push({
        file,
        sourceNodeId: node.sourceNodeId,
        resourceType: node.resourceType,
        label: node.title
      });
    }
  }
  for (const [resourceType, nodes] of visualNodesByType) {
    const addressCandidates = addressesByType.get(resourceType) ?? [];
    if (nodes.length > 1 && addressCandidates.length === 1) {
      findings.oneAddressMultipleVisualGroups.push({
        file,
        resourceType,
        sourceNodeIds: nodes.map((node) => node.sourceNodeId),
        resourceAddress: addressCandidates[0].raw
      });
    }

    const matchedAddressIndexes = new Set();
    const unmatchedNodes = [];
    for (const node of nodes) {
      const addressIndex = addressCandidates.findIndex(
        (address, index) => !matchedAddressIndexes.has(index) && address.resourceName === node.title
      );
      if (addressIndex === -1) {
        unmatchedNodes.push(node);
      } else {
        matchedAddressIndexes.add(addressIndex);
        exactTitleNameMatches += 1;
      }
    }
    const unmatchedAddresses = addressCandidates.filter(
      (_address, index) => !matchedAddressIndexes.has(index)
    );
    if (unmatchedNodes.length === 0 && unmatchedAddresses.length === 0) {
      continue;
    }
    if (unmatchedNodes.length === 1 && unmatchedAddresses.length === 1) {
      singleTypeCandidateMatches += 1;
    } else {
      unresolvedNodeAddressTypeGroups += 1;
    }
  }

  return {
    explicitEndpointPairs,
    visualAwsNodes: visualNodes.length,
    terraformResourceAddresses: capture.terraform.resourceAddresses.length,
    exactTitleNameMatches,
    singleTypeCandidateMatches,
    unresolvedNodeAddressTypeGroups
  };
}

function validateOrderedCollection(collection, idKey, kind, file, addError) {
  const ids = new Set();
  const orders = new Set();
  for (const [index, item] of collection.entries()) {
    if (typeof item[idKey] !== "string" || item[idKey] === "" || ids.has(item[idKey])) {
      addError(
        "idOrOrderErrors",
        `brainboard.capture.invalid_or_duplicate_${kind}_id`,
        file,
        `${kind}s[${index}].${idKey}`,
        `${kind} IDs must be non-empty and unique`
      );
    }
    if (!Number.isInteger(item.order) || item.order !== index || orders.has(item.order)) {
      addError(
        "idOrOrderErrors",
        `brainboard.capture.non_contiguous_${kind}_order`,
        file,
        `${kind}s[${index}].order`,
        `${kind} order must be unique, contiguous, and equal to DOM array order`
      );
    }
    ids.add(item[idKey]);
    orders.add(item.order);
  }
}

function validateUniqueStrings(values, codeSuffix, file, errorPath, addError) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string" || value === "" || seen.has(value)) {
      addError(
        "idOrOrderErrors",
        `brainboard.capture.${codeSuffix}`,
        file,
        `${errorPath}[${index}]`,
        `${errorPath} entries must be non-empty and unique`
      );
    }
    seen.add(value);
  }
}

function validateEdgeEndpoints(edge, sourceNode, targetNode) {
  if (!finitePoint(edge.sourcePoint) || !finitePoint(edge.targetPoint)) {
    return "sourcePoint and targetPoint must be explicit finite points";
  }
  if (!Array.isArray(edge.waypoints) || edge.waypoints.length < 2) {
    return "edge must preserve at least its source and target waypoints";
  }
  if (edge.waypoints.some((point) => !finitePoint(point))) {
    return "all edge waypoints must be finite";
  }
  if (
    !samePoint(edge.sourcePoint, edge.waypoints[0]) ||
    !samePoint(edge.targetPoint, edge.waypoints.at(-1))
  ) {
    return "explicit endpoints must equal the first and last authored waypoints";
  }
  if (typeof edge.svgPath !== "string" || edge.svgPath.trim() === "") {
    return "edge must preserve a non-empty authored SVG path";
  }
  if (
    typeof edge.sourcePort !== "string" ||
    edge.sourcePort === "" ||
    typeof edge.targetPort !== "string" ||
    edge.targetPort === ""
  ) {
    return "edge must preserve non-empty source and target ports";
  }
  if (
    sourceNode &&
    pointToRectangleBoundaryDistance(edge.sourcePoint, sourceNode) > ENDPOINT_BOUNDARY_TOLERANCE
  ) {
    return `sourcePoint is farther than ${ENDPOINT_BOUNDARY_TOLERANCE} units from its node boundary`;
  }
  if (
    targetNode &&
    pointToRectangleBoundaryDistance(edge.targetPoint, targetNode) > ENDPOINT_BOUNDARY_TOLERANCE
  ) {
    return `targetPoint is farther than ${ENDPOINT_BOUNDARY_TOLERANCE} units from its node boundary`;
  }
  return null;
}

function validateIndexSummary(index, captured, failed, addError) {
  const expected = { total: captured + failed, captured, failed };
  if (JSON.stringify(index.summary) !== JSON.stringify(expected)) {
    addError(
      "metadataMismatches",
      "brainboard.capture.index_summary_mismatch",
      null,
      "summary",
      `Index summary ${JSON.stringify(index.summary)} does not match raw status counts ${JSON.stringify(expected)}`
    );
  }
}

function readSourceManifest(repositoryRoot) {
  const idsSource = readFileSync(path.join(repositoryRoot, SOURCE_IDS_RELATIVE_PATH), "utf8");
  const idsBody = /export const BRAINBOARD_TEMPLATE_IDS = \[([\s\S]*?)\] as const;/.exec(
    idsSource
  )?.[1];
  const ids = [...(idsBody ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const manifestSource = readFileSync(
    path.join(repositoryRoot, SOURCE_MANIFEST_RELATIVE_PATH),
    "utf8"
  );
  const entryPattern =
    /\{\s*id:\s*BRAINBOARD_TEMPLATE_IDS\[(\d+)\],\s*sourceTemplateId:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*author:\s*BRAINBOARD_TEMPLATE_AUTHOR,\s*provider:\s*BRAINBOARD_TEMPLATE_PROVIDER,\s*downloads:\s*([\d_]+)/g;
  return [...manifestSource.matchAll(entryPattern)].map((match) => ({
    id: ids[Number(match[1])],
    sourceTemplateId: match[2],
    title: match[3],
    downloads: Number(match[4].replaceAll("_", ""))
  }));
}

function findRepositoryRoot(indexPath) {
  let directory = path.dirname(path.resolve(indexPath));
  while (true) {
    if (existsSync(path.join(directory, "package.json"))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Could not find repository root above ${indexPath}`);
    }
    directory = parent;
  }
}

function parseResourceAddress(raw) {
  const parts = raw.split(".");
  if (parts[0] === "data") {
    return { raw, resourceType: parts[1], resourceName: parts.slice(2).join(".") };
  }
  return { raw, resourceType: parts[0], resourceName: parts.slice(1).join(".") };
}

function pointToRectangleBoundaryDistance(point, node) {
  const minX = node.position.x;
  const minY = node.position.y;
  const maxX = minX + node.width;
  const maxY = minY + node.height;
  const inside = point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  if (inside) {
    return Math.min(
      Math.abs(point.x - minX),
      Math.abs(point.x - maxX),
      Math.abs(point.y - minY),
      Math.abs(point.y - maxY)
    );
  }
  const deltaX = Math.max(minX - point.x, 0, point.x - maxX);
  const deltaY = Math.max(minY - point.y, 0, point.y - maxY);
  return Math.hypot(deltaX, deltaY);
}

function semanticEdgeSignature(edge) {
  return JSON.stringify({
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourcePort: edge.sourcePort,
    targetPort: edge.targetPort,
    sourcePoint: edge.sourcePoint,
    targetPoint: edge.targetPoint,
    svgPath: edge.svgPath,
    waypoints: edge.waypoints,
    arrow: edge.arrow
  });
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function area(node) {
  return node.width * node.height;
}

function finitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function samePoint(left, right) {
  return left.x === right.x && left.y === right.y;
}

function createEmptyFindings() {
  return {
    rawParentTwoNodeCycles: [],
    invertedParentLinks: [],
    semanticDuplicateEdgePairs: [],
    nonzeroRotations: [],
    emptyTextNodes: [],
    shapeStyleGaps: [],
    emptyUndefinedTerraformFiles: [],
    visualNodesWithoutAddressType: [],
    oneAddressMultipleVisualGroups: []
  };
}

function emptyCaptureAudit(overrides = {}) {
  return {
    explicitEndpointPairs: 0,
    visualAwsNodes: 0,
    terraformResourceAddresses: 0,
    exactTitleNameMatches: 0,
    singleTypeCandidateMatches: 0,
    unresolvedNodeAddressTypeGroups: 0,
    ...overrides
  };
}

function printHumanReport(report) {
  const summary = report.summary;
  const lines = [
    `Brainboard capture validation: ${report.valid ? "PASS" : "FAIL"}`,
    `templates: ${summary.totalTemplates} (${summary.capturedTemplates} captured, ${summary.failedTemplates} failed)`,
    `integrity errors: ${report.errors.length}`,
    `raw parent cycles: ${summary.rawParentTwoNodeCycles}`,
    `inverted parent links: ${summary.invertedParentLinks}`,
    `exact semantic duplicate-edge pairs: ${summary.semanticDuplicateEdgePairs}`,
    `nonzero rotations: ${summary.nonzeroRotations}`,
    `empty text / shape style gaps: ${summary.emptyTextNodes} / ${summary.shapeStyleGaps}`,
    `empty undefined.tf files: ${summary.emptyUndefinedTerraformFiles}`,
    `visual AWS nodes / Terraform addresses: ${summary.visualAwsNodes} / ${summary.terraformResourceAddresses}`,
    "mapping policy: evidence-only; array-index pairing is forbidden"
  ];
  if (report.errors.length > 0) {
    lines.push(
      "",
      ...report.errors.map(
        (error) => `${error.code} ${error.file ?? "index"}:${error.path} ${error.message}`
      )
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function parseCliArguments(argv) {
  const options = {
    indexPath: DEFAULT_INDEX_PATH,
    capturesDirectory: DEFAULT_CAPTURES_DIRECTORY,
    json: false,
    writeStatusPath: null,
    checkStatusPath: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--index") {
      options.indexPath = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === "--captures-dir") {
      options.capturesDirectory = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === "--write-status") {
      options.writeStatusPath = path.resolve(optionalValue(argv, index + 1, DEFAULT_STATUS_PATH));
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
    } else if (argument === "--check-status") {
      options.checkStatusPath = path.resolve(optionalValue(argv, index + 1, DEFAULT_STATUS_PATH));
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.writeStatusPath && options.checkStatusPath) {
    throw new Error("Use only one of --write-status or --check-status");
  }
  return options;
}

function requireValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function optionalValue(argv, index, fallback) {
  const value = argv[index];
  return !value || value.startsWith("--") ? fallback : value;
}

function assertOutsideRawCaptures(outputPath, capturesDirectory) {
  const relative = path.relative(path.resolve(capturesDirectory), path.resolve(outputPath));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("Refusing to write generated status inside immutable raw captures");
  }
}

async function main() {
  try {
    const cli = parseCliArguments(process.argv.slice(2));
    const report = validateCaptureCorpus({
      indexPath: cli.indexPath,
      capturesDirectory: cli.capturesDirectory
    });
    if (!report.valid && (cli.writeStatusPath || cli.checkStatusPath)) {
      const errorCodes = [...new Set(report.errors.map(({ code }) => code))];
      throw new Error(
        `Capture validation failed; refusing to read or write status (${errorCodes.join(", ")})`
      );
    }
    if (cli.writeStatusPath) {
      assertOutsideRawCaptures(cli.writeStatusPath, cli.capturesDirectory);
      const statusText = buildStatusText(cli);
      writeFileSync(cli.writeStatusPath, statusText);
      process.stdout.write(`Wrote deterministic capture status: ${cli.writeStatusPath}\n`);
    } else if (cli.checkStatusPath) {
      assertOutsideRawCaptures(cli.checkStatusPath, cli.capturesDirectory);
      const statusText = buildStatusText(cli);
      if (readFileSync(cli.checkStatusPath, "utf8") !== statusText) {
        throw new Error(`Capture status is stale: ${cli.checkStatusPath}`);
      }
      process.stdout.write(`Capture status is deterministic and current: ${cli.checkStatusPath}\n`);
    } else if (cli.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printHumanReport(report);
    }
    process.exitCode = report.valid ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}

function buildStatusText(cli) {
  return `${JSON.stringify(
    buildCaptureStatus({
      indexPath: cli.indexPath,
      capturesDirectory: cli.capturesDirectory
    }),
    null,
    2
  )}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
