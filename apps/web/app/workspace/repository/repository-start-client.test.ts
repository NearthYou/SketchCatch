import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("Repository draft saves retain the server revision loaded with the screen", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /getProjectDraft\(projectId\)/);
  assert.match(source, /setProjectDraftRevision\(projectDraftResponse\.draft\?\.revision \?\? null\)/);
  assert.equal(source.match(/expectedRevision: requireProjectDraftRevision\(\)/g)?.length, 1);
  assert.match(source, /async function saveRepositoryBoard/);
});

test("Repository start screen exposes an explicit AI chat fallback", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createPublicRepositoryRecommendation/);
  assert.doesNotMatch(source, /createPublicRepositoryArchitectureDraftRequest/);
  assert.doesNotMatch(source, /createAiArchitectureDraft/);
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

test("Repository board generation saves the selected Fixed Template directly", () => {
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
  assert.doesNotMatch(source, /createConnectedRepositoryArchitectureDraftRequest/);
  assert.doesNotMatch(source, /createAiArchitectureDraft/);
  assert.match(publicBoardBody, /saveTemplateBoard\(templateId, publicAnalysis\)/);
  assert.match(connectedBoardBody, /await saveTemplateBoard\(/);
  assert.doesNotMatch(publicBoardBody, /saveProjectDraft/);
  assert.doesNotMatch(connectedBoardBody, /saveProjectDraft/);
  assert.match(source, /await saveRepositoryBoard\(/);
  assert.match(source, /createRepositoryAnalysisRecordPayload/);
  assert.match(source, /onCreateBoard=\{\(templateId\) => void createConnectedRepositoryBoard\(templateId\)\}/);
  assert.doesNotMatch(source, /createRepositoryBoardHref/);
  assert.doesNotMatch(source, /href=\{createRepositoryBoardHref/);
});

test("public Repository Template failures do not masquerade as Repository access failures", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const publicErrorBody = source.slice(
    source.indexOf('{publicAnalysisState === "architecture_error" && !pendingAnalysisRecord ? ('),
    source.indexOf('{publicAnalysisState === "repository_error" && !pendingAnalysisRecord ? (')
  );

  assert.ok(publicErrorBody.length > 0);
  assert.match(publicErrorBody, /title="Fixed Template 보드를 생성할 수 없습니다"/);
  assert.match(publicErrorBody, /onClick=\{\(\) => void createPublicRepositoryBoard\(\)\}/);
  assert.match(publicErrorBody, />\s*다시 생성\s*</);
  assert.doesNotMatch(publicErrorBody, /<RepositoryAnalysisRecovery/);
});

test("public Repository errors keep analysis and architecture failures distinct", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /publicAnalysisState === "repository_error"/);
  assert.match(source, /publicAnalysisState === "architecture_error"/);
  assert.doesNotMatch(source, /draft\.question/);
  const repositoryErrorBody = source.slice(
    source.indexOf('{publicAnalysisState === "repository_error" && !pendingAnalysisRecord ? ('),
    source.indexOf("{activeRepository && !publicAnalysis ? (")
  );

  assert.match(repositoryErrorBody, /<RepositoryAnalysisRecovery/);
  assert.doesNotMatch(repositoryErrorBody, /createPublicRepositoryBoard/);
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

test("Repository draft defers CI/CD connection until Delivery", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createGitHubSourceRepositoryInstallUrl/);
  assert.match(source, /getRepositoryDraftBlockingIssue/);
  assert.match(source, /\.map\(localizePublicRepositoryQuestion\)/);
  assert.match(source, /공개 저장소는 GitHub 연결 없이 분석하고 보드를 만들 수 있습니다/);
  assert.match(source, /CI\/CD는 보드 생성 후 Delivery에서 연결합니다/);
  assert.doesNotMatch(source, /function RepositoryCiCdConnection/);
  assert.match(source, /onConfirmConfiguration=\{confirmPublicRecommendationConfiguration\}/);
  assert.doesNotMatch(source, /CiCdHandoffOption/);
  assert.doesNotMatch(source, /CI\/CD 인계 사용/);
  assert.doesNotMatch(source, /환경설정에서 권한 관리/);
  assert.doesNotMatch(source, /추천 결과를 아키텍처에 맞게 조정합니다\./);
  assert.doesNotMatch(source, /title="Delivery용 Repository 연결"/);
  assert.doesNotMatch(source, /Delivery용 Repository 연결 확인/);
});

test("GitHub connection preserves and restores public analysis without reanalysis", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createRepositoryAnalysisResumeKey/);
  assert.match(source, /writeRepositoryAnalysisResume/);
  assert.match(source, /consumeRepositoryAnalysisResume/);
  assert.match(source, /const targetRepositoryUrl = publicAnalysis\?\.repositoryUrl \?\? repositoryUrl\.trim\(\)/);
  assert.match(source, /repositoryUrl:\s*targetRepositoryUrl/);
  assert.match(source, /resumeKey/);
  assert.match(source, /if \(initialResumeKey\) return/);
  assert.match(source, /setPublicAnalysis\(resume\.publicAnalysis\)/);
});

test("GitHub connection checks server availability before configured-only repository calls", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const loadCandidatesBody = source.slice(
    source.indexOf("async function loadCandidates"),
    source.indexOf("async function openGitHubConnection")
  );
  const openConnectionBody = source.slice(
    source.indexOf("async function openGitHubConnection"),
    source.indexOf("async function analyzeRepositoryUrl")
  );

  assert.match(source, /GitHub App 서버 설정이 필요합니다/);
  const listAccountInstallationsIndex = loadCandidatesBody.indexOf(
    "listGitHubAccountInstallations"
  );
  const listInstalledRepositoriesIndex = loadCandidatesBody.indexOf(
    "listGitHubInstalledRepositories"
  );
  assert.ok(listAccountInstallationsIndex >= 0);
  assert.ok(
    listInstalledRepositoriesIndex >= 0 &&
      listAccountInstallationsIndex < listInstalledRepositoriesIndex
  );
  const createInstallUrlIndex = openConnectionBody.indexOf(
    "createGitHubSourceRepositoryInstallUrl"
  );
  const connectionSetupIndex = openConnectionBody.indexOf("connectionSetup");
  const installationReadIndex = openConnectionBody.indexOf("installationRead");
  assert.ok(createInstallUrlIndex >= 0);
  assert.ok(connectionSetupIndex >= 0 && connectionSetupIndex < createInstallUrlIndex);
  assert.ok(installationReadIndex >= 0 && installationReadIndex < createInstallUrlIndex);
});
