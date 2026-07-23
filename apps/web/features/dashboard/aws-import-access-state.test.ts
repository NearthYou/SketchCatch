import assert from "node:assert/strict";
import test from "node:test";
import type {
  AwsConnectionStatus,
  AwsImportAccessNextAction,
  AwsImportAccessState,
  AwsImportAccessStatus
} from "@sketchcatch/types";
import { deriveAwsImportAccessView } from "./aws-import-access-state";

/** gg: 상태별 UI 계약만 비교할 수 있는 safe state를 만듭니다. */
function state(
  status: AwsImportAccessStatus,
  nextAction: AwsImportAccessNextAction | null,
  cleanupAvailable: boolean
): AwsImportAccessState {
  return {
    connectionId: "connection-1",
    status,
    nextAction,
    cleanupAvailable,
    coreReady: status === "ready" || status === "limited",
    limitedServiceLabels: status === "limited" ? ["IAM", "Lambda"] : [],
    lastCheckedAt: null,
    operationId: null,
    safeSummary: null
  };
}

/** gg: 기본 verified 연결에서 status와 nextAction 조합을 해석합니다. */
function view(
  status: AwsImportAccessStatus,
  nextAction: AwsImportAccessNextAction | null,
  options: {
    connectionStatus?: AwsConnectionStatus;
    cleanupAvailable?: boolean;
    hasPolicyApproval?: boolean;
  } = {}
) {
  return deriveAwsImportAccessView({
    connectionStatus: options.connectionStatus ?? "verified",
    hasPolicyApproval: options.hasPolicyApproval ?? false,
    state: state(
      status,
      nextAction,
      options.cleanupAvailable ?? (
        status !== "check_required" && status !== "cleanup_complete"
      )
    )
  });
}

test("verified deployment connection can still require import access", () => {
  const result = view("update_required", "preview_policy");

  assert.equal(result.title, "가져오기 권한 업데이트 필요");
  assert.equal(result.primaryAction, "가져오기 권한 업데이트");
  assert.equal(result.primaryCommand, "preview_policy");
  assert.equal(result.deploymentConnectionPreserved, true);
});

test("retry_required follows the server operation-aware nextAction", () => {
  const cases = [
    ["prepare_manager", "AWS Console 다시 열기"],
    ["check_manager", "Manager 준비 확인"],
    ["preview_policy", "가져오기 권한 업데이트"],
    ["check_reads", "읽기 권한 다시 확인"],
    ["check_cleanup", "정리 상태 확인"]
  ] as const;

  for (const [nextAction, label] of cases) {
    const result = view("retry_required", nextAction);
    assert.equal(result.primaryCommand, nextAction);
    assert.equal(result.primaryAction, label);
  }

  const legacy = view("retry_required", null);
  assert.equal(legacy.primaryCommand, null);
  assert.equal(legacy.primaryAction, null);

  const genericRetry = view("retry_required", "retry");
  assert.equal(genericRetry.primaryCommand, null);
  assert.equal(genericRetry.primaryAction, null);
});

test("manager reload can mint a fresh Console link and still check AWS", () => {
  const result = view("manager_approval_required", "check_manager");

  assert.equal(result.primaryCommand, "check_manager");
  assert.equal(result.primaryAction, "Manager 준비 확인");
  assert.equal(result.secondaryCommand, "prepare_manager");
  assert.equal(result.secondaryAction, "AWS Console 다시 열기");
});

test("policy approval reload previews a fresh single-use approval before apply", () => {
  const reloaded = view("policy_approval_required", "apply_policy");
  assert.equal(reloaded.primaryCommand, "preview_policy");
  assert.equal(reloaded.primaryAction, "권한 변경 내용 확인");

  const previewed = view("policy_approval_required", "apply_policy", {
    hasPolicyApproval: true
  });
  assert.equal(previewed.primaryCommand, "apply_policy");
  assert.equal(previewed.primaryAction, "확인한 권한 적용");
});

test("connection and cleanup states expose distinct state-driven actions", () => {
  assert.deepEqual(
    {
      command: view("connection_required", "open_settings").primaryCommand,
      title: view("connection_required", "open_settings").title
    },
    { command: "open_settings", title: "AWS 연결 확인 필요" }
  );
  assert.deepEqual(
    {
      command: view("cleanup_policy_required", "delete_policy_stack").primaryCommand,
      title: view("cleanup_policy_required", "delete_policy_stack").title
    },
    { command: "prepare_cleanup", title: "가져오기 권한 정리 필요" }
  );
  assert.deepEqual(
    {
      command: view("cleanup_manager_required", "delete_manager_stack").primaryCommand,
      title: view("cleanup_manager_required", "delete_manager_stack").title
    },
    { command: "prepare_cleanup", title: "Manager 정리 필요" }
  );
  assert.deepEqual(
    {
      command: view("cleanup_required", "check_cleanup").primaryCommand,
      title: view("cleanup_required", "check_cleanup").title
    },
    { command: "check_cleanup", title: "AWS 권한 정리 확인 필요" }
  );

  for (const status of ["cleanup_policy_required", "cleanup_manager_required"] as const) {
    const cleanup = view(
      status,
      status === "cleanup_policy_required"
        ? "delete_policy_stack"
        : "delete_manager_stack"
    );
    assert.equal(cleanup.secondaryCommand, "check_cleanup");
    assert.equal(cleanup.secondaryAction, "정리 상태 확인");
  }
});

