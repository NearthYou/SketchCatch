import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeploymentLiveObservationManifestV2 } from "@sketchcatch/types";
import {
  LIVE_OBSERVATION_STORE_POLICY,
  LiveObservationStoreClockError,
  LiveObservationStoreInputError,
  LiveObservationStoreUnavailableError,
  type LiveObservationStore,
  type LiveObservationStoreCollectResult,
  type LiveObservationStoreCreateInput
} from "./live-observation-store.js";

const START_MS = Date.parse("2026-07-11T00:00:00.000Z");
const OBSERVATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_OBSERVATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEPLOYMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const SECOND_DEPLOYMENT_ID = "223e4567-e89b-42d3-a456-426614174001";
const AWS_CONNECTION_ID = "abcdef12-3456-4789-8abc-def012345678";
const ARTIFACT_SHA = "0123456789abcdef".repeat(4);
const FIRST_OBSERVER_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_OBSERVER_ID = "22222222-2222-4222-8222-222222222222";
const FIRST_BOOST_LEASE_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_BOOST_LEASE_ID = "44444444-4444-4444-8444-444444444444";

export type LiveObservationStoreContractHarness = {
  store: LiveObservationStore;
  setNow(value: number): void;
  advanceBy(milliseconds: number): void;
};

export function createLiveObservationStoreContractInput(): LiveObservationStoreCreateInput {
  return createInput();
}

