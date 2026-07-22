import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationV2Snapshot } from "@sketchcatch/types";
import { ApiClientError } from "../../lib/api-client";
import { streamLiveObservationSnapshots } from "./api";
import { getLiveObservationStreamErrorMessage } from "./live-observation-errors";

test("Live Observation stream failures retain safe request diagnostics", async (context) => {
  const originalFetch = globalThis.fetch;
  const abortController = new AbortController();
  let capturedError: unknown;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }

    return new Response(
      JSON.stringify({
        error: "LIVE_OBSERVATION_CACHE_UNAVAILABLE",
        message: "Live Observation cache is unavailable"
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-live-stream-503"
        }
      }
    );
  };

  await streamLiveObservationSnapshots({
    deploymentId: "deployment-id",
    observationId: "observation-id",
    signal: abortController.signal,
    onSnapshot: () => undefined,
    onError: (failure) => {
      capturedError = failure.error;
      abortController.abort();
    }
  });

  assert.ok(capturedError instanceof ApiClientError);
  assert.equal(capturedError.status, 503);
  assert.equal(capturedError.code, "LIVE_OBSERVATION_CACHE_UNAVAILABLE");
  assert.deepEqual(capturedError.requestContext, {
    method: "GET",
    path: "/api/deployments/deployment-id/live-observations/observation-id/stream",
    requestId: "req-live-stream-503"
  });

  const message = getLiveObservationStreamErrorMessage({
    error: capturedError,
    retryCount: 0,
    source: "stream"
  });
  assert.match(
    message,
    /GET \/api\/deployments\/deployment-id\/live-observations\/observation-id\/stream/u
  );
  assert.match(message, /HTTP 503/u);
  assert.match(message, /LIVE_OBSERVATION_CACHE_UNAVAILABLE/u);
  assert.match(message, /req-live-stream-503/u);
});

test("Live Observation reconnect delay resets after each successful stream snapshot", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const abortController = new AbortController();
  const retryDelays: number[] = [];
  const snapshot = activeSnapshot();

  context.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/stream")) {
      return new Response(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }
    return Response.json({ snapshot });
  };
  globalThis.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
    retryDelays.push(delay ?? 0);
    queueMicrotask(() => {
      if (typeof callback === "function") callback(...args);
      if (retryDelays.length === 3) abortController.abort();
    });
    return 1;
  }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof globalThis.clearTimeout;

  await streamLiveObservationSnapshots({
    deploymentId: "deployment-id",
    observationId: "observation-id",
    signal: abortController.signal,
    onSnapshot: () => undefined,
    retryBaseDelayMs: 1
  });

  assert.deepEqual(retryDelays, [1, 1, 1]);
});

function activeSnapshot(): LiveObservationV2Snapshot {
  const observedAt = "2026-07-22T00:00:00.000Z";
  return {
    observationId: "observation-id",
    status: "active",
    live: {
      acceptedEventCount: 1,
      observedAt,
      pressureLevel: "normal",
      pressurePercent: 1,
      projectedRequestsPerMinute: 1,
      rollingRequestsPerSecond: 1
    },
    latestObservation: null,
    terminalAt: null
  };
}
