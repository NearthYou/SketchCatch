import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./CicdConsoleScreen.tsx", import.meta.url)),
  "utf8"
);

test("CI/CD sends users without a GitHub account installation to global settings", () => {
  assert.match(source, /listGitHubAccountInstallations/);
  assert.match(source, /hasGitHubAccountConnection/);
  assert.match(source, /isGitHubIdentityRequiredError/);
  assert.match(source, /\/dashboard\/settings#github-account-settings-title/);
  assert.match(source, /GitHub 계정 연결이 필요합니다\./);
  assert.match(source, /GitHub 계정 설정 열기/);
});

test("CI/CD sends connected GitHub accounts without a repository to source repository", () => {
  assert.match(source, /GitHub 저장소 연결이 필요합니다\./);
  assert.match(source, /프로젝트 소스 저장소 열기/);
  assert.match(
    source,
    /\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/repository/
  );
  assert.doesNotMatch(source, /settings\?tab=github/);
});
