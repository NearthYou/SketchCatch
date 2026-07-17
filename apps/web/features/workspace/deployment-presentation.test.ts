import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getDeploymentFailureDeveloperCheck,
  getDeploymentStatusPresentation,
  getRecentDeploymentResultTitle
} from "./deployment-presentation";

test("deployment statuses use Korean labels and semantic tones", () => {
  assert.deepEqual(getDeploymentStatusPresentation("FAILED"), {
    label: "실패",
    tone: "error"
  });
  assert.deepEqual(getDeploymentStatusPresentation("RUNNING"), {
    label: "실행 중",
    tone: "running"
  });
  assert.deepEqual(getDeploymentStatusPresentation("SUCCESS"), {
    label: "성공",
    tone: "success"
  });
  assert.equal(getDeploymentStatusPresentation("PENDING").label, "대기 중");
  assert.equal(getDeploymentStatusPresentation("CANCELLED").label, "취소됨");
  assert.equal(getDeploymentStatusPresentation("DESTROYED").label, "정리 완료");
  assert.deepEqual(getDeploymentStatusPresentation("PARTIALLY_FAILED"), {
    label: "부분 실패",
    tone: "error"
  });
  assert.deepEqual(getDeploymentStatusPresentation("PARTIALLY_CANCELED"), {
    label: "부분 취소",
    tone: "neutral"
  });
});

test("development deployment failures name the concrete evidence developers must inspect", () => {
  assert.match(
    getDeploymentFailureDeveloperCheck("application_release", "development") ?? "",
    /CodeBuild 로그.*ECR image digest.*ECS task health.*S3·CloudFront/u
  );
  assert.match(
    getDeploymentFailureDeveloperCheck("plan", "development") ?? "",
    /Terraform plan stderr.*state refresh/u
  );
  assert.equal(getDeploymentFailureDeveloperCheck("plan", "production"), null);
});

test("a failed unapproved run is presented as a validation result", () => {
  assert.equal(
    getRecentDeploymentResultTitle({ approvedAt: null, status: "FAILED" }),
    "최근 검증 결과"
  );
  assert.equal(
    getRecentDeploymentResultTitle({
      approvedAt: "2026-07-15T00:00:00.000Z",
      status: "FAILED"
    }),
    "최근 배포 결과"
  );
});

test("an absent run uses a neutral recent result title", () => {
  assert.equal(getRecentDeploymentResultTitle(null), "최근 실행 결과");
  assert.equal(
    getRecentDeploymentResultTitle({ approvedAt: null, status: "PENDING" }),
    "최근 실행 결과"
  );
});
