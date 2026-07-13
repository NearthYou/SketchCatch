import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type {
  CreateLiveObservationV2Response,
  LiveObservationV2SnapshotResponse
} from "@sketchcatch/types";
import {
  LiveObservationV2ServiceError,
  type LiveObservationV2Service
} from "../live-observations/live-observation-v2-service.js";
import { registerLiveObservationV2Routes } from "./live-observations-v2.js";

const DEPLOYMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";

test("v2 authenticated routes prepare create and authorize read and stop", async (t) => {
  const calls: string[] = [];
  const app = Fastify();
  await app.register(registerLiveObservationV2Routes, {
    enabled: true,
    liveObservationService: createService(calls),
    async prepareDeploymentManifest(_request, deploymentId) {
      calls.push(`prepare:${deploymentId}`);
    },
    async requireDeploymentAccess(_request, deploymentId) {
      calls.push(`access:${deploymentId}`);
    },
    async refreshObservation(_request, deploymentId, observationId) {
      calls.push(`refresh:${deploymentId}:${observationId}`);
    }
  });
  await app.ready();
  t.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: `/deployments/${DEPLOYMENT_ID}/live-observations`
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().session.audienceUrl, `https://sketchcatch.example.com/observe/${OBSERVATION_ID}`);

  const read = await app.inject({
    method: "GET",
    url: `/deployments/${DEPLOYMENT_ID}/live-observations/${OBSERVATION_ID}`
  });
  assert.equal(read.statusCode, 200);

  const stopped = await app.inject({
    method: "POST",
    url: `/deployments/${DEPLOYMENT_ID}/live-observations/${OBSERVATION_ID}/stop`
  });
  assert.equal(stopped.statusCode, 200);
  assert.deepEqual(calls, [
    `prepare:${DEPLOYMENT_ID}`,
    `create:${DEPLOYMENT_ID}`,
    `access:${DEPLOYMENT_ID}`,
    `refresh:${DEPLOYMENT_ID}:${OBSERVATION_ID}`,
    `read:${DEPLOYMENT_ID}:${OBSERVATION_ID}`,
    `access:${DEPLOYMENT_ID}`,
    `stop:${DEPLOYMENT_ID}:${OBSERVATION_ID}`
  ]);
});

test("v2 authenticated stream emits a snapshot and closes in once mode", async (t) => {
  const app = Fastify();
  await app.register(registerLiveObservationV2Routes, {
    enabled: true,
    liveObservationService: createService([]),
    async prepareDeploymentManifest() {},
    async requireDeploymentAccess() {},
    async refreshObservation() {}
  });
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/deployments/${DEPLOYMENT_ID}/live-observations/${OBSERVATION_ID}/stream?once=true`
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/event-stream/);
  assert.match(response.body, /event: snapshot/);
  assert.match(response.body, new RegExp(OBSERVATION_ID));
});

test("v2 authenticated GET maps observer Store outages to a stable sanitized 503", async (t) => {
  const app = Fastify();
  await app.register(registerLiveObservationV2Routes, {
    enabled: true,
    liveObservationService: createService([]),
    async prepareDeploymentManifest() {},
    async requireDeploymentAccess() {},
    async refreshObservation() {
      throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_CACHE_UNAVAILABLE");
    }
  });
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/deployments/${DEPLOYMENT_ID}/live-observations/${OBSERVATION_ID}`
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: "LIVE_OBSERVATION_CACHE_UNAVAILABLE",
    message: "Live Observation session request failed"
  });
});

test("v2 authenticated SSE emits one sanitized error event for observer Store outages", async (t) => {
  const app = Fastify();
  await app.register(registerLiveObservationV2Routes, {
    enabled: true,
    liveObservationService: createService([]),
    async prepareDeploymentManifest() {},
    async requireDeploymentAccess() {},
    async refreshObservation() {
      throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_CACHE_UNAVAILABLE");
    }
  });
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/deployments/${DEPLOYMENT_ID}/live-observations/${OBSERVATION_ID}/stream?once=true`
  });

  assert.equal(response.statusCode, 200);
  assert.equal((response.body.match(/event: error/g) ?? []).length, 1);
  assert.match(response.body, /LIVE_OBSERVATION_CACHE_UNAVAILABLE/);
  assert.doesNotMatch(response.body, /stack|Store unavailable|internal/i);
});

test("disabled v2 authenticated plugin registers no live observation routes", async (t) => {
  const app = Fastify();
  await app.register(registerLiveObservationV2Routes, {
    enabled: false,
    liveObservationService: createService([]),
    async prepareDeploymentManifest() {},
    async requireDeploymentAccess() {},
    async refreshObservation() {}
  });
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/deployments/${DEPLOYMENT_ID}/live-observations`
  });
  assert.equal(response.statusCode, 404);
});

function createService(calls: string[]): LiveObservationV2Service {
  return {
    async createSession(deploymentId) {
      calls.push(`create:${deploymentId}`);
      return createResponse();
    },
    async readSession(deploymentId, observationId) {
      calls.push(`read:${deploymentId}:${observationId}`);
      return createSnapshotResponse();
    },
    async stopSession(deploymentId, observationId) {
      calls.push(`stop:${deploymentId}:${observationId}`);
      return createSnapshotResponse("stopped");
    }
  };
}

function createResponse(): CreateLiveObservationV2Response {
  return {
    session: {
      id: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID,
      status: "active",
      audienceUrl: `https://sketchcatch.example.com/observe/${OBSERVATION_ID}`,
      createdAt: "2026-07-11T00:00:00.000Z",
      expiresAt: "2026-07-11T00:15:00.000Z"
    },
    ...createSnapshotResponse()
  };
}

function createSnapshotResponse(
  status: "active" | "stopped" = "active"
): LiveObservationV2SnapshotResponse {
  return {
    snapshot: {
      observationId: OBSERVATION_ID,
      status,
      live: {
        acceptedEventCount: 0,
        rollingRequestsPerSecond: 0,
        projectedRequestsPerMinute: 0,
        pressurePercent: 0,
        pressureLevel: "normal",
        observedAt: "2026-07-11T00:00:00.000Z"
      },
      latestObservation: null,
      terminalAt: status === "active" ? null : "2026-07-11T00:01:00.000Z"
    }
  };
}
