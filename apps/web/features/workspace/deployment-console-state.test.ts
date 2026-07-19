import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiPreDeploymentAnalysisResult } from "@sketchcatch/types";
import {
  createResetPreDeploymentCheckState,
  getDeploymentPlanActionLabel,
  getDirectDeploymentPreflightState,
  getDirectDeploymentFlow,
  hasDeploymentDraftChanges,
  shouldShowDeploymentValidationActions,
  requiresProjectBuildEnvironment,
  type DirectDeploymentFlowInput
} from "./deployment-console-state";

const idleActions = {
  canApply: false,
  canApprovePlan: false,
  canRunApplyPlan: false,
  canRunDestroyPlan: false,
  shouldShowApplyButton: false,
  shouldShowApprovePlanButton: false,
  shouldShowApplyPlanButton: false,
  shouldShowDestroyButton: false,
  shouldShowDestroyPlanButton: false
};

function createInput(
  overrides: Partial<DirectDeploymentFlowInput> = {}
): DirectDeploymentFlowInput {
  return {
    actions: idleActions,
    deployment: null,
    failedStepId: null,
    hasUnsavedBaseline: false,
    preflightState: "idle",
    requestState: "idle",
    ...overrides
  };
}

test("a new or failed validation request clears the previous analysis", () => {
  assert.deepEqual(createResetPreDeploymentCheckState("loading"), {
    analysis: null,
    errorMessage: "",
    fingerprint: null,
    requestState: "loading"
  });
  assert.deepEqual(createResetPreDeploymentCheckState("error", "validate failed"), {
    analysis: null,
    errorMessage: "validate failed",
    fingerprint: null,
    requestState: "error"
  });
});

test("Direct Deployment exposes exactly validation, approval, and deployment", () => {
  const flow = getDirectDeploymentFlow(createInput({ hasUnsavedBaseline: true }));

  assert.deepEqual(
    flow.steps.map((step) => step.id),
    ["validation", "approval", "deployment"]
  );
  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "active");
  assert.equal(flow.steps[1]?.state, "idle");
});

test("a never-run Preflight step is neutral and active after save", () => {
  const flow = getDirectDeploymentFlow(createInput());

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "active");
  assert.notEqual(flow.steps[0]?.state, "error");
});

test("a created deployment without a plan advances to Plan", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canRunApplyPlan: true, shouldShowApplyPlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: null,
        currentPlanOperation: null,
        status: "PENDING"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "active");
});

test("a warning Preflight still advances a created deployment to Plan", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canRunApplyPlan: true, shouldShowApplyPlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: null,
        currentPlanOperation: null,
        status: "PENDING"
      },
      preflightState: "warning"
    })
  );

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "warning");
});

test("Trivy security findings remain advisory even when their checklist item fails", () => {
  const analysis = createPreDeploymentAnalysis({
    findings: [
      {
        id: "trivy:aws-0010:main.tf:aws_s3_bucket.assets:1",
        category: "security",
        severity: "medium",
        resourceId: "aws_s3_bucket.assets",
        title: "S3 security setting review",
        description: "Review the generated bucket configuration.",
        recommendation: "Review the Trivy recommendation before deployment."
      }
    ],
    checklist: [
      {
        id: "security-open-ssh-check",
        label: "Security review",
        status: "fail",
        relatedFindingIds: ["trivy:aws-0010:main.tf:aws_s3_bucket.assets:1"]
      }
    ]
  });

  assert.equal(
    getDirectDeploymentPreflightState({
      analysis,
      errorMessage: "",
      hasStaleAnalysis: false,
      requestState: "idle"
    }),
    "warning"
  );
});

test("non-security checklist failures still block Direct Deployment", () => {
  const analysis = createPreDeploymentAnalysis({
    findings: [
      {
        id: "terraform-diagnostic-0-error",
        category: "configuration",
        severity: "high",
        title: "Terraform configuration error",
        description: "A required Terraform value is invalid.",
        recommendation: "Fix the Terraform diagnostic before deployment."
      }
    ],
    checklist: [
      {
        id: "terraform-diagnostics-check",
        label: "Terraform diagnostics",
        status: "fail",
        relatedFindingIds: ["terraform-diagnostic-0-error"]
      }
    ]
  });

  assert.equal(
    getDirectDeploymentPreflightState({
      analysis,
      errorMessage: "",
      hasStaleAnalysis: false,
      requestState: "idle"
    }),
    "blocked"
  );
});

