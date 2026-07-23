import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const clientSource = readFileSync(join(currentDir, "settings-dashboard-client.tsx"), "utf8");
const stylesSource = readFileSync(
  join(currentDir, "..", "dashboard-tools.module.css"),
  "utf8"
);

test("Settings keeps the existing connection order inside one progressive flow", () => {
  const githubIndex = clientSource.indexOf('title="GitHub App 연결"');
  const awsIndex = clientSource.indexOf('title="AWS 계정 연결"');
  const codeBuildIndex = clientSource.indexOf('title="AWS CodeBuild용 GitHub 권한"');

  assert.ok(githubIndex >= 0);
  assert.ok(awsIndex > githubIndex);
  assert.ok(codeBuildIndex > awsIndex);
  assert.match(clientSource, /className=\{styles\.connectionFlow\}/);
  assert.match(clientSource, /<GitHubAccountSettings embedded \/>/);
  assert.doesNotMatch(clientSource, /title="연결 완료"/);
  assert.match(stylesSource, /\.connectionFlow\s*\{/);
  assert.match(stylesSource, /\.connectionStepBody\s*\{/);
});

test("Settings keeps raw CodeBuild failures behind a local details disclosure", () => {
  assert.match(clientSource, /AWS GitHub 권한 연결을 확인할 수 없습니다\./);
  assert.match(clientSource, /<summary>오류 상세<\/summary>/);
  assert.match(clientSource, /connection\.codeConnection\.statusReason/);
  assert.match(clientSource, />다시 생성<\/button>/);
  assert.match(clientSource, /"연결 정보 지우기"/);
});

test("Settings collapses every step after CodeBuild authorization is complete", () => {
  assert.match(clientSource, /deriveSettingsConnectionFlowState/);
  assert.match(clientSource, /recommendedConnectionStep = connectionFlow\.recommendedConnectionStep/);
  assert.match(clientSource, /useState<SettingsConnectionFlowStepId \| null>/);
});

test("Settings does not lock the AWS step when GitHub App setup is incomplete", () => {
  const awsStepStart = clientSource.indexOf('expanded={expandedConnectionStep === "aws"}');
  const codeBuildStepStart = clientSource.indexOf('expanded={expandedConnectionStep === "codebuild"}');
  const awsStepSource = clientSource.slice(awsStepStart, codeBuildStepStart);

  assert.ok(awsStepStart >= 0);
  assert.ok(codeBuildStepStart > awsStepStart);
  assert.doesNotMatch(awsStepSource, /locked=/);
  assert.match(clientSource, /locked=\{codeBuildStepState === "locked"\}/);
});

test("Settings shows the operational AWS Role description only inside the expanded step body", () => {
  const roleDescriptions = clientSource.match(/Terraform 실행을 위한 IAM Role 기반 AWS 연결을 설정합니다\./g);

  assert.equal(roleDescriptions?.length, 1);
  assert.match(clientSource, /summary \? <span className=\{styles\.connectionStepSummary\}>/);
});

test("Settings client passes one AWS connection ID into recovery navigation", () => {
  assert.match(
    clientSource,
    /const recoveryAwsConnectionId = getSingleSearchParam\([\s\S]*?searchParams\.getAll\("awsConnectionId"\)[\s\S]*?\);/
  );
  assert.match(clientSource, /awsConnectionId:\s*recoveryAwsConnectionId/);
});

test("Pending GitHub authorization identifies the exact AWS connection to update", () => {
  assert.match(
    clientSource,
    /getAwsCodeConnectionDisplayName\(connection\.codeConnection\.awsConnectionId\)/
  );
  assert.match(clientSource, /Pending 연결을 선택한 뒤/);
  assert.match(clientSource, /Update pending connection/);
});

test("Settings refreshes an existing CodeConnection from AWS before presenting its status", () => {
  const loadStart = clientSource.indexOf("void Promise.all(");
  const loadEnd = clientSource.indexOf("return () =>", loadStart);
  const loadSource = clientSource.slice(loadStart, loadEnd);

  assert.ok(loadStart > -1);
  assert.ok(loadEnd > loadStart);
  assert.match(loadSource, /await getAwsCodeConnection\(connection\.id\)/);
  assert.match(loadSource, /await refreshAwsCodeConnection\(connection\.id\)/);
  assert.match(loadSource, /catch \(error\) \{/);
  assert.match(loadSource, /return \[connection\.id, savedConnection\] as const/);
  assert.match(loadSource, /AWS 상태를 다시 확인하지 못해 저장된 연결 상태를 표시합니다/);
});

test("Settings keeps Reverse return behind the selected connection import-access wizard", () => {
  assert.match(clientSource, /<AwsImportAccessWizard/);
  assert.match(clientSource, /connectionId=\{connection\.id\}/);
  assert.match(clientSource, /connectionStatus=\{connection\.status\}/);
  assert.match(clientSource, /recoveryAwsConnectionId === connection\.id/);
  assert.match(clientSource, /onContinue:\s*returnToReverseEngineeringAfterRecovery/);
  assert.doesNotMatch(
    clientSource,
    /connection\.status === "verified"\s*\?\s*\([\s\S]{0,200}<AwsImportAccessWizard/
  );

  for (const functionName of ["verifyCreatedRole", "retestConnection", "reverifyConnection"]) {
    const start = clientSource.indexOf(`async function ${functionName}`);
    const end = clientSource.indexOf("\n  }", start);
    const source = clientSource.slice(start, end);
    assert.ok(start > -1, functionName);
    assert.doesNotMatch(source, /returnToReverseEngineeringAfterRecovery/u, functionName);
  }
});
