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

test("전체 선택 도움말은 보드에만 표시하는 AWS 리소스도 함께 읽는다고 설명한다", () => {
  assert.equal(
    getReverseEngineeringSelectionHelp(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION),
    "배포할 수 있는 리소스와 보드에만 표시하는 AWS 리소스를 함께 읽습니다."
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
