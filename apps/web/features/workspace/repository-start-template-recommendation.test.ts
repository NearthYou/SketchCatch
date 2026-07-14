import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Repository start screen exposes deployment, CI/CD, and template recommendation controls", async () => {
  const source = await readFile(
    new URL("../../app/workspace/repository/repository-start-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /recommendRepositoryTemplate/);
  assert.match(source, /analyzePublicSourceRepository/);
  assert.match(source, /saveProjectDraft/);
  assert.match(source, /<h1 id="repository-start-title">GitHub 저장소<\/h1>/);
  assert.doesNotMatch(source, /코드 근거로 시작하기/);
  assert.match(source, /GitHub 저장소 URL 분석/);
  assert.match(source, /https:\/\/github\.com\/owner\/repository/);
  assert.match(source, /showUrlAnalysis/);
  assert.match(source, /PublicRepositoryRecommendationStep/);
  assert.match(source, /추천 템플릿/);
  assert.match(source, /추천 템플릿 후보/);
  assert.match(source, /publicCandidateList/);
  assert.match(source, /publicCandidateDetail/);
  assert.match(source, /publicBoardAction/);
  assert.match(source, /CiCdHandoffOption/);
  assert.match(source, /CI\/CD 인계 설정/);
  assert.match(source, /questionSection/);
  assert.match(source, /추가 질문/);
  assert.match(source, /shouldAskPublicRepositoryDeploymentType/);
  assert.match(source, /getPublicRepositoryTemplateDeploymentType/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /보드 생성/);
  assert.match(source, /createPublicRepositoryRecommendation/);
  assert.match(source, /createPublicRepositoryArchitectureDraftRequest/);
  assert.doesNotMatch(source, /evidenceFiles\.map/);
  assert.match(source, /PR 생성, CI\/CD 인계/);
  assert.match(source, /EC2\/VM 기반/);
  assert.match(source, /컨테이너 기반/);
  assert.match(source, /서버리스 기반/);
  assert.match(source, /CI\/CD 인계 사용/);
  assert.match(
    source,
    /showUrlAnalysis\s*&& publicAnalysis\s*&& publicRecommendationStage === "questions"\s*&& usesCiCd\s*&& !activeRepository/
  );
  assert.match(source, /<h2>CI\/CD 연결<\/h2>/);
  assert.match(source, /setUsesCiCd\(false\)/);
  assert.match(source, /PublicRecommendationStage/);
  assert.match(source, /publicRecommendationStage === "questions"/);
  assert.match(source, /onConfirmConfiguration/);
  assert.match(source, /선택한 템플릿/);
  assert.match(source, /aria-label="템플릿 선택으로 돌아가기"/);
  assert.match(source, /확인 <ArrowRight/);
  assert.match(source, /selectedTemplateId/);
  assert.match(source, /setAnswers\(\{\}\)/);
  assert.match(source, /questionChoices/);
  assert.match(source, /questionChoiceSelected/);
  assert.doesNotMatch(source, /questionChoiceCheck/);
  assert.match(source, /aria-checked=\{selected\}/);
  assert.match(source, /hasRepositoryQuestionAnswer/);
  assert.doesNotMatch(source, /allQuestionsAnswered/);
  assert.match(source, /모든 추가 질문에 답한 뒤 보드를 생성해주세요/);
  assert.match(source, /템플릿 추천/);
  assert.match(source, /questions\?\.slice\(0, 5\)/);
  assert.match(source, /환경설정에서 권한 관리/);
  assert.match(source, /const githubSettingsHref = "\/dashboard\/settings"/);
  assert.doesNotMatch(source, /createGitHubSourceRepositoryInstallUrl/);
});
