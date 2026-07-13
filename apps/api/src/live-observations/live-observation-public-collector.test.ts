import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";
import { createLiveObservationCapability } from "./live-observation-capability.js";
import {
  createLiveObservationPublicCollector,
  LiveObservationPublicCollectorError
} from "./live-observation-public-collector.js";
import { createLiveObservationPublicRequestRateLimiter } from "./live-observation-public-request-rate-limiter.js";
import { createLiveObservationStoreContractInput } from "./live-observation-store-contract.js";
import type { LiveObservationStore } from "./live-observation-store.js";

const NOW_MS = Date.parse("2026-07-11T00:00:00.000Z");
const SECRET = Buffer.alloc(32, 0x31).toString("base64url");
const EVENT_ID = "00000000-0000-4000-8000-000000000001";

test("public collector authenticates Store-bound claims before requesting and accepting one receipt", async () => {
  const fixture = await createFixture();
  const authorized = await fixture.collector.authorize({
    authorization: `LiveObservation ${fixture.credential}`,
    observationId: fixture.input.observationId,
    origin: "https://audience.example.com"
  });

  assert.equal(authorized.audienceOrigin, "https://audience.example.com");
  assert.deepEqual(await authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }), {
    accepted: true,
    acceptedEventCount: 1
  });
  assert.deepEqual(await authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }), {
    accepted: false,
    acceptedEventCount: 1
  });
});

test("authorized public request revalidates the traffic target immediately before transport", async () => {
  let transportCalls = 0;
  let corruptReread = false;
  const fixture = await createFixture(
    (store) => ({
      ...store,
      async readSession(input) {
        const result = await store.readSession(input);
        if (corruptReread && result.kind === "active") {
          result.session.manifest.endpoints.trafficUrl =
            "https://169.254.169.254/latest/meta-data";
        }
        return result;
      }
    }),
    {
      async post() {
        transportCalls += 1;
        return { status: 204 };
      }
    }
  );
  const authorized = await authorize(fixture);
  corruptReread = true;

  await assertCollectorError(
    () => authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
    "unavailable"
  );
  assert.equal(transportCalls, 0);
});

test("authorized public request passes only the current Store manifest to transport before receipt", async () => {
  const transportCalls: unknown[] = [];
  const fixture = await createFixture(undefined, {
    async post(manifest) {
      transportCalls.push(manifest);
      return { status: 204 };
    }
  });
  const authorized = await authorize(fixture);

  assert.deepEqual(
    await authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
    { accepted: true, acceptedEventCount: 1 }
  );
  assert.deepEqual(transportCalls, [fixture.input.manifest]);
});

test("authorized public request returns one generic error and accepts no receipt for redirect, timeout, or non-2xx", async () => {
  const cases = [
    async () => ({ status: 302 }),
    async () => ({ status: 503 }),
    async () => {
      throw new DOMException("request timed out", "TimeoutError");
    }
  ];

  for (const post of cases) {
    const fixture = await createFixture(undefined, { post });
    const authorized = await authorize(fixture);

    await assertCollectorError(
      () => authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
      "unavailable"
    );
    const read = await fixture.store.readSession({ observationId: fixture.input.observationId });
    assert.equal(read.kind, "active");
    if (read.kind === "active") assert.equal(read.session.live.acceptedEventCount, 0);
  }
});

test("authorized public request rechecks a stopped Store session before transport", async () => {
  let transportCalls = 0;
  const fixture = await createFixture(undefined, {
    async post() {
      transportCalls += 1;
      return { status: 204 };
    }
  });
  const authorized = await authorize(fixture);
  const stopped = await fixture.store.stopSession({
    deploymentId: fixture.input.manifest.provenance.deploymentId,
    observationId: fixture.input.observationId
  });
  assert.equal(stopped.kind, "stopped");

  await assertCollectorError(
    () => authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
    "gone"
  );
  assert.equal(transportCalls, 0);
});

test("authorized public request rechecks exact Store expiry before transport", async () => {
  let nowMs = NOW_MS;
  let transportCalls = 0;
  const fixture = await createFixture(undefined, {
    async post() {
      transportCalls += 1;
      return { status: 204 };
    },
    now: () => nowMs
  });
  const authorized = await authorize(fixture);
  nowMs = Date.parse(fixture.created.session.expiresAt);

  await assertCollectorError(
    () => authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
    "gone"
  );
  assert.equal(transportCalls, 0);
});