test("an unapproved apply plan advances to approval", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApprovePlan: true, shouldShowApprovePlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "approval");
  assert.equal(flow.steps[1]?.state, "active");
});

test("an approved apply plan advances to Apply", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApply: true, shouldShowApplyButton: true },
      deployment: {
        approvedAt: "2026-07-11T00:00:00.000Z",
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "deployment");
  assert.equal(flow.steps[2]?.state, "active");
});

test("a persisted plan resumes at approval after the local preflight state resets", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApprovePlan: true, shouldShowApprovePlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "idle"
    })
  );

  assert.equal(flow.activeStepId, "approval");
  assert.equal(flow.steps[1]?.state, "active");
});

test("a failed foreground request does not auto-advance when polling finds a plan", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApprovePlan: true, shouldShowApprovePlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "plan-from-polling",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "passed",
      requestState: "error",
      failedStepId: "validation"
    })
  );

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "error");
});

test("an accepted durable Plan resumes approval after its HTTP response fails", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApprovePlan: true, shouldShowApprovePlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "plan-from-accepted-worker",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "passed",
      requestState: "error",
      failedStepId: "validation",
      reconciledRequestState: "idle"
    } as Partial<DirectDeploymentFlowInput>)
  );

  assert.equal(flow.activeStepId, "approval");
  assert.equal(flow.steps[0]?.state, "done");
  assert.equal(flow.steps[1]?.state, "active");
});

test("running apply reports a running final step", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, shouldShowApplyButton: true },
      deployment: {
        approvedAt: "2026-07-11T00:00:00.000Z",
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "RUNNING"
      },
      preflightState: "passed",
      requestState: "loading"
    })
  );

  assert.equal(flow.activeStepId, "deployment");
  assert.equal(flow.steps[2]?.state, "running");
});

test("blocked Preflight stops the flow without using idle error color", () => {
  const flow = getDirectDeploymentFlow(createInput({ preflightState: "blocked" }));

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "blocked");
  assert.equal(flow.steps[1]?.state, "idle");
});

test("destroy uses the same approval and deployment phases", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "destroy-plan",
        currentPlanOperation: "destroy",
        status: "SUCCESS"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "approval");
  assert.equal(flow.steps[1]?.state, "active");
});

test("a persisted destroy plan advances despite unrelated draft changes", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApprovePlan: true, shouldShowApprovePlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "destroy-plan",
        currentPlanOperation: "destroy",
        status: "SUCCESS"
      },
      hasUnsavedBaseline: true,
      preflightState: "idle"
    })
  );

  assert.equal(flow.activeStepId, "approval");
  assert.equal(flow.steps[1]?.state, "active");
});

test("an unchanged successful deployment returns to cleanup after reload", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      deployment: {
        approvedAt: "2026-07-16T00:00:00.000Z",
        currentPlanArtifactId: "apply-plan",
        currentPlanOperation: "apply",
        status: "SUCCESS"
      },
      hasUnsavedBaseline: false,
      preflightState: "idle"
    })
  );

  assert.equal(flow.activeStepId, "deployment");
  assert.equal(flow.steps[2]?.statusLabel, "배포 완료");
});

test("an approved plan returns to validation with an explicit revalidation status after a draft change", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      deployment: {
        approvedAt: "2026-07-16T00:00:00.000Z",
        currentPlanArtifactId: "apply-plan",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      hasUnsavedBaseline: true,
      preflightState: "idle"
    })
  );

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.statusLabel, "변경 후 재검증 필요");
});

test("save and validation actions depend on changes after a successful deployment", () => {
  assert.equal(
    shouldShowDeploymentValidationActions({
      deploymentStatus: "SUCCESS",
      hasUnsavedBaseline: false,
      preflightState: "idle"
    }),
    false
  );
  assert.equal(
    shouldShowDeploymentValidationActions({
      deploymentStatus: "SUCCESS",
      hasUnsavedBaseline: true,
      preflightState: "idle"
    }),
    true
  );
});

