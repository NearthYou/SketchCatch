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
  assert.match(source, /GitHub 저장소 URL 분석/);
  assert.match(source, /https:\/\/github\.com\/owner\/repository/);
  assert.match(source, /showUrlAnalysis/);
  assert.match(source, /PublicRepositoryRecommendationStep/);
  assert.match(source, /추천 템플릿/);
  assert.match(source, /보드 생성/);
  assert.match(source, /createPublicRepositoryQuestions/);
  assert.match(source, /selectPublicRepositoryTemplateId/);
  assert.doesNotMatch(source, /evidenceFiles\.map/);
  assert.match(source, /PR 생성, CI\/CD 인계/);
  assert.match(source, /EC2\/VM 기반/);
  assert.match(source, /컨테이너 기반/);
  assert.match(source, /서버리스 기반/);
  assert.match(source, /CI\/CD 인계 사용/);
  assert.match(source, /템플릿 추천/);
  assert.match(source, /questions\?\.slice\(0, 5\)/);
  assert.match(source, /환경설정에서 권한 관리/);
  assert.match(source, /\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/settings\?tab=github/);
  assert.doesNotMatch(source, /createGitHubSourceRepositoryInstallUrl/);
});
