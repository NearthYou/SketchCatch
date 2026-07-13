#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";
import { normalizeCapture } from "./normalize-capture.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const capturesDirectory = path.join(
  repositoryRoot,
  "docs/gg/feat-infrastructure-template/brainboard-captures"
);
const captureIndexPath = path.join(
  repositoryRoot,
  "docs/gg/feat-infrastructure-template/brainboard-capture-index.json"
);
const configDirectory = path.join(
  repositoryRoot,
  "scripts/brainboard-capture/source-fixture-configs"
);
const sourcesDirectory = path.join(
  repositoryRoot,
  "packages/types/src/brainboard-templates/sources"
);

export async function runSourceFixtureGenerator(argv = process.argv.slice(2)) {
  const cli = parseCliArguments(argv);
  const fixtures = await loadFixtureConfigs(cli.configFileName);
  for (const config of fixtures) {
    const outputPath = path.join(sourcesDirectory, config.outputFileName);
    const prettierConfig = (await resolveConfig(outputPath)) ?? {};
    const generated = await format(generateFixture(config), {
      ...prettierConfig,
      filepath: outputPath
    });
    if (cli.mode === "check") {
      if (readFileSync(outputPath, "utf8") !== generated) {
        throw new Error(`Generated Brainboard source fixture is stale: ${outputPath}`);
      }
    } else {
      writeFileSync(outputPath, generated);
    }
  }
  process.stdout.write(
    `${cli.mode === "check" ? "Checked" : "Wrote"} ${fixtures.length} deterministic Brainboard source fixtures ${cli.configFileName ? `from ${cli.configFileName}` : "in manifest rank order"}\n`
  );
}

