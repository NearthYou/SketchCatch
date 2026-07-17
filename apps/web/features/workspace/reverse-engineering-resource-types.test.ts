import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import {
  getReverseEngineeringSelectionHelp,
  getNextReverseEngineeringResourceSelections,
  isReverseEngineeringResourceSelectionChecked,
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  REVERSE_ENGINEERING_RESOURCE_TYPES
} from "./reverse-engineering-resource-types";

test("전체 선택 도움말은 확인 전용 AWS Resource도 함께 읽는다고 설명한다", () => {
  assert.equal(
    getReverseEngineeringSelectionHelp(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION),
    "현재 지원 Resource와 확인 전용 AWS Resource를 함께 읽습니다."
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
