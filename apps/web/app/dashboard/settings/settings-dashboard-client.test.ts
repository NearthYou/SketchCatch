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
  const awsIndex = clientSource.indexOf('title="AWS 연결"');
  const codeBuildIndex = clientSource.indexOf('title="GitHub 배포 연결"');

  assert.ok(githubIndex >= 0);
  assert.ok(awsIndex > githubIndex);
  assert.ok(codeBuildIndex > awsIndex);
  assert.match(clientSource, /className=\{styles\.connectionFlow\}/);
  assert.match(clientSource, /<GitHubAccountSettings embedded \/>/);
  assert.doesNotMatch(clientSource, /title="연결 완료"/);
  assert.match(stylesSource, /\.connectionFlow\s*\{/);
  assert.match(stylesSource, /\.connectionStepBody\s*\{/);
});

test("Settings keeps raw GitHub deployment failures behind a local details disclosure", () => {
  assert.match(clientSource, /GitHub 배포 연결을 확인할 수 없습니다\./);
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

test("Settings hides AWS implementation terms and explains one connection outcome", () => {
  assert.match(
    clientSource,
    /AWS 계정을 한 번 연결하면 배포와 기존 AWS 구조 분석에 사용할 수 있습니다\./
  );
  assert.match(clientSource, /AWS에서 연결 승인/);
  assert.match(clientSource, /AWS 연결 확인/);
  assert.doesNotMatch(clientSource, /Terraform 실행을 위한 IAM Role 기반 AWS 연결을 설정합니다\./);
  assert.doesNotMatch(clientSource, /AWS Role 연결 상태/);
  assert.doesNotMatch(clientSource, /CloudFormation으로 Role 만들기/);
  assert.doesNotMatch(clientSource, />Role 연결 확인</);
  assert.doesNotMatch(clientSource, /getApiErrorMessage\(/);
  assert.doesNotMatch(clientSource, /<pre>\{cloudFormation\.templateBody\}<\/pre>/);
});

test("Settings keeps role identifiers out of the connected AWS account summary", () => {
  assert.match(clientSource, /<p>\{getAwsRegionLabel\(connection\.region\)\}<\/p>/);
  assert.doesNotMatch(clientSource, /connection\.region\} · \{connection\.roleArn/);
  assert.match(clientSource, /<Trash2 size=\{15\} \/>AWS 연결 해제/);
});

test("Settings uses a simple confirmation before disconnecting AWS", () => {
  assert.match(clientSource, /AWS 연결 해제 확인/);
  assert.match(clientSource, /배포한 인프라와 구조 분석 설정은 유지됩니다\./);
  assert.match(clientSource, /deletionPreview\.blockerMessage/);
  assert.match(clientSource, /className=\{styles\.cleanupBlocker\}/);
  assert.doesNotMatch(clientSource, /구조 분석 설정을 먼저 정리한 뒤 AWS 연결을 해제할 수 있습니다\./);
  assert.doesNotMatch(clientSource, /설정 해제 계속\s*<\/button>/);
  assert.doesNotMatch(clientSource, /continueAwsStructureAnalysisCleanup/);
  assert.doesNotMatch(clientSource, /deletionPreview\.preservedResources\.join/);
  assert.doesNotMatch(clientSource, /deletionPreview\.preservedRecords/);
});

test("Settings checks structure analysis after AWS connection confirmation", () => {
  for (const functionName of ["verifyCreatedRole", "retestConnection", "reverifyConnection"]) {
    const start = clientSource.indexOf(`async function ${functionName}`);
    const end = clientSource.indexOf("\n  }", start);
    const source = clientSource.slice(start, end);

    assert.ok(start >= 0, functionName);
    assert.match(source, /await checkAwsImportAccessReads\(/, functionName);
  }
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

test("Settings uses the cached CodeConnection query when showing deployment connection state", () => {
  assert.match(clientSource, /useAwsCodeConnectionsQueries\(displayedVerifiedConnectionIds\)/);
  assert.match(clientSource, /codeConnectionQueries\.flatMap/);
  assert.match(clientSource, /codeConnectionQueries\.map\(\(query\) => query\.refetch\(\)\)/);
  assert.doesNotMatch(clientSource, /void Promise\.all\(\s*displayedVerifiedConnections\.map/);
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
