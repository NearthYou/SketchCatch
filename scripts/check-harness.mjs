import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];

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
  requireHeading("agent-progress.md", "## 현재 검증된 상태");
  requireHeading("agent-progress.md", "## 세션 레코드");
  requireHeading("session-handoff.md", "## 현재 검증된 것");
  requireHeading("session-handoff.md", "## 이번 세션의 변경 사항");
  requireHeading("session-handoff.md", "## 아직 깨졌거나 미검증된 것");
  requireHeading("session-handoff.md", "## 다음으로 최선의 행동");
  requireHeading("clean-state-checklist.md", "## 거절해야 하는 완료 선언");
  requireHeading("evaluator-rubric.md", "## Hard Fail");
  requireHeading("quality-document.md", "## 제품 도메인 스냅샷");

  if (/^- pending\s*$/m.test(readText("agent-progress.md"))) {
    problems.push("agent-progress.md: unresolved '- pending' placeholder remains");
  }
  if (/^- pending\s*$/m.test(readText("session-handoff.md"))) {
    problems.push("session-handoff.md: unresolved '- pending' placeholder remains");
  }
}

function checkWiring() {
  requireIncludes("AGENTS.md", "## Harness Operating Loop", "Harness Operating Loop is not wired into root instructions");
  requireIncludes("AGENTS.md", "feature_list.json", "feature_list.json is not referenced");
  requireIncludes("AGENTS.md", "clean-state-checklist.md", "clean-state checklist is not referenced");
  requireIncludes("docs/README.md", "../agent-progress.md", "agent-progress.md is not in the docs map");
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
