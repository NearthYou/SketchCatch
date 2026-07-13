import type {
  DeploymentLiveObservationManifestV2,
  IsoDateTimeString,
  LiveObservationProviderSnapshot
} from "@sketchcatch/types";
import { parseDeploymentLiveObservationManifestV2 } from "./live-observation-manifest.js";
import { parseLiveObservationProviderSnapshot } from "./live-observation-provider-snapshot.js";
import {
  LIVE_OBSERVATION_STORE_POLICY,
  LiveObservationStoreInputError,
  type LiveObservationStoreCreateInput,
  type LiveObservationStoreLiveView,
  type LiveObservationStoreObservation
} from "./live-observation-store.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function parseStoreCreateInput(input: unknown): LiveObservationStoreCreateInput {
  try {
    assertExactObject(input, ["observationId", "manifest", "capability"]);
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
      observationId: parseCanonicalUuid(input.observationId),
      manifest,
      capability: { kid, tokenVersion: tokenVersion as number }
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

export function parseStoreReadInput(input: unknown): { observationId: string } {
  return parseExactUuidInput(input, ["observationId"]);
}

export function parseStoreCollectInput(input: unknown): {
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

export function parseStoreStopInput(input: unknown): {
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

export function parseStoreObserverLeaseInput(input: unknown): {
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

export function parseStoreObservationCommitInput(input: unknown): {
  observationId: string;
  observerId: string;
  fencingToken: number;
  observation: LiveObservationStoreObservation;
  observedAtMs: number;
} {
  try {
    assertExactObject(input, ["observationId", "observerId", "fencingToken", "observation"]);
    assertExactObject(input.observation, ["observedAt", "payload"]);
    if (!Number.isSafeInteger(input.fencingToken) || (input.fencingToken as number) <= 0) {
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

export function parseStorePresenterLeaseInput(input: unknown): {
  observationId: string;
  leaseId: string;
} {
  try {
    assertExactObject(input, ["observationId", "leaseId"]);
    return {
      observationId: parseCanonicalUuid(input.observationId),
      leaseId: parseCanonicalUuid(input.leaseId)
    };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

export function cloneStoreSnapshot(value: unknown): LiveObservationProviderSnapshot {
  return parseLiveObservationProviderSnapshot(value);
}

export function parseStoredManifest(value: string): DeploymentLiveObservationManifestV2 {
  return parseDeploymentLiveObservationManifestV2(JSON.parse(value) as unknown);
}

export function parseStoredObservation(value: string): LiveObservationStoreObservation | null {
  if (value === "") {
    return null;
  }
  const parsed = JSON.parse(value) as unknown;
  assertExactObject(parsed, ["observedAt", "payload"]);
  return {
    observedAt: parseCanonicalIso(parsed.observedAt),
    payload: cloneStoreSnapshot(parsed.payload)
  };
}

export function createStoreLiveView(
  acceptedEventCount: number,
  rollingCount: number,
  pressureTarget: number,
  observedAtMs: number
): LiveObservationStoreLiveView {
  const rollingRequestsPerSecond = roundMetric(
    rollingCount / LIVE_OBSERVATION_STORE_POLICY.rollingWindowSeconds
  );
  const projectedRequestsPerMinute = roundMetric(rollingRequestsPerSecond * 60);
  const pressurePercent = roundMetric((projectedRequestsPerMinute / pressureTarget) * 100);
  return {
    acceptedEventCount,
    rollingRequestsPerSecond,
    projectedRequestsPerMinute,
    pressurePercent,
    pressureLevel:
      pressurePercent >= 100
        ? "critical"
        : pressurePercent >= 70
          ? "high"
          : pressurePercent >= 40
            ? "warning"
            : "normal",
    observedAt: epochMsToIso(observedAtMs)
  };
}

export function epochMsToIso(value: number): IsoDateTimeString {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Invalid stored epoch");
  }
  return new Date(value).toISOString();
}

export function parseSafeInteger(value: unknown): number {
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError("Invalid stored integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError("Invalid stored integer");
  }
  return parsed;
}

function parseExactUuidInput(input: unknown, keys: ["observationId"]): { observationId: string } {
  try {
    assertExactObject(input, keys);
    return { observationId: parseCanonicalUuid(input.observationId) };
  } catch {
    throw new LiveObservationStoreInputError();
  }
}

function assertExactObject(
  value: unknown,
  expectedKeys: readonly string[]
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

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
