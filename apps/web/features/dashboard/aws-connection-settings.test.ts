import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse
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

test("settings gates GitHub build connection behind a verified AWS connection", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../../app/dashboard/settings/settings-dashboard-client.tsx", import.meta.url)
    ),
    "utf8"
  );

  assert.match(source, /GitHub 빌드 연결/);
  assert.match(source, /AWS 연결이 먼저 필요합니다/);
  assert.match(source, /AWS 연결하러 가기/);
  assert.match(source, /AWS에서 승인하기/);
  assert.match(source, /createAwsCodeConnection/);
  assert.match(source, /refreshAwsCodeConnection/);
  assert.match(source, /connection\.status === "verified"/);
  assert.match(source, /setupModalAccessibility/);
  assert.match(source, /ref=\{modalOverlayRef\}/);
  assert.match(source, /ref=\{modalDialogRef\}/);
  assert.match(source, /ref=\{modalCloseButtonRef\}/);
  assert.doesNotMatch(source, /CodeConnection ARN.*input|connectionArn.*onChange/is);
});

test("settings previews exact SketchCatch managed cleanup before AWS connection deletion", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../../app/dashboard/settings/settings-dashboard-client.tsx", import.meta.url)
    ),
    "utf8"
  );

  assert.match(source, /getAwsConnectionDeletionPreview/);
  assert.match(source, /AWS 연결 삭제 대상 확인/);
  assert.match(source, /정리할 리소스/);
  assert.match(source, /삭제하지 않는 리소스/);
  assert.match(source, /confirmedManagedCleanup: true/);
  assert.match(source, /confirmationToken: deletionPreview\.confirmationToken/);
  assert.match(source, /관리 리소스 정리 후 연결 삭제/);
  assert.doesNotMatch(source, /한 번 더 눌러 삭제/);
});
