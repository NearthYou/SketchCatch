import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  CollectLiveObservationEventResponse,
  CreateLiveObservationResponse,
  DeploymentLiveProfile,
  DeploymentStatus,
  LiveObservationPressureLevel,
  LiveObservationSession,
  LiveObservationSnapshot,
  LiveObservationStatus
} from "@sketchcatch/types";
import type {
  RuntimeCache,
  RuntimeCacheEntryKey,
  RuntimeCacheJsonValue
} from "../runtime-cache/index.js";
import type {
  DeploymentObservation,
  DeploymentObservabilityProvider,
  DeploymentObservabilityTarget
} from "./deployment-observability-provider.js";
import { createUnavailableDeploymentObservation } from "./deployment-observability-provider.js";

const SESSION_TTL_MS = 15 * 60 * 1_000;
const REQUEST_BUCKET_TTL_MS = 30_000;
const AWS_OBSERVATION_TTL_MS = 10_000;
const ROLLING_WINDOW_SECONDS = 10;
const RATE_WINDOW_SECONDS = 10;
const MAX_BURST_PER_SECOND = 20;
const MAX_RECEIPTS_PER_RATE_WINDOW = 100;
const MAX_ACCEPTED_EVENTS = 5_000;

const SESSION_NAMESPACE = "live-observation-session";
const EVENT_NAMESPACE = "live-observation-event";
const BUCKET_NAMESPACE = "live-observation-bucket";

export type LiveObservationServiceErrorCode =
  | "LIVE_OBSERVATION_CACHE_UNAVAILABLE"
  | "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE"
  | "LIVE_OBSERVATION_GONE"
  | "LIVE_OBSERVATION_NOT_FOUND"
  | "LIVE_OBSERVATION_OUTPUT_INVALID"
  | "LIVE_OBSERVATION_RATE_LIMITED";

export class LiveObservationServiceError extends Error {
  constructor(
    readonly code: LiveObservationServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LiveObservationServiceError";
  }
}

export type CreateLiveObservationServiceOptions = {
  readonly runtimeCache: RuntimeCache;
  readonly observabilityProvider: DeploymentObservabilityProvider;
  readonly publicApiBaseUrl: string;
  readonly invalidateObservationCacheOnEvent?: boolean | undefined;
  readonly requireSharedCache?: boolean | undefined;
  readonly maxAcceptedEvents?: number | undefined;
  readonly now?: (() => number) | undefined;
  readonly createObservationId?: (() => string) | undefined;
  readonly createPublicToken?: (() => string) | undefined;
  readonly onSessionTerminal?: ((observationId: string) => void) | undefined;
};

export type CreateLiveObservationSessionInput = {
  readonly deploymentId: string;
  readonly status: DeploymentStatus;
  readonly liveProfile: DeploymentLiveProfile;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly observationTarget: Pick<
    DeploymentObservabilityTarget,
    "awsConnectionId" | "roleArn" | "externalId" | "region"
  >;
};

type StoredLiveObservationSession = {
  readonly session: LiveObservationSession;
  readonly publicTokenHash: string;
  readonly scaleOutThreshold: number;
  readonly observationTarget: DeploymentObservabilityTarget;
};

type RequiredDeploymentOutputs = {
  readonly staticSiteUrl: string;
  readonly apiBaseUrl: string;
  readonly albArnSuffix: string;
  readonly targetGroupArnSuffix: string;
  readonly scaleOutThreshold: number;
  readonly capacityTarget: DeploymentObservabilityTarget["capacityTarget"];
};

export type LiveObservationService = ReturnType<typeof createLiveObservationService>;

