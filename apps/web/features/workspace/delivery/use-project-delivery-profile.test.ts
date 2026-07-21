import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectDeliveryProfile } from "@sketchcatch/types";
import {
  createProjectDeliveryProfileState,
  reduceProjectDeliveryProfileState
} from "./use-project-delivery-profile";

const profile = {
  readiness: { checkedAt: "2026-07-20T00:00:00.000Z" }
} as ProjectDeliveryProfile;

test("applies only the latest generation for the current project", () => {
  const loading = reduceProjectDeliveryProfileState(
    createProjectDeliveryProfileState("project-1"),
    { type: "start", projectId: "project-1", generation: 2 }
  );
  const stale = reduceProjectDeliveryProfileState(loading, {
    type: "success",
    projectId: "project-1",
    generation: 1,
    profile
  });
  const current = reduceProjectDeliveryProfileState(stale, {
    type: "success",
    projectId: "project-1",
    generation: 2,
    profile
  });

  assert.equal(stale.profile, null);
  assert.equal(stale.status, "loading");
  assert.equal(current.profile, profile);
  assert.equal(current.status, "idle");
});

test("clears the previous profile when a different project starts loading", () => {
  const previous = {
    ...createProjectDeliveryProfileState("project-1"),
    profile,
    status: "idle" as const
  };

  const next = reduceProjectDeliveryProfileState(previous, {
    type: "start",
    projectId: "project-2",
    generation: 1
  });

  assert.equal(next.projectId, "project-2");
  assert.equal(next.profile, null);
  assert.equal(next.status, "loading");
});

test("ignores an error response owned by an older request", () => {
  const loading = reduceProjectDeliveryProfileState(
    createProjectDeliveryProfileState("project-1"),
    { type: "start", projectId: "project-1", generation: 3 }
  );

  assert.deepEqual(
    reduceProjectDeliveryProfileState(loading, {
      type: "error",
      projectId: "project-1",
      generation: 2,
      errorMessage: "stale"
    }),
    loading
  );
});
