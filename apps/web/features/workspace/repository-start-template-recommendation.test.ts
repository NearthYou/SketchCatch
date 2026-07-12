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
  assert.match(source, /Analyze a GitHub repository URL/);
  assert.match(source, /https:\/\/github\.com\/owner\/repository/);
  assert.match(source, /showUrlAnalysis/);
  assert.match(source, /PublicRepositoryRecommendationStep/);
  assert.match(source, /Recommended template/);
  assert.match(source, /Create board/);
  assert.match(source, /createPublicRepositoryQuestions/);
  assert.match(source, /selectPublicRepositoryTemplateId/);
  assert.doesNotMatch(source, /evidenceFiles\.map/);
  assert.match(source, /PR creation, CI\/CD handoff/);
  assert.match(source, /EC2\/VM based/);
  assert.match(source, /Container based/);
  assert.match(source, /Serverless based/);
  assert.match(source, /Use CI\/CD handoff/);
  assert.match(source, /Recommend templates/);
  assert.match(source, /questions\?\.slice\(0, 5\)/);
  assert.match(source, /Manage permissions in settings/);
  assert.match(source, /\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/settings\?tab=github/);
  assert.doesNotMatch(source, /createGitHubSourceRepositoryInstallUrl/);
});
