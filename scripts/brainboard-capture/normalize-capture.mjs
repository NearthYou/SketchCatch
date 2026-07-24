#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = path.resolve(scriptDirectory, "../..");
export const DEFAULT_INDEX_PATH = path.join(
  DEFAULT_REPOSITORY_ROOT,
  "docs/diagram-templates/brainboard/capture-index.json"
);
export const DEFAULT_CAPTURES_DIRECTORY = path.join(
  DEFAULT_REPOSITORY_ROOT,
  "docs/diagram-templates/brainboard/captures"
);
export const DEFAULT_REPORT_PATH = path.join(
  DEFAULT_REPOSITORY_ROOT,
  "docs/diagram-templates/brainboard/normalization-report.json"
);

const CLONE_ARCHITECTURE_ID_PATTERN =
  /\/a\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/design(?:[/?#]|$)/i;
const NUMBER_PATTERN = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?";
const ROTATION_PATTERN = new RegExp(`\\brotate\\(\\s*(${NUMBER_PATTERN})(?:[\\s,]|\\))`, "i");
const ARROW_ROTATION_PATTERN = new RegExp(
  `^\\s*rotate\\(\\s*(${NUMBER_PATTERN})[\\s,]+(${NUMBER_PATTERN})[\\s,]+(${NUMBER_PATTERN})\\s*\\)\\s*$`,
  "i"
);
const ARROW_CENTER_TOLERANCE = 1e-9;

export const CENTER_CONTAINMENT_TOLERANCE = 0.5;

export function normalizeCapture(rawCapture, options = {}) {
  if (rawCapture?.status === "failed") {
    return {
      id: rawCapture.id,
      title: rawCapture.title,
      captureStatus: "failed",
      provider: "aws",
      attemptedAt: rawCapture.attemptedAt,
      origin: {
        platform: rawCapture.origin.platform,
        author: rawCapture.origin.author,
        sourceTemplateId: rawCapture.sourceTemplateId,
        sourceUrl: rawCapture.origin.sourceUrl,
        previewUrl: rawCapture.origin.previewUrl,
        previewWidth: rawCapture.origin.previewWidth,
        previewHeight: rawCapture.origin.previewHeight,
        downloads: rawCapture.downloads
      },
      attempts: cloneJson(rawCapture.attempts),
      error: rawCapture.error
    };
  }
  const viewport = parseViewBox(rawCapture.viewport?.viewBox);

  const normalizedNodes = rawCapture.nodes.map(normalizeNode);
  const { nodes, parentRepairs } = repairInvertedParents(normalizedNodes, options);
  const remainingCycles = findParentCycles(nodes);
  if (remainingCycles.length > 0) {
    throw new ParentNormalizationError(
      "brainboard.normalize.parent_cycle",
      `Parent normalization left ${remainingCycles.length} cycle(s)`,
      { cycles: remainingCycles }
    );
  }

  return {
    id: rawCapture.id,
    sourceTemplateId: rawCapture.sourceTemplateId,
    title: rawCapture.title,
    downloads: rawCapture.downloads,
    captureStatus: rawCapture.status,
    error: rawCapture.error,
    origin: normalizeOrigin(rawCapture.origin),
    provider: rawCapture.provider,
    viewport,
    nodes,
    edges: rawCapture.edges.map(normalizeEdge),
    terraform: {
      files: rawCapture.terraform.files.map((file) => ({
        fileName: file.fileName,
        code: file.code,
        lineCount: file.lineCount,
        sha256: file.sha256,
        includeInWorkspace: file.includeInWorkspace
      })),
      resourceAddresses: [...rawCapture.terraform.resourceAddresses]
    },
    normalization: { parentRepairs }
  };
}

export function normalizeCaptureCorpus({
  indexPath = DEFAULT_INDEX_PATH,
  capturesDirectory = DEFAULT_CAPTURES_DIRECTORY,
  parentOverrides = {},
  centerTolerance = CENTER_CONTAINMENT_TOLERANCE
} = {}) {
  const indexBytes = readFileSync(indexPath);
  const index = JSON.parse(indexBytes);
  const captures = [];
  const templates = [];
  const parentRepairs = [];
  let capturedTemplates = 0;
  let failedTemplates = 0;
  let fullEnclosureRepairs = 0;
  let centerContainmentRepairs = 0;
  let rootRepairs = 0;
  let overrideRepairs = 0;
  let remainingParentCycles = 0;
  let nonzeroRotations = 0;
  let explicitEndpointPairs = 0;
  let sourceEdges = 0;
  let normalizedEdges = 0;

  const verifiedRawCaptures = index.templates.map((entry) => {
    const capturePath = path.join(capturesDirectory, entry.file);
    const rawBytes = readFileSync(capturePath);
    const rawCaptureSha256 = digest(rawBytes);
    if (rawCaptureSha256 !== entry.captureSha256) {
      throw new CaptureIntegrityError(
        "brainboard.normalize.raw_sha_mismatch",
        `Raw capture SHA-256 does not match the immutable index for ${entry.file}`,
        {
          file: entry.file,
          expectedSha256: entry.captureSha256,
          actualSha256: rawCaptureSha256
        }
      );
    }
    return { entry, rawBytes, rawCaptureSha256 };
  });

  for (const { entry, rawBytes, rawCaptureSha256 } of verifiedRawCaptures) {
    const rawCapture = JSON.parse(rawBytes);
    const normalized = normalizeCapture(rawCapture, {
      parentOverrides: parentOverrides[entry.id] ?? {},
      centerTolerance
    });
    captures.push(normalized);

    if (normalized.captureStatus === "failed") {
      failedTemplates += 1;
      templates.push({
        rank: entry.rank,
        id: entry.id,
        file: entry.file,
        captureStatus: "failed",
        rawCaptureSha256,
        normalizedSha256: digest(JSON.stringify(normalized)),
        parentRepairs: 0,
        remainingParentCycles: 0,
        cloneArchitectureId: null,
        error: normalized.error
      });
      continue;
    }

    capturedTemplates += 1;
    const templateCycles = findParentCycles(normalized.nodes);
    remainingParentCycles += templateCycles.length;
    nonzeroRotations += normalized.nodes.filter((node) => node.rotation !== 0).length;
    explicitEndpointPairs += normalized.edges.filter(
      (edge) => finitePoint(edge.sourcePoint) && finitePoint(edge.targetPoint)
    ).length;
    sourceEdges += rawCapture.edges.length;
    normalizedEdges += normalized.edges.length;

    for (const repair of normalized.normalization.parentRepairs) {
      const reportRepair = { file: entry.file, ...repair };
      parentRepairs.push(reportRepair);
      if (repair.strategy === "full-enclosure") fullEnclosureRepairs += 1;
      if (repair.strategy === "center-containment") centerContainmentRepairs += 1;
      if (repair.strategy === "root") rootRepairs += 1;
      if (repair.strategy === "override") overrideRepairs += 1;
    }
    if (rawCapture.edges.length !== normalized.edges.length) {
      throw new Error(
        `Normalization changed parallel-edge cardinality for ${entry.file}: ${rawCapture.edges.length} -> ${normalized.edges.length}`
      );
    }
    templates.push({
      rank: entry.rank,
      id: entry.id,
      file: entry.file,
      captureStatus: "captured",
      rawCaptureSha256,
      normalizedSha256: digest(JSON.stringify(normalized)),
      nodeCount: normalized.nodes.length,
      edgeCount: normalized.edges.length,
      parentRepairs: normalized.normalization.parentRepairs.length,
      remainingParentCycles: templateCycles.length,
      cloneArchitectureId: normalized.origin.cloneArchitectureId,
      error: null
    });
  }

  const report = {
    schemaVersion: 1,
    source: {
      index: path.relative(DEFAULT_REPOSITORY_ROOT, indexPath),
      indexSha256: digest(indexBytes),
      capturesDirectory: path.relative(DEFAULT_REPOSITORY_ROOT, capturesDirectory),
      rawEvidenceImmutable: true
    },
    policy: {
      repairScope: "inverted-parent-links-only",
      fullEnclosure: "smallest-strictly-larger-area",
      centerContainmentFallbackTolerance: centerTolerance,
      noCandidate: "clear-inverted-parent-to-root",
      equalAreaTie: "fail-with-dom-order-candidates-unless-reviewed-override",
      nullParents: "preserve",
      nodeAddressMapping: "unresolved-no-array-index-matching",
      terraformExpressions: "preserve-source-code-without-string-coercion",
      parallelEdges: "preserve"
    },
    summary: {
      totalTemplates: index.templates.length,
      capturedTemplates,
      failedTemplates,
      parentRepairs: parentRepairs.length,
      fullEnclosureRepairs,
      centerContainmentRepairs,
      rootRepairs,
      overrideRepairs,
      remainingParentCycles,
      nonzeroRotations,
      explicitEndpointPairs,
      sourceEdges,
      normalizedEdges
    },
    templates,
    parentRepairs
  };

  if (remainingParentCycles !== 0) {
    throw new ParentNormalizationError(
      "brainboard.normalize.corpus_parent_cycles",
      `Normalized corpus has ${remainingParentCycles} remaining parent cycle(s)`,
      { remainingParentCycles }
    );
  }
  return { captures, report };
}

export function repairInvertedParents(
  nodes,
  { parentOverrides = {}, centerTolerance = CENTER_CONTAINMENT_TOLERANCE } = {}
) {
  if (!Number.isFinite(centerTolerance) || centerTolerance < 0) {
    throw new RangeError("centerTolerance must be a finite non-negative number");
  }
  const inputNodes = nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    size: { ...node.size }
  }));
  const nodesById = new Map(inputNodes.map((node) => [node.sourceNodeId, node]));
  const parentRepairs = [];

  for (const node of inputNodes) {
    if (node.parentSourceNodeId === null) continue;
    const rawParent = nodesById.get(node.parentSourceNodeId);
    if (!rawParent || area(rawParent) >= area(node)) continue;

    const fullEnclosures = largerCandidates(inputNodes, node).filter((candidate) =>
      fullyEncloses(candidate, node)
    );
    const centerCandidates =
      fullEnclosures.length === 0
        ? largerCandidates(inputNodes, node).filter((candidate) =>
            containsCenter(candidate, node, centerTolerance)
          )
        : [];
    const candidates = fullEnclosures.length > 0 ? fullEnclosures : centerCandidates;
    const strategy = fullEnclosures.length > 0 ? "full-enclosure" : "center-containment";
    const smallestArea =
      candidates.length > 0 ? Math.min(...candidates.map(area)) : Number.POSITIVE_INFINITY;
    const smallestCandidates = candidates
      .filter((candidate) => area(candidate) === smallestArea)
      .sort(compareDomOrder);
    const overrideId = parentOverrides[node.sourceNodeId];
    let replacement = null;
    let repairStrategy = strategy;

    if (overrideId !== undefined) {
      replacement =
        smallestCandidates.find((candidate) => candidate.sourceNodeId === overrideId) ?? null;
      if (!replacement) {
        throw new ParentNormalizationError(
          "brainboard.normalize.invalid_parent_override",
          `Override ${JSON.stringify(overrideId)} is not a valid larger containment candidate for ${JSON.stringify(node.sourceNodeId)}`,
          {
            sourceNodeId: node.sourceNodeId,
            overrideId,
            candidateSourceNodeIds: smallestCandidates.map((candidate) => candidate.sourceNodeId)
          }
        );
      }
      repairStrategy = "override";
    } else if (candidates.length > 0) {
      if (smallestCandidates.length > 1) {
        throw new ParentNormalizationError(
          "brainboard.normalize.ambiguous_parent",
          `Equal-area parent candidates require an explicit override for ${JSON.stringify(node.sourceNodeId)}`,
          {
            sourceNodeId: node.sourceNodeId,
            candidateSourceNodeIds: smallestCandidates.map((candidate) => candidate.sourceNodeId)
          }
        );
      }
      replacement = smallestCandidates[0];
    } else {
      repairStrategy = "root";
    }

    const fromParentSourceNodeId = node.parentSourceNodeId;
    node.parentSourceNodeId = replacement?.sourceNodeId ?? null;
    parentRepairs.push({
      sourceNodeId: node.sourceNodeId,
      fromParentSourceNodeId,
      toParentSourceNodeId: node.parentSourceNodeId,
      strategy: repairStrategy
    });
  }

  return { nodes: inputNodes, parentRepairs };
}

