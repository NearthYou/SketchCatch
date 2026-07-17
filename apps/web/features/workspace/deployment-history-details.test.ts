import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginDeploymentHistoryDetailsLoad,
  completeDeploymentHistoryDetailsLoad,
  failDeploymentHistoryDetailsLoad,
  selectDeploymentLogView
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

test("the current deployment logs replace stale history logs while a new run is active", () => {
  const currentLogs = [{ id: "current-log" }] as never[];
  const historyLogs = [{ id: "history-log" }] as never[];

  const view = selectDeploymentLogView({
    currentDeploymentId: "deployment-current",
    currentLogs,
    historyDeploymentId: "deployment-history",
    historyErrorMessage: "history failed",
    historyIsLoading: true,
    historyLogs
  });

  assert.equal(view.source, "current");
  assert.equal(view.logs, currentLogs);
  assert.equal(view.errorMessage, "");
  assert.equal(view.isLoading, false);
});

test("a selected successful version keeps its history logs", () => {
  const currentLogs = [{ id: "current-log" }] as never[];
  const historyLogs = [{ id: "history-log" }] as never[];

  const view = selectDeploymentLogView({
    currentDeploymentId: "deployment-history",
    currentLogs,
    historyDeploymentId: "deployment-history",
    historyErrorMessage: "",
    historyIsLoading: false,
    historyLogs
  });

  assert.equal(view.source, "history");
  assert.equal(view.logs, historyLogs);
});