export function createLiveObservationService(options: CreateLiveObservationServiceOptions) {
  const now = options.now ?? Date.now;
  const createObservationId = options.createObservationId ?? randomUUID;
  const createPublicToken =
    options.createPublicToken ?? (() => randomBytes(32).toString("base64url"));
  const maxAcceptedEvents = options.maxAcceptedEvents ?? MAX_ACCEPTED_EVENTS;
  const publicApiBaseUrl = normalizeHttpUrl(options.publicApiBaseUrl, "public API base URL");

  return {
    async createSession(
      input: CreateLiveObservationSessionInput
    ): Promise<CreateLiveObservationResponse> {
      assertEligibleDeployment(input);
      const requiredOutputs = parseRequiredOutputs(input.outputs);
      const cacheDegradationCount = await assertCacheAvailable(options);

      const existingSession = await readActiveDeploymentSession(
        options.runtimeCache,
        input.deploymentId,
        now()
      );

      if (existingSession) {
        const snapshot = await getSnapshot(existingSession.session.id);

        if ((await assertCacheAvailable(options)) !== cacheDegradationCount) {
          throw new LiveObservationServiceError(
            "LIVE_OBSERVATION_CACHE_UNAVAILABLE",
            "Redis Runtime Cache degraded while reading the active Live Observation"
          );
        }

        return {
          session: existingSession.session,
          snapshot
        };
      }

      const createdAtMs = now();
      const observationId = createObservationId();
      const publicToken = createPublicToken();
      const publicTokenHash = hashPublicToken(publicToken);
      const trafficApiUrl = createTrafficApiUrl(requiredOutputs.apiBaseUrl);
      const session: LiveObservationSession = {
        id: observationId,
        deploymentId: input.deploymentId,
        status: "active",
        audienceUrl: createAudienceUrl(
          requiredOutputs.staticSiteUrl,
          publicToken,
          publicApiBaseUrl,
          trafficApiUrl
        ),
        trafficApiUrl,
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + SESSION_TTL_MS).toISOString()
      };
      const storedSession: StoredLiveObservationSession = {
        session,
        publicTokenHash,
        scaleOutThreshold: requiredOutputs.scaleOutThreshold,
        observationTarget: {
          ...input.observationTarget,
          capacityTarget: requiredOutputs.capacityTarget,
          albArnSuffix: requiredOutputs.albArnSuffix,
          targetGroupArnSuffix: requiredOutputs.targetGroupArnSuffix
        }
      };

      await options.runtimeCache.set(
        createSessionKey(observationId),
        toRuntimeCacheValue(storedSession),
        { ttlMs: SESSION_TTL_MS }
      );
      await options.runtimeCache.set(
        createPublicTokenKey(publicTokenHash),
        observationId,
        { ttlMs: SESSION_TTL_MS }
      );

      const becameActive = await options.runtimeCache.setIfAbsent(
        createActiveDeploymentKey(input.deploymentId),
        observationId,
        { ttlMs: SESSION_TTL_MS }
      );

      if (!becameActive) {
        await options.runtimeCache.delete(createSessionKey(observationId));
        await options.runtimeCache.delete(createPublicTokenKey(publicTokenHash));
        const winner = await readActiveDeploymentSession(
          options.runtimeCache,
          input.deploymentId,
          now()
        );

        if (winner) {
          return {
            session: winner.session,
            snapshot: await getSnapshot(winner.session.id)
          };
        }

        throw new LiveObservationServiceError(
          "LIVE_OBSERVATION_NOT_FOUND",
          "Active Live Observation session could not be loaded"
        );
      }

      const finalCacheDegradationCount = await assertCacheAvailable(options);

      if (finalCacheDegradationCount !== cacheDegradationCount) {
        await options.runtimeCache.delete(createSessionKey(observationId));
        await options.runtimeCache.delete(createPublicTokenKey(publicTokenHash));
        await options.runtimeCache.delete(createActiveDeploymentKey(input.deploymentId));
        throw new LiveObservationServiceError(
          "LIVE_OBSERVATION_CACHE_UNAVAILABLE",
          "Redis Runtime Cache degraded while creating Live Observation"
        );
      }

      const snapshot = await getSnapshot(observationId);
      const postSnapshotCacheDegradationCount = await assertCacheAvailable(options);

      if (postSnapshotCacheDegradationCount !== cacheDegradationCount) {
        await options.runtimeCache.delete(createSessionKey(observationId));
        await options.runtimeCache.delete(createPublicTokenKey(publicTokenHash));
        await options.runtimeCache.delete(createActiveDeploymentKey(input.deploymentId));
        throw new LiveObservationServiceError(
          "LIVE_OBSERVATION_CACHE_UNAVAILABLE",
          "Redis Runtime Cache degraded while reading the initial Live Observation snapshot"
        );
      }

      return { session, snapshot };
    },

    getSnapshot,

    async getSnapshotForDeployment(
      observationId: string,
      deploymentId: string
    ): Promise<LiveObservationSnapshot> {
      const storedSession = await readStoredSession(options.runtimeCache, observationId);

      if (!storedSession || storedSession.session.deploymentId !== deploymentId) {
        throw new LiveObservationServiceError(
          "LIVE_OBSERVATION_NOT_FOUND",
          "Live Observation session not found"
        );
      }

      return getSnapshot(observationId);
    },

    async getSessionForPublicToken(publicToken: string): Promise<LiveObservationSession> {
      return (
        await readSessionByPublicToken(options.runtimeCache, publicToken, now())
      ).session;
    },

    async collectEvent(input: {
      readonly publicToken: string;
      readonly eventId: string;
    }): Promise<CollectLiveObservationEventResponse> {
      const currentTimeMs = now();
      const storedSession = await readSessionByPublicToken(
        options.runtimeCache,
        input.publicToken,
        currentTimeMs
      );
      assertSessionActive(storedSession, currentTimeMs);

      const currentSecond = Math.floor(currentTimeMs / 1_000);
      const burstCount = await options.runtimeCache.increment(
        createRateSecondKey(storedSession.session.id, currentSecond),
        1,
        { ttlMs: REQUEST_BUCKET_TTL_MS }
      );
      const previousSecondBurstCount =
        (await options.runtimeCache.get<number>(
          createRateSecondKey(storedSession.session.id, currentSecond - 1)
        )) ?? 0;
      const currentSecondProgress = (currentTimeMs % 1_000) / 1_000;
      const boundaryAdjustedBurstCount =
        burstCount + previousSecondBurstCount * (1 - currentSecondProgress);
      const earlierRateCounts = await Promise.all(
        Array.from({ length: RATE_WINDOW_SECONDS - 2 }, (_, index) =>
          options.runtimeCache.get<number>(
            createRateSecondKey(storedSession.session.id, currentSecond - index - 2)
          )
        )
      );
      const rollingRateWindowCount =
        burstCount +
        previousSecondBurstCount +
        earlierRateCounts.reduce<number>((sum, count) => sum + (count ?? 0), 0);

      if (
        boundaryAdjustedBurstCount > MAX_BURST_PER_SECOND ||
        rollingRateWindowCount > MAX_RECEIPTS_PER_RATE_WINDOW
      ) {
        throw new LiveObservationServiceError(
          "LIVE_OBSERVATION_RATE_LIMITED",
          "Live Observation receipt rate limit exceeded"
        );
      }

      const eventAccepted = await options.runtimeCache.setIfAbsent(
        createEventKey(storedSession.session.id, input.eventId),
        true,
        { ttlMs: remainingSessionTtlMs(storedSession, currentTimeMs) }
      );
      const acceptedBefore = await readAcceptedEventCount(
        options.runtimeCache,
        storedSession.session.id
      );

      if (!eventAccepted) {
        return {
          accepted: false,
          acceptedEventCount: acceptedBefore
        };
      }

      const acceptedEventCount = await options.runtimeCache.increment(
        createAcceptedCountKey(storedSession.session.id),
        1,
        { ttlMs: remainingSessionTtlMs(storedSession, currentTimeMs) }
      );

      if (acceptedEventCount > maxAcceptedEvents) {
        await options.runtimeCache.increment(
          createAcceptedCountKey(storedSession.session.id),
          -1,
          { ttlMs: remainingSessionTtlMs(storedSession, currentTimeMs) }
        );
        await options.runtimeCache.delete(
          createEventKey(storedSession.session.id, input.eventId)
        );
        throw new LiveObservationServiceError(
          "LIVE_OBSERVATION_RATE_LIMITED",
          "Live Observation session event limit exceeded"
        );
      }

      await options.runtimeCache.increment(
        createLiveBucketKey(storedSession.session.id, currentSecond),
        1,
        { ttlMs: REQUEST_BUCKET_TTL_MS }
      );

      if (options.invalidateObservationCacheOnEvent) {
        await options.runtimeCache.delete(createAwsObservationKey(storedSession.session.id));
      }

      return {
        accepted: true,
        acceptedEventCount
      };
    },

    async stopSession(
      observationId: string,
      deploymentId: string
    ): Promise<LiveObservationSnapshot> {
      const storedSession = await readStoredSession(options.runtimeCache, observationId);

      if (!storedSession || storedSession.session.deploymentId !== deploymentId) {
        throw new LiveObservationServiceError(
          "LIVE_OBSERVATION_NOT_FOUND",
          "Live Observation session not found"
        );
      }

      if (storedSession.session.status === "active") {
        const stoppedSession: StoredLiveObservationSession = {
          ...storedSession,
          session: {
            ...storedSession.session,
            status: "stopped"
          }
        };

        await options.runtimeCache.set(
          createSessionKey(observationId),
          toRuntimeCacheValue(stoppedSession),
          { ttlMs: remainingSessionTtlMs(storedSession, now()) }
        );
        await options.runtimeCache.delete(createActiveDeploymentKey(deploymentId));
      }

      return getSnapshot(observationId);
    }
  };

  async function getSnapshot(observationId: string): Promise<LiveObservationSnapshot> {
    const storedSession = await readStoredSession(options.runtimeCache, observationId);

    if (!storedSession) {
      throw new LiveObservationServiceError(
        "LIVE_OBSERVATION_GONE",
        "Live Observation session expired or was removed"
      );
    }

    const currentTimeMs = now();
    const status = getEffectiveStatus(storedSession.session, currentTimeMs);
    const currentSecond = Math.floor(currentTimeMs / 1_000);
    const bucketValues = await Promise.all(
      Array.from({ length: ROLLING_WINDOW_SECONDS }, (_, index) =>
        options.runtimeCache.get<number>(
          createLiveBucketKey(
            observationId,
            currentSecond - (ROLLING_WINDOW_SECONDS - 1 - index)
          )
        )
      )
    );
    const rollingCount = bucketValues.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0
    );
    const rollingRequestsPerSecond = roundMetric(
      rollingCount / ROLLING_WINDOW_SECONDS
    );
    const projectedRequestsPerMinute = roundMetric(
      rollingRequestsPerSecond * 60
    );
    const pressurePercent = roundMetric(
      (projectedRequestsPerMinute / storedSession.scaleOutThreshold) * 100
    );
    const observation = await readDeploymentObservation(
      options.runtimeCache,
      options.observabilityProvider,
      storedSession,
      currentTimeMs
    );

    const snapshot: LiveObservationSnapshot = {
      observationId,
      status,
      live: {
        acceptedEventCount: Math.min(
          await readAcceptedEventCount(options.runtimeCache, observationId),
          MAX_ACCEPTED_EVENTS
        ),
        rollingRequestsPerSecond,
        projectedRequestsPerMinute,
        pressurePercent,
        pressureLevel: getLiveObservationPressureLevel(pressurePercent),
        observedAt: new Date(currentTimeMs).toISOString()
      },
      ...observation
    };

    if (status !== "active") {
      options.onSessionTerminal?.(observationId);
    }

    return snapshot;
  }
}

