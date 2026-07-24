import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringServiceCoverage } from "@sketchcatch/types";
import { getReverseEngineeringPartialScanNotice } from "./reverse-engineering-scan-notice";

test("부분 결과가 재시도 대상이면 연결 설정 이동을 제안하지 않는다", () => {
  assert.deepEqual(
    getReverseEngineeringPartialScanNotice({
      coverage: coverage({ remedy: "retry" }),
      scanErrors: []
    }),
    {
      action: "none",
      description: "가져온 구조는 계속 볼 수 있으며, 필요하면 나중에 다시 스캔할 수 있습니다.",
      title: "일부 AWS 정보를 아직 가져오지 못했습니다."
    }
  );
});

test("권한 부족 부분 결과만 AWS 연결 설정 이동을 제안한다", () => {
  assert.deepEqual(
    getReverseEngineeringPartialScanNotice({
      coverage: coverage({ remedy: "open_settings" }),
      scanErrors: []
    })?.action,
    "open_settings"
  );
});

test("현재 지원 범위 밖인 정보는 설정 문제가 아닌 범위 안내로 남긴다", () => {
  assert.deepEqual(
    getReverseEngineeringPartialScanNotice({
      coverage: {
        capabilityLimits: [
          {
            displayName: "Resource Explorer",
            reason: "not_supported",
            serviceKey: "resource-explorer"
          }
        ],
        status: "partial",
        unavailableServices: []
      },
      scanErrors: []
    })?.action,
    "none"
  );
});

/** 테스트가 필요한 부분 결과만 짧게 만듭니다. */
function coverage({ remedy }: { readonly remedy: "open_settings" | "retry" }): ReverseEngineeringServiceCoverage {
  return {
    status: "partial",
    unavailableServices: [
      {
        displayName: "EC2",
        reason: remedy === "open_settings" ? "permission_required" : "retry",
        remedy,
        serviceKey: "ec2"
      }
    ]
  };
}
