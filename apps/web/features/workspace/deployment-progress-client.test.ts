import assert from "node:assert/strict";
import test from "node:test";
import type { DeploymentProgressSnapshot } from "@sketchcatch/types";
import { getDeploymentProgressSnapshot } from "./api";

test("deployment progress client requests the read-only endpoint with cancellation", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const controller = new AbortController();
  const expected = createProgressSnapshot();
  let requestedUrl = "";
  let requestedCache: RequestCache | undefined;
  let requestedSignal: AbortSignal | null | undefined;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedCache = init?.cache;
    requestedSignal = init?.signal;
    return new Response(JSON.stringify({ progress: expected }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  };

  const progress = await getDeploymentProgressSnapshot("deployment/one", controller.signal);

  assert.match(requestedUrl, /\/deployments\/deployment%2Fone\/progress$/);
  assert.equal(requestedCache, "no-store");
  assert.equal(requestedSignal, controller.signal);
  assert.deepEqual(progress, expected);
});

function createProgressSnapshot(): DeploymentProgressSnapshot {
  return {
    activeStage: "apply",
    deploymentId: "deployment/one",
    failureStage: null,
    measurement: {
      kind: "resource_count",
      completedUnits: 1,
      totalUnits: 2,
      percent: 50
    },
    status: "RUNNING",
    updatedAt: "2026-07-20T10:00:00.000Z"
  };
}
