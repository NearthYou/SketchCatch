import assert from "node:assert/strict";
import test from "node:test";

import {
  getEligibleLiveObservationDeployments,
  getLiveObservationOutputUrl,
  getSelectedLiveObservationOutputUrl
} from "./live-observation.js";

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

test("Live Observation falls back to the selected infrastructure Deployment CloudFront Output", () => {
  const outputUrl = getLiveObservationOutputUrl("deployment-1", [], [
    {
      id: "output-1",
      deploymentId: "deployment-1",
      name: "cloudfront_url",
      value: "https://d111111abcdef8.cloudfront.net",
      sensitive: false,
      createdAt: "2026-07-16T11:03:55.301Z"
    }
  ]);

  assert.equal(outputUrl, "https://d111111abcdef8.cloudfront.net/");
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

test("CI/CD Live Observation keeps the exact selected run URL and deployment", () => {
  const releases = [
    {
      deploymentId: "deployment-1",
      status: "succeeded",
      outputUrl: "https://newer.example.com",
      completedAt: "2026-07-15T00:05:00.000Z"
    }
  ];
  const selection = {
    runId: "run-1",
    deploymentId: "deployment-1",
    outputUrl: "https://selected.cloudfront.net"
  };

  assert.equal(
    getSelectedLiveObservationOutputUrl(selection, "deployment-1", releases),
    "https://selected.cloudfront.net/"
  );
  assert.equal(getSelectedLiveObservationOutputUrl(selection, "deployment-2", releases), null);
});

test("Live Observation keeps the CloudFront URL and deployment selectable during frontend partial states", () => {
  const deployments = getEligibleLiveObservationDeployments([
    { id: "failed", status: "FAILED", completedAt: "2026-07-15T00:00:00.000Z" },
    {
      id: "partial-failed",
      status: "PARTIALLY_FAILED",
      completedAt: "2026-07-15T00:01:00.000Z"
    },
    {
      id: "partial-cancelled",
      status: "PARTIALLY_CANCELED",
      completedAt: "2026-07-15T00:02:00.000Z"
    }
  ]);

  assert.deepEqual(deployments.map((deployment) => deployment.id), [
    "partial-cancelled",
    "partial-failed"
  ]);
  assert.equal(
    getLiveObservationOutputUrl("partial-failed", [
      {
        deploymentId: "partial-failed",
        status: "partially_failed",
        outputUrl: "https://d111111abcdef8.cloudfront.net",
        completedAt: "2026-07-15T00:01:00.000Z"
      }
    ]),
    "https://d111111abcdef8.cloudfront.net/"
  );
});
