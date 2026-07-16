import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginDeploymentHistoryDetailsLoad,
  completeDeploymentHistoryDetailsLoad,
  failDeploymentHistoryDetailsLoad
} from "./deployment-history-details";

test("a stale version response cannot replace the newly selected version", () => {
  const firstRequest = beginDeploymentHistoryDetailsLoad("deployment-1");
  const secondRequest = beginDeploymentHistoryDetailsLoad("deployment-2");
  const staleCompletion = completeDeploymentHistoryDetailsLoad(secondRequest, {
    deploymentId: firstRequest.deploymentId,
    logs: [],
    outputs: [],
    resources: []
  });

  assert.equal(staleCompletion, secondRequest);
  assert.equal(staleCompletion.deploymentId, "deployment-2");
  assert.equal(staleCompletion.requestState, "loading");
});

test("a selected version detail failure remains separate and visible", () => {
  const loading = beginDeploymentHistoryDetailsLoad("deployment-2");
  const failed = failDeploymentHistoryDetailsLoad(loading, {
    deploymentId: "deployment-2",
    errorMessage: "배포 버전 상세를 불러오지 못했습니다."
  });

  assert.equal(failed.requestState, "error");
  assert.equal(failed.errorMessage, "배포 버전 상세를 불러오지 못했습니다.");
  assert.deepEqual(failed.logs, []);
  assert.deepEqual(failed.resources, []);
  assert.deepEqual(failed.outputs, []);
});
