import type {
  DeploymentLiveObservationManifestV2,
  IsoDateTimeString
} from "@sketchcatch/types";
import { parseDeploymentLiveObservationManifestV2 } from "./live-observation-manifest.js";
import { parseLiveObservationProviderSnapshot } from "./live-observation-provider-snapshot.js";
import {
  LIVE_OBSERVATION_STORE_POLICY,
  LiveObservationStoreClockError,
  LiveObservationStoreInputError,
  type LiveObservationStore,
  type LiveObservationStoreActiveSession,
  type LiveObservationStoreCreateInput,
  type LiveObservationStoreLiveView,
  type LiveObservationStoreObservation,
  type LiveObservationStoreObserverLease,
  type LiveObservationStoreTerminalSession
} from "./live-observation-store.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

type OperationTime = {
  epochMs: number;
  iso: IsoDateTimeString;
};

type ActiveSessionRecord = {
  observationId: string;
  deploymentId: string;
  manifest: DeploymentLiveObservationManifestV2;
  capability: {
    kid: string;
    tokenVersion: number;
  };
  createdAt: IsoDateTimeString;
  createdAtMs: number;
  expiresAt: IsoDateTimeString;
  expiresAtMs: number;
  acceptedEventCount: number;
  acceptedEventIds: Set<string>;
  acceptedBySecond: Map<number, number>;
  expiryWindowAcceptedCount: number;
  expiryFinalLive: LiveObservationStoreLiveView;
  latestObservation: LiveObservationStoreObservation | null;
  expiryFinalObservation: LiveObservationStoreObservation | null;
  observerFencingToken: number;
  observerLease: ObserverLeaseRecord | null;
};

type ObserverLeaseRecord = LiveObservationStoreObserverLease & {
  observerId: string;
  expiresAtMs: number;
};

type TerminalSessionRecord = {
  session: LiveObservationStoreTerminalSession;
  purgeAtMs: number;
};

type ReconciledSession =
  | { kind: "active"; record: ActiveSessionRecord }
  | { kind: "terminal"; record: TerminalSessionRecord }
  | { kind: "not_found" };

