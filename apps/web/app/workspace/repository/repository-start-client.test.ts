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
  assert.match(source, /compileArchitectureDraftProposal/);
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

test("connected Repository board generation uses the AI Architecture Draft path", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const publicBoardBody = source.slice(
    source.indexOf("async function createPublicRepositoryBoard"),
    source.indexOf("async function createConnectedRepositoryBoard")
  );
  const connectedBoardBody = source.slice(
    source.indexOf("async function createConnectedRepositoryBoard"),
    source.indexOf("async function saveTemplateBoard")
  );

  assert.match(source, /createConnectedRepositoryBoard/);
  assert.match(source, /createConnectedRepositoryArchitectureDraftRequest/);
  assert.match(source, /createAiArchitectureDraft/);
  assert.match(source, /compileArchitectureDraftProposal\(draft\)/);
  assert.match(source, /presentCompilerProposal\(proposal, "public"\)/);
  assert.match(source, /presentCompilerProposal\(proposal, "connected"\)/);
  assert.match(source, /function approvePendingCompilerProposal/);
  assert.match(source, /diagramJson:\s*pendingCompilerProposal\.proposal\.diagram/);
  assert.match(source, /RepositoryCompilerProposalReview/);
  assert.doesNotMatch(publicBoardBody, /saveProjectDraft/);
  assert.doesNotMatch(connectedBoardBody, /saveProjectDraft/);
  assert.match(source, /repositoryAnalysis:\s*{/);
  assert.match(source, /sourceRepositoryId:\s*repository\.id/);
  assert.match(source, /repositoryEvidence:\s*{/);
  assert.match(source, /onCreateBoard=\{\(templateId\) => void createConnectedRepositoryBoard\(templateId\)\}/);
  assert.doesNotMatch(source, /createRepositoryBoardHref/);
  assert.doesNotMatch(source, /href=\{createRepositoryBoardHref/);
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

test("Repository draft requires an inline CI/CD connection before continuing", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createGitHubSourceRepositoryInstallUrl/);
  assert.match(source, /getRepositoryDraftBlockingIssue/);
  assert.match(source, /\.map\(localizePublicRepositoryQuestion\)/);
  assert.match(source, /RepositoryCiCdConnection/);
  assert.match(source, /className=\{styles\.configurationWarning\}/);
  assert.match(source, /configurationWarning \? \(/);
  assert.doesNotMatch(source, /title="CI\/CD 연결이 필요합니다"/);
  assert.match(source, /onConfirmConfiguration=\{confirmPublicRecommendationConfiguration\}/);
  assert.doesNotMatch(source, /CiCdHandoffOption/);
  assert.doesNotMatch(source, /CI\/CD 인계 사용/);
  assert.doesNotMatch(source, /환경설정에서 권한 관리/);
  assert.doesNotMatch(source, /추천 결과를 아키텍처에 맞게 조정합니다\./);
});
