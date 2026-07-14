import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("Repository start screen exposes an explicit AI chat fallback", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createPublicRepositoryRecommendation/);
  assert.match(source, /createPublicRepositoryArchitectureDraftRequest/);
  assert.match(source, /createAiArchitectureDraft/);
  assert.match(source, /getDiagramJsonForArchitectureDraft/);
  assert.match(source, /createWorkspaceAiStartHref/);
  assert.match(source, /원하는 구성이 없나요\? AI로 새 설계 만들기/);
  assert.match(source, /className=\{styles\.publicAiFallbackAction\}/);
  assert.doesNotMatch(source, /createPublicRepositoryDiagram/);
  assert.doesNotMatch(source, /AI FALLBACK/);
  assert.doesNotMatch(source, /fallbackAdditionalRequirements/);
  assert.doesNotMatch(source, /generatePublicFallbackArchitectureDraft/);
  assert.doesNotMatch(source, /buildPublicRepositoryTemplateFallbackDraftRequest/);
  assert.doesNotMatch(source, /Template 없이 AI로 생성/);
});

test("Repository start screen selects a fetched branch before reanalysis", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /setDefaultBranch\(result\.defaultBranch\)/);
  assert.match(source, /publicAnalysis\.availableBranches\.map/);
  assert.match(source, /<SelectMenu/);
  assert.match(source, /tone="workspace"/);
  assert.match(source, /setDefaultBranch\(""\)/);
  assert.match(source, /analyzePublicRepositoryUrl\(repositoryUrl, defaultBranch\)/);
  assert.doesNotMatch(source, /placeholder="main"/);
});

test("Repository start sends GitHub permission management to global settings", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /const githubSettingsHref = "\/dashboard\/settings"/);
  assert.match(source, /전역 설정에서 GitHub 권한 연결이 필요합니다/);
  assert.doesNotMatch(source, /프로젝트 환경설정에서 GitHub 권한 연결이 필요합니다/);
});
