import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiPreDeploymentAnalysisResult } from "@sketchcatch/types";
import {
  getDeploymentPlanActionLabel,
  getDirectDeploymentPreflightState,
  getDirectDeploymentFlow,
  requiresProjectBuildEnvironment,
  shouldStartQueuedApplyPlan,
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
    hasUnsavedBaseline: false,
    preflightState: "idle",
    requestState: "idle",
    ...overrides
  };
}

test("Direct Deployment exposes exactly validation, approval, and deployment", () => {
  const flow = getDirectDeploymentFlow(createInput({ hasUnsavedBaseline: true }));

  assert.deepEqual(flow.steps.map((step) => step.id), ["validation", "approval", "deployment"]);
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
    "빌드 환경 준비 후 Plan 생성"
  );
  assert.equal(
    getDeploymentPlanActionLabel({
      buildEnvironmentStatus: "ready",
      deployment,
      isLoading: false
    }),
    "Plan 생성"
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
    "빌드 환경 준비 및 Plan 생성 중"
  );
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

test("a queued deployment starts its apply plan after init returns to PENDING", () => {
  assert.equal(
    shouldStartQueuedApplyPlan({
      deployment: {
        id: "deployment-1",
        currentPlanArtifactId: null,
        status: "PENDING"
      },
      queuedDeploymentId: "deployment-1",
      requestState: "idle"
    }),
    true
  );
  assert.equal(
    shouldStartQueuedApplyPlan({
      deployment: {
        id: "deployment-1",
        currentPlanArtifactId: "plan-1",
        status: "PENDING"
      },
      queuedDeploymentId: "deployment-1",
      requestState: "idle"
    }),
    false
  );
  assert.equal(
    shouldStartQueuedApplyPlan({
      deployment: {
        id: "deployment-1",
        currentPlanArtifactId: null,
        status: "RUNNING"
      },
      queuedDeploymentId: "deployment-1",
      requestState: "idle"
    }),
    false
  );
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
