import assert from "node:assert/strict";
import test from "node:test";
import {
  createLiveObservationViewState,
  readLiveObservationViewState,
  selectLiveObservationDeployment,
  storeLiveObservationViewport
} from "./live-observation-view-state";

test("Live Observation re-entry preserves the selected Deployment and viewport per project", () => {
  let state = createLiveObservationViewState("project-1");

  state = selectLiveObservationDeployment(state, "project-1", "deployment-1");
  state = storeLiveObservationViewport(state, "project-1", "deployment-1", {
    x: 120,
    y: 48,
    zoom: 0.85
  });

  assert.deepEqual(readLiveObservationViewState(state, "project-1"), {
    selectedDeploymentId: "deployment-1",
    viewport: { x: 120, y: 48, zoom: 0.85 }
  });
  assert.deepEqual(readLiveObservationViewState(state, "project-2"), {
    selectedDeploymentId: "",
    viewport: null
  });
});