export function createInMemoryLiveObservationStore(options: {
  now?: () => number;
} = {}): LiveObservationStore {
  const now = options.now ?? Date.now;
  const activeSessions = new Map<string, ActiveSessionRecord>();
  const terminalSessions = new Map<string, TerminalSessionRecord>();
  const activeObservationByDeployment = new Map<string, string>();

  function compareDeleteDeploymentClaim(record: ActiveSessionRecord): void {
    if (
      activeObservationByDeployment.get(record.deploymentId) ===
      record.observationId
    ) {
      activeObservationByDeployment.delete(record.deploymentId);
    }
  }

  function expireSession(record: ActiveSessionRecord): TerminalSessionRecord {
    const session: LiveObservationStoreTerminalSession = {
      observationId: record.observationId,
      deploymentId: record.deploymentId,
      status: "expired",
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      terminalAt: record.expiresAt,
      finalLive: structuredClone(record.expiryFinalLive),
      finalObservation: cloneObservation(record.expiryFinalObservation)
    };
    const terminalRecord = {
      session,
      purgeAtMs:
        record.expiresAtMs +
        LIVE_OBSERVATION_STORE_POLICY.terminalTombstoneRetentionMs
    };

    activeSessions.delete(record.observationId);
    compareDeleteDeploymentClaim(record);
    terminalSessions.set(record.observationId, terminalRecord);
    return terminalRecord;
  }

  function reconcileObservation(
    observationId: string,
    evaluatedAtMs: number
  ): ReconciledSession {
    const existingTerminal = terminalSessions.get(observationId);

    if (existingTerminal) {
      if (evaluatedAtMs >= existingTerminal.purgeAtMs) {
        terminalSessions.delete(observationId);
        return { kind: "not_found" };
      }

      return { kind: "terminal", record: existingTerminal };
    }

    const activeRecord = activeSessions.get(observationId);

    if (!activeRecord) {
      return { kind: "not_found" };
    }

    if (evaluatedAtMs < activeRecord.expiresAtMs) {
      return { kind: "active", record: activeRecord };
    }

    const expired = expireSession(activeRecord);

    if (evaluatedAtMs >= expired.purgeAtMs) {
      terminalSessions.delete(observationId);
      return { kind: "not_found" };
    }

    return { kind: "terminal", record: expired };
  }

  function reconcileDeploymentClaim(
    deploymentId: string,
    evaluatedAtMs: number
  ): void {
    const observationId = activeObservationByDeployment.get(deploymentId);

    if (!observationId) {
      return;
    }

    const reconciled = reconcileObservation(observationId, evaluatedAtMs);

    if (
      reconciled.kind !== "active" &&
      activeObservationByDeployment.get(deploymentId) === observationId
    ) {
      activeObservationByDeployment.delete(deploymentId);
    }
  }

  return Object.freeze({
    async createSession(input) {
      const parsed = parseCreateInput(input);
      const evaluatedAt = readOperationTime(now);
      const deploymentId = parsed.manifest.provenance.deploymentId;

      reconcileDeploymentClaim(deploymentId, evaluatedAt.epochMs);
      const claimedObservationId =
        activeObservationByDeployment.get(deploymentId);

      if (claimedObservationId) {
        const claimed = activeSessions.get(claimedObservationId);

        if (claimed) {
          return {
            kind: "active_exists",
            evaluatedAt: evaluatedAt.iso,
            session: createActiveSession(claimed, evaluatedAt.epochMs)
          };
        }

        activeObservationByDeployment.delete(deploymentId);
      }

      if (
        reconcileObservation(parsed.observationId, evaluatedAt.epochMs).kind !==
        "not_found"
      ) {
        return {
          kind: "observation_id_conflict",
          evaluatedAt: evaluatedAt.iso
        };
      }

      const expiry = addClockDuration(
        evaluatedAt.epochMs,
        LIVE_OBSERVATION_STORE_POLICY.sessionLifetimeMs
      );
      const record: ActiveSessionRecord = {
        observationId: parsed.observationId,
        deploymentId,
        manifest: parsed.manifest,
        capability: parsed.capability,
        createdAt: evaluatedAt.iso,
        createdAtMs: evaluatedAt.epochMs,
        expiresAt: expiry.iso,
        expiresAtMs: expiry.epochMs,
        acceptedEventCount: 0,
        acceptedEventIds: new Set(),
        acceptedBySecond: new Map(),
        expiryWindowAcceptedCount: 0,
        expiryFinalLive: createLiveViewFromCount(
          0,
          0,
          parsed.manifest.pressure.target,
          expiry.iso
        ),
        latestObservation: null,
        expiryFinalObservation: null,
        observerFencingToken: 0,
        observerLease: null
      };

      activeSessions.set(record.observationId, record);
      activeObservationByDeployment.set(record.deploymentId, record.observationId);

      return {
        kind: "created",
        evaluatedAt: evaluatedAt.iso,
        session: createActiveSession(record, evaluatedAt.epochMs)
      };
    },

    async readSession(input) {
      const { observationId } = parseReadInput(input);
      const evaluatedAt = readOperationTime(now);
      const reconciled = reconcileObservation(
        observationId,
        evaluatedAt.epochMs
      );

      if (reconciled.kind === "active") {
        return {
          kind: "active",
          evaluatedAt: evaluatedAt.iso,
          session: createActiveSession(
            reconciled.record,
            evaluatedAt.epochMs
          )
        };
      }

      if (reconciled.kind === "terminal") {
        return {
          kind: "terminal",
          evaluatedAt: evaluatedAt.iso,
          session: cloneTerminalSession(reconciled.record)
        };
      }

      return {
        kind: "not_found",
        evaluatedAt: evaluatedAt.iso
      };
    },

    async collectEvent(input) {
      const { observationId, eventId } = parseCollectInput(input);
      const evaluatedAt = readOperationTime(now);
      const reconciled = reconcileObservation(
        observationId,
        evaluatedAt.epochMs
      );

      if (reconciled.kind === "terminal") {
        return {
          kind: "gone",
          evaluatedAt: evaluatedAt.iso,
          session: cloneTerminalSession(reconciled.record)
        };
      }

      if (reconciled.kind === "active") {
        const record = reconciled.record;

        if (record.acceptedEventIds.has(eventId)) {
          return {
            kind: "duplicate",
            evaluatedAt: evaluatedAt.iso,
            live: createLiveView(record, evaluatedAt.epochMs)
          };
        }

        if (
          record.acceptedEventCount >=
          LIVE_OBSERVATION_STORE_POLICY.maxAcceptedEventsPerSession
        ) {
          return {
            kind: "event_limit_reached",
            evaluatedAt: evaluatedAt.iso,
            live: createLiveView(record, evaluatedAt.epochMs)
          };
        }

        const currentSecond = Math.floor(evaluatedAt.epochMs / 1_000);
        const currentSecondProgress =
          (evaluatedAt.epochMs - currentSecond * 1_000) / 1_000;
        const candidateCurrentSecond =
          (record.acceptedBySecond.get(currentSecond) ?? 0) + 1;
        const previousSecond =
          record.acceptedBySecond.get(currentSecond - 1) ?? 0;
        const weightedBurst =
          candidateCurrentSecond +
          previousSecond * (1 - currentSecondProgress);
        const rollingCandidate =
          acceptedCountInWindow(record, currentSecond) + 1;

        if (
          weightedBurst >
            LIVE_OBSERVATION_STORE_POLICY.maxWeightedBurstPerSecond ||
          rollingCandidate >
            LIVE_OBSERVATION_STORE_POLICY.maxAcceptedEventsPerRateWindow
        ) {
          return {
            kind: "rate_limited",
            evaluatedAt: evaluatedAt.iso,
            live: createLiveView(record, evaluatedAt.epochMs)
          };
        }

        record.acceptedEventIds.add(eventId);
        record.acceptedEventCount += 1;
        record.acceptedBySecond.set(
          currentSecond,
          candidateCurrentSecond
        );
        updateExpiryFinalLive(record, currentSecond);

        return {
          kind: "accepted",
          evaluatedAt: evaluatedAt.iso,
          live: createLiveView(record, evaluatedAt.epochMs)
        };
      }

      return {
        kind: "not_found",
        evaluatedAt: evaluatedAt.iso
      };
    },

    async stopSession(input) {
      const { observationId, deploymentId } = parseStopInput(input);
      const evaluatedAt = readOperationTime(now);
      const reconciled = reconcileObservation(
        observationId,
        evaluatedAt.epochMs
      );

      if (reconciled.kind === "terminal") {
        if (reconciled.record.session.deploymentId !== deploymentId) {
          return {
            kind: "not_found",
            evaluatedAt: evaluatedAt.iso
          };
        }

        return {
          kind: "already_terminal",
          evaluatedAt: evaluatedAt.iso,
          session: cloneTerminalSession(reconciled.record)
        };
      }

      if (
        reconciled.kind === "active" &&
        reconciled.record.deploymentId === deploymentId
      ) {
        const record = reconciled.record;
        const terminalRecord: TerminalSessionRecord = {
          session: {
            observationId: record.observationId,
            deploymentId: record.deploymentId,
            status: "stopped",
            createdAt: record.createdAt,
            expiresAt: record.expiresAt,
            terminalAt: evaluatedAt.iso,
            finalLive: createLiveView(record, evaluatedAt.epochMs),
            finalObservation: cloneObservation(record.latestObservation)
          },
          purgeAtMs:
            evaluatedAt.epochMs +
            LIVE_OBSERVATION_STORE_POLICY.terminalTombstoneRetentionMs
        };

        activeSessions.delete(record.observationId);
        compareDeleteDeploymentClaim(record);
        terminalSessions.set(record.observationId, terminalRecord);

        return {
          kind: "stopped",
          evaluatedAt: evaluatedAt.iso,
          session: cloneTerminalSession(terminalRecord)
        };
      }

      return {
        kind: "not_found",
        evaluatedAt: evaluatedAt.iso
      };
    },

    async claimObserverLease(input) {
      const { observationId, observerId } = parseObserverLeaseInput(input);
      const evaluatedAt = readOperationTime(now);
      const reconciled = reconcileObservation(
        observationId,
        evaluatedAt.epochMs
      );

      if (reconciled.kind === "terminal") {
        return {
          kind: "gone",
          evaluatedAt: evaluatedAt.iso,
          session: cloneTerminalSession(reconciled.record)
        };
      }

      if (reconciled.kind === "not_found") {
        return {
          kind: "not_found",
          evaluatedAt: evaluatedAt.iso
        };
      }

      const record = reconciled.record;
      const existing = record.observerLease;

      if (existing && evaluatedAt.epochMs < existing.expiresAtMs) {
        if (existing.observerId !== observerId) {
          return {
            kind: "contended",
            evaluatedAt: evaluatedAt.iso
          };
        }

        const expiry = createCappedLeaseExpiry(
          evaluatedAt.epochMs,
          LIVE_OBSERVATION_STORE_POLICY.observerLeaseDurationMs,
          record
        );
        existing.expiresAtMs = expiry.epochMs;
        existing.expiresAt = expiry.iso;

        return {
          kind: "claimed",
          evaluatedAt: evaluatedAt.iso,
          lease: cloneObserverLease(existing)
        };
      }

      record.observerFencingToken += 1;
      const expiry = createCappedLeaseExpiry(
        evaluatedAt.epochMs,
        LIVE_OBSERVATION_STORE_POLICY.observerLeaseDurationMs,
        record
      );
      const lease: ObserverLeaseRecord = {
        observerId,
        fencingToken: record.observerFencingToken,
        expiresAt: expiry.iso,
        expiresAtMs: expiry.epochMs
      };
      record.observerLease = lease;

      return {
        kind: "claimed",
        evaluatedAt: evaluatedAt.iso,
        lease: cloneObserverLease(lease)
      };
    },

    async commitObservation(input) {
      const parsed = parseObservationCommitInput(input);
      const evaluatedAt = readOperationTime(now);

      if (parsed.observedAtMs > evaluatedAt.epochMs) {
        throw new LiveObservationStoreInputError();
      }

      const reconciled = reconcileObservation(
        parsed.observationId,
        evaluatedAt.epochMs
      );

      if (reconciled.kind === "terminal") {
        return {
          kind: "gone",
          evaluatedAt: evaluatedAt.iso,
          session: cloneTerminalSession(reconciled.record)
        };
      }

      if (reconciled.kind === "not_found") {
        return {
          kind: "not_found",
          evaluatedAt: evaluatedAt.iso
        };
      }

      const record = reconciled.record;
      const lease = record.observerLease;

      if (
        !lease ||
        evaluatedAt.epochMs >= lease.expiresAtMs ||
        lease.observerId !== parsed.observerId ||
        lease.fencingToken !== parsed.fencingToken
      ) {
        if (lease && evaluatedAt.epochMs >= lease.expiresAtMs) {
          record.observerLease = null;
        }

        return {
          kind: "lease_lost",
          evaluatedAt: evaluatedAt.iso
        };
      }

      if (
        record.latestObservation &&
        parsed.observedAtMs <=
          Date.parse(record.latestObservation.observedAt)
      ) {
        return {
          kind: "stale_observation",
          evaluatedAt: evaluatedAt.iso
        };
      }

      record.latestObservation = cloneObservation(parsed.observation);
      record.expiryFinalObservation = cloneObservation(parsed.observation);

      return {
        kind: "committed",
        evaluatedAt: evaluatedAt.iso
      };
    }
  });
}

