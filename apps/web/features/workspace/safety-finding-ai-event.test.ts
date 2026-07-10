import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckFinding } from "@sketchcatch/types";
import {
  WORKSPACE_SAFETY_FINDING_AI_EVENT,
  createWorkspaceSafetyFindingAiEventDetail
} from "./safety-finding-ai-event";

test("createWorkspaceSafetyFindingAiEventDetail keeps the finding payload and timestamp", () => {
  const finding = createFinding();
  const detail = createWorkspaceSafetyFindingAiEventDetail(finding, "2026-07-04T00:00:00.000Z");

  assert.equal(WORKSPACE_SAFETY_FINDING_AI_EVENT, "sketchcatch:safety-finding-ai-open");
  assert.equal(detail.finding, finding);
  assert.equal(detail.requestedAt, "2026-07-04T00:00:00.000Z");
});

function createFinding(): CheckFinding {
  return {
    id: "security-open-ssh-sg-app",
    category: "security",
    severity: "high",
    resourceId: "sg-app",
    title: "SSH is open",
    description: "Port 22 allows public access",
    recommendation: "Restrict SSH CIDR"
  };
}