export function findParentCycles(nodes) {
  const nodesById = new Map(nodes.map((node) => [node.sourceNodeId, node]));
  const cyclesByKey = new Map();

  for (const start of nodes) {
    const path = [];
    const pathIndexes = new Map();
    let current = start;
    while (current) {
      const cycleStart = pathIndexes.get(current.sourceNodeId);
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart).map((node) => node.sourceNodeId);
        const canonical = canonicalizeCycle(cycle, nodesById);
        cyclesByKey.set(canonical.join("\u0000"), canonical);
        break;
      }
      pathIndexes.set(current.sourceNodeId, path.length);
      path.push(current);
      current =
        current.parentSourceNodeId === null ? undefined : nodesById.get(current.parentSourceNodeId);
    }
  }

  return [...cyclesByKey.values()].sort((left, right) =>
    compareDomOrder(nodesById.get(left[0]), nodesById.get(right[0]))
  );
}

export class ParentNormalizationError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ParentNormalizationError";
    this.code = code;
    this.details = details;
  }
}

export class CaptureIntegrityError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "CaptureIntegrityError";
    this.code = code;
    this.details = details;
  }
}

export function parseViewBox(rawViewBox) {
  const values = String(rawViewBox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`Invalid SVG viewBox: ${JSON.stringify(rawViewBox)}`);
  }
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) {
    throw new RangeError(
      `SVG viewBox width and height must be positive: ${JSON.stringify(rawViewBox)}`
    );
  }
  return { x, y, width, height };
}

