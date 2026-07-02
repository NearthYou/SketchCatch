import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTerraformLeaveSaveStartFeedback,
  resolveTerraformLeaveSaveCompletion
} from "./terraform-leave-save-state";

test("terraform leave save feedback enters saving while an external save is requested", () => {
  assert.deepEqual(createTerraformLeaveSaveStartFeedback(), {
    canRunPendingAction: false,
    message: "Terraform 변경사항을 저장하는 중입니다.",
    shouldKeepDialogOpen: true,
    state: "saving"
  });
});

test("terraform leave save feedback closes the dialog only after a successful save", () => {
  assert.deepEqual(resolveTerraformLeaveSaveCompletion(true), {
    canRunPendingAction: true,
    message: "",
    shouldKeepDialogOpen: false,
    state: "idle"
  });
});

test("terraform leave save feedback keeps the dialog open when save is blocked", () => {
  assert.deepEqual(resolveTerraformLeaveSaveCompletion(false), {
    canRunPendingAction: false,
    message: "저장하지 못했습니다. Terraform 패널의 오류나 변경 제안을 확인해 주세요.",
    shouldKeepDialogOpen: true,
    state: "blocked"
  });
});
