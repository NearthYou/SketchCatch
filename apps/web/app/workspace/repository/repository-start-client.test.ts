import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repositoryScreenPath = join(currentDir, "repository-analysis-screen.tsx");
const repositoryStylesPath = join(currentDir, "repository-analysis-screen.module.css");
const repositoryScreenSource = existsSync(repositoryScreenPath)
  ? readFileSync(repositoryScreenPath, "utf8")
  : "";
const repositoryStylesSource = existsSync(repositoryStylesPath)
  ? readFileSync(repositoryStylesPath, "utf8")
  : "";

test("Repository start separates the pre-analysis form from the completed result", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.equal(source.match(/<h1/g)?.length, 1);
  assert.match(source, /showUrlAnalysis && !publicAnalysis/);
  assert.match(source, /<RepositoryAnalysisForm/);
  assert.match(source, /<RepositoryAnalysisResult/);
  assert.match(repositoryScreenSource, /export function RepositoryAnalysisForm/);
  assert.match(repositoryScreenSource, /<form onSubmit=\{onSubmit\}>/);
  assert.match(repositoryScreenSource, /name="repositoryUrl"/);
  assert.match(repositoryScreenSource, /name="branch"/);
  assert.match(repositoryScreenSource, /공개 저장소는 GitHub 연결 없이 분석할 수 있습니다/);
  assert.doesNotMatch(repositoryScreenSource, /Template Preview[\s\S]*RepositoryAnalysisForm/);
});

test("Repository start keeps global navigation and uses a presentation-scale canvas", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /import \{ ProductBrand \} from "\.\.\/\.\.\/\.\.\/components\/ui\/ProductBrand"/);
  assert.match(
    source,
    /<header className=\{styles\.topbar\}>[\s\S]*<ProductBrand \/>[\s\S]*href="\/workspace\/new"[\s\S]*시작 방식 다시 선택[\s\S]*<\/header>/
  );
  assert.match(repositoryStylesSource, /\.topbar \{[\s\S]*min-height:\s*64px/);
  assert.match(repositoryStylesSource, /\.shell \{[\s\S]*width:\s*min\(1440px,\s*100%\)/);
  assert.match(repositoryStylesSource, /\.pageHeading h1 \{[\s\S]*44px/);
});

test("Repository result keeps metadata compact and uses the real Template thumbnail", () => {
  assert.match(repositoryScreenSource, /owner/);
  assert.match(repositoryScreenSource, /branch/);
  assert.match(repositoryScreenSource, /분석 완료/);
  assert.match(repositoryScreenSource, /다른 저장소 분석/);
  assert.match(repositoryScreenSource, /<dl/);
  assert.match(repositoryScreenSource, /createRepositoryEvidenceSummary/);
  assert.match(repositoryScreenSource, /listBoardTemplates/);
  assert.match(repositoryScreenSource, /thumbnailSrc/);
  assert.match(repositoryScreenSource, /<BoardThumbnailImage/);
  assert.match(repositoryScreenSource, /currentCandidate\.reasons\[0\]/);
  assert.match(repositoryScreenSource, /Math\.round\(currentCandidate\.confidence \* 100\)/);
});

test("Repository Template exploration changes only the preview index until explicit use", () => {
  assert.match(repositoryScreenSource, /useState\(0\)/);
  assert.match(repositoryScreenSource, /setPreviewIndex\(0\)/);
  assert.match(repositoryScreenSource, /aria-label="이전 Template"/);
  assert.match(repositoryScreenSource, /aria-label="다음 Template"/);
  assert.match(repositoryScreenSource, /aria-live="polite"/);
  assert.match(repositoryScreenSource, /candidates\.length > 1/);
  assert.match(repositoryScreenSource, /resolvedPreviewIndex/);
  assert.match(repositoryScreenSource, /onUseTemplate\(currentCandidate\.templateId\)/);
  assert.doesNotMatch(repositoryScreenSource, /saveProjectDraft|router\.push|buildBoardTemplateDiagram/);
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  assert.match(source, /activeRepository\.analysis\?\.analyzedAt/);
});

test("public Repository accepts a Template only from the explicit use action", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const analysisBody = source.slice(
    source.indexOf("async function analyzePublicRepositoryUrl"),
    source.indexOf("async function createPublicRepositoryBoard")
  );
  const confirmationBody = source.slice(
    source.indexOf("function confirmPublicRecommendationConfiguration"),
    source.indexOf("return (", source.indexOf("function confirmPublicRecommendationConfiguration"))
  );

  assert.match(analysisBody, /setSelectedPublicTemplateId\(null\)/);
  assert.doesNotMatch(analysisBody, /candidates\[0\]\?\.templateId/);
  assert.match(confirmationBody, /setSelectedPublicTemplateId\(templateId\)/);
  assert.match(confirmationBody, /setPublicRecommendationStage\("questions"\)/);
  assert.match(confirmationBody, /nextRecommendation\.questions\.length === 0/);
  assert.match(confirmationBody, /createPublicRepositoryBoard\(templateId\)/);
});

