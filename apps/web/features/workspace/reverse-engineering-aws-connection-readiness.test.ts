import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  canStartReverseEngineeringScan,
  createReverseEngineeringAwsSettingsHref,
  formatReverseEngineeringAwsConnectionLabel,
  getReverseEngineeringAwsConnectionRecovery
} from "./reverse-engineering-aws-connection-readiness";
import { createReverseEngineeringFinalRegressionFixture } from "./reverse-engineering-final-regression.fixture";

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

test("AWS 연결이 없으면 Role 연결 복구 행동을 보여준다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [],
    selectedConnectionId: ""
  });

  assert.deepEqual(recovery, {
    readiness: "setup_required",
    canStartScan: false,
    title: "AWS Role이 아직 준비되지 않았습니다.",
    description: "기존 AWS를 읽으려면 먼저 AWS Role을 연결해야 합니다.",
    actionLabel: "AWS Role 연결하기",
    settingsHref: "/dashboard/settings?tab=aws&next=reverse",
    selectedConnectionId: null
  });
});

test("부분 결과 권한 보완도 공개 connection ID만 같은 Settings 주소에 보존한다", () => {
  const href = createReverseEngineeringAwsSettingsHref("connection-partial");

  assert.equal(
    href,
    "/dashboard/settings?tab=aws&next=reverse&awsConnectionId=connection-partial"
  );
  assert.doesNotMatch(href, /arn:aws|external-id|123456789012/iu);
});

test("pending 연결은 설정 계속 행동으로 복구한다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [
      createConnection({
        id: "pending-connection",
        accountId: null,
        roleArn: null,
        status: "pending"
      })
    ],
    selectedConnectionId: "pending-connection"
  });

  assert.equal(recovery.readiness, "verification_required");
  assert.equal(recovery.canStartScan, false);
  assert.equal(recovery.actionLabel, "설정 계속");
  assert.equal(recovery.selectedConnectionId, "pending-connection");
});

test("검증 실패 연결은 다시 확인 행동으로 복구한다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [createConnection({ id: "failed-connection", status: "failed" })],
    selectedConnectionId: "failed-connection"
  });

  assert.equal(recovery.readiness, "retry_required");
  assert.equal(recovery.canStartScan, false);
  assert.equal(recovery.actionLabel, "연결 다시 확인");
  assert.equal(
    recovery.settingsHref,
    "/dashboard/settings?tab=aws&next=reverse&awsConnectionId=failed-connection"
  );
  assert.doesNotMatch(recovery.settingsHref, /123456789012|SketchCatchTerraformExecutionRole|external-id/);
});

test("Role ARN 또는 계정 ID가 없는 verified 연결은 스캔하지 않는다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [
      createConnection({
        id: "incomplete-connection",
        accountId: null,
        status: "verified"
      })
    ],
    selectedConnectionId: "incomplete-connection"
  });

  assert.equal(recovery.readiness, "verification_required");
  assert.equal(recovery.canStartScan, false);
  assert.equal(recovery.actionLabel, "설정 계속");
});

test("완전히 검증된 연결만 스캔을 시작할 수 있다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [createConnection({ id: "verified-connection" })],
    selectedConnectionId: "verified-connection"
  });

  assert.equal(recovery.readiness, "ready");
  assert.equal(recovery.canStartScan, true);
  assert.equal(recovery.selectedConnectionId, "verified-connection");
});

test("최종 혼합 fixture의 verified 연결은 저장 scan과 새 프로젝트 preview에서만 시작 가능하다", () => {
  const { awsConnection } = createReverseEngineeringFinalRegressionFixture();
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [awsConnection],
    selectedConnectionId: awsConnection.id
  });
  const commonInput = {
    hasSelectedVerifiedConnection: true,
    loadState: "idle" as const,
    recovery,
    scanState: "idle" as const,
    selectedResourceTypeCount: 5
  };

  assert.equal(
    canStartReverseEngineeringScan({
      ...commonInput,
      createProjectOnApply: false,
      hasSelectedProject: true
    }),
    true
  );
  assert.equal(
    canStartReverseEngineeringScan({
      ...commonInput,
      createProjectOnApply: true,
      hasSelectedProject: false
    }),
    true
  );
});

test("사용자가 pending 연결을 선택하면 verified 연결이 함께 있어도 스캔을 막는다", () => {
  const verifiedConnection = createConnection({ id: "verified-connection" });
  const pendingConnection = createConnection({
    id: "pending-connection",
    accountId: null,
    roleArn: null,
    status: "pending"
  });

  const pendingRecovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [verifiedConnection, pendingConnection],
    selectedConnectionId: "pending-connection"
  });

  assert.equal(pendingRecovery.readiness, "verification_required");
  assert.equal(pendingRecovery.selectedConnectionId, "pending-connection");
  assert.equal(
    pendingRecovery.settingsHref,
    "/dashboard/settings?tab=aws&next=reverse&awsConnectionId=pending-connection"
  );
  assert.doesNotMatch(
    pendingRecovery.settingsHref,
    /123456789012|SketchCatchTerraformExecutionRole|external-id/
  );
  assert.equal(
    getReverseEngineeringAwsConnectionRecovery({
      connections: [verifiedConnection, pendingConnection],
      selectedConnectionId: "verified-connection"
    }).readiness,
    "ready"
  );
});