export function registerLiveObservationStoreContract(input: {
  name: string;
  createHarness: () => LiveObservationStoreContractHarness;
}): void {
  const contractTest = (
    name: string,
    callback: (harness: LiveObservationStoreContractHarness) => Promise<void>
  ) => {
    test(input.name + ": " + name, async () => {
      await callback(input.createHarness());
    });
  };

  contractTest("creates and reads a capability-compatible active session", async ({
    store,
    advanceBy
  }) => {
    assert.equal(Object.isFrozen(LIVE_OBSERVATION_STORE_POLICY), true);
    assert.deepEqual(LIVE_OBSERVATION_STORE_POLICY, {
      sessionLifetimeMs: 900_000,
      terminalTombstoneRetentionMs: 60_000,
      rollingWindowSeconds: 10,
      maxWeightedBurstPerSecond: 20,
      maxAcceptedEventsPerRateWindow: 120,
      maxAcceptedEventsPerSession: 10_000,
      observerLeaseDurationMs: 15_000,
      presenterBoostLeaseDurationMs: 10_000
    });

    const created = await store.createSession(createInput());
    assertKind(created, "created");
    assert.equal(created.evaluatedAt, iso(START_MS));
    assert.deepEqual(created.session, {
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID,
      status: "active",
      manifest: createManifest(),
      capability: {
        kid: "current-key",
        tokenVersion: 1
      },
      createdAt: iso(START_MS),
      expiresAt: iso(START_MS + 900_000),
      live: {
        acceptedEventCount: 0,
        rollingRequestsPerSecond: 0,
        projectedRequestsPerMinute: 0,
        pressurePercent: 0,
        pressureLevel: "normal",
        observedAt: iso(START_MS)
      },
      latestObservation: null
    });

    advanceBy(1_234);
    const read = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(read, "active");
    assert.equal(read.evaluatedAt, iso(START_MS + 1_234));
    assert.equal(read.session.createdAt, iso(START_MS));
    assert.equal(read.session.expiresAt, iso(START_MS + 900_000));
    assert.equal(read.session.live.observedAt, iso(START_MS + 1_234));
  });

  contractTest("atomically creates one session for concurrent Deployment claims", async ({
    store
  }) => {
    const results = await Promise.all([
      store.createSession(createInput()),
      store.createSession(
        createInput({
          observationId: SECOND_OBSERVATION_ID
        })
      )
    ]);
    const created = results.filter((result) => result.kind === "created");
    const existing = results.filter((result) => result.kind === "active_exists");

    assert.equal(created.length, 1);
    assert.equal(existing.length, 1);
    assert.deepEqual(created[0]?.session, existing[0]?.session);

    const claimedObservationId = created[0]?.session.observationId;
    const unclaimedObservationId =
      claimedObservationId === OBSERVATION_ID
        ? SECOND_OBSERVATION_ID
        : OBSERVATION_ID;
    const orphanRead = await store.readSession({
      observationId: unclaimedObservationId
    });
    assertKind(orphanRead, "not_found");
  });

  contractTest("uses active-claim priority and stable observation conflicts", async ({
    store
  }) => {
    const first = await store.createSession(createInput());
    assertKind(first, "created");

    const retry = await store.createSession(createInput());
    assertKind(retry, "active_exists");
    assert.equal(retry.session.observationId, OBSERVATION_ID);

    const reusedId = await store.createSession(
      createInput({
        deploymentId: SECOND_DEPLOYMENT_ID
      })
    );
    assertKind(reusedId, "observation_id_conflict");

    const secondDeployment = await store.createSession(
      createInput({
        observationId: SECOND_OBSERVATION_ID,
        deploymentId: SECOND_DEPLOYMENT_ID
      })
    );
    assertKind(secondDeployment, "created");

    const activeClaimWins = await store.createSession(
      createInput({
        observationId: SECOND_OBSERVATION_ID
      })
    );
    assertKind(activeClaimWins, "active_exists");
    assert.equal(activeClaimWins.session.observationId, OBSERVATION_ID);
  });

  contractTest("enforces exact expiry and tombstone purge boundaries", async ({
    store,
    setNow
  }) => {
    const created = await store.createSession(createInput());
    assertKind(created, "created");
    const expiresAtMs = Date.parse(created.session.expiresAt);

    setNow(expiresAtMs - 1);
    assertKind(
      await store.readSession({ observationId: OBSERVATION_ID }),
      "active"
    );

    setNow(expiresAtMs);
    const expired = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(expired, "terminal");
    assert.equal(expired.session.status, "expired");
    assert.equal(expired.session.terminalAt, iso(expiresAtMs));
    assert.equal(expired.session.finalLive.observedAt, iso(expiresAtMs));

    setNow(expiresAtMs + 59_999);
    assertKind(
      await store.readSession({ observationId: OBSERVATION_ID }),
      "terminal"
    );

    setNow(expiresAtMs + 60_000);
    assertKind(
      await store.readSession({ observationId: OBSERVATION_ID }),
      "not_found"
    );
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(1)
      }),
      "not_found"
    );
    assertKind(
      await store.stopSession({
        observationId: OBSERVATION_ID,
        deploymentId: DEPLOYMENT_ID
      }),
      "not_found"
    );
  });

  contractTest("does not extend expiry on reads or collects", async ({
    store,
    setNow
  }) => {
    const created = await store.createSession(createInput());
    assertKind(created, "created");
    const expiresAtMs = Date.parse(created.session.expiresAt);

    setNow(expiresAtMs - 60_000);
    const read = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(read, "active");
    assert.equal(read.session.expiresAt, created.session.expiresAt);
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(1)
      }),
      "accepted"
    );

    setNow(expiresAtMs);
    const gone = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: eventId(2)
    });
    assertKind(gone, "gone");
    assert.equal(gone.session.status, "expired");
    assert.equal(gone.session.expiresAt, created.session.expiresAt);
  });

  contractTest("isolates retained state from nested input and result mutations", async ({
    store
  }) => {
    const createValue = createInput();
    const created = await store.createSession(createValue);
    assertKind(created, "created");

    createValue.capability.kid = "mutated-key";
    createValue.manifest.provenance.region = "us-east-1";
    asAsgCapacityTarget(createValue.manifest).autoScalingGroupName = "mutated-input";
    created.session.capability.kid = "mutated-result";
    created.session.manifest.provenance.region = "eu-west-1";
    asAsgCapacityTarget(created.session.manifest).autoScalingGroupName = "mutated-result";
    created.session.live.acceptedEventCount = 999;

    const firstRead = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(firstRead, "active");
    assert.equal(firstRead.session.capability.kid, "current-key");
    assert.equal(firstRead.session.manifest.provenance.region, "ap-northeast-2");
    assert.equal(
      asAsgCapacityTarget(firstRead.session.manifest).autoScalingGroupName,
      "sc-lo-asg-123e4567e89b"
    );
    assert.equal(firstRead.session.live.acceptedEventCount, 0);

    firstRead.session.live.pressurePercent = 999;
    firstRead.session.manifest.endpoints.trafficUrl = "https://mutated.example.com";
    const secondRead = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(secondRead, "active");
    assert.equal(secondRead.session.live.pressurePercent, 0);
    assert.equal(
      secondRead.session.manifest.endpoints.trafficUrl,
      "https://api-123e4567e89b.example.com/traffic"
    );

    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    stopped.session.finalLive.acceptedEventCount = 999;

    const terminalRead = await store.readSession({
      observationId: OBSERVATION_ID
    });
    assertKind(terminalRead, "terminal");
    assert.equal(terminalRead.session.finalLive.acceptedEventCount, 0);
  });

  contractTest("rejects forbidden data generically while retaining the artifact SHA", async ({
    store
  }) => {
    const credentialProbe = "review-key." + "A".repeat(43);
    const tokenHashProbe = "token-derived-sha256-" + "b".repeat(64);
    const roleArnProbe = "arn:aws:iam::123456789012:role/reviewer-probe";
    const externalIdProbe = "external-id-reviewer-probe-73921";
    const tokenUrlProbe =
      "https://audience.example.com/watch?token=reviewer-probe-token";
    const terraformProbe =
      "resource \"aws_iam_role\" \"reviewer_probe\" { name = \"secret\" }";
    const probes = [
      credentialProbe,
      tokenHashProbe,
      roleArnProbe,
      externalIdProbe,
      tokenUrlProbe,
      terraformProbe
    ];
    const candidates: unknown[] = [];

    candidates.push({
      ...createInput(),
      credential: credentialProbe
    });
    candidates.push({
      ...createInput(),
      capability: {
        ...createInput().capability,
        mac: credentialProbe
      }
    });
    candidates.push({
      ...createInput(),
      capability: {
        ...createInput().capability,
        tokenSha256: tokenHashProbe
      }
    });
    candidates.push({
      ...createInput(),
      tokenIndex: tokenHashProbe
    });
    candidates.push(
      mutateInput((candidate) => {
        candidate.manifest.provenance.awsConnectionId = roleArnProbe;
      })
    );
    candidates.push(
      mutateInput((candidate) => {
        candidate.manifest.provenance.awsConnectionId = externalIdProbe;
      })
    );
    candidates.push(
      mutateInput((candidate) => {
        candidate.manifest.endpoints.audienceBaseUrl = tokenUrlProbe;
      })
    );
    candidates.push(
      mutateInput((candidate) => {
        asPayload(candidate.manifest).rawTerraform = terraformProbe;
      })
    );

    for (const candidate of candidates) {
      const error = await captureError(() =>
        store.createSession(candidate as LiveObservationStoreCreateInput)
      );
      assert.ok(error instanceof LiveObservationStoreInputError);
      assert.equal(error.message, "Invalid Live Observation Store input");
      assert.equal(error.cause, undefined);
      assert.deepEqual(Object.keys(error), []);
      for (const probe of probes) {
        assert.equal(error.message.includes(probe), false);
        assert.equal(JSON.stringify(error).includes(probe), false);
      }
      assert.equal(error.message.includes("provenance"), false);
      assert.equal(error.message.includes("Unrecognized"), false);
    }

    const created = await store.createSession(createInput());
    assertKind(created, "created");
    assert.equal(
      created.session.manifest.provenance.terraformArtifactSha256,
      ARTIFACT_SHA
    );
    const serializedActive = JSON.stringify(created);
    assert.equal(serializedActive.includes(ARTIFACT_SHA), true);
    for (const probe of probes) {
      assert.equal(serializedActive.includes(probe), false);
    }

    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    const serializedTerminal = JSON.stringify(stopped);
    assert.equal(serializedTerminal.includes(ARTIFACT_SHA), false);
    assert.equal(serializedTerminal.includes(AWS_CONNECTION_ID), false);
    assert.deepEqual(Object.keys(stopped.session).sort(), [
      "createdAt",
      "deploymentId",
      "expiresAt",
      "finalLive",
      "finalObservation",
      "observationId",
      "status",
      "terminalAt"
    ]);
  });

  contractTest("accepts and deduplicates events with exact live metrics", async ({
    store
  }) => {
    assertKind(await store.createSession(createInput()), "created");

    const first = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: eventId(1)
    });
    assertKind(first, "accepted");
    assert.deepEqual(first.live, {
      acceptedEventCount: 1,
      rollingRequestsPerSecond: 0.1,
      projectedRequestsPerMinute: 6,
      pressurePercent: 10,
      pressureLevel: "normal",
      observedAt: iso(START_MS)
    });

    const duplicate = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: eventId(1)
    });
    assertKind(duplicate, "duplicate");
    assert.equal(duplicate.live.acceptedEventCount, 1);

    let latest: LiveObservationStoreCollectResult = duplicate;
    for (let index = 2; index <= 4; index += 1) {
      latest = await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(index)
      });
    }
    assertKind(latest, "accepted");
    assert.equal(latest.live.pressurePercent, 40);
    assert.equal(latest.live.pressureLevel, "warning");

    for (let index = 5; index <= 7; index += 1) {
      latest = await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(index)
      });
    }
    assertKind(latest, "accepted");
    assert.equal(latest.live.pressurePercent, 70);
    assert.equal(latest.live.pressureLevel, "high");

    for (let index = 8; index <= 10; index += 1) {
      latest = await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(index)
      });
    }
    assertKind(latest, "accepted");
    assert.equal(latest.live.acceptedEventCount, 10);
    assert.equal(latest.live.pressurePercent, 100);
    assert.equal(latest.live.pressureLevel, "critical");
  });

  contractTest("enforces the weighted 20 per-second boundary and permits retry", async ({
    store,
    advanceBy
  }) => {
    assertKind(await store.createSession(createInput()), "created");

    for (let index = 0; index < 19; index += 1) {
      assertKind(
        await store.collectEvent({
          observationId: OBSERVATION_ID,
          eventId: eventId(index)
        }),
        "accepted"
      );
    }

    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(0)
      }),
      "duplicate"
    );
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(19)
      }),
      "accepted"
    );

    const retryEventId = eventId(20);
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: retryEventId
      }),
      "rate_limited"
    );

    advanceBy(1_000);
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: retryEventId
      }),
      "rate_limited"
    );

    advanceBy(50);
    const acceptedRetry = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: retryEventId
    });
    assertKind(acceptedRetry, "accepted");
    assert.equal(acceptedRetry.live.acceptedEventCount, 21);
  });

  contractTest("enforces the 120-event rolling window and does not dedupe rejection", async ({
    store,
    setNow,
    advanceBy
  }) => {
    setNow(START_MS + 500);
    assertKind(await store.createSession(createInput()), "created");

    for (let second = 0; second < 10; second += 1) {
      for (let offset = 0; offset < 12; offset += 1) {
        assertKind(
          await store.collectEvent({
            observationId: OBSERVATION_ID,
            eventId: eventId(second * 12 + offset)
          }),
          "accepted"
        );
      }
      if (second < 9) {
        advanceBy(1_000);
      }
    }

    const retryEventId = eventId(120);
    const limited = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: retryEventId
    });
    assertKind(limited, "rate_limited");
    assert.equal(limited.live.acceptedEventCount, 120);

    advanceBy(1_000);
    const retry = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: retryEventId
    });
    assertKind(retry, "accepted");
    assert.equal(retry.live.acceptedEventCount, 121);
  });

  contractTest("accepts exactly 10,000 events before enforcing the session cap", async ({
    store,
    setNow,
    advanceBy
  }) => {
    setNow(START_MS + 500);
    assertKind(await store.createSession(createInput()), "created");

    for (let index = 0; index < 10_000; index += 1) {
      const result = await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(index)
      });
      assertKind(result, "accepted");
      if (index === 9_999) {
        assert.equal(result.live.acceptedEventCount, 10_000);
      }
      if ((index + 1) % 12 === 0 && index + 1 < 10_000) {
        advanceBy(1_000);
      }
    }

    const capped = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: eventId(10_000)
    });
    assertKind(capped, "event_limit_reached");
    assert.equal(capped.live.acceptedEventCount, 10_000);
  });

  contractTest("serializes collect-before-stop into the frozen final view", async ({
    store
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(1)
      }),
      "accepted"
    );

    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    assert.equal(stopped.session.finalLive.acceptedEventCount, 1);

    const gone = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: eventId(2)
    });
    assertKind(gone, "gone");
    assert.equal(gone.session.finalLive.acceptedEventCount, 1);
  });

  contractTest("serializes stop-before-collect as gone without changing final state", async ({
    store
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    assert.equal(stopped.session.finalLive.acceptedEventCount, 0);

    const gone = await store.collectEvent({
      observationId: OBSERVATION_ID,
      eventId: eventId(1)
    });
    assertKind(gone, "gone");
    assert.equal(gone.session.finalLive.acceptedEventCount, 0);
  });

  contractTest("binds stop ownership and reuses claims while tombstones remain", async ({
    store,
    setNow
  }) => {
    assertKind(await store.createSession(createInput()), "created");

    assertKind(
      await store.stopSession({
        observationId: OBSERVATION_ID,
        deploymentId: SECOND_DEPLOYMENT_ID
      }),
      "not_found"
    );
    assertKind(
      await store.readSession({ observationId: OBSERVATION_ID }),
      "active"
    );

    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    assertKind(
      await store.stopSession({
        observationId: OBSERVATION_ID,
        deploymentId: DEPLOYMENT_ID
      }),
      "already_terminal"
    );
    assertKind(
      await store.stopSession({
        observationId: OBSERVATION_ID,
        deploymentId: SECOND_DEPLOYMENT_ID
      }),
      "not_found"
    );

    const replacement = await store.createSession(
      createInput({ observationId: SECOND_OBSERVATION_ID })
    );
    assertKind(replacement, "created");
    const oldIdConflict = await store.createSession(
      createInput({
        observationId: OBSERVATION_ID,
        deploymentId: SECOND_DEPLOYMENT_ID
      })
    );
    assertKind(oldIdConflict, "observation_id_conflict");

    setNow(Date.parse(stopped.session.terminalAt) + 60_000);
    assertKind(
      await store.stopSession({
        observationId: OBSERVATION_ID,
        deploymentId: DEPLOYMENT_ID
      }),
      "not_found"
    );
  });

  contractTest("freezes natural expiry at expiresAt and releases the claim", async ({
    store,
    setNow
  }) => {
    const created = await store.createSession(createInput());
    assertKind(created, "created");
    const expiresAtMs = Date.parse(created.session.expiresAt);

    setNow(expiresAtMs - 10_000);
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(1)
      }),
      "accepted"
    );
    setNow(expiresAtMs - 9_000);
    assertKind(
      await store.collectEvent({
        observationId: OBSERVATION_ID,
        eventId: eventId(2)
      }),
      "accepted"
    );

    setNow(expiresAtMs);
    const expired = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(expired, "terminal");
    assert.deepEqual(expired.session.finalLive, {
      acceptedEventCount: 2,
      rollingRequestsPerSecond: 0.1,
      projectedRequestsPerMinute: 6,
      pressurePercent: 10,
      pressureLevel: "normal",
      observedAt: iso(expiresAtMs)
    });
    assert.equal(expired.session.finalObservation, null);

    const replacement = await store.createSession(
      createInput({ observationId: SECOND_OBSERVATION_ID })
    );
    assertKind(replacement, "created");
  });

  contractTest("fences observer ownership across renewal and exact lease expiry", async ({
    store,
    setNow
  }) => {
    assertKind(await store.createSession(createInput()), "created");

    const claims = await Promise.all([
      store.claimObserverLease({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID
      }),
      store.claimObserverLease({
        observationId: OBSERVATION_ID,
        observerId: SECOND_OBSERVER_ID
      })
    ]);
    const claimed = claims.find((result) => result.kind === "claimed");
    const contended = claims.filter((result) => result.kind === "contended");
    assert.ok(claimed);
    assert.equal(contended.length, 1);
    assertKind(claimed, "claimed");
    assert.deepEqual(Object.keys(claimed.lease).sort(), [
      "expiresAt",
      "fencingToken"
    ]);
    assert.equal(claimed.lease.fencingToken, 1);
    assert.equal(claimed.lease.expiresAt, iso(START_MS + 15_000));

    const ownerId =
      claims[0] === claimed ? FIRST_OBSERVER_ID : SECOND_OBSERVER_ID;
    const nextOwnerId =
      claims[0] === claimed ? SECOND_OBSERVER_ID : FIRST_OBSERVER_ID;

    setNow(START_MS + 1_000);
    const renewed = await store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: ownerId
    });
    assertKind(renewed, "claimed");
    assert.equal(renewed.lease.fencingToken, 1);
    assert.equal(renewed.lease.expiresAt, iso(START_MS + 16_000));

    setNow(START_MS + 16_000);
    const takeover = await store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: nextOwnerId
    });
    assertKind(takeover, "claimed");
    assert.equal(takeover.lease.fencingToken, 2);

    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: ownerId,
        fencingToken: 1,
        observation: observation(START_MS + 16_000, { owner: "stale" })
      }),
      "lease_lost"
    );
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: nextOwnerId,
        fencingToken: 2,
        observation: observation(START_MS + 16_000, { owner: "current" })
      }),
      "committed"
    );

    const read = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(read, "active");
    assert.deepEqual(read.session.latestObservation, observation(START_MS + 16_000, {
      owner: "current"
    }));
  });

  contractTest("rejects expired, mismatched, and out-of-order observation commits", async ({
    store,
    setNow
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    const claim = await store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: FIRST_OBSERVER_ID
    });
    assertKind(claim, "claimed");

    setNow(START_MS + 1_000);
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS + 1_000, { sequence: 1 })
      }),
      "committed"
    );

    setNow(START_MS + 2_000);
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS + 2_000, { sequence: 2 })
      }),
      "committed"
    );
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS + 2_000, { sequence: 200 })
      }),
      "stale_observation"
    );
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS + 1_500, { sequence: 150 })
      }),
      "stale_observation"
    );
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: SECOND_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS + 2_000, { sequence: 3 })
      }),
      "lease_lost"
    );
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken + 1,
        observation: observation(START_MS + 2_000, { sequence: 3 })
      }),
      "lease_lost"
    );

    const current = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(current, "active");
    assert.deepEqual(current.session.latestObservation?.payload, { sequence: 2 });

    setNow(Date.parse(claim.lease.expiresAt));
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(Date.parse(claim.lease.expiresAt), {
          sequence: 3
        })
      }),
      "lease_lost"
    );
  });

  contractTest("freezes detached latest observations on stop and natural expiry", async ({
    store,
    setNow
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    const claim = await store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: FIRST_OBSERVER_ID
    });
    assertKind(claim, "claimed");
    const retainedInput = observation(START_MS, {
      nested: { state: "original" }
    });
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: retainedInput
      }),
      "committed"
    );
    (retainedInput.payload as { nested: { state: string } }).nested.state =
      "mutated-input";

    const active = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(active, "active");
    assert.equal(
      (active.session.latestObservation?.payload as { nested: { state: string } })
        .nested.state,
      "original"
    );
    (active.session.latestObservation?.payload as { nested: { state: string } })
      .nested.state = "mutated-result";

    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    assert.equal(
      (stopped.session.finalObservation?.payload as {
        nested: { state: string };
      }).nested.state,
      "original"
    );

    const secondHarness = input.createHarness();
    const created = await secondHarness.store.createSession(createInput());
    assertKind(created, "created");
    const expiresAtMs = Date.parse(created.session.expiresAt);
    secondHarness.setNow(expiresAtMs - 10_000);
    const expiryClaim = await secondHarness.store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: SECOND_OBSERVER_ID
    });
    assertKind(expiryClaim, "claimed");
    assert.equal(expiryClaim.lease.expiresAt, iso(expiresAtMs));
    assertKind(
      await secondHarness.store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: SECOND_OBSERVER_ID,
        fencingToken: expiryClaim.lease.fencingToken,
        observation: observation(expiresAtMs - 10_000, { final: "expiry" })
      }),
      "committed"
    );
    secondHarness.setNow(expiresAtMs);
    const expired = await secondHarness.store.readSession({
      observationId: OBSERVATION_ID
    });
    assertKind(expired, "terminal");
    assert.deepEqual(
      expired.session.finalObservation,
      observation(expiresAtMs - 10_000, { final: "expiry" })
    );
  });

  contractTest("rejects malformed observation evidence before retaining it", async ({
    store,
    setNow
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    const claim = await store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: FIRST_OBSERVER_ID
    });
    assertKind(claim, "claimed");

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const accessor = Object.defineProperty({}, "probe", {
      enumerable: true,
      get() {
        assert.fail("JSON validation must not invoke accessors");
      }
    });
    const customPrototype = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    customPrototype.value = "probe";
    const invalidPayloads = [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      BigInt(1),
      Symbol("probe"),
      () => "probe",
      new Date(START_MS),
      customPrototype,
      accessor,
      cyclic
    ];

    for (const payload of invalidPayloads) {
      const error = await captureError(() =>
        store.commitObservation({
          observationId: OBSERVATION_ID,
          observerId: FIRST_OBSERVER_ID,
          fencingToken: claim.lease.fencingToken,
          observation: {
            observedAt: iso(START_MS),
            payload
          }
        } as Parameters<typeof store.commitObservation>[0])
      );
      assertGenericInputError(error);
    }

    const malformedActions = [
      () =>
        store.claimObserverLease({
          observationId: OBSERVATION_ID,
          observerId: OBSERVATION_ID.toUpperCase()
        }),
      () =>
        store.commitObservation({
          observationId: OBSERVATION_ID,
          observerId: FIRST_OBSERVER_ID,
          fencingToken: 0,
          observation: observation(START_MS, null)
        }),
      () =>
        store.commitObservation({
          observationId: OBSERVATION_ID,
          observerId: FIRST_OBSERVER_ID,
          fencingToken: 1.5,
          observation: observation(START_MS, null)
        }),
      () =>
        store.commitObservation({
          observationId: OBSERVATION_ID,
          observerId: FIRST_OBSERVER_ID,
          fencingToken: claim.lease.fencingToken,
          observation: {
            observedAt: "2026-07-11T09:00:00.000+09:00",
            payload: null
          }
        }),
      () =>
        store.acquirePresenterBoostLease({
          observationId: OBSERVATION_ID,
          leaseId: SECOND_OBSERVATION_ID.toUpperCase()
        })
    ];

    for (const action of malformedActions) {
      assertGenericInputError(await captureError(action));
    }

    setNow(START_MS);
    const futureError = await captureError(() =>
      store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS + 1, { future: true })
      })
    );
    assertGenericInputError(futureError);
  });

  contractTest("serializes presenter acquire and keeps same-id retries idempotent", async ({
    store,
    setNow
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    const acquired = await Promise.all([
      store.acquirePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: FIRST_BOOST_LEASE_ID
      }),
      store.acquirePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: SECOND_BOOST_LEASE_ID
      })
    ]);
    const winner = acquired.find((result) => result.kind === "acquired");
    assert.ok(winner);
    assert.equal(acquired.filter((result) => result.kind === "busy").length, 1);
    assertKind(winner, "acquired");
    assert.equal(winner.lease.expiresAt, iso(START_MS + 10_000));
    const winningLeaseId =
      acquired[0] === winner ? FIRST_BOOST_LEASE_ID : SECOND_BOOST_LEASE_ID;
    const waitingLeaseId =
      acquired[0] === winner ? SECOND_BOOST_LEASE_ID : FIRST_BOOST_LEASE_ID;

    setNow(START_MS + 1_000);
    const retry = await store.acquirePresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: winningLeaseId
    });
    assertKind(retry, "already_acquired");
    assert.equal(retry.lease.expiresAt, winner.lease.expiresAt);
    const busy = await store.acquirePresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: waitingLeaseId
    });
    assertKind(busy, "busy");
    assert.deepEqual(Object.keys(busy).sort(), ["evaluatedAt", "kind"]);

    setNow(START_MS + 10_000);
    const next = await store.acquirePresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: waitingLeaseId
    });
    assertKind(next, "acquired");
    assert.equal(next.lease.expiresAt, iso(START_MS + 20_000));
  });

  contractTest("renews, releases, and session-caps presenter leases exactly", async ({
    store,
    setNow
  }) => {
    const created = await store.createSession(createInput());
    assertKind(created, "created");
    const acquired = await store.acquirePresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: FIRST_BOOST_LEASE_ID
    });
    assertKind(acquired, "acquired");

    assertKind(
      await store.renewPresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: SECOND_BOOST_LEASE_ID
      }),
      "lease_lost"
    );
    assertKind(
      await store.releasePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: SECOND_BOOST_LEASE_ID
      }),
      "lease_lost"
    );

    setNow(START_MS + 3_000);
    const renewed = await store.renewPresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: FIRST_BOOST_LEASE_ID
    });
    assertKind(renewed, "renewed");
    assert.equal(renewed.lease.expiresAt, iso(START_MS + 13_000));

    const released = await store.releasePresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: FIRST_BOOST_LEASE_ID
    });
    assertKind(released, "released");
    assertKind(
      await store.renewPresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: FIRST_BOOST_LEASE_ID
      }),
      "lease_lost"
    );
    assertKind(
      await store.acquirePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: SECOND_BOOST_LEASE_ID
      }),
      "acquired"
    );

    setNow(START_MS + 13_000);
    assertKind(
      await store.renewPresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: SECOND_BOOST_LEASE_ID
      }),
      "lease_lost"
    );

    const expiresAtMs = Date.parse(created.session.expiresAt);
    setNow(expiresAtMs - 5_000);
    const capped = await store.acquirePresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: FIRST_BOOST_LEASE_ID
    });
    assertKind(capped, "acquired");
    assert.equal(capped.lease.expiresAt, created.session.expiresAt);
    const cappedRenewal = await store.renewPresenterBoostLease({
      observationId: OBSERVATION_ID,
      leaseId: FIRST_BOOST_LEASE_ID
    });
    assertKind(cappedRenewal, "renewed");
    assert.equal(cappedRenewal.lease.expiresAt, created.session.expiresAt);
  });

  contractTest("cleans lease state at terminal and tombstone purge boundaries", async ({
    store,
    setNow
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    const claim = await store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: FIRST_OBSERVER_ID
    });
    assertKind(claim, "claimed");
    assertKind(
      await store.acquirePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: FIRST_BOOST_LEASE_ID
      }),
      "acquired"
    );
    assertKind(
      await store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS, { terminal: true })
      }),
      "committed"
    );
    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    const terminalJson = JSON.stringify(stopped.session);
    assert.equal(terminalJson.includes(FIRST_OBSERVER_ID), false);
    assert.equal(terminalJson.includes(FIRST_BOOST_LEASE_ID), false);
    assert.equal(terminalJson.includes("fencingToken"), false);

    const terminalOperations = [
      () =>
        store.claimObserverLease({
          observationId: OBSERVATION_ID,
          observerId: SECOND_OBSERVER_ID
        }),
      () =>
        store.commitObservation({
          observationId: OBSERVATION_ID,
          observerId: FIRST_OBSERVER_ID,
          fencingToken: claim.lease.fencingToken,
          observation: observation(START_MS, null)
        }),
      () =>
        store.acquirePresenterBoostLease({
          observationId: OBSERVATION_ID,
          leaseId: SECOND_BOOST_LEASE_ID
        }),
      () =>
        store.renewPresenterBoostLease({
          observationId: OBSERVATION_ID,
          leaseId: FIRST_BOOST_LEASE_ID
        }),
      () =>
        store.releasePresenterBoostLease({
          observationId: OBSERVATION_ID,
          leaseId: FIRST_BOOST_LEASE_ID
        })
    ];
    for (const operation of terminalOperations) {
      assertKind(await operation(), "gone");
    }

    setNow(Date.parse(stopped.session.terminalAt) + 60_000);
    for (const operation of terminalOperations) {
      assertKind(await operation(), "not_found");
    }
  });

  contractTest("serializes observation stop and presenter release races", async ({
    store
  }) => {
    assertKind(await store.createSession(createInput()), "created");
    const claim = await store.claimObserverLease({
      observationId: OBSERVATION_ID,
      observerId: FIRST_OBSERVER_ID
    });
    assertKind(claim, "claimed");
    const [commit, stop] = await Promise.all([
      store.commitObservation({
        observationId: OBSERVATION_ID,
        observerId: FIRST_OBSERVER_ID,
        fencingToken: claim.lease.fencingToken,
        observation: observation(START_MS, { serialized: true })
      }),
      store.stopSession({
        observationId: OBSERVATION_ID,
        deploymentId: DEPLOYMENT_ID
      })
    ]);
    assertKind(stop, "stopped");
    if (commit.kind === "committed") {
      assert.deepEqual(stop.session.finalObservation?.payload, {
        serialized: true
      });
    } else {
      assertKind(commit, "gone");
      assert.equal(stop.session.finalObservation, null);
    }

    const secondHarness = input.createHarness();
    assertKind(
      await secondHarness.store.createSession(createInput()),
      "created"
    );
    assertKind(
      await secondHarness.store.acquirePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: FIRST_BOOST_LEASE_ID
      }),
      "acquired"
    );
    const [released, acquired] = await Promise.all([
      secondHarness.store.releasePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: FIRST_BOOST_LEASE_ID
      }),
      secondHarness.store.acquirePresenterBoostLease({
        observationId: OBSERVATION_ID,
        leaseId: SECOND_BOOST_LEASE_ID
      })
    ]);
    assertKind(released, "released");
    if (acquired.kind === "busy") {
      assertKind(
        await secondHarness.store.acquirePresenterBoostLease({
          observationId: OBSERVATION_ID,
          leaseId: SECOND_BOOST_LEASE_ID
        }),
        "acquired"
      );
    } else {
      assertKind(acquired, "acquired");
    }
  });

  contractTest("rejects malformed inputs with the fixed non-reflective error", async ({
    store
  }) => {
    const invalidManifestInput = createInput();
    invalidManifestInput.manifest.provenance.awsConnectionId =
      AWS_CONNECTION_ID.toUpperCase();
    const invalidActions = [
      () =>
        store.createSession(
          createInput({ observationId: OBSERVATION_ID.toUpperCase() })
        ),
      () =>
        store.createSession(
          createInput({
            capability: { kid: "bad kid", tokenVersion: 1 }
          })
        ),
      () =>
        store.createSession(
          createInput({
            capability: { kid: "current-key", tokenVersion: 0 }
          })
        ),
      () => store.createSession(invalidManifestInput),
      () =>
        store.readSession({
          observationId: OBSERVATION_ID.toUpperCase()
        }),
      () =>
        store.collectEvent({
          observationId: OBSERVATION_ID,
          eventId: "DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD"
        }),
      () =>
        store.stopSession({
          observationId: OBSERVATION_ID,
          deploymentId: DEPLOYMENT_ID.toUpperCase()
        }),
      () =>
        store.readSession({
          observationId: OBSERVATION_ID,
          unexpected: "reviewer-probe"
        } as { observationId: string })
    ];

    for (const action of invalidActions) {
      const error = await captureError(action);
      assert.ok(error instanceof LiveObservationStoreInputError);
      assert.equal(error.message, "Invalid Live Observation Store input");
      assert.equal(error.cause, undefined);
      assert.deepEqual(Object.keys(error), []);
      assert.equal(error.message.includes("reviewer-probe"), false);
      assert.equal(error.message.includes("awsConnectionId"), false);
    }
  });

  contractTest("rejects unsafe clocks separately and reserves unavailable errors", async ({
    store,
    setNow
  }) => {
    for (const invalidClock of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      8_640_000_000_000_001
    ]) {
      setNow(invalidClock);
      const error = await captureError(() =>
        store.readSession({ observationId: OBSERVATION_ID })
      );
      assert.ok(error instanceof LiveObservationStoreClockError);
      assert.equal(error.message, "Invalid Live Observation Store clock");
      assert.equal(error.cause, undefined);
      assert.deepEqual(Object.keys(error), []);
    }

    setNow(8_640_000_000_000_000);
    const expiryOverflow = await captureError(() =>
      store.createSession(createInput())
    );
    assert.ok(expiryOverflow instanceof LiveObservationStoreClockError);
    assert.equal(expiryOverflow.message, "Invalid Live Observation Store clock");
    assert.equal(expiryOverflow.cause, undefined);
    assert.deepEqual(Object.keys(expiryOverflow), []);

    const unavailable = new LiveObservationStoreUnavailableError();
    assert.equal(unavailable.message, "Live Observation Store unavailable");
    assert.equal(unavailable.cause, undefined);
    assert.deepEqual(Object.keys(unavailable), []);
  });

  contractTest("returns fresh copies for every active and terminal result", async ({
    store
  }) => {
    const created = await store.createSession(createInput());
    assertKind(created, "created");
    const firstRead = await store.readSession({ observationId: OBSERVATION_ID });
    const secondRead = await store.readSession({ observationId: OBSERVATION_ID });
    assertKind(firstRead, "active");
    assertKind(secondRead, "active");

    assert.notStrictEqual(created.session, firstRead.session);
    assert.notStrictEqual(firstRead.session, secondRead.session);
    assert.notStrictEqual(firstRead.session.manifest, secondRead.session.manifest);
    assert.notStrictEqual(
      firstRead.session.manifest.adapter.payload,
      secondRead.session.manifest.adapter.payload
    );
    assert.notStrictEqual(firstRead.session.capability, secondRead.session.capability);
    assert.notStrictEqual(firstRead.session.live, secondRead.session.live);

    const stopped = await store.stopSession({
      observationId: OBSERVATION_ID,
      deploymentId: DEPLOYMENT_ID
    });
    assertKind(stopped, "stopped");
    const firstTerminalRead = await store.readSession({
      observationId: OBSERVATION_ID
    });
    const secondTerminalRead = await store.readSession({
      observationId: OBSERVATION_ID
    });
    assertKind(firstTerminalRead, "terminal");
    assertKind(secondTerminalRead, "terminal");
    assert.notStrictEqual(stopped.session, firstTerminalRead.session);
    assert.notStrictEqual(firstTerminalRead.session, secondTerminalRead.session);
    assert.notStrictEqual(
      firstTerminalRead.session.finalLive,
      secondTerminalRead.session.finalLive
    );
  });
}

