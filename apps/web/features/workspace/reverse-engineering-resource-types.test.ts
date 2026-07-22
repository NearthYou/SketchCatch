import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import {
  formatReverseEngineeringResourceSelectionLabel,
  getReverseEngineeringSelectionHelp,
  getNextReverseEngineeringResourceSelections,
  isReverseEngineeringResourceSelectionChecked,
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  REVERSE_ENGINEERING_RESOURCE_TYPES
} from "./reverse-engineering-resource-types";

test("Resource 선택은 API 값 대신 한국어 화면 이름으로 표시한다", () => {
  assert.equal(formatReverseEngineeringResourceSelectionLabel("ALL"), "전체");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("VPC"), "네트워크(VPC)");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("SUBNET"), "서브넷");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("INTERNET_GATEWAY"), "인터넷 게이트웨이");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("ROUTE_TABLE"), "라우팅 테이블");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("SECURITY_GROUP"), "보안 그룹");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("EC2"), "가상 서버(EC2)");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("RDS"), "데이터베이스(RDS)");
  assert.equal(formatReverseEngineeringResourceSelectionLabel("S3"), "파일 저장소(S3)");
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("CLOUDWATCH_LOG_GROUP"),
    "로그 저장소(CloudWatch)"
  );
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("LOAD_BALANCER"),
    "애플리케이션 로드 밸런서(ALB)"
  );
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("CLOUDFRONT"),
    "콘텐츠 전송(CloudFront)"
  );
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("ECS_CLUSTER"),
    "컨테이너 클러스터(ECS)"
  );
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("ECS_SERVICE"),
    "컨테이너 서비스(ECS)"
  );
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("ECS_TASK_DEFINITION"),
    "컨테이너 작업 정의(ECS)"
  );
});

test("정식 지원된 ALB, CloudFront, ECS는 전체와 개별 AWS 스캔 선택 모두에서 보인다", () => {
  assert.deepEqual(
    REVERSE_ENGINEERING_RESOURCE_TYPES.filter((resourceType) =>
      ["LOAD_BALANCER", "CLOUDFRONT", "ECS_CLUSTER", "ECS_SERVICE", "ECS_TASK_DEFINITION"].includes(
        resourceType
      )
    ),
    ["LOAD_BALANCER", "CLOUDFRONT", "ECS_CLUSTER", "ECS_SERVICE", "ECS_TASK_DEFINITION"]
  );
});

test("CloudWatch Log Group을 직접 가져올 Resource로 선택할 수 있다", () => {
  assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes("CLOUDWATCH_LOG_GROUP"), true);
});

test("API Gateway와 CloudWatch Alarm을 개별 Resource로 선택하고 쉬운 이름으로 본다", () => {
  assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes("API_GATEWAY_REST_API"), true);
  assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes("CLOUDWATCH_METRIC_ALARM"), true);
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("API_GATEWAY_REST_API"),
    "API 입구(API Gateway)"
  );
  assert.equal(
    formatReverseEngineeringResourceSelectionLabel("CLOUDWATCH_METRIC_ALARM"),
    "지표 알림(CloudWatch)"
  );
});

test("Lambda, IAM, KMS, EventBridge를 개별 Resource로 선택하고 쉬운 이름으로 본다", () => {
  const expectedLabels = [
    ["LAMBDA", "Lambda 함수"],
    ["LAMBDA_PERMISSION", "Lambda 호출 권한"],
    ["IAM_ROLE", "IAM 역할"],
    ["IAM_POLICY", "IAM 정책"],
    ["IAM_INSTANCE_PROFILE", "EC2용 IAM 프로필"],
    ["KMS_KEY", "암호화 키(KMS)"],
    ["EVENTBRIDGE_RULE", "이벤트 규칙(EventBridge)"],
    ["EVENTBRIDGE_TARGET", "이벤트 대상(EventBridge)"]
  ] as const satisfies readonly (readonly [ReverseEngineeringResourceSelection, string])[];

  for (const [resourceType, label] of expectedLabels) {
    assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes(resourceType), true);
    assert.equal(formatReverseEngineeringResourceSelectionLabel(resourceType), label);
  }
});

test("전체 선택 도움말은 보드에만 표시하는 AWS 리소스도 함께 읽는다고 설명한다", () => {
  assert.equal(
    getReverseEngineeringSelectionHelp(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION),
    "Terraform 편집 대상과 보드에서 확인할 AWS 리소스를 함께 읽습니다."
  );
  assert.equal(
    getReverseEngineeringSelectionHelp("VPC"),
    "선택한 정식 지원 Resource만 읽습니다."
  );
});

test("전체 선택은 고급 설정의 모든 표시 리소스를 선택된 상태로 보인다", () => {
  const selections: ReverseEngineeringResourceSelection[] = [
    REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
  ];

  assert.equal(
    isReverseEngineeringResourceSelectionChecked(
      selections,
      REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
    ),
    true
  );
  assert.ok(
    REVERSE_ENGINEERING_RESOURCE_TYPES.every((resourceType) =>
      isReverseEngineeringResourceSelectionChecked(selections, resourceType)
    )
  );
});

test("전체 선택에서 개별 리소스를 해제하면 나머지 리소스 선택은 유지한다", () => {
  assert.deepEqual(
    getNextReverseEngineeringResourceSelections(
      [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION],
      "EC2"
    ),
    REVERSE_ENGINEERING_RESOURCE_TYPES.filter((resourceType) => resourceType !== "EC2")
  );
});

test("마지막 개별 리소스를 선택하면 전체 스캔 값으로 다시 정규화한다", () => {
  assert.deepEqual(
    getNextReverseEngineeringResourceSelections(
      REVERSE_ENGINEERING_RESOURCE_TYPES.filter((resourceType) => resourceType !== "S3"),
      "S3"
    ),
    [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION]
  );
});
