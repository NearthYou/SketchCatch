import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import { createInMemoryLiveObservationStore } from "../live-observations/in-memory-live-observation-store.js";
import { createLiveObservationCapability } from "../live-observations/live-observation-capability.js";
import {
  createLiveObservationPublicCollector,
  LiveObservationPublicCollectorError,
  type LiveObservationPublicCollector
} from "../live-observations/live-observation-public-collector.js";
import { createLiveObservationPublicRequestRateLimiter } from "../live-observations/live-observation-public-request-rate-limiter.js";
import { createLiveObservationStoreContractInput } from "../live-observations/live-observation-store-contract.js";
import { registerLiveObservationPublicCollectorRoutes } from "./live-observation-public-collector.js";

const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const AUTHORIZATION = `LiveObservation current-key.${"a".repeat(43)}`;
const ORIGIN = "https://audience.example.com";
const NOW_MS = Date.parse("2026-07-11T00:00:00.000Z");

test("v2 collector route connects real capability verification to Store collection", async (t) => {
  const store = createInMemoryLiveObservationStore({ now: () => NOW_MS });
  const input = createLiveObservationStoreContractInput();
  const created = await store.createSession(input);
  assert.equal(created.kind, "created");
  if (created.kind !== "created") assert.fail("Expected created Store session");
  const capability = createLiveObservationCapability({
    keyring: {
      current: {
        kid: input.capability.kid,
        secret: Buffer.alloc(32, 0x41).toString("base64url")
      }
    },
    now: () => NOW_MS
  });
  const credential = capability.issue(
    {
      createdAt: created.session.createdAt,
      expiresAt: created.session.expiresAt,
      observationId: created.session.observationId,
      tokenVersion: created.session.capability.tokenVersion
    },
    created.evaluatedAt
  ).credential;
  const app = await createApp(
    createLiveObservationPublicCollector({
      capability,
      createTimeoutSignal: AbortSignal.timeout,
      fetch: async () => ({ status: 204 }),
      requestRateLimiter: createLiveObservationPublicRequestRateLimiter({
        now: () => NOW_MS,
        runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null, now: () => NOW_MS })
      }),
      store
    })
  );
  t.after(() => app.close());

  const first = await app.inject({
    method: "POST",
    url: `/live-observations/public/${input.observationId}/events`,
    headers: {
      authorization: `LiveObservation ${credential}`,
      origin: ORIGIN
    },
    payload: { eventId: EVENT_ID }
  });
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json(), { accepted: true, acceptedEventCount: 1 });

  await store.stopSession({
    deploymentId: input.manifest.provenance.deploymentId,
    observationId: input.observationId
  });
  const gone = await app.inject({
    method: "POST",
    url: `/live-observations/public/${input.observationId}/events`,
    headers: {
      authorization: `LiveObservation ${credential}`,
      origin: ORIGIN
    },
    payload: { eventId: "33333333-3333-4333-8333-333333333333" }
  });
  assert.equal(gone.statusCode, 410);
});

test("v2 collector route applies exact CORS and preserves accepted/duplicate semantics", async (t) => {
  let accepted = false;
  const collector = createCollector({
    async collectEvent() {
      if (accepted) return { accepted: false, acceptedEventCount: 1 };
      accepted = true;
      return { accepted: true, acceptedEventCount: 1 };
    }
  });
  const app = await createApp(collector);
  t.after(() => app.close());

  const preflight = await app.inject({
    method: "OPTIONS",
    url: `/live-observations/public/${OBSERVATION_ID}/events`,
    headers: { origin: ORIGIN }
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], ORIGIN);
  assert.equal(preflight.headers["access-control-allow-methods"], "POST,OPTIONS");
  assert.equal(preflight.headers["access-control-allow-headers"], "authorization,content-type");
  assert.equal(preflight.headers.vary, "Origin");

  const first = await collect(app);
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json(), { accepted: true, acceptedEventCount: 1 });
  assert.equal(first.headers["access-control-allow-origin"], ORIGIN);

  const duplicate = await collect(app);
  assert.equal(duplicate.statusCode, 200);
  assert.deepEqual(duplicate.json(), { accepted: false, acceptedEventCount: 1 });
});

