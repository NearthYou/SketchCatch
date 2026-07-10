import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];
const conflictMarkerPattern = /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m;

const stateFileLimits = [
  { path: "agent-progress.md", maxLines: 220, maxBytes: 24_000 },
  { path: "session-handoff.md", maxLines: 80, maxBytes: 12_000 }
];

function readText(relativePath) {
  const filePath = join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    problems.push(`${relativePath}: file does not exist`);
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function requireIncludes(relativePath, needle, message) {
  const content = readText(relativePath);
  if (!content.includes(needle)) {
    problems.push(`${relativePath}: ${message}`);
  }
}

function requireHeading(relativePath, heading) {
  requireIncludes(relativePath, heading, `missing required heading ${heading}`);
}

function lineCount(content) {
  if (content.length === 0) {
    return 0;
  }
  return content.split(/\r\n|\r|\n/).length;
}

function checkStateFileSize(relativePath, content, maxLines, maxBytes) {
  const lines = lineCount(content);
  const bytes = Buffer.byteLength(content, "utf8");
  if (lines > maxLines) {
    problems.push(
      `${relativePath}: ${lines} lines exceeds ${maxLines}; archive old entries under docs/agent-history/`
    );
  }
  if (bytes > maxBytes) {
    problems.push(
      `${relativePath}: ${bytes} bytes exceeds ${maxBytes}; archive old entries under docs/agent-history/`
    );
  }
}

function checkNoConflictMarkers(relativePath, content) {
  if (conflictMarkerPattern.test(content)) {
    problems.push(`${relativePath}: merge conflict marker remains`);
  }
}

function checkFeatureList() {
  let parsed;
  try {
    parsed = JSON.parse(readText("feature_list.json"));
  } catch (error) {
    problems.push(`feature_list.json: invalid JSON (${error.message})`);
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push("feature_list.json: root must be an object");
    return;
  }

  const allowedStatuses = new Set(parsed.statusRules?.allowedStatuses ?? []);
  const features = parsed.features;
  if (!Array.isArray(features) || features.length === 0) {
    problems.push("feature_list.json: features must be a non-empty array");
    return;
  }

  const ids = new Set();
  let inProgressCount = 0;

  for (const feature of features) {
    if (!feature.id || typeof feature.id !== "string") {
      problems.push("feature_list.json: every feature needs a string id");
      continue;
    }

    if (ids.has(feature.id)) {
      problems.push(`feature_list.json: duplicate feature id ${feature.id}`);
    }
    ids.add(feature.id);

    if (!allowedStatuses.has(feature.status)) {
      problems.push(`feature_list.json: ${feature.id} has invalid status ${feature.status}`);
    }

    if (feature.status === "in_progress") {
      inProgressCount += 1;
    }

    if (feature.status === "passing") {
      const commands = feature.evidence?.commands;
      if (!feature.evidence?.lastVerified || !Array.isArray(commands) || commands.length === 0) {
        problems.push(`feature_list.json: ${feature.id} is passing without verification evidence`);
      }
    }

    if (feature.status === "blocked" && !feature.notes) {
      problems.push(`feature_list.json: ${feature.id} is blocked without notes`);
    }
  }

  if (parsed.statusRules?.singleActiveFeature && inProgressCount > 1) {
    problems.push(`feature_list.json: expected at most one in_progress feature, found ${inProgressCount}`);
  }
}

function checkMarkdownStateFiles() {
  const progress = readText("agent-progress.md");
  const handoff = readText("session-handoff.md");

  requireHeading("agent-progress.md", "## Current Verified State");
  requireHeading("agent-progress.md", "## Session Record");
  requireHeading("session-handoff.md", "## Currently Verified");
  requireHeading("session-handoff.md", "## Changes This Session");
  requireHeading("session-handoff.md", "## Broken Or Unverified");
  requireHeading("session-handoff.md", "## Best Next Action");
  requireHeading("clean-state-checklist.md", "## 거절해야 하는 완료 선언");
  requireHeading("evaluator-rubric.md", "## Hard Fail");
  requireHeading("quality-document.md", "## 제품 도메인 스냅샷");

  for (const { path, maxLines, maxBytes } of stateFileLimits) {
    const content = path === "agent-progress.md" ? progress : handoff;
    checkStateFileSize(path, content, maxLines, maxBytes);
    checkNoConflictMarkers(path, content);
  }

  if (/^- pending\s*$/m.test(progress)) {
    problems.push("agent-progress.md: unresolved '- pending' placeholder remains");
  }
  if (/^- pending\s*$/m.test(handoff)) {
    problems.push("session-handoff.md: unresolved '- pending' placeholder remains");
  }
}

function checkWiring() {
  requireIncludes("AGENTS.md", "## Harness Operating Loop", "Harness Operating Loop is not wired into root instructions");
  requireIncludes("AGENTS.md", "feature_list.json", "feature_list.json is not referenced");
  requireIncludes("AGENTS.md", "docs/agent-history/", "agent progress archive is not referenced");
  requireIncludes("AGENTS.md", "clean-state-checklist.md", "clean-state checklist is not referenced");
  requireIncludes("docs/README.md", "../agent-progress.md", "agent-progress.md is not in the docs map");
  requireIncludes("docs/README.md", "./agent-history/", "agent progress archive is not in the docs map");
  requireIncludes("docs/README.md", "../feature_list.json", "feature_list.json is not in the docs map");
}

checkFeatureList();
checkMarkdownStateFiles();
checkWiring();

if (problems.length > 0) {
  console.error("Harness check failed:");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log("Harness check passed.");
