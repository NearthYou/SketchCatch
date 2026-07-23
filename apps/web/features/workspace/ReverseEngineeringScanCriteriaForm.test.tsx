import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AwsConnection,
  Project,
  ReverseEngineeringResourceSelection
} from "@sketchcatch/types";
import { ReverseEngineeringScanCriteriaForm } from "./ReverseEngineeringScanCriteriaForm";
import { getReverseEngineeringAwsConnectionRecovery } from "./reverse-engineering-aws-connection-readiness";

const project: Project = {
  id: "project-1",
  userId: "user-1",
  name: "프로젝트",
  description: null,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z"
};

const resourceTypes: ReverseEngineeringResourceSelection[] = [
  "ALL",
  "VPC",
  "LOAD_BALANCER",
  "CLOUDFRONT",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "ECS_TASK_DEFINITION"
];

function createConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    id: "connection-1",
    userId: "user-1",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "sc_conn_sensitive_external_id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides
  };
}

function renderForm(input: {
  readonly awsConnections: AwsConnection[];
  readonly selectedAwsConnectionId: string;
}): string {
  const recovery = getReverseEngineeringAwsConnectionRecovery({
    connections: input.awsConnections,
    selectedConnectionId: input.selectedAwsConnectionId
  });

  return renderToStaticMarkup(
    createElement(ReverseEngineeringScanCriteriaForm, {
      awsConnectionRecovery: recovery,
      awsConnections: input.awsConnections,
      canStartScan: recovery.canStartScan,
      isLoadingOptions: false,
      isScanning: false,
      onRefresh() {},
      onResourceTypeToggle() {},
      onScanCancel() {},
      onScanStart() {},
      onSelectedAwsConnectionChange() {},
      projects: [project],
      resourceTypes,
      selectedAwsConnectionId: input.selectedAwsConnectionId,
      selectedProjectId: project.id,
      selectedResourceTypes: ["ALL"]
    })
  );
}

test("pending AWS 연결은 복구 CTA만 보여주고 별도 새로고침 진입점과 민감한 값을 숨긴다", () => {
  const html = renderForm({
    awsConnections: [
      createConnection({
        accountId: null,
        roleArn: null,
        status: "pending"
      })
    ],
    selectedAwsConnectionId: "connection-1"
  });

  assert.match(html, /확인 필요/);
  assert.match(html, /AWS Role이 아직 준비되지 않았습니다\./);
  assert.match(html, /설정 계속/);
  assert.doesNotMatch(html, /AWS 연결 새로고침/);
  assert.match(
    html,
    /\/dashboard\/settings\?tab=aws&amp;next=reverse&amp;awsConnectionId=connection-1/
  );
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /123456789012/);
  assert.doesNotMatch(html, /SketchCatchTerraformExecutionRole/);
  assert.doesNotMatch(html, /sc_conn_sensitive_external_id/);
});

test("검증 실패 연결은 연결 다시 확인 CTA를 보여준다", () => {
  const html = renderForm({
    awsConnections: [createConnection({ status: "failed" })],
    selectedAwsConnectionId: "connection-1"
  });

  assert.match(html, /재확인 필요/);
  assert.match(html, /연결 다시 확인/);
  assert.match(
    html,
    /\/dashboard\/settings\?tab=aws&amp;next=reverse&amp;awsConnectionId=connection-1/
  );
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /123456789012/);
  assert.doesNotMatch(html, /SketchCatchTerraformExecutionRole/);
  assert.doesNotMatch(html, /sc_conn_sensitive_external_id/);
});

test("AWS 연결이 없으면 AWS Role 연결하기 CTA를 보여준다", () => {
  const html = renderForm({
    awsConnections: [],
    selectedAwsConnectionId: ""
  });

  assert.match(html, /AWS Role 연결하기/);
  assert.match(html, /AWS Role이 아직 준비되지 않았습니다\./);
  assert.match(html, /disabled/);
});

test("검증된 AWS 연결은 복구 카드 없이 스캔 행동을 유지한다", () => {
  const html = renderForm({
    awsConnections: [createConnection()],
    selectedAwsConnectionId: "connection-1"
  });

  assert.match(html, /검증됨/);
  assert.match(html, /기존 AWS 가져오기/);
  assert.doesNotMatch(html, /AWS Role이 아직 준비되지 않았습니다\./);
  assert.doesNotMatch(html, /AWS Role 연결하기|설정 계속|연결 다시 확인/);
  for (const label of [
    "애플리케이션 로드 밸런서(ALB)",
    "콘텐츠 전송(CloudFront)",
    "컨테이너 클러스터(ECS)",
    "컨테이너 서비스(ECS)",
    "컨테이너 작업 정의(ECS)"
  ]) {
    assert.match(html, new RegExp(label.replace(/[()]/g, "\\$&")));
  }
});