test("cleanup recovery reuses manager preparation only when the API explicitly allows it", () => {
  const recoverable = view("cleanup_required", "prepare_manager");

  assert.equal(recoverable.title, "가져오기 권한 다시 준비 필요");
  assert.equal(recoverable.primaryAction, "가져오기 권한 다시 준비");
  assert.equal(recoverable.primaryCommand, "prepare_manager");

  const stillCleaning = view("cleanup_required", "check_cleanup");
  assert.equal(stillCleaning.primaryAction, "정리 상태 확인");
  assert.equal(stillCleaning.primaryCommand, "check_cleanup");

  const completed = view("cleanup_complete", "prepare_manager");
  assert.equal(completed.primaryAction, null);
  assert.equal(completed.primaryCommand, null);
});

test("only ready and limited states can return to Reverse Engineering", () => {
  const statuses: readonly AwsImportAccessStatus[] = [
    "check_required",
    "manager_approval_required",
    "manager_checking",
    "policy_approval_required",
    "policy_working",
    "checking_reads",
    "ready",
    "limited",
    "update_required",
    "retry_required",
    "connection_required",
    "cleanup_policy_required",
    "cleanup_manager_required",
    "cleanup_checking",
    "cleanup_required",
    "cleanup_complete"
  ];

  for (const status of statuses) {
    const result = view(status, null);
    assert.equal(result.canContinue, status === "ready" || status === "limited", status);
  }
});

test("every non-retry server status follows its contracted next action", () => {
  const cases = [
    ["check_required", "prepare_manager", "prepare_manager"],
    ["manager_approval_required", "check_manager", "check_manager"],
    ["manager_checking", "check_manager", "check_manager"],
    ["policy_approval_required", "preview_policy", "preview_policy"],
    ["policy_working", "check_reads", "check_reads"],
    ["checking_reads", "check_reads", "check_reads"],
    ["ready", null, null],
    ["limited", "check_reads", "check_reads"],
    ["update_required", "preview_policy", "preview_policy"],
    ["connection_required", "open_settings", "open_settings"],
    ["cleanup_policy_required", "delete_policy_stack", "prepare_cleanup"],
    ["cleanup_manager_required", "delete_manager_stack", "prepare_cleanup"],
    ["cleanup_checking", "check_cleanup", "check_cleanup"],
    ["cleanup_required", "check_cleanup", "check_cleanup"],
    ["cleanup_complete", null, null]
  ] as const;

  for (const [status, nextAction, expectedCommand] of cases) {
    assert.equal(view(status, nextAction).primaryCommand, expectedCommand, status);
  }
});

test("persisted setup states offer cleanup without misclassifying synthesized or cleanup states", () => {
  const setupCases = [
    ["manager_approval_required", "check_manager"],
    ["manager_checking", "check_manager"],
    ["policy_approval_required", "apply_policy"],
    ["policy_working", "check_reads"],
    ["checking_reads", "check_reads"],
    ["ready", null],
    ["limited", "check_reads"],
    ["update_required", "preview_policy"],
    ["connection_required", "open_settings"],
    ["retry_required", "prepare_manager"],
    ["retry_required", "retry"]
  ] as const;

  for (const [status, nextAction] of setupCases) {
    const result = view(status, nextAction);
    assert.equal(result.cleanupCommand, "prepare_cleanup", `${status}/${nextAction}`);
    assert.equal(result.cleanupAction, "가져오기 권한 정리", `${status}/${nextAction}`);
  }

  const excludedCases = [
    ["check_required", "prepare_manager"],
    ["retry_required", "check_cleanup"],
    ["cleanup_policy_required", "delete_policy_stack"],
    ["cleanup_manager_required", "delete_manager_stack"],
    ["cleanup_checking", "check_cleanup"],
    ["cleanup_required", "check_cleanup"],
    ["cleanup_complete", null]
  ] as const;

  for (const [status, nextAction] of excludedCases) {
    const result = view(status, nextAction);
    assert.equal(result.cleanupCommand, null, `${status}/${nextAction}`);
    assert.equal(result.cleanupAction, null, `${status}/${nextAction}`);
  }
});

test("cleanupAvailable distinguishes persisted and synthesized check_required states", () => {
  const synthesized = view("check_required", "prepare_manager", {
    cleanupAvailable: false
  });
  const persisted = view("check_required", "prepare_manager", {
    cleanupAvailable: true
  });

  assert.equal(synthesized.cleanupCommand, null);
  assert.equal(persisted.cleanupCommand, "prepare_cleanup");
  assert.equal(persisted.cleanupAction, "가져오기 권한 정리");
});

test("a failed base connection can still clean up persisted import setup", () => {
  const abandoned = view("manager_approval_required", "check_manager", {
    connectionStatus: "failed"
  });
  assert.equal(abandoned.primaryCommand, "open_settings");
  assert.equal(abandoned.cleanupCommand, "prepare_cleanup");

  const synthesized = view("check_required", "prepare_manager", {
    connectionStatus: "failed"
  });
  assert.equal(synthesized.primaryCommand, "open_settings");
  assert.equal(synthesized.cleanupCommand, null);

  const cleanupRetry = view("retry_required", "check_cleanup", {
    connectionStatus: "failed"
  });
  assert.equal(cleanupRetry.primaryCommand, "check_cleanup");
  assert.equal(cleanupRetry.cleanupCommand, null);
});