function parseCreateInput(input: unknown): LiveObservationStoreCreateInput {
  try {
    assertExactObject(input, ["observationId", "manifest", "capability"]);
    const observationId = parseCanonicalUuid(input.observationId);
    assertExactObject(input.capability, ["kid", "tokenVersion"]);
    const kid = input.capability.kid;
    const tokenVersion = input.capability.tokenVersion;

    if (
      typeof kid !== "string" ||
      !KID_PATTERN.test(kid) ||
      !Number.isSafeInteger(tokenVersion) ||
      (tokenVersion as number) <= 0
    ) {
      throw new LiveObservationStoreInputError();
    }

    const manifest = parseDeploymentLiveObservationManifestV2(input.manifest);
    parseCanonicalUuid(manifest.provenance.deploymentId);

    return {
      observationId,
      manifest,
      capability: {
        kid,
        tokenVersion: tokenVersion as number
      }
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

function parseReadInput(input: unknown): { observationId: string } {
  try {
    assertExactObject(input, ["observationId"]);
    return {
      observationId: parseCanonicalUuid(input.observationId)
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

function parseCollectInput(input: unknown): {
  observationId: string;
  eventId: string;
} {
  try {
    assertExactObject(input, ["observationId", "eventId"]);
    return {
      observationId: parseCanonicalUuid(input.observationId),
      eventId: parseCanonicalUuid(input.eventId)
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

function parseStopInput(input: unknown): {
  observationId: string;
  deploymentId: string;
} {
  try {
    assertExactObject(input, ["observationId", "deploymentId"]);
    return {
      observationId: parseCanonicalUuid(input.observationId),
      deploymentId: parseCanonicalUuid(input.deploymentId)
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

function parseObserverLeaseInput(input: unknown): {
  observationId: string;
  observerId: string;
} {
  try {
    assertExactObject(input, ["observationId", "observerId"]);
    return {
      observationId: parseCanonicalUuid(input.observationId),
      observerId: parseCanonicalUuid(input.observerId)
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

function parseObservationCommitInput(input: unknown): {
  observationId: string;
  observerId: string;
  fencingToken: number;
  observation: LiveObservationStoreObservation;
  observedAtMs: number;
} {
  try {
    assertExactObject(input, [
      "observationId",
      "observerId",
      "fencingToken",
      "observation"
    ]);
    assertExactObject(input.observation, ["observedAt", "payload"]);
    if (
      !Number.isSafeInteger(input.fencingToken) ||
      (input.fencingToken as number) <= 0
    ) {
      throw new LiveObservationStoreInputError();
    }

    const observedAt = parseCanonicalIso(input.observation.observedAt);

    return {
      observationId: parseCanonicalUuid(input.observationId),
      observerId: parseCanonicalUuid(input.observerId),
      fencingToken: input.fencingToken as number,
      observation: {
        observedAt,
        payload: parseLiveObservationProviderSnapshot(input.observation.payload)
      },
      observedAtMs: Date.parse(observedAt)
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

function assertExactObject(
  value: unknown,
  expectedKeys: string[]
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LiveObservationStoreInputError();
  }

  const keys = Object.keys(value);

  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new LiveObservationStoreInputError();
  }
}

function parseCanonicalUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new LiveObservationStoreInputError();
  }

  return value;
}

function parseCanonicalIso(value: unknown): IsoDateTimeString {
  if (typeof value !== "string") {
    throw new LiveObservationStoreInputError();
  }

  try {
    if (new Date(value).toISOString() !== value) {
      throw new LiveObservationStoreInputError();
    }
  } catch {
    throw new LiveObservationStoreInputError();
  }

  return value;
}

function readOperationTime(now: () => number): OperationTime {
  let epochMs: number;

  try {
    epochMs = now();
  } catch {
    throw new LiveObservationStoreClockError();
  }

  if (!Number.isSafeInteger(epochMs)) {
    throw new LiveObservationStoreClockError();
  }

  try {
    return {
      epochMs,
      iso: new Date(epochMs).toISOString()
    };
  } catch {
    throw new LiveObservationStoreClockError();
  }
}

function addClockDuration(epochMs: number, durationMs: number): OperationTime {
  const result = epochMs + durationMs;

  if (!Number.isSafeInteger(result)) {
    throw new LiveObservationStoreClockError();
  }

  try {
    return {
      epochMs: result,
      iso: new Date(result).toISOString()
    };
  } catch {
    throw new LiveObservationStoreClockError();
  }
}

function createCappedLeaseExpiry(
  evaluatedAtMs: number,
  durationMs: number,
  record: ActiveSessionRecord
): OperationTime {
  const uncapped = evaluatedAtMs + durationMs;

  if (!Number.isSafeInteger(uncapped)) {
    throw new LiveObservationStoreClockError();
  }

  const epochMs = Math.min(uncapped, record.expiresAtMs);
  try {
    return {
      epochMs,
      iso: new Date(epochMs).toISOString()
    };
  } catch {
    throw new LiveObservationStoreClockError();
  }
}

function cloneObserverLease(
  lease: ObserverLeaseRecord
): LiveObservationStoreObserverLease {
  return {
    fencingToken: lease.fencingToken,
    expiresAt: lease.expiresAt
  };
}

function cloneObservation(
  observation: LiveObservationStoreObservation | null
): LiveObservationStoreObservation | null {
  return observation ? structuredClone(observation) : null;
}

function createActiveSession(
  record: ActiveSessionRecord,
  evaluatedAtMs: number
): LiveObservationStoreActiveSession {
  return structuredClone({
    observationId: record.observationId,
    deploymentId: record.deploymentId,
    status: "active",
    manifest: record.manifest,
    capability: record.capability,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    live: createLiveView(record, evaluatedAtMs),
    latestObservation: record.latestObservation
  });
}

function cloneTerminalSession(
  record: TerminalSessionRecord
): LiveObservationStoreTerminalSession {
  return structuredClone(record.session);
}

function createLiveView(
  record: ActiveSessionRecord,
  evaluatedAtMs: number
): LiveObservationStoreLiveView {
  const currentSecond = Math.floor(evaluatedAtMs / 1_000);
  const rollingCount = acceptedCountInWindow(record, currentSecond);

  return createLiveViewFromCount(
    record.acceptedEventCount,
    rollingCount,
    record.manifest.pressure.target,
    new Date(evaluatedAtMs).toISOString()
  );
}

function acceptedCountInWindow(
  record: ActiveSessionRecord,
  currentSecond: number
): number {
  const minimumSecond =
    currentSecond - (LIVE_OBSERVATION_STORE_POLICY.rollingWindowSeconds - 1);
  let rollingCount = 0;

  for (const [second, count] of record.acceptedBySecond) {
    if (second < minimumSecond) {
      record.acceptedBySecond.delete(second);
    } else if (second <= currentSecond) {
      rollingCount += count;
    }
  }

  return rollingCount;
}

function updateExpiryFinalLive(
  record: ActiveSessionRecord,
  acceptedSecond: number
): void {
  const expirySecond = Math.floor(record.expiresAtMs / 1_000);
  const minimumExpirySecond =
    expirySecond - (LIVE_OBSERVATION_STORE_POLICY.rollingWindowSeconds - 1);

  if (
    acceptedSecond >= minimumExpirySecond &&
    acceptedSecond <= expirySecond
  ) {
    record.expiryWindowAcceptedCount += 1;
  }

  record.expiryFinalLive = createLiveViewFromCount(
    record.acceptedEventCount,
    record.expiryWindowAcceptedCount,
    record.manifest.pressure.target,
    record.expiresAt
  );
}

function createLiveViewFromCount(
  acceptedEventCount: number,
  rollingCount: number,
  pressureTarget: number,
  observedAt: IsoDateTimeString
): LiveObservationStoreLiveView {
  const rollingRequestsPerSecond = roundMetric(
    rollingCount / LIVE_OBSERVATION_STORE_POLICY.rollingWindowSeconds
  );
  const projectedRequestsPerMinute = roundMetric(
    rollingRequestsPerSecond * 60
  );
  const pressurePercent = roundMetric(
    (projectedRequestsPerMinute / pressureTarget) * 100
  );

  return {
    acceptedEventCount,
    rollingRequestsPerSecond,
    projectedRequestsPerMinute,
    pressurePercent,
    pressureLevel: pressureLevel(pressurePercent),
    observedAt
  };
}

function pressureLevel(
  pressurePercent: number
): LiveObservationStoreLiveView["pressureLevel"] {
  if (pressurePercent >= 100) {
    return "critical";
  }

  if (pressurePercent >= 70) {
    return "high";
  }

  if (pressurePercent >= 40) {
    return "warning";
  }

  return "normal";
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
