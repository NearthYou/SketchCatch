import assert from "node:assert/strict";
import { test } from "node:test";
import { getDeploymentStatusLabel, getDeploymentTone } from "./dashboard-overview-parts";

test("deployment status keeps success, failure, and running visually distinct", () => {
  const statuses = ["SUCCESS", "FAILED", "RUNNING"] as const;

  assert.deepEqual(
    statuses.map((status) => ({
      label: getDeploymentStatusLabel(status),
      tone: getDeploymentTone(status)
    })),
    [
      { label: "성공", tone: "success" },
      { label: "실패", tone: "error" },
      { label: "진행 중", tone: "progress" }
    ]
  );
});
