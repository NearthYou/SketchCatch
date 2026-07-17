import assert from "node:assert/strict";
import test from "node:test";

import { resolveAllowedCandidateStatuses } from "./trusted-release-step-repository.js";

test("terminal candidate recovery accepts pending and idempotent terminal states", () => {
  assert.deepEqual(resolveAllowedCandidateStatuses("failed"), [
    "pending",
    "activating",
    "partially_failed",
    "failed"
  ]);
  assert.deepEqual(resolveAllowedCandidateStatuses("cancelled"), [
    "pending",
    "activating",
    "partially_failed",
    "cancelled"
  ]);
});

test("candidate activation and success keep their strict forward-only transitions", () => {
  assert.deepEqual(resolveAllowedCandidateStatuses("activating"), ["pending"]);
  assert.deepEqual(resolveAllowedCandidateStatuses("succeeded"), ["activating"]);
});
