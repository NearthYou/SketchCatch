import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse,
  AwsConnectionListResponse
} from "@sketchcatch/types";
import { restoreAwsConnectionSetup } from "./aws-connection-setup";

const pendingConnection: AwsConnection = {
  id: "connection-1",
  userId: "user-1",
  accountId: null,
  roleArn: null,
  externalId: "external-1",
  region: "ap-northeast-2",
  status: "pending",
  lastVerifiedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
};

const cloudFormation: AwsConnectionCloudFormationTemplateResponse = {
  roleName: "SketchCatchConnectionRole",
  stackName: "sketchcatch-connection-1",
  region: "ap-northeast-2",
  capabilities: ["CAPABILITY_NAMED_IAM"],
  templateBody: "{}",
  templateUrl: null,
  templateUrlExpiresAt: null,
  launchStackUrl: "https://console.aws.amazon.com/cloudformation",
  manualTemplateFallbackAvailable: true
};

test("pending AWS connections restore the saved verification setup", async () => {
  let requestedConnectionId = "";

  const restored = await restoreAwsConnectionSetup(pendingConnection, async (input) => {
    requestedConnectionId = input.connectionId;
    return cloudFormation;
  });

  assert.equal(requestedConnectionId, pendingConnection.id);
  assert.deepEqual(restored, {
    connection: pendingConnection,
    cloudFormation,
    accountId: "",
    region: pendingConnection.region
  });
});

test("settings gates GitHub deployment connection behind one GitHub App and a verified AWS connection", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../../app/dashboard/settings/settings-dashboard-client.tsx", import.meta.url)
    ),
    "utf8"
  );

  assert.match(source, /GitHub 배포 연결/);
  assert.match(source, /GitHub 배포 연결을 위해 GitHub App을 먼저 연결해 주세요/);
  assert.match(source, /GitHub App 연결하기/);
  assert.match(source, /GitHub 배포에 사용할 GitHub App 연결을 하나만 유지해 주세요/);
  assert.match(source, /useGitHubInstallationsQuery/);
  assert.match(source, /deriveGitHubCodeBuildAuthorizationTarget/);
  assert.match(source, /AWS 연결이 먼저 필요합니다/);
  assert.match(source, /AWS 연결하러 가기/);
  assert.match(source, /AWS에서 GitHub 권한 승인하기/);
  assert.doesNotMatch(source, /승인 세션이 남아 있으면 로그인 화면이 생략될 수 있습니다/);
  assert.match(source, /deriveAwsCodeConnectionConnectedState/);
  assert.match(source, /connectedState\.actionHref/);
  assert.match(source, /connectedState\.actionLabel/);
  assert.match(source, /buildConnectionReady/);
  assert.doesNotMatch(source, /buildConnectionUnverified/);
  assert.doesNotMatch(source, /AWS GitHub 승인 완료/);
  assert.doesNotMatch(source, /승인한 GitHub 계정 이름을 반환하지 않으므로/);
  assert.doesNotMatch(source, /GitHub 빌드 연결 완료/);
  assert.match(source, /createAwsCodeConnection/);
  assert.match(source, /refreshAwsCodeConnection/);
  assert.match(source, /disconnectAwsCodeConnection/);
  assert.match(source, /GitHub 빌드 연결 해제/);
  assert.match(source, /연결 해제 재시도/);
  assert.match(source, /cleanupRetryRequired/);
  assert.match(source, /AWS 연결과 배포한 애플리케이션 및 인프라는 유지됩니다\./);
  assert.match(source, /confirmedManagedCleanup: true/);
  assert.match(source, /onDisconnect/);
  assert.match(source, /connection\.status === "verified"/);
  assert.match(source, /setupModalAccessibility/);
  assert.match(source, /ref=\{modalOverlayRef\}/);
  assert.match(source, /ref=\{modalDialogRef\}/);
  assert.match(source, /ref=\{modalCloseButtonRef\}/);
  assert.doesNotMatch(source, /CodeConnection ARN.*input|connectionArn.*onChange/is);
});