function parseCliArguments(argv) {
  let mode = null;
  let configFileName = null;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--check" || option === "--write") {
      if (mode !== null) throw new Error("Use exactly one of --check or --write");
      mode = option.slice(2);
      continue;
    }
    if (option === "--config") {
      if (configFileName !== null) throw new Error("Use --config at most once");
      const value = argv[index + 1];
      if (!value || !/^batch-[0-9-]+\.mjs$/u.test(value)) {
        throw new Error("--config requires a batch-<ranks>.mjs file name");
      }
      configFileName = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${option}`);
  }
  if (mode === null) throw new Error("Use exactly one of --check or --write");
  return { mode, configFileName };
}

async function loadFixtureConfigs(configFileName) {
  const configFiles = configFileName
    ? [configFileName]
    : readdirSync(configDirectory)
        .filter((fileName) => /^batch-[0-9-]+\.mjs$/u.test(fileName))
        .sort((left, right) => left.localeCompare(right, "en"));
  const modules = await Promise.all(
    configFiles.map((fileName) => import(pathToFileURL(path.join(configDirectory, fileName)).href))
  );
  const configs = modules.flatMap((module, index) => {
    if (!Array.isArray(module.fixtures)) {
      throw new Error(`${configFiles[index]} must export a fixtures array`);
    }
    return module.fixtures;
  });
  configs.sort((left, right) => left.rank - right.rank);

  const index = JSON.parse(readFileSync(captureIndexPath, "utf8"));
  const seenRanks = new Set();
  const seenOutputs = new Set();
  const verifiedConfigs = [];
  for (const config of configs) {
    if (!Number.isInteger(config.rank) || seenRanks.has(config.rank)) {
      throw new Error(`Fixture rank must be a unique integer: ${config.rank}`);
    }
    if (seenOutputs.has(config.outputFileName)) {
      throw new Error(`Fixture output must be unique: ${config.outputFileName}`);
    }
    seenRanks.add(config.rank);
    seenOutputs.add(config.outputFileName);
    const manifestEntry = index.templates.find(({ rank }) => rank === config.rank);
    if (manifestEntry?.file !== config.captureFileName) {
      throw new Error(
        `Fixture rank ${config.rank} must target manifest capture ${manifestEntry?.file ?? "<missing>"}`
      );
    }
    verifiedConfigs.push({
      ...config,
      expectedCaptureSha256: manifestEntry.captureSha256
    });
  }
  return verifiedConfigs;
}

function generateFixture(config) {
  const raw = readVerifiedRawCapture(
    path.join(capturesDirectory, config.captureFileName),
    config.expectedCaptureSha256
  );
  const normalized = normalizeCapture(raw);
  if (normalized.captureStatus !== "captured") {
    throw new Error(`Cannot generate a deployable source from ${config.captureFileName}`);
  }
  const normalizedNodeIds = new Set(normalized.nodes.map(({ sourceNodeId }) => sourceNodeId));
  const bindingIds = Object.keys(config.bindings);
  if (
    bindingIds.length !== normalized.nodes.length ||
    bindingIds.some((sourceNodeId) => !normalizedNodeIds.has(sourceNodeId))
  ) {
    throw new Error(`Bindings do not exactly cover ${config.captureFileName}`);
  }

  const definition = {
    id: normalized.id,
    origin: {
      platform: normalized.origin.platform,
      author: normalized.origin.author,
      sourceTemplateId: normalized.origin.sourceTemplateId,
      sourceUrl: normalized.origin.sourceUrl,
      cloneArchitectureId: normalized.origin.cloneArchitectureId,
      downloads: normalized.origin.downloads,
      capturedAt: normalized.origin.capturedAt
    },
    captureStatus: "captured",
    title: normalized.title,
    description: null,
    provider: normalized.provider,
    viewport: normalized.viewport,
    nodes: normalized.nodes.map((node) => ({
      sourceNodeId: node.sourceNodeId,
      domOrder: node.domOrder,
      label: node.label,
      position: node.position,
      size: node.size,
      parentSourceNodeId: node.parentSourceNodeId,
      zIndex: node.zIndex,
      rawTransform: node.rawTransform,
      rotation: node.rotation,
      rawResourceType: node.rawResourceType
    })),
    edges: normalized.edges.map((edge) => ({
      sourceEdgeId: edge.sourceEdgeId,
      domOrder: edge.domOrder,
      zIndex: edge.zIndex,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      svgPath: edge.svgPath,
      sourcePoint: edge.sourcePoint,
      targetPoint: edge.targetPoint,
      waypoints: edge.waypoints,
      arrowDirection: edge.arrowDirection,
      arrowAngle: edge.arrowAngle,
      rawArrow: edge.rawArrow
    })),
    terraform: {
      files: normalized.terraform.files.map((file) => sourceFile(file, config.workspaceOmissions)),
      resourceAddresses: normalized.terraform.resourceAddresses
    },
    bindings: Object.fromEntries(
      normalized.nodes.map(({ sourceNodeId }) => [sourceNodeId, config.bindings[sourceNodeId]])
    )
  };

  return [
    'import { defineCapturedBrainboardTemplate } from "./define-source.js";',
    "",
    `export const ${config.exportName} = defineCapturedBrainboardTemplate(`,
    `${JSON.stringify(definition, null, 2)}`,
    ");",
    ""
  ].join("\n");
}

export function readVerifiedRawCapture(capturePath, expectedSha256) {
  const rawBytes = readFileSync(capturePath);
  if (sha256(rawBytes) !== expectedSha256) {
    throw new Error(`Raw capture SHA-256 mismatch: ${path.basename(capturePath)}`);
  }
  return JSON.parse(rawBytes.toString("utf8"));
}

function sourceFile(file, workspaceOmissions) {
  const result = {
    fileName: file.fileName,
    code: file.code,
    sha256: file.sha256,
    includeInWorkspace: file.includeInWorkspace
  };
  const omissions = (workspaceOmissions[file.fileName] ?? []).map((omission) =>
    typeof omission === "string" ? { sourceText: omission, occurrenceCount: 1 } : omission
  );
  if (omissions.length === 0) return result;
  if (!file.includeInWorkspace) {
    throw new Error(`Cannot sanitize excluded source file ${file.fileName}`);
  }
  let workspaceCode = file.code;
  for (const { sourceText, occurrenceCount } of omissions) {
    const actualOccurrenceCount = workspaceCode.split(sourceText).length - 1;
    if (
      !Number.isInteger(occurrenceCount) ||
      occurrenceCount < 1 ||
      actualOccurrenceCount !== occurrenceCount
    ) {
      throw new Error(
        `${file.fileName} contains ${actualOccurrenceCount}, not ${occurrenceCount}, reviewed fragment occurrences`
      );
    }
    workspaceCode = workspaceCode.split(sourceText).join("");
  }
  result.workspaceSeed = {
    code: workspaceCode,
    sha256: sha256(workspaceCode),
    omissions: omissions.map(({ sourceText, occurrenceCount }) => ({
      reason: "brainboard-architecture-uuid",
      sourceText,
      occurrenceCount
    }))
  };
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runSourceFixtureGenerator();
}
