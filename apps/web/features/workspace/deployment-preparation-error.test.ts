import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DeploymentPreparationError,
  getDeploymentPreparationErrorMessage
} from "./deployment-preparation-error";

test("deployment preparation exposes the failed stage instead of a generic message", () => {
  const error = new DeploymentPreparationError({
    cause: new Error("upload failed"),
    stage: "asset_upload"
  });

  assert.equal(
    getDeploymentPreparationErrorMessage(error, "프로젝트 저장과 배포 준비에 실패했습니다."),
    "Terraform 파일 업로드 단계에서 실패했습니다. 업로드 권한과 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
  );
});

test("deployment preparation preserves a safe, specific draft-save message", () => {
  const error = new DeploymentPreparationError({
    cause: new Error("draft response was stale"),
    stage: "project_draft_save"
  });

  assert.equal(
    getDeploymentPreparationErrorMessage(error, "프로젝트 저장과 배포 준비에 실패했습니다."),
    "프로젝트 저장 단계에서 실패했습니다. 보드 변경사항을 다시 저장한 뒤 배포 준비를 실행해 주세요."
  );
});
