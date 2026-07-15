import assert from "node:assert/strict";
import test from "node:test";

import { getLiveObservationOutputUrl } from "./live-observation.js";

test("Live Observation uses the selected Deployment's successful Release Output URL", () => {
  const outputUrl = getLiveObservationOutputUrl("deployment-1", [
    {
      deploymentId: "deployment-2",
      status: "succeeded",
      outputUrl: "https://other.example.com",
      completedAt: "2026-07-15T00:02:00.000Z"
    },
    {
      deploymentId: "deployment-1",
      status: "failed",
      outputUrl: "https://failed.example.com",
      completedAt: "2026-07-15T00:01:00.000Z"
    },
    {
      deploymentId: "deployment-1",
      status: "succeeded",
      outputUrl: "https://app.example.com",
      completedAt: "2026-07-15T00:00:00.000Z"
    }
  ]);

  assert.equal(outputUrl, "https://app.example.com/");
});

test("Live Observation selects the newest safe HTTPS Output URL", () => {
  const outputUrl = getLiveObservationOutputUrl("deployment-1", [
    {
      deploymentId: "deployment-1",
      status: "succeeded",
      outputUrl: "https://app.example.com/previous",
      completedAt: "2026-07-15T00:00:00.000Z"
    },
    {
      deploymentId: "deployment-1",
      status: "succeeded",
      outputUrl: "https://app.example.com/latest",
      completedAt: "2026-07-15T00:02:00.000Z"
    }
  ]);

  assert.equal(outputUrl, "https://app.example.com/latest");
});

test("Live Observation rejects unsafe Release Output URLs", () => {
  const releases = [
    "http://app.example.com",
    "https://user:password@app.example.com",
    "https://app.example.com?token=secret",
    "https://app.example.com#fragment",
    "not-a-url"
  ].map((outputUrl) => ({
    deploymentId: "deployment-1",
    status: "succeeded",
    outputUrl,
    completedAt: "2026-07-15T00:00:00.000Z"
  }));

  assert.equal(getLiveObservationOutputUrl("deployment-1", releases), null);
});