test("삭제된 선택은 남아 있는 verified 연결로만 자동 이동한다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [
      createConnection({ id: "verified-older", updatedAt: "2026-07-17T00:00:00.000Z" }),
      createConnection({
        id: "pending-newer",
        accountId: null,
        roleArn: null,
        status: "pending",
        updatedAt: "2026-07-18T00:00:00.000Z"
      })
    ],
    selectedConnectionId: "deleted-connection"
  });

  assert.equal(recovery.selectedConnectionId, "verified-older");
  assert.equal(recovery.readiness, "ready");
});

test("verified 연결이 없으면 삭제된 선택을 가장 최근 복구 대상에 맞춘다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [
      createConnection({
        id: "failed-older",
        status: "failed",
        updatedAt: "2026-07-17T00:00:00.000Z"
      }),
      createConnection({
        id: "pending-newer",
        accountId: null,
        roleArn: null,
        status: "pending",
        updatedAt: "2026-07-18T00:00:00.000Z"
      })
    ],
    selectedConnectionId: "deleted-connection"
  });

  assert.equal(recovery.selectedConnectionId, "pending-newer");
  assert.equal(recovery.readiness, "verification_required");
});

test("같은 시각의 복구 대상은 ID 순서로 결정해 새로고침마다 바뀌지 않는다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [
      createConnection({
        id: "connection-b",
        accountId: null,
        roleArn: null,
        status: "failed"
      }),
      createConnection({
        id: "connection-a",
        accountId: null,
        roleArn: null,
        status: "pending"
      })
    ],
    selectedConnectionId: "deleted-connection"
  });

  assert.equal(recovery.selectedConnectionId, "connection-a");
  assert.equal(recovery.readiness, "verification_required");
});

test("알 수 없는 상태는 안전하게 재확인 필요로 처리한다", () => {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [createConnection({ status: "unexpected" as AwsConnection["status"] })],
    selectedConnectionId: "connection-1"
  });

  assert.equal(recovery.readiness, "retry_required");
  assert.equal(recovery.canStartScan, false);
  assert.equal(recovery.actionLabel, "연결 다시 확인");
});

test("AWS 연결 선택 라벨은 상태를 설명하면서 민감한 원문은 숨긴다", () => {
  assert.equal(
    formatReverseEngineeringAwsConnectionLabel(createConnection()),
    "1234******** · ap-northeast-2 · 검증됨"
  );
  assert.equal(
    formatReverseEngineeringAwsConnectionLabel(
      createConnection({ accountId: null, roleArn: null, status: "pending" })
    ),
    "계정 미확인 · ap-northeast-2 · 확인 필요"
  );
  assert.equal(
    formatReverseEngineeringAwsConnectionLabel(createConnection({ status: "failed" })),
    "1234******** · ap-northeast-2 · 재확인 필요"
  );
});

test("연결 목록 새로고침 실패는 이전 verified 연결이 있어도 스캔 권한으로 취급하지 않는다", () => {
  const readyRecovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [createConnection()],
    selectedConnectionId: "connection-1"
  });

  assert.equal(
    canStartReverseEngineeringScan({
      createProjectOnApply: false,
      hasSelectedVerifiedConnection: true,
      hasSelectedProject: true,
      loadState: "idle",
      recovery: readyRecovery,
      scanState: "idle",
      selectedResourceTypeCount: 1
    }),
    true
  );
  assert.equal(
    canStartReverseEngineeringScan({
      createProjectOnApply: false,
      hasSelectedVerifiedConnection: true,
      hasSelectedProject: true,
      loadState: "error",
      recovery: readyRecovery,
      scanState: "idle",
      selectedResourceTypeCount: 1
    }),
    false
  );
  assert.equal(
    canStartReverseEngineeringScan({
      createProjectOnApply: true,
      hasSelectedVerifiedConnection: true,
      hasSelectedProject: false,
      loadState: "idle",
      recovery: readyRecovery,
      scanState: "loading",
      selectedResourceTypeCount: 1
    }),
    false
  );
});

test("삭제된 선택을 복원한 연결이 실제 스캔 연결로 확인되기 전에는 버튼을 켜지 않는다", () => {
  const verifiedConnection = createConnection({ id: "verified-connection" });
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: [verifiedConnection],
    selectedConnectionId: "deleted-connection"
  });

  assert.equal(recovery.selectedConnectionId, verifiedConnection.id);
  assert.equal(
    canStartReverseEngineeringScan({
      createProjectOnApply: false,
      hasSelectedVerifiedConnection: false,
      hasSelectedProject: true,
      loadState: "idle",
      recovery,
      scanState: "idle",
      selectedResourceTypeCount: 1
    }),
    false
  );
});