export function parseRotation(rawTransform) {
  const match = ROTATION_PATTERN.exec(String(rawTransform ?? ""));
  if (!match) {
    throw new TypeError(
      `Transform does not contain a numeric rotate(...): ${JSON.stringify(rawTransform)}`
    );
  }
  const rotation = Number(match[1]);
  if (!Number.isFinite(rotation)) {
    throw new TypeError(`Transform rotation must be finite: ${JSON.stringify(rawTransform)}`);
  }
  return rotation;
}

function normalizeOrigin(origin) {
  const cloneBoardUrl = origin.cloneBoardUrl ?? null;
  return {
    platform: origin.platform,
    author: origin.author,
    sourceTemplateId: origin.sourceTemplateId,
    sourceUrl: origin.sourceUrl,
    cloneBoardUrl,
    cloneArchitectureId: extractCloneArchitectureId(cloneBoardUrl),
    downloads: origin.downloads,
    capturedAt: origin.capturedAt
  };
}

function extractCloneArchitectureId(cloneBoardUrl) {
  if (cloneBoardUrl === null) return null;
  const match = CLONE_ARCHITECTURE_ID_PATTERN.exec(cloneBoardUrl);
  if (!match) {
    throw new TypeError(`Invalid Brainboard clone board URL: ${JSON.stringify(cloneBoardUrl)}`);
  }
  return match[1];
}

