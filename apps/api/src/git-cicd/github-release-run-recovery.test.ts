import assert from "node:assert/strict";
import test from "node:test";
import { classifyInterruptedReleaseSteps } from "./github-release-run-recovery.js";

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