function createInput(
  overrides: {
    observationId?: string;
    deploymentId?: string;
    capability?: { kid: string; tokenVersion: number };
  } = {}
): LiveObservationStoreCreateInput {
  const deploymentId = overrides.deploymentId ?? DEPLOYMENT_ID;

  return {
    observationId: overrides.observationId ?? OBSERVATION_ID,
    manifest: createManifest(deploymentId),
    capability: overrides.capability ?? {
      kid: "current-key",
      tokenVersion: 1
    }
  };
}

function createManifest(
  deploymentId: string = DEPLOYMENT_ID
): DeploymentLiveObservationManifestV2 {
  const resourceSuffix = deploymentId.replaceAll("-", "").slice(0, 12).toLowerCase();

  return {
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId,
      terraformArtifactSha256: ARTIFACT_SHA,
      awsConnectionId: AWS_CONNECTION_ID,
      region: "ap-northeast-2",
      verifiedAt: "2026-07-11T00:00:00.000Z"
    },
    endpoints: {
      audienceBaseUrl: "https://audience.example.com",
      trafficUrl: `https://api-${resourceSuffix}.example.com/traffic`
    },
    pressure: {
      metric: "requests_per_target_per_minute",
      target: 60,
      windowSeconds: 60
    },
    adapter: {
      kind: "aws-live-observation",
      version: 2,
      payload: {
        trafficHostname: `api-${resourceSuffix}.example.com`,
        loadBalancerDnsName:
          `sc-lo-alb-${resourceSuffix}-123456789.ap-northeast-2.elb.amazonaws.com`,
        loadBalancerArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:" +
          "loadbalancer/app/sc-lo-alb-" +
          resourceSuffix +
          "/50dc6c495c0c9188",
        targetGroupArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:" +
          "targetgroup/sc-lo-api-" +
          resourceSuffix +
          "/6d0ecf831eec9f09",
        capacityTarget: {
          kind: "asg",
          autoScalingGroupName: "sc-lo-asg-" + resourceSuffix
        }
      }
    }
  };
}