test("Repository result gives most space to Preview and collapses without overflow", () => {
  assert.match(
    repositoryStylesSource,
    /grid-template-columns:\s*minmax\(200px,\s*0\.24fr\)\s+minmax\(0,\s*1fr\)/
  );
  assert.match(repositoryStylesSource, /\.previewColumn[\s\S]*min-width:\s*0/);
  assert.match(repositoryStylesSource, /@media\s*\(max-width:\s*[^)]+\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(repositoryStylesSource, /overflow-wrap:\s*anywhere/);
});

test("Repository preview navigation stays anchored when the recommendation reason grows", () => {
  assert.match(repositoryStylesSource, /\.previewFooter\s*\{[\s\S]*align-items:\s*start/);
});

test("Repository follow-up questions expose clear hierarchy and selectable choices", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /className=\{styles\.selectedTemplateName\}/);
  assert.doesNotMatch(source, /선택한 Template/);
  assert.match(source, /className=\{styles\.questionOptions\}/);
  assert.match(
    repositoryStylesSource,
    /\.questionStepBody\s*\{[^}]*padding:\s*16px 32px 28px/
  );
  assert.match(
    repositoryStylesSource,
    /\.questionList h3\s*\{[\s\S]*font-size:\s*calc\(24px/
  );
  assert.match(
    repositoryStylesSource,
    /\.questionList\s*\{[\s\S]*gap:\s*28px/
  );
  assert.match(
    repositoryStylesSource,
    /\.questionList\s*\{[^}]*gap:\s*28px;[^}]*margin-top:\s*8px/
  );
  assert.doesNotMatch(
    repositoryStylesSource,
    /\.selectedTemplateSummary\s*\{|\.questionField\s*\{[\s\S]*border-top/
  );
  assert.match(
    repositoryStylesSource,
    /\.questionField legend\s*\{[\s\S]*margin:\s*0 0 10px/
  );
  assert.match(
    repositoryStylesSource,
    /\.questionField \+ \.questionField\s*\{[\s\S]*margin-top:\s*8px/
  );
  assert.match(
    repositoryStylesSource,
    /\.questionOption:has\(input:checked\)\s*\{[\s\S]*background:\s*var\(--color-primary\)/
  );
});

test("Repository draft saves retain the server revision loaded with the screen", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /getProjectDraft\(projectId\)/);
  assert.match(
    source,
    /setProjectDraftRevision\(projectDraftResponse\.draft\?\.revision \?\? null\)/
  );
  assert.equal(
    source.match(/expectedRevision: createdProject \? null : requireProjectDraftRevision\(\)/g)
      ?.length,
    1
  );
  assert.match(source, /async function saveRepositoryBoard/);
});

test("Repository start preserves the explicit AI new-design entry", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createPublicRepositoryRecommendation/);
  assert.doesNotMatch(source, /createPublicRepositoryArchitectureDraftRequest/);
  assert.doesNotMatch(source, /createAiArchitectureDraft/);
  assert.match(source, /createWorkspaceAiStartHref/);
  assert.match(repositoryScreenSource, /<Link[\s\S]*href=\{aiDesignHref\}[\s\S]*AI로 직접 설계/);
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
  assert.doesNotMatch(source, /setSelectedConnectedTemplateId/);
  assert.match(source, /void createConnectedRepositoryBoard\(templateId\)/);
  assert.doesNotMatch(publicBoardBody, /recommendation\.candidates\[0\]/);
  assert.match(publicBoardBody, /templateId: PublicRepositoryTemplateId/);
  assert.doesNotMatch(publicBoardBody, /PublicRepositoryTemplateId \| null/);
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
  assert.match(publicErrorBody, /createPublicRepositoryBoard\(selectedPublicTemplateId\)/);
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
  assert.match(repositoryScreenSource, /id="repository-branch"/);
  assert.match(repositoryScreenSource, /name="branch"/);
  assert.match(repositoryScreenSource, /onBranchChange/);
  assert.match(source, /setDefaultBranch\(""\)/);
  assert.match(source, /analyzePublicRepositoryUrl\(repositoryUrl, defaultBranch\)/);
});

test("changing the Repository URL clears a stale branch from the previous Repository", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const urlChangeBody = source.slice(
    source.indexOf("onRepositoryUrlChange={(nextRepositoryUrl) => {"),
    source.indexOf("onSubmit=", source.indexOf("onRepositoryUrlChange={(nextRepositoryUrl) => {"))
  );

  assert.ok(urlChangeBody.length > 0);
  assert.match(urlChangeBody, /setDefaultBranch\(""\)/);
});

test("public Repository generation locks configuration and keeps the result mounted", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");
  const publicResultBody = source.slice(
    source.indexOf("{publicAnalysis &&"),
    source.indexOf("{publicAnalysis &&", source.indexOf("{publicAnalysis &&") + 1)
  );
  const questionBody = source.slice(
    source.indexOf('publicRecommendationStage === "questions"'),
    source.indexOf('{publicAnalysisState === "architecture_error"')
  );

  assert.match(
    publicResultBody,
    /id="public-repository-deployment-type"[\s\S]*disabled=\{isPublicAnalysisBusy\}/
  );
  assert.doesNotMatch(publicResultBody, /\skey=\{/);
  assert.match(
    questionBody,
    /className=\{styles\.secondaryButton\}[\s\S]*disabled=\{isPublicAnalysisBusy\}[\s\S]*Template 다시 선택/
  );
});

test("the default Web test command runs Repository TSX tests with the CSS loader", () => {
  const webPackage = JSON.parse(
    readFileSync(join(currentDir, "../../..", "package.json"), "utf8")
  ) as { scripts?: { test?: string } };
  const testCommand = webPackage.scripts?.test ?? "";
  const repositoryTestSegment = testCommand
    .split("&&")
    .find((segment) => segment.includes("app/workspace/repository"));

  assert.ok(repositoryTestSegment);
  assert.match(
    repositoryTestSegment,
    /node --import \.\/test-css-register\.mjs --import tsx --test/
  );
  assert.match(repositoryTestSegment, /app\/workspace\/repository\/\*\.test\.tsx/);
});

test("Repository draft defers CI/CD connection until Delivery", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /createGitHubSourceRepositoryInstallUrl/);
  assert.match(source, /getRepositoryDraftBlockingIssue/);
  assert.match(source, /\.map\(localizePublicRepositoryQuestion\)/);
  assert.match(source, /onUseTemplate=\{confirmPublicRecommendationConfiguration\}/);
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
