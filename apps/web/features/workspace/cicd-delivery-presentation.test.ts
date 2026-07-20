import assert from "node:assert/strict";
import test from "node:test";
import { getDeploymentTargetPresentation } from "./cicd-delivery-presentation";

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