test("v2 collector authenticates before body validation and enforces a 1 KiB body limit", async (t) => {
  let authorizeCalls = 0;
  let collectCalls = 0;
  const collector = createCollector({
    async authorize() {
      authorizeCalls += 1;
      const collectEvent = async () => {
        collectCalls += 1;
        return { accepted: true, acceptedEventCount: 1 };
      };
      return {
        audienceOrigin: ORIGIN,
        collectEvent,
        request: async () => collectEvent()
      };
    }
  });
  const app = await createApp(collector);
  t.after(() => app.close());

  const malformed = await app.inject({
    method: "POST",
    url: `/live-observations/public/${OBSERVATION_ID}/events`,
    headers: { authorization: AUTHORIZATION, origin: ORIGIN },
    payload: { count: 1 }
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(authorizeCalls, 1);
  assert.equal(collectCalls, 0);

  const invalidJson = await app.inject({
    method: "POST",
    url: `/live-observations/public/${OBSERVATION_ID}/events`,
    headers: {
      authorization: AUTHORIZATION,
      "content-type": "application/json",
      origin: ORIGIN
    },
    payload: "{"
  });
  assert.equal(invalidJson.statusCode, 400);
  assert.deepEqual(invalidJson.json(), {
    error: "LIVE_OBSERVATION_COLLECTOR_BAD_REQUEST",
    message: "Live Observation collector request failed"
  });
  assert.equal(authorizeCalls, 2);
  assert.equal(collectCalls, 0);

  const oversized = await app.inject({
    method: "POST",
    url: `/live-observations/public/${OBSERVATION_ID}/events`,
    headers: {
      authorization: AUTHORIZATION,
      "content-type": "application/json",
      origin: ORIGIN
    },
    payload: JSON.stringify({ eventId: EVENT_ID, padding: "x".repeat(1_024) })
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(collectCalls, 0);
});

test("v2 collector route maps public failures to fixed generic statuses", async (t) => {
  const cases = [
    ["unauthorized", 401],
    ["forbidden_origin", 403],
    ["not_found", 404],
    ["gone", 410],
    ["rate_limited", 429],
    ["unavailable", 503]
  ] as const;

  for (const [code, status] of cases) {
    const app = await createApp(
      createCollector({
        async authorize() {
          throw new LiveObservationPublicCollectorError(code);
        }
      })
    );
    t.after(() => app.close());
    const response = await collect(app);
    assert.equal(response.statusCode, status, code);
    assert.deepEqual(response.json(), {
      error: `LIVE_OBSERVATION_COLLECTOR_${code.toUpperCase()}`,
      message: "Live Observation collector request failed"
    });
  }
});

test("v2 public bootstrap returns a transient credential with no-store caching", async (t) => {
  const app = await createApp(
    createCollector({
      async bootstrap() {
        return {
          audienceOrigin: ORIGIN,
          credential: `current-key.${"b".repeat(43)}`
        };
      }
    })
  );
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/live-observations/public/${OBSERVATION_ID}/bootstrap`,
    headers: { origin: ORIGIN }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["access-control-allow-origin"], ORIGIN);
  assert.deepEqual(response.json(), {
    credential: `current-key.${"b".repeat(43)}`
  });
});

test("v2 public request uses the server-observed IP and the authorized safe request path", async (t) => {
  let requestInput: { eventId: string; ipAddress: string } | null = null;
  const app = await createApp(
    createCollector({
      async authorize() {
        return {
          audienceOrigin: ORIGIN,
          collectEvent: async () => ({ accepted: true, acceptedEventCount: 1 }),
          async request(input) {
            requestInput = input;
            return { accepted: true, acceptedEventCount: 1 };
          }
        };
      }
    })
  );
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/live-observations/public/${OBSERVATION_ID}/requests`,
    headers: { authorization: AUTHORIZATION, origin: ORIGIN },
    payload: { eventId: EVENT_ID },
    remoteAddress: "203.0.113.10"
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(requestInput, {
    eventId: EVENT_ID,
    ipAddress: "203.0.113.10"
  });
});

test("disabled v2 public plugin registers no bootstrap, request, or collector route", async (t) => {
  const app = Fastify();
  await app.register(registerLiveObservationPublicCollectorRoutes, {
    collector: createCollector(),
    enabled: false
  });
  await app.ready();
  t.after(() => app.close());

  for (const path of ["bootstrap", "requests", "events"]) {
    const response = await app.inject({
      method: "POST",
      url: `/live-observations/public/${OBSERVATION_ID}/${path}`,
      headers: { origin: ORIGIN }
    });
    assert.equal(response.statusCode, 404);
  }
});

async function createApp(collector: LiveObservationPublicCollector) {
  const app = Fastify();
  await app.register(registerLiveObservationPublicCollectorRoutes, {
    collector,
    enabled: true
  });
  await app.ready();
  return app;
}

function createCollector(
  overrides: Partial<LiveObservationPublicCollector> & {
    collectEvent?: (eventId: string) => Promise<{
      accepted: boolean;
      acceptedEventCount: number;
    }>;
  } = {}
): LiveObservationPublicCollector {
  return {
    async authorize() {
      const collectEvent =
        overrides.collectEvent ?? (async () => ({ accepted: true, acceptedEventCount: 1 }));
      return {
        audienceOrigin: ORIGIN,
        collectEvent,
        request: async ({ eventId }) => collectEvent(eventId)
      };
    },
    async preflight() {
      return { audienceOrigin: ORIGIN };
    },
    async bootstrap() {
      return {
        audienceOrigin: ORIGIN,
        credential: `current-key.${"b".repeat(43)}`
      };
    },
    ...overrides
  } as LiveObservationPublicCollector;
}

function collect(app: Awaited<ReturnType<typeof createApp>>) {
  return app.inject({
    method: "POST",
    url: `/live-observations/public/${OBSERVATION_ID}/events`,
    headers: { authorization: AUTHORIZATION, origin: ORIGIN },
    payload: { eventId: EVENT_ID }
  });
}
