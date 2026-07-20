import assert from "node:assert/strict";
import test from "node:test";
import type { GitCicdHandoffReadinessItem } from "./cicd-handoff";
import {
  getDeploymentTargetPresentation,
  groupGitCicdReadiness
} from "./cicd-delivery-presentation";

test("labels an auto-filled AWS connection as unsaved", () => {
  assert.equal(getDeploymentTargetPresentation({
    draftAwsConnectionId: "aws-1",
    savedAwsConnectionId: null,
    isDirty: false
  }).statusLabel, "저장 전 추천값");
});

test("distinguishes saved, dirty, and required target states", () => {
  assert.equal(getDeploymentTargetPresentation({
    draftAwsConnectionId: "aws-1",
    savedAwsConnectionId: "aws-1",
    isDirty: false
  }).status, "saved");
  assert.equal(getDeploymentTargetPresentation({
    draftAwsConnectionId: "aws-2",
    savedAwsConnectionId: "aws-1",
    isDirty: true
  }).statusLabel, "미저장 변경");
  assert.equal(getDeploymentTargetPresentation({
    draftAwsConnectionId: null,
    savedAwsConnectionId: null,
    isDirty: false
  }).status, "required");
});

test("puts required items before a collapsed completed summary", () => {
  const items = [
    { key: "source_repository", status: "ready" },
    { key: "approved_apply_plan", status: "action_required" },
    { key: "monitoring_config", status: "ready" }
  ] as GitCicdHandoffReadinessItem[];

  const presentation = groupGitCicdReadiness(items);

  assert.deepEqual(presentation.required.map(({ key }) => key), ["approved_apply_plan"]);
  assert.equal(presentation.completedCount, 2);
  assert.equal(presentation.remainingLabel, "배포 PR까지 1개 남음");
});

test("reports readiness completion without retaining a remaining count", () => {
  const presentation = groupGitCicdReadiness([
    { key: "source_repository", status: "ready" }
  ] as GitCicdHandoffReadinessItem[]);

  assert.equal(presentation.remainingLabel, "배포 PR 준비 완료");
  assert.equal(presentation.required.length, 0);
});
