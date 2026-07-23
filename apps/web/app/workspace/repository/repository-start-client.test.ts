import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("Repository start uses an unstyled semantic surface without legacy presentation", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /<main>/);
  assert.match(source, /<form onSubmit=\{\(event\) => void analyzeRepositoryUrl\(event\)\}>/);
  assert.match(source, /htmlFor="repository-url"/);
  assert.match(source, /id="repository-url"/);
  assert.match(source, /name="repositoryUrl"/);
  assert.match(source, /htmlFor="repository-branch"/);
  assert.match(source, /id="repository-branch"/);
  assert.match(source, /name="branch"/);
  assert.match(source, /<section aria-labelledby="repository-analysis-result-title">/);
  assert.match(source, /<p aria-live="polite" role="status">/);
  assert.doesNotMatch(source, /repository-start\.module\.css/);
  assert.doesNotMatch(source, /RepositoryArchitecturePreview/);
  assert.doesNotMatch(source, /ProductBrand/);
  assert.doesNotMatch(source, /ProductState/);
  assert.doesNotMatch(source, /SelectMenu/);
  assert.doesNotMatch(source, /styles\./);
});

test("Repository draft saves retain the server revision loaded with the screen", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /getProjectDraft\(projectId\)/);
  assert.match(
    source,
    /setProjectDraftRevision\(projectDraftResponse\.draft\?\.revision \?\? null\)/
  );
  assert.equal(source.match(/expectedRevision: requireProjectDraftRevision\(\)/g)?.length, 1);
  assert.match(source, /async function saveRepositoryBoard/);
});

test("Repository start preserves the explicit AI new-design entry", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createPublicRepositoryRecommendation/);
  assert.doesNotMatch(source, /createPublicRepositoryArchitectureDraftRequest/);
  assert.doesNotMatch(source, /createAiArchitectureDraft/);
  assert.match(source, /createWorkspaceAiStartHref/);
  assert.match(source, /<Link href=\{aiDesignHref\}>AI 새 설계<\/Link>/);
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
  assert.match(source, /setSelectedConnectedTemplateId/);
  assert.match(source, /void createConnectedRepositoryBoard\(selectedConnectedTemplate\)/);
  assert.doesNotMatch(source, /createRepositoryBoardHref/);
  assert.doesNotMatch(source, /href=\{createRepositoryBoardHref/);
});

test("Repository Fixed Template receives runtime Secret requirements from the analyzed revision", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const saveTemplateBody = source.slice(
    source.indexOf("async function saveTemplateBoard"),
    source.indexOf("async function saveRepositoryBoard")
  );

  assert.match(saveTemplateBody, /requiredRuntimeSecrets/);
  assert.match(
    saveTemplateBody,
    /getRepositoryRequiredRuntimeSecrets\(publicRepositoryAnalysis\.aiHandoff\)/
  );
  assert.match(saveTemplateBody, /publicRepositoryAnalysis\.aiHandoff/);
});

test("Repository board generation does not special-case repository identities", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const saveTemplateBody = source.slice(
    source.indexOf("async function saveTemplateBoard"),
    source.indexOf("async function saveRepositoryBoard")
  );

  assert.doesNotMatch(saveTemplateBody, /createGitHubArchitectureDraft/);
  assert.doesNotMatch(saveTemplateBody, /chaekang\/audience-live-check/);
});

test("public Repository Template failures do not masquerade as Repository access failures", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const publicErrorBody = source.slice(
    source.indexOf('{publicAnalysisState === "architecture_error" && !pendingAnalysisRecord ? ('),
    source.indexOf('{publicAnalysisState === "repository_error" && !pendingAnalysisRecord ? (')
  );

  assert.ok(publicErrorBody.length > 0);
  assert.match(publicErrorBody, /<h2 id="repository-board-error-title">보드를 생성할 수 없습니다<\/h2>/);
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

test("Repository start keeps the analyzed branch for a later URL analysis request", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /setDefaultBranch\(result\.defaultBranch\)/);
  assert.match(source, /publicAnalysis\.availableBranches\.map/);
  assert.match(source, /id="repository-branch"/);
  assert.match(source, /name="branch"/);
  assert.match(source, /<select/);
  assert.match(source, /onChange=\{\(event\) => setDefaultBranch\(event\.target\.value\)\}/);
  assert.match(source, /setDefaultBranch\(""\)/);
  assert.match(source, /analyzePublicRepositoryUrl\(repositoryUrl, defaultBranch\)/);
  assert.doesNotMatch(source, /placeholder="main"/);
});

test("Repository draft defers CI/CD connection until Delivery", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createGitHubSourceRepositoryInstallUrl/);
  assert.match(source, /getRepositoryDraftBlockingIssue/);
  assert.match(source, /\.map\(localizePublicRepositoryQuestion\)/);
  assert.match(source, /onConfirmConfiguration=\{confirmPublicRecommendationConfiguration\}/);
  assert.doesNotMatch(source, /function RepositoryCiCdConnection/);
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
  assert.match(
    source,
    /const targetRepositoryUrl = publicAnalysis\?\.repositoryUrl \?\? repositoryUrl\.trim\(\)/
  );
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
