import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import { getSettingsAwsConnectionAction } from "./settings-aws-connection-action";

function createConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    id: "connection-1",
    userId: "user-1",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides
  };
}

test("검증 실패 연결에 저장된 Role이 있으면 설정 재개 대신 기존 Role을 재검증한다", () => {
  assert.deepEqual(
    getSettingsAwsConnectionAction(createConnection({ status: "failed" })),
    {
      kind: "reverify",
      label: "연결 다시 확인"
    }
  );
});

test("Role이 없는 미검증 연결은 CloudFormation 설정을 이어서 진행한다", () => {
  assert.deepEqual(
    getSettingsAwsConnectionAction(
      createConnection({
        accountId: null,
        roleArn: null,
        status: "failed"
      })
    ),
    {
      kind: "resume",
      label: "설정 계속"
    }
  );
});

test("검증된 연결의 연결 테스트 행동은 유지한다", () => {
  assert.deepEqual(getSettingsAwsConnectionAction(createConnection()), {
    kind: "test",
    label: "연결 테스트"
  });
});