function normalizeNode(node) {
  const rawTransform = node.rawTransform ?? node.transform;
  return {
    kind: "unresolved",
    sourceNodeId: node.sourceNodeId,
    domOrder: node.order,
    zIndex: node.order,
    position: { x: node.position.x, y: node.position.y },
    size: { width: node.width, height: node.height },
    rawResourceType: node.resourceType,
    label: node.title,
    onboarding: node.onboarding,
    rawTransform,
    rotation: parseRotation(rawTransform),
    parentSourceNodeId: node.parentSourceNodeId
  };
}

function normalizeEdge(edge) {
  const waypoints = edge.waypoints.map((point) => ({ x: point.x, y: point.y }));
  const sourcePoint = edge.sourcePoint ?? waypoints[0];
  const targetPoint = edge.targetPoint ?? waypoints.at(-1);
  if (!sourcePoint || !targetPoint) {
    throw new TypeError(`Edge ${JSON.stringify(edge.id)} has no explicit endpoints or waypoints`);
  }
  const arrow = normalizeArrow(edge.arrow, sourcePoint, targetPoint, edge.id);
  return {
    sourceEdgeId: edge.id,
    domOrder: edge.order,
    zIndex: edge.order,
    svgPath: edge.svgPath,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourcePort: edge.sourcePort,
    targetPort: edge.targetPort,
    sourcePoint: { x: sourcePoint.x, y: sourcePoint.y },
    targetPoint: { x: targetPoint.x, y: targetPoint.y },
    waypoints,
    arrowDirection: arrow.arrowDirection,
    arrowAngle: arrow.arrowAngle,
    rawArrow: cloneJson(edge.arrow)
  };
}