test("authorized public request refuses missing and unavailable Store rereads before transport", async () => {
  for (const failure of ["not_found", "unavailable"] as const) {
    let failReread = false;
    let transportCalls = 0;
    const fixture = await createFixture(
      (store) => ({
        ...store,
        async readSession(input) {
          if (!failReread) return store.readSession(input);
          if (failure === "not_found") {
            return {
              kind: "not_found" as const,
              evaluatedAt: new Date(NOW_MS).toISOString()
            };
          }
          throw new Error("redis unavailable probe");
        }
      }),
      {
        async post() {
          transportCalls += 1;
          return { status: 204 };
        }
      }
    );
    const authorized = await authorize(fixture);
    failReread = true;

    await assertCollectorError(
      () => authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
      failure
    );
    assert.equal(transportCalls, 0);
  }
});

test("authorized public request cannot follow a replacement session with the same observation ID", async () => {
  let nowMs = NOW_MS;
  let transportCalls = 0;
  const fixture = await createFixture(undefined, {
    async post() {
      transportCalls += 1;
      return { status: 204 };
    },
    now: () => nowMs
  });
  const authorized = await authorize(fixture);
  assert.equal(
    (
      await fixture.store.stopSession({
        deploymentId: fixture.input.manifest.provenance.deploymentId,
        observationId: fixture.input.observationId
      })
    ).kind,
    "stopped"
  );
  nowMs += 60_000;
  assert.equal((await fixture.store.createSession(fixture.input)).kind, "created");

  await assertCollectorError(
    () => authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
    "gone"
  );
  assert.equal(transportCalls, 0);
});

test("public collector rejects invalid capability and origin without Store mutation", async () => {
  const fixture = await createFixture();

  await assertCollectorError(
    () =>
      fixture.collector.authorize({
        authorization: `LiveObservation ${fixture.credential.slice(0, -1)}A`,
        observationId: fixture.input.observationId,
        origin: "https://audience.example.com"
      }),
    "unauthorized"
  );
  await assertCollectorError(
    () =>
      fixture.collector.authorize({
        authorization: `LiveObservation ${fixture.credential}`,
        observationId: fixture.input.observationId,
        origin: "https://evil.example.com"
      }),
    "forbidden_origin"
  );

  const read = await fixture.store.readSession({
    observationId: fixture.input.observationId
  });
  assert.equal(read.kind, "active");
  if (read.kind === "active") assert.equal(read.session.live.acceptedEventCount, 0);
});

test("public collector exposes exact-origin preflight without capability", async () => {
  const fixture = await createFixture();

  assert.deepEqual(
    await fixture.collector.preflight({
      observationId: fixture.input.observationId,
      origin: "https://audience.example.com"
    }),
    { audienceOrigin: "https://audience.example.com" }
  );
  await assertCollectorError(
    () =>
      fixture.collector.preflight({
        observationId: fixture.input.observationId,
        origin: "https://app.example.com"
      }),
    "forbidden_origin"
  );
});

test("public collector bootstrap regenerates a Store-bound capability only for the exact audience origin", async () => {
  const fixture = await createFixture();

  const bootstrap = await fixture.collector.bootstrap({
    observationId: fixture.input.observationId,
    origin: "https://audience.example.com"
  });

  assert.equal(bootstrap.audienceOrigin, "https://audience.example.com");
  assert.equal(
    fixture.capability.verify(
      bootstrap.credential,
      {
        createdAt: fixture.created.session.createdAt,
        expiresAt: fixture.created.session.expiresAt,
        kid: fixture.created.session.capability.kid,
        observationId: fixture.created.session.observationId,
        tokenVersion: fixture.created.session.capability.tokenVersion
      },
      fixture.created.evaluatedAt
    ),
    true
  );
  await assertCollectorError(
    () =>
      fixture.collector.bootstrap({
        observationId: fixture.input.observationId,
        origin: "https://evil.example.com"
      }),
    "forbidden_origin"
  );
});