test("persisted draft revisions restore whether a successful deployment changed after reload", () => {
  assert.equal(
    hasDeploymentDraftChanges({
      currentDraftRevision: 7,
      hasUnsavedWorkspaceChanges: false,
      preparedDraftRevision: 7
    }),
    false
  );
  assert.equal(
    hasDeploymentDraftChanges({
      currentDraftRevision: 8,
      hasUnsavedWorkspaceChanges: false,
      preparedDraftRevision: 7
    }),
    true
  );
  assert.equal(
    hasDeploymentDraftChanges({
      currentDraftRevision: 7,
      hasUnsavedWorkspaceChanges: true,
      preparedDraftRevision: 7
    }),
    true
  );
});

test("an ECS application plan prepares the project build environment only until it is ready", () => {
  const deployment = {
    scope: "full_stack" as const,
    targetKind: "ecs_fargate" as const
  };

  assert.equal(requiresProjectBuildEnvironment(deployment), true);
  assert.equal(
    getDeploymentPlanActionLabel({
      buildEnvironmentStatus: null,
      deployment,
      isLoading: false
    }),
    "\uBE4C\uB4DC \uD658\uACBD \uC900\uBE44 \uD6C4 Plan \uC0DD\uC131"
  );
  assert.equal(
    getDeploymentPlanActionLabel({
      buildEnvironmentStatus: "ready",
      deployment,
      isLoading: false
    }),
    "Plan \uC0DD\uC131"
  );
});

test("infrastructure-only and non-ECS plans do not prepare an ECS build environment", () => {
  assert.equal(
    requiresProjectBuildEnvironment({ scope: "infrastructure", targetKind: "ecs_fargate" }),
    false
  );
  assert.equal(
    requiresProjectBuildEnvironment({ scope: "full_stack", targetKind: "lambda" }),
    false
  );
});

test("the Plan action names the build-environment work while the first request is running", () => {
  assert.equal(
    getDeploymentPlanActionLabel({
      buildEnvironmentStatus: "preparing",
      deployment: { scope: "application", targetKind: "ecs_fargate" },
      isLoading: true
    }),
    "\uBE4C\uB4DC \uD658\uACBD \uC900\uBE44 \uBC0F Plan \uC0DD\uC131 \uC911"
  );
});

test("failed apply cleanup uses its saved deployment snapshot instead of the current Board state", () => {
  const cleanupActions = {
    ...idleActions,
    canRunDestroyPlan: true,
    shouldShowDestroyPlanButton: true
  };
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: cleanupActions,
      deployment: {
        approvedAt: "2026-07-11T00:00:00.000Z",
        currentPlanArtifactId: "apply-plan",
        currentPlanOperation: "apply",
        status: "FAILED"
      },
      hasUnsavedBaseline: true,
      preflightState: "idle"
    })
  );

  assert.equal(flow.activeStepId, "deployment");
  assert.equal(flow.steps[0]?.state, "done");
  assert.equal(flow.steps[2]?.state, "active");
});

test("approved destroy cleanup keeps the execution step open when the current Board is unsaved", () => {
  const cleanupActions = {
    ...idleActions,
    shouldShowDestroyButton: true
  };
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: cleanupActions,
      deployment: {
        approvedAt: "2026-07-11T00:00:00.000Z",
        currentPlanArtifactId: "destroy-plan",
        currentPlanOperation: "destroy",
        status: "FAILED"
      },
      hasUnsavedBaseline: true,
      preflightState: "idle"
    })
  );

  assert.equal(flow.activeStepId, "deployment");
  assert.equal(flow.steps[0]?.state, "done");
  assert.equal(flow.steps[2]?.state, "error");
});

function createPreDeploymentAnalysis(
  overrides: Partial<AiPreDeploymentAnalysisResult> = {}
): AiPreDeploymentAnalysisResult {
  return {
    summary: "Pre-deployment result",
    totalMonthlyEstimate: {
      amount: 0,
      currency: "USD",
      pricingAssumption: "Test fixture"
    },
    resourceCostEstimates: [],
    findings: [],
    checklist: [],
    suggestions: [],
    ...overrides
  };
}