function eventId(index: number): string {
  return (
    "00000000-0000-4000-8000-" + index.toString(16).padStart(12, "0")
  );
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function observation(
  observedAtMs: number,
  payload: unknown
): { observedAt: string; payload: never } {
  return {
    observedAt: iso(observedAtMs),
    payload: payload as never
  };
}

function asPayload(
  manifest: DeploymentLiveObservationManifestV2
): Record<string, string> {
  return manifest.adapter.payload as Record<string, string>;
}

function asAsgCapacityTarget(
  manifest: DeploymentLiveObservationManifestV2
): { kind: "asg"; autoScalingGroupName: string } {
  if (
    manifest.adapter.version !== 2 ||
    manifest.adapter.payload.capacityTarget.kind !== "asg"
  ) {
    assert.fail("Expected adapter v2 ASG capacity target");
  }
  return manifest.adapter.payload.capacityTarget;
}

function mutateInput(
  mutate: (candidate: LiveObservationStoreCreateInput) => void
): LiveObservationStoreCreateInput {
  const candidate = structuredClone(createInput());
  mutate(candidate);
  return candidate;
}

async function captureError(callback: () => Promise<unknown>): Promise<Error> {
  try {
    await callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }

  assert.fail("Expected operation to reject");
}

function assertGenericInputError(error: Error): void {
  assert.ok(error instanceof LiveObservationStoreInputError);
  assert.equal(error.message, "Invalid Live Observation Store input");
  assert.equal(error.cause, undefined);
  assert.deepEqual(Object.keys(error), []);
}

function assertKind<
  TResult extends { kind: string },
  TKind extends TResult["kind"]
>(
  result: TResult,
  kind: TKind
): asserts result is Extract<TResult, { kind: TKind }> {
  assert.equal(result.kind, kind);
}