test("public collector maps real Store terminal, missing, and unavailable reads", async () => {
  const cases = [
    {
      code: "gone" as const,
      readSession: async () => ({
        kind: "terminal" as const,
        evaluatedAt: new Date(NOW_MS).toISOString(),
        session: {
          observationId: "11111111-1111-4111-8111-111111111111",
          deploymentId: "22222222-2222-4222-8222-222222222222",
          status: "stopped" as const,
          createdAt: new Date(NOW_MS).toISOString(),
          expiresAt: new Date(NOW_MS + 900_000).toISOString(),
          terminalAt: new Date(NOW_MS).toISOString(),
          finalLive: {
            acceptedEventCount: 0,
            rollingRequestsPerSecond: 0,
            projectedRequestsPerMinute: 0,
            pressurePercent: 0,
            pressureLevel: "normal" as const,
            observedAt: new Date(NOW_MS).toISOString()
          },
          finalObservation: null
        }
      })
    },
    {
      code: "not_found" as const,
      readSession: async () => ({
        kind: "not_found" as const,
        evaluatedAt: new Date(NOW_MS).toISOString()
      })
    },
    {
      code: "unavailable" as const,
      readSession: async () => {
        throw new Error("redis unavailable probe");
      }
    }
  ];

  for (const item of cases) {
    const fixture = await createFixture((store) => ({
      ...store,
      readSession: item.readSession
    }));
    await assertCollectorError(
      () =>
        fixture.collector.authorize({
          authorization: `LiveObservation ${fixture.credential}`,
          observationId: fixture.input.observationId,
          origin: "https://audience.example.com"
        }),
      item.code
    );
  }
});

test("public collector maps Store rate, cap, disappearance, and failure outcomes", async () => {
  const cases = [
    ["rate_limited", "rate_limited"],
    ["event_limit_reached", "rate_limited"],
    ["gone", "gone"],
    ["not_found", "not_found"]
  ] as const;

  for (const [kind, code] of cases) {
    const fixture = await createFixture((store, active) => ({
      ...store,
      async collectEvent() {
        if (kind === "gone") {
          return {
            kind,
            evaluatedAt: active.evaluatedAt,
            session: {
              observationId: active.session.observationId,
              deploymentId: active.session.deploymentId,
              status: "stopped",
              createdAt: active.session.createdAt,
              expiresAt: active.session.expiresAt,
              terminalAt: active.evaluatedAt,
              finalLive: active.session.live,
              finalObservation: null
            }
          };
        }
        if (kind === "not_found") {
          return { kind, evaluatedAt: active.evaluatedAt };
        }
        return { kind, evaluatedAt: active.evaluatedAt, live: active.session.live };
      }
    }));
    const authorized = await authorize(fixture);
    await assertCollectorError(
      () => authorized.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" }),
      code
    );
  }

  const unavailable = await createFixture((store) => ({
    ...store,
    async collectEvent() {
      throw new Error("redis unavailable probe");
    }
  }));
  await assertCollectorError(
    () =>
      authorize(unavailable).then((session) =>
        session.request({ eventId: EVENT_ID, ipAddress: "203.0.113.42" })
      ),
    "unavailable"
  );
});

async function createFixture(
  wrapStore?: (
    store: LiveObservationStore,
    active: Extract<Awaited<ReturnType<LiveObservationStore["createSession"]>>, { kind: "created" }>
  ) => LiveObservationStore,
  requestOptions: {
    now?: () => number;
    post?: (manifest: unknown) => Promise<{ status: number }>;
  } = {}
) {
  const now = requestOptions.now ?? (() => NOW_MS);
  const baseStore = createInMemoryLiveObservationStore({ now });
  const capability = createLiveObservationCapability({
    keyring: { current: { kid: "current-key", secret: SECRET } },
    now
  });
  const input = createLiveObservationStoreContractInput();
  const created = await baseStore.createSession(input);
  assert.equal(created.kind, "created");
  if (created.kind !== "created") assert.fail("Expected created Store session");
  const store = wrapStore?.(baseStore, created) ?? baseStore;
  const credential = capability.issue(
    {
      createdAt: created.session.createdAt,
      expiresAt: created.session.expiresAt,
      observationId: created.session.observationId,
      tokenVersion: created.session.capability.tokenVersion
    },
    created.evaluatedAt
  ).credential;

  return {
    capability,
    collector: createLiveObservationPublicCollector({
      capability,
      requestRateLimiter: createLiveObservationPublicRequestRateLimiter({
        now,
        runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null, now })
      }),
      store,
      trafficTransport: {
        post: requestOptions.post ?? (async () => ({ status: 204 }))
      }
    }),
    created,
    credential,
    input,
    store
  };
}

function authorize(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return fixture.collector.authorize({
    authorization: `LiveObservation ${fixture.credential}`,
    observationId: fixture.input.observationId,
    origin: "https://audience.example.com"
  });
}

async function assertCollectorError(
  operation: () => Promise<unknown>,
  code: LiveObservationPublicCollectorError["code"]
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(error instanceof LiveObservationPublicCollectorError, true);
    assert.equal((error as LiveObservationPublicCollectorError).code, code);
    return true;
  });
}
