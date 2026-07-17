import assert from "node:assert/strict";
import test from "node:test";
import { getSettingsAwsRecoveryNavigation } from "./settings-aws-recovery-navigation";

test("AWS Reverse Engineering 복구 진입은 미검증 연결과 고정 복귀 경로를 사용한다", () => {
  assert.deepEqual(
    getSettingsAwsRecoveryNavigation({
      next: "reverse",
      tab: "aws"
    }),
    {
      includeUnverifiedAwsConnections: true,
      returnHref: "/workspace/reverse"
    }
  );
});

test("일반 Settings 진입은 기존 verified-only 연결 목록을 유지한다", () => {
  assert.deepEqual(getSettingsAwsRecoveryNavigation({}), {
    includeUnverifiedAwsConnections: false,
    returnHref: null
  });
  assert.deepEqual(
    getSettingsAwsRecoveryNavigation({
      tab: "aws"
    }),
    {
      includeUnverifiedAwsConnections: false,
      returnHref: null
    }
  );
  assert.deepEqual(
    getSettingsAwsRecoveryNavigation({
      next: "reverse",
      tab: "github"
    }),
    {
      includeUnverifiedAwsConnections: false,
      returnHref: null
    }
  );
});

test("복수 query 값과 알 수 없는 next 값은 복구 경로를 열지 않는다", () => {
  assert.deepEqual(
    getSettingsAwsRecoveryNavigation({
      next: ["reverse", "other"],
      tab: "aws"
    }),
    {
      includeUnverifiedAwsConnections: false,
      returnHref: null
    }
  );
  assert.deepEqual(
    getSettingsAwsRecoveryNavigation({
      next: "external",
      tab: "aws"
    }),
    {
      includeUnverifiedAwsConnections: false,
      returnHref: null
    }
  );
});