test("settings previews exact SketchCatch managed cleanup before AWS connection removal", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../../app/dashboard/settings/settings-dashboard-client.tsx", import.meta.url)
    ),
    "utf8"
  );

  assert.match(source, /getAwsConnectionDeletionPreview/);
  assert.match(source, /AWS 연결 해제 확인/);
  assert.match(source, /정리되는 연결 항목/);
  assert.match(source, /유지되는 항목/);
  assert.match(source, /confirmedManagedCleanup: true/);
  assert.match(source, /confirmationToken: deletionPreview\.confirmationToken/);
  assert.match(source, /AWS 연결 해제/);
  assert.match(source, /구조 분석 설정이 남아 있으면 먼저 정리해야 합니다/);
  assert.doesNotMatch(source, /구조 분석 설정은 유지됩니다/);
  assert.doesNotMatch(source, /GitHub CodeConnection \{deletionPreview/);
  assert.match(source, /연결 해제가 완료되지 않았습니다\. AWS 연결은 유지되었습니다\./);
  assert.match(source, /연결 해제 중…/);
  assert.match(source, /deletionErrorMessage/);
  assert.doesNotMatch(source, /한 번 더 눌러 삭제/);
});

test("settings separates failed cleanup retries from connections that can run GitHub builds", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../../app/dashboard/settings/settings-dashboard-client.tsx", import.meta.url)
    ),
    "utf8"
  );
  const querySource = readFileSync(
    fileURLToPath(new URL("./connection-queries.ts", import.meta.url)),
    "utf8"
  );

  assert.match(source, /useAwsConnectionSettingsQuery/);
  assert.match(source, /deriveAwsConnectionSettingsState/);
  assert.match(source, /const connections = connectionSettings\.activeConnections/);
  assert.match(source, /const cleanupRetries = connectionSettings\.cleanupRetries/);
  assert.match(querySource, /listAwsConnectionSettings/);
  assert.match(querySource, /queryKeys\.awsConnectionSettings/);
  assert.match(source, /정리 재시도 필요/);
  assert.match(source, /이전 AWS 연결 정리를 완료해야 같은 계정을 다시 연결할 수 있습니다\./);
  assert.match(source, /onClick=\{\(\) => void removeConnection\(retry\.id\)\}/);
  assert.match(source, /AWS 연결 정리 재시도/);
  assert.match(source, /AWS 연결 정리 재시도/);
  assert.match(source, /connectionsQuery\.isError && connections\.length === 0 && cleanupRetries\.length === 0/);
  assert.match(source, /AWS 연결 정리 재시도 닫기/);
});

test("settings state keeps cleanup retries out of verified build candidates", async () => {
  const helperModulePath = "./aws-connection-settings-state.ts";
  const helperModule = await import(helperModulePath).catch(() => null);
  assert.ok(helperModule, "AWS connection settings state helper should exist");

  const verifiedConnection: AwsConnection = {
    ...pendingConnection,
    id: "active-verified",
    accountId: "111122223333",
    roleArn: "arn:aws:iam::111122223333:role/SketchCatchRole",
    status: "verified"
  };
  const cleanupRetryConnection: AwsConnection = {
    ...verifiedConnection,
    id: "cleanup-retry",
    accountId: "444455556666",
    region: "us-east-1"
  };
  const settings: AwsConnectionListResponse = {
    awsConnections: [verifiedConnection, pendingConnection],
    cleanupRetries: [
      {
        awsConnection: cleanupRetryConnection
      }
    ]
  };

  const result = helperModule.deriveAwsConnectionSettingsState(settings);

  assert.deepEqual(
    result.activeConnections.map((connection: AwsConnection) => connection.id),
    [verifiedConnection.id, pendingConnection.id]
  );
  assert.deepEqual(
    result.verifiedConnections.map((connection: AwsConnection) => connection.id),
    [verifiedConnection.id]
  );
  assert.deepEqual(result.cleanupRetries, [
    {
      id: cleanupRetryConnection.id,
      accountId: cleanupRetryConnection.accountId,
      region: cleanupRetryConnection.region
    }
  ]);
  assert.deepEqual(Object.keys(result.cleanupRetries[0] ?? {}).sort(), [
    "accountId",
    "id",
    "region"
  ]);
});
