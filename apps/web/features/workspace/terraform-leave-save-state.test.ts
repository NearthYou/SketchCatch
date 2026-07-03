import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTerraformLeaveSaveStartFeedback,
  resolveTerraformLeaveSaveCompletion
} from "./terraform-leave-save-state";

test("terraform leave save feedback enters saving while an external save is requested", () => {
  assert.deepEqual(createTerraformLeaveSaveStartFeedback(), {
    canRunPendingAction: false,
    message: "",
    shouldRevealTerraformPanel: false,
    shouldKeepDialogOpen: true,
    state: "saving"
  });
});

test("terraform leave save feedback closes the dialog only after a successful save", () => {
  assert.deepEqual(resolveTerraformLeaveSaveCompletion(true), {
    canRunPendingAction: true,
    message: "",
    shouldRevealTerraformPanel: false,
    shouldKeepDialogOpen: false,
    state: "idle"
  });
});

test("terraform leave save feedback keeps the dialog open when save is blocked", () => {
  assert.deepEqual(resolveTerraformLeaveSaveCompletion(false), {
    canRunPendingAction: false,
    message: "저장하지 못했습니다. Terraform 패널의 오류를 확인해 주세요.",
    shouldRevealTerraformPanel: false,
    shouldKeepDialogOpen: true,
    state: "blocked"
  });
});

test("terraform leave save feedback closes the dialog when panel diagnostics explain the failure", () => {
  assert.deepEqual(resolveTerraformLeaveSaveCompletion(false, { hasBlockingDiagnostics: true }), {
    canRunPendingAction: false,
    message: "",
    shouldRevealTerraformPanel: true,
    shouldKeepDialogOpen: false,
    state: "idle"
  });
});