function normalizeArrow(rawArrow, sourcePoint, targetPoint, edgeId) {
  if (rawArrow === null || rawArrow === undefined) {
    return { arrowDirection: "none", arrowAngle: 0 };
  }
  const match = ARROW_ROTATION_PATTERN.exec(String(rawArrow.transform ?? ""));
  if (!match) {
    throw new TypeError(
      `Edge ${JSON.stringify(edgeId)} arrow transform is not rotate(angle, centerX, centerY): ${JSON.stringify(rawArrow.transform)}`
    );
  }
  const [arrowAngle, centerX, centerY] = match.slice(1).map(Number);
  if (![arrowAngle, centerX, centerY].every(Number.isFinite)) {
    throw new TypeError(`Edge ${JSON.stringify(edgeId)} arrow transform must be finite`);
  }
  const atSource = samePointWithinTolerance(
    { x: centerX, y: centerY },
    sourcePoint,
    ARROW_CENTER_TOLERANCE
  );
  const atTarget = samePointWithinTolerance(
    { x: centerX, y: centerY },
    targetPoint,
    ARROW_CENTER_TOLERANCE
  );
  if (atSource === atTarget) {
    throw new TypeError(
      `Edge ${JSON.stringify(edgeId)} arrow marker center must match exactly one authored endpoint`
    );
  }
  return {
    arrowDirection: atTarget ? "source-to-target" : "target-to-source",
    arrowAngle
  };
}

function largerCandidates(nodes, child) {
  return nodes.filter(
    (candidate) => candidate.sourceNodeId !== child.sourceNodeId && area(candidate) > area(child)
  );
}

function fullyEncloses(container, child) {
  return (
    child.position.x >= container.position.x &&
    child.position.y >= container.position.y &&
    child.position.x + child.size.width <= container.position.x + container.size.width &&
    child.position.y + child.size.height <= container.position.y + container.size.height
  );
}

function containsCenter(container, child, tolerance) {
  const centerX = child.position.x + child.size.width / 2;
  const centerY = child.position.y + child.size.height / 2;
  return (
    centerX >= container.position.x - tolerance &&
    centerX <= container.position.x + container.size.width + tolerance &&
    centerY >= container.position.y - tolerance &&
    centerY <= container.position.y + container.size.height + tolerance
  );
}

function area(node) {
  return node.size.width * node.size.height;
}

function compareDomOrder(left, right) {
  const orderDifference = left.domOrder - right.domOrder;
  return orderDifference || left.sourceNodeId.localeCompare(right.sourceNodeId, "en");
}

function canonicalizeCycle(cycle, nodesById) {
  let canonical = cycle;
  for (let index = 1; index < cycle.length; index += 1) {
    const candidate = [...cycle.slice(index), ...cycle.slice(0, index)];
    if (compareDomOrder(nodesById.get(candidate[0]), nodesById.get(canonical[0])) < 0) {
      canonical = candidate;
    }
  }
  return canonical;
}

