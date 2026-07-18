import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyInterruptedReleaseSteps,
  isRecoveryBaselineForDeploymentTarget
} from "./github-release-run-recovery.js";

test("restart recovery rolls ECS back when activation started before frontend activation", () => {
  assert.deepEqual(
    classifyInterruptedReleaseSteps([
      { step: "runtime_verification", status: "succeeded" },
      { step: "ecs_activation", status: "running" }
    ]),
    {
      ecsActivationStarted: true,
      frontendActivationStarted: false,
      failureStage: "frontend_activation"
    }
  );
});

test("restart recovery preserves ECS and reports partial cancellation once index activation may have started", () => {
  assert.deepEqual(
    classifyInterruptedReleaseSteps([
      { step: "ecs_activation", status: "succeeded" },
      { step: "ecs_health", status: "succeeded" },
      { step: "frontend_activation", status: "running" },
      { step: "cloudfront_invalidation", status: "running" }
    ]),
    {
      ecsActivationStarted: true,
      frontendActivationStarted: true,
      failureStage: "cloudfront_invalidation"
    }
  );
});

test("restart recovery never reuses a rollback baseline from a replaced deployment target", () => {
  assert.equal(
    isRecoveryBaselineForDeploymentTarget(
      { deploymentTargetFingerprint: "a".repeat(64) },
      { deploymentTargetFingerprint: "b".repeat(64) }
    ),
    false
  );
  assert.equal(
    isRecoveryBaselineForDeploymentTarget(
      { deploymentTargetFingerprint: "a".repeat(64) },
      { deploymentTargetFingerprint: "a".repeat(64) }
    ),
    true
  );
});
