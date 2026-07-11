import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDeploymentDuration, getDeploymentDurationLabel } from "./deployment-duration";

test("formatDeploymentDuration reports minutes and seconds", () => {
  assert.equal(formatDeploymentDuration(0), "0분 00초");
  assert.equal(formatDeploymentDuration(125_000), "2분 05초");
  assert.equal(formatDeploymentDuration(3_999), "0분 03초");
});

test("getDeploymentDurationLabel uses terminal timestamps and live time for running work", () => {
  const baseDeployment = {
    startedAt: "2026-07-10T09:00:00.000Z",
    completedAt: "2026-07-10T09:02:05.000Z",
    failedAt: null,
    cancelledAt: null,
    status: "SUCCESS" as const,
    updatedAt: "2026-07-10T09:02:05.000Z"
  };

  assert.equal(getDeploymentDurationLabel(baseDeployment), "2분 05초");
  assert.equal(
    getDeploymentDurationLabel(
      { ...baseDeployment, completedAt: null, status: "RUNNING", updatedAt: baseDeployment.startedAt },
      Date.parse("2026-07-10T09:00:07.000Z")
    ),
    "0분 07초"
  );
});