function samePointWithinTolerance(left, right, tolerance) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= tolerance;
}

function finitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function parseCliArguments(argv) {
  const options = {
    indexPath: DEFAULT_INDEX_PATH,
    capturesDirectory: DEFAULT_CAPTURES_DIRECTORY,
    inputPath: null,
    parentOverridesPath: null,
    reportPath: null,
    checkReportPath: null,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--index") {
      options.indexPath = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === "--captures-dir") {
      options.capturesDirectory = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === "--input") {
      options.inputPath = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === "--parent-overrides") {
      options.parentOverridesPath = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === "--write-report") {
      options.reportPath = path.resolve(requireOptionalValue(argv, index + 1, DEFAULT_REPORT_PATH));
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
    } else if (argument === "--check-report") {
      options.checkReportPath = path.resolve(
        requireOptionalValue(argv, index + 1, DEFAULT_REPORT_PATH)
      );
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.reportPath && options.checkReportPath) {
    throw new Error("Use only one of --write-report or --check-report");
  }
  return options;
}

function requireValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function requireOptionalValue(argv, index, fallback) {
  const value = argv[index];
  return !value || value.startsWith("--") ? fallback : value;
}

function assertSafeReportPath(reportPath, capturesDirectory) {
  const relative = path.relative(path.resolve(capturesDirectory), path.resolve(reportPath));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("Refusing to write a report inside the immutable raw capture directory");
  }
}

function printHumanReport(report) {
  const summary = report.summary;
  process.stdout.write(
    [
      "Brainboard capture normalization: PASS",
      `templates: ${summary.totalTemplates} (${summary.capturedTemplates} captured, ${summary.failedTemplates} failed evidence)`,
      `parent repairs: ${summary.parentRepairs} (${summary.fullEnclosureRepairs} full, ${summary.centerContainmentRepairs} center, ${summary.rootRepairs} root, ${summary.overrideRepairs} override)`,
      `remaining parent cycles: ${summary.remainingParentCycles}`,
      `rotations / endpoint pairs: ${summary.nonzeroRotations} / ${summary.explicitEndpointPairs}`,
      `parallel edge cardinality: ${summary.sourceEdges} -> ${summary.normalizedEdges}`,
      "raw capture writes: forbidden"
    ].join("\n") + "\n"
  );
}

async function main() {
  try {
    const cli = parseCliArguments(process.argv.slice(2));
    const parentOverrides = cli.parentOverridesPath
      ? JSON.parse(readFileSync(cli.parentOverridesPath, "utf8"))
      : {};
    if (cli.inputPath) {
      if (cli.reportPath || cli.checkReportPath) {
        throw new Error("--input cannot be combined with corpus report options");
      }
      const normalized = normalizeCapture(JSON.parse(readFileSync(cli.inputPath, "utf8")), {
        parentOverrides
      });
      process.stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
      return;
    }

    const { report } = normalizeCaptureCorpus({
      indexPath: cli.indexPath,
      capturesDirectory: cli.capturesDirectory,
      parentOverrides
    });
    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    if (cli.reportPath) {
      assertSafeReportPath(cli.reportPath, cli.capturesDirectory);
      writeFileSync(cli.reportPath, reportText);
      process.stdout.write(`Wrote deterministic report: ${cli.reportPath}\n`);
    } else if (cli.checkReportPath) {
      assertSafeReportPath(cli.checkReportPath, cli.capturesDirectory);
      const committed = readFileSync(cli.checkReportPath, "utf8");
      if (committed !== reportText) {
        throw new Error(`Normalization report is stale: ${cli.checkReportPath}`);
      }
      process.stdout.write(
        `Normalization report is deterministic and current: ${cli.checkReportPath}\n`
      );
    } else if (cli.json) {
      process.stdout.write(reportText);
    } else {
      printHumanReport(report);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