export function getLiveObservationPressureLevel(
  pressurePercent: number
): LiveObservationPressureLevel {
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

async function assertCacheAvailable(
  options: CreateLiveObservationServiceOptions
): Promise<number> {
  if (!options.requireSharedCache) {
    return options.runtimeCache.getDegradationCount?.() ?? 0;
  }

  if (
    options.runtimeCache.backend !== "redis" ||
    !(await options.runtimeCache.isAvailable())
  ) {
    throw new LiveObservationServiceError(
      "LIVE_OBSERVATION_CACHE_UNAVAILABLE",
      "Redis Runtime Cache is required for Live Observation"
    );
  }

  return options.runtimeCache.getDegradationCount?.() ?? 0;
}

function assertEligibleDeployment(input: CreateLiveObservationSessionInput): void {
  if (input.status !== "SUCCESS" || input.liveProfile !== "demo_web_service") {
    throw new LiveObservationServiceError(
      "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE",
      "Live Observation requires a successful demo_web_service deployment"
    );
  }
}

function parseRequiredOutputs(
  outputs: Readonly<Record<string, unknown>>
): RequiredDeploymentOutputs {
  return {
    staticSiteUrl: readRequiredUrlOutput(outputs, "static_site_url"),
    apiBaseUrl: readRequiredUrlOutput(outputs, "api_base_url"),
    capacityTarget: parseCapacityTarget(outputs),
    albArnSuffix: readRequiredStringOutput(outputs, "alb_arn_suffix"),
    targetGroupArnSuffix: readRequiredStringOutput(
      outputs,
      "target_group_arn_suffix"
    ),
    scaleOutThreshold: readRequiredPositiveNumberOutput(
      outputs,
      "scale_out_threshold"
    )
  };
}

function parseCapacityTarget(
  outputs: Readonly<Record<string, unknown>>
): DeploymentObservabilityTarget["capacityTarget"] {
  const ecsClusterName = readOptionalStringOutput(outputs, "ecs_cluster_name");
  const ecsServiceName = readOptionalStringOutput(outputs, "ecs_service_name");

  if (ecsClusterName || ecsServiceName) {
    if (!ecsClusterName || !ecsServiceName) {
      throw invalidOutput(ecsClusterName ? "ecs_service_name" : "ecs_cluster_name");
    }

    return {
      clusterName: ecsClusterName,
      kind: "ecs_service",
      maxCapacity: readRequiredPositiveNumberOutput(outputs, "max_capacity"),
      serviceName: ecsServiceName
    };
  }

  return {
    asgName: readRequiredStringOutput(outputs, "asg_name"),
    kind: "asg"
  };
}

function readOptionalStringOutput(
  outputs: Readonly<Record<string, unknown>>,
  name: string
): string | null {
  const value = outputs[name];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRequiredUrlOutput(
  outputs: Readonly<Record<string, unknown>>,
  name: string
): string {
  const value = readRequiredStringOutput(outputs, name);

  try {
    return normalizeHttpUrl(value, name);
  } catch {
    throw invalidOutput(name);
  }
}

function readRequiredStringOutput(
  outputs: Readonly<Record<string, unknown>>,
  name: string
): string {
  const value = outputs[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidOutput(name);
  }

  return value.trim();
}

function readRequiredPositiveNumberOutput(
  outputs: Readonly<Record<string, unknown>>,
  name: string
): number {
  const rawValue = outputs[name];
  const value =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number(rawValue)
        : Number.NaN;

  if (!Number.isFinite(value) || value <= 0) {
    throw invalidOutput(name);
  }

  return value;
}

function invalidOutput(name: string): LiveObservationServiceError {
  return new LiveObservationServiceError(
    "LIVE_OBSERVATION_OUTPUT_INVALID",
    `Live Observation deployment output ${name} is missing or invalid`
  );
}

function normalizeHttpUrl(value: string, label: string): string {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${label} must use http or https`);
  }

  return url.toString().replace(/\/$/, "");
}

function createAudienceUrl(
  staticSiteUrl: string,
  publicToken: string,
  publicApiBaseUrl: string,
  trafficApiUrl: string
): string {
  const audienceUrl = new URL(staticSiteUrl);
  audienceUrl.searchParams.set("observation", publicToken);
  audienceUrl.searchParams.set("collector", publicApiBaseUrl);
  audienceUrl.searchParams.set("traffic", trafficApiUrl);
  return audienceUrl.toString();
}

function createTrafficApiUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/api/traffic`;
}

function hashPublicToken(publicToken: string): string {
  return createHash("sha256").update(publicToken).digest("hex");
}

async function readSessionByPublicToken(
  runtimeCache: RuntimeCache,
  publicToken: string,
  currentTimeMs: number
): Promise<StoredLiveObservationSession> {
  const publicTokenHash = hashPublicToken(publicToken);
  const observationId = await runtimeCache.get<string>(
    createPublicTokenKey(publicTokenHash)
  );

  if (!observationId) {
    throw new LiveObservationServiceError(
      "LIVE_OBSERVATION_GONE",
      "Live Observation session expired or stopped"
    );
  }

  const storedSession = await readStoredSession(runtimeCache, observationId);

  if (!storedSession || getEffectiveStatus(storedSession.session, currentTimeMs) !== "active") {
    throw new LiveObservationServiceError(
      "LIVE_OBSERVATION_GONE",
      "Live Observation session expired or stopped"
    );
  }

  return storedSession;
}

async function readActiveDeploymentSession(
  runtimeCache: RuntimeCache,
  deploymentId: string,
  currentTimeMs: number
): Promise<StoredLiveObservationSession | null> {
  const activeObservationId = await runtimeCache.get<string>(
    createActiveDeploymentKey(deploymentId)
  );

  if (!activeObservationId) {
    return null;
  }

  const storedSession = await readStoredSession(runtimeCache, activeObservationId);

  if (
    storedSession &&
    getEffectiveStatus(storedSession.session, currentTimeMs) === "active"
  ) {
    return storedSession;
  }

  await runtimeCache.delete(createActiveDeploymentKey(deploymentId));
  return null;
}

async function readStoredSession(
  runtimeCache: RuntimeCache,
  observationId: string
): Promise<StoredLiveObservationSession | null> {
  return runtimeCache.get<StoredLiveObservationSession>(
    createSessionKey(observationId)
  );
}

function assertSessionActive(
  storedSession: StoredLiveObservationSession,
  currentTimeMs: number
): void {
  if (getEffectiveStatus(storedSession.session, currentTimeMs) !== "active") {
    throw new LiveObservationServiceError(
      "LIVE_OBSERVATION_GONE",
      "Live Observation session expired or stopped"
    );
  }
}

function getEffectiveStatus(
  session: LiveObservationSession,
  currentTimeMs: number
): LiveObservationStatus {
  if (session.status !== "active") {
    return session.status;
  }

  return currentTimeMs >= Date.parse(session.expiresAt) ? "expired" : "active";
}

async function readAcceptedEventCount(
  runtimeCache: RuntimeCache,
  observationId: string
): Promise<number> {
  return (
    (await runtimeCache.get<number>(createAcceptedCountKey(observationId))) ?? 0
  );
}

async function readDeploymentObservation(
  runtimeCache: RuntimeCache,
  provider: DeploymentObservabilityProvider,
  storedSession: StoredLiveObservationSession,
  currentTimeMs: number
): Promise<DeploymentObservation> {
  const cacheKey = createAwsObservationKey(storedSession.session.id);
  const cachedObservation = await runtimeCache.get<DeploymentObservation>(cacheKey);

  if (cachedObservation) {
    return cachedObservation;
  }

  let observation: DeploymentObservation;

  try {
    observation = await provider.observe(
      storedSession.observationTarget,
      storedSession.session.id
    );
  } catch {
    observation = createUnavailableDeploymentObservation();
  }

  await runtimeCache.set(cacheKey, toRuntimeCacheValue(observation), {
    ttlMs: Math.min(
      AWS_OBSERVATION_TTL_MS,
      remainingSessionTtlMs(storedSession, currentTimeMs)
    )
  });

  return observation;
}

function remainingSessionTtlMs(
  storedSession: StoredLiveObservationSession,
  currentTimeMs: number
): number {
  return Math.max(1, Date.parse(storedSession.session.expiresAt) - currentTimeMs);
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function toRuntimeCacheValue(value: unknown): RuntimeCacheJsonValue {
  return JSON.parse(JSON.stringify(value)) as RuntimeCacheJsonValue;
}

function createSessionKey(observationId: string): RuntimeCacheEntryKey {
  return { namespace: SESSION_NAMESPACE, key: observationId };
}

function createActiveDeploymentKey(deploymentId: string): RuntimeCacheEntryKey {
  return { namespace: SESSION_NAMESPACE, key: `deployment:${deploymentId}:active` };
}

function createPublicTokenKey(publicTokenHash: string): RuntimeCacheEntryKey {
  return { namespace: SESSION_NAMESPACE, key: `token:${publicTokenHash}` };
}

function createAwsObservationKey(observationId: string): RuntimeCacheEntryKey {
  return { namespace: SESSION_NAMESPACE, key: `${observationId}:aws` };
}

function createEventKey(
  observationId: string,
  eventId: string
): RuntimeCacheEntryKey {
  return { namespace: EVENT_NAMESPACE, key: `${observationId}:${eventId}` };
}

function createAcceptedCountKey(observationId: string): RuntimeCacheEntryKey {
  return { namespace: BUCKET_NAMESPACE, key: `${observationId}:accepted` };
}

function createLiveBucketKey(
  observationId: string,
  second: number
): RuntimeCacheEntryKey {
  return { namespace: BUCKET_NAMESPACE, key: `${observationId}:live:${second}` };
}

function createRateSecondKey(
  observationId: string,
  second: number
): RuntimeCacheEntryKey {
  return { namespace: BUCKET_NAMESPACE, key: `${observationId}:rate-second:${second}` };
}
