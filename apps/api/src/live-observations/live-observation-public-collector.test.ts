import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";
import { createLiveObservationCapability } from "./live-observation-capability.js";
import {
  createLiveObservationPublicCollector,
  LiveObservationPublicCollectorError
} from "./live-observation-public-collector.js";
import { createLiveObservationStoreContractInput } from "./live-observation-store-contract.js";
import type { LiveObservationStore } from "./live-observation-store.js";

const NOW_MS = Date.parse("2026-07-11T00:00:00.000Z");
const SECRET = Buffer.alloc(32, 0x31).toString("base64url");
const EVENT_ID = "00000000-0000-4000-8000-000000000001";

test("public collector authenticates Store-bound claims before accepting one event", async () => {
  const fixture = await createFixture();
  const authorized = await fixture.collector.authorize({
    authorization: `LiveObservation ${fixture.credential}`,
    observationId: fixture.input.observationId,
    origin: "https://audience.example.com"
  });

  assert.equal(authorized.audienceOrigin, "https://audience.example.com");
  assert.deepEqual(await authorized.collectEvent(EVENT_ID), {
    accepted: true,
    acceptedEventCount: 1
  });
  assert.deepEqual(await authorized.collectEvent(EVENT_ID), {
    accepted: false,
    acceptedEventCount: 1
  });
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
    await assertCollectorError(() => authorized.collectEvent(EVENT_ID), code);
  }

  const unavailable = await createFixture((store) => ({
    ...store,
    async collectEvent() {
      throw new Error("redis unavailable probe");
    }
  }));
  await assertCollectorError(
    () => authorize(unavailable).then((session) => session.collectEvent(EVENT_ID)),
    "unavailable"
  );
});

async function createFixture(
  wrapStore?: (
    store: LiveObservationStore,
    active: Extract<Awaited<ReturnType<LiveObservationStore["createSession"]>>, { kind: "created" }>
  ) => LiveObservationStore
) {
  const baseStore = createInMemoryLiveObservationStore({ now: () => NOW_MS });
  const capability = createLiveObservationCapability({
    keyring: { current: { kid: "current-key", secret: SECRET } },
    now: () => NOW_MS
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
    collector: createLiveObservationPublicCollector({ capability, store }),
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
