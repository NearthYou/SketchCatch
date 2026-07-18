import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  prepareReverseEngineeringImportPermissionUpdate,
  reverifyReverseEngineeringImportPermission
} from "./reverse-engineering-import-permissions";

const connection: AwsConnection = {
  id: "connection-474",
  userId: "user-1",
  accountId: "123456789012",
  roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-47447447",
  externalId: "external-id",
  region: "ap-northeast-2",
  status: "verified",
  lastVerifiedAt: "2026-07-18T00:00:00.000Z",
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z"
};

test("가져오기 권한 준비는 같은 연결의 Template만 열고 연결 생성이나 검증을 시작하지 않는다", async () => {
  const requestedConnectionIds: string[] = [];
  const downloadedTemplates: Array<{ fileName: string; templateBody: string }> = [];
  const openedUrls: string[] = [];

  const result = await prepareReverseEngineeringImportPermissionUpdate({
    connection,
    downloadTemplate(fileName, templateBody) {
      downloadedTemplates.push({ fileName, templateBody });
    },
    async getTemplate({ connectionId }) {
      requestedConnectionIds.push(connectionId);
      return {
        roleName: "SketchCatchTerraformExecutionRole-47447447",
        stackName: "sketchcatch-aws-connection-connecti",
        region: "ap-northeast-2",
        capabilities: ["CAPABILITY_NAMED_IAM"],
        templateBody: "template",
        templateUrl: "https://example.com/template.yaml",
        templateUrlExpiresAt: "2026-07-18T01:00:00.000Z",
        launchStackUrl: "https://console.aws.amazon.com/cloudformation/home",
        manualTemplateFallbackAvailable: false
      };
    },
    openExternal(url) {
      openedUrls.push(url);
    }
  });

  assert.deepEqual(requestedConnectionIds, [connection.id]);
  assert.deepEqual(downloadedTemplates, [
    {
      fileName: "sketchcatch-aws-connection-connecti.yaml",
      templateBody: "template"
    }
  ]);
  assert.equal(openedUrls.length, 1);
  assert.match(openedUrls[0] ?? "", /filteringText=sketchcatch-aws-connection-connecti/);
  assert.doesNotMatch(openedUrls[0] ?? "", /quickcreate/);
  assert.equal(result, "awaiting_aws_approval");
});

test("AWS 승인 뒤에는 같은 connection id와 저장된 Role ARN만 다시 검증한다", async () => {
  const verificationInputs: Array<{ connectionId: string; roleArn: string }> = [];

  await reverifyReverseEngineeringImportPermission({
    connection,
    async verify(input) {
      verificationInputs.push(input);
      return {
        ok: true,
        accountId: "123456789012",
        callerArn: "arn:aws:sts::123456789012:assumed-role/example/session",
        region: "ap-northeast-2",
        awsConnection: connection
      };
    }
  });

  assert.deepEqual(verificationInputs, [
    { connectionId: connection.id, roleArn: connection.roleArn }
  ]);
});
