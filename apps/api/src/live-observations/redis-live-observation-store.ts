import { createClient } from "redis";
import {
  LiveObservationStoreClockError,
  LiveObservationStoreInputError,
  LiveObservationStoreUnavailableError,
  type LiveObservationStore,
  type LiveObservationStoreActiveSession,
  type LiveObservationStoreTerminalSession
} from "./live-observation-store.js";
import {
  REDIS_LIVE_OBSERVATION_STORE_SCRIPTS,
  type RedisLiveObservationStoreScripts
} from "./redis-live-observation-store-scripts.js";
import {
  createStoreLiveView,
  epochMsToIso,
  parseSafeInteger,
  parseStoredManifest,
  parseStoredObservation,
  parseStoreCollectInput,
  parseStoreCreateInput,
  parseStoreObservationCommitInput,
  parseStoreObserverLeaseInput,
  parseStorePresenterLeaseInput,
  parseStoreReadInput,
  parseStoreStopInput
} from "./live-observation-store-values.js";

const NAMESPACE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export type RedisLiveObservationStoreClient = {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  eval(
    script: string,
    options: {
      readonly keys: readonly string[];
      readonly arguments: readonly string[];
    }
  ): Promise<unknown>;
  on?(event: "error", listener: (error: unknown) => void): unknown;
};

export type CreateRedisLiveObservationStoreOptions = {
  readonly redisUrl: string;
  readonly keyNamespace: string;
  readonly createClient?: ((redisUrl: string) => RedisLiveObservationStoreClient) | undefined;
};

type InternalOptions = CreateRedisLiveObservationStoreOptions & {
  readonly scripts: RedisLiveObservationStoreScripts;
  readonly logicalNow?: (() => number) | undefined;
};

type RedisReplyTuple = [version: string, kind: string, evaluatedAtMs: string, ...rest: string[]];

export type RedisLiveObservationStoreKeys = {
  session: string;
  terminal: string;
  deployment: (deploymentId: string) => string;
};

export function createRedisLiveObservationStore(
  options: CreateRedisLiveObservationStoreOptions
): LiveObservationStore {
  return createRedisLiveObservationStoreInternal({
    ...options,
    scripts: REDIS_LIVE_OBSERVATION_STORE_SCRIPTS
  });
}

/** @internal Test support only. */
export function createRedisLiveObservationStoreInternal(
  options: InternalOptions
): LiveObservationStore {
  const redisUrl = parseRedisUrl(options.redisUrl);
  const keyBase = createKeyBase(options.keyNamespace);
  const createRedisClient = options.createClient ?? createDefaultRedisClient;
  let client: RedisLiveObservationStoreClient | null = null;
  let connectPromise: Promise<RedisLiveObservationStoreClient> | null = null;

  const store: LiveObservationStore = {
    async createSession(input) {
      const parsed = parseStoreCreateInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.createSession,
        [keys.session, keys.terminal, keys.deployment(parsed.manifest.provenance.deploymentId)],
        [
          parsed.observationId,
          parsed.manifest.provenance.deploymentId,
          JSON.stringify(parsed.manifest),
          parsed.capability.kid,
          String(parsed.capability.tokenVersion),
          String(parsed.manifest.pressure.target)
        ],
        900_000
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (tuple[1] === "created" || tuple[1] === "active_exists") {
          const decoded = decodeActive(
            tuple,
            tuple[1] === "created" ? parsed.observationId : undefined,
            parsed.manifest.provenance.deploymentId
          );
          return {
            kind: tuple[1],
            evaluatedAt: decoded.evaluatedAt,
            session: decoded.session
          };
        }
        assertSimpleKind(tuple, "observation_id_conflict");
        return {
          kind: "observation_id_conflict",
          evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2]))
        };
      });
    },

    async readSession(input) {
      const parsed = parseStoreReadInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.readSession,
        [keys.session, keys.terminal],
        [parsed.observationId]
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (tuple[1] === "active") {
          const decoded = decodeActive(tuple, parsed.observationId);
          return { kind: "active", ...decoded };
        }
        if (tuple[1] === "terminal") {
          const decoded = decodeTerminal(tuple, parsed.observationId);
          return { kind: "terminal", ...decoded };
        }
        assertSimpleKind(tuple, "not_found");
        return { kind: "not_found", evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
      });
    },

    async collectEvent(input) {
      const parsed = parseStoreCollectInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.collectEvent,
        [keys.session, keys.terminal],
        [parsed.observationId, parsed.eventId]
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (
          tuple[1] === "accepted" ||
          tuple[1] === "duplicate" ||
          tuple[1] === "rate_limited" ||
          tuple[1] === "event_limit_reached"
        ) {
          const decoded = decodeLive(tuple);
          return { kind: tuple[1], ...decoded };
        }
        if (tuple[1] === "gone") {
          const decoded = decodeTerminal(tuple, parsed.observationId);
          return { kind: "gone", ...decoded };
        }
        assertSimpleKind(tuple, "not_found");
        return { kind: "not_found", evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
      });
    },

    async stopSession(input) {
      const parsed = parseStoreStopInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.stopSession,
        [keys.session, keys.terminal, keys.deployment(parsed.deploymentId)],
        [parsed.observationId, parsed.deploymentId]
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (tuple[1] === "stopped" || tuple[1] === "already_terminal") {
          const decoded = decodeTerminal(tuple, parsed.observationId, parsed.deploymentId);
          return { kind: tuple[1], ...decoded };
        }
        assertSimpleKind(tuple, "not_found");
        return { kind: "not_found", evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
      });
    },

    async claimObserverLease(input) {
      const parsed = parseStoreObserverLeaseInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.claimObserverLease,
        [keys.session, keys.terminal],
        [parsed.observationId, parsed.observerId]
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (tuple[1] === "claimed") {
          assertLength(tuple, 5);
          const evaluatedAtMs = parseSafeInteger(tuple[2]);
          const expiresAtMs = parseSafeInteger(required(tuple, 4));
          if (expiresAtMs <= evaluatedAtMs || expiresAtMs > evaluatedAtMs + 15_000) {
            throw unavailable();
          }
          return {
            kind: "claimed",
            evaluatedAt: epochMsToIso(evaluatedAtMs),
            lease: {
              fencingToken: positiveInteger(required(tuple, 3)),
              expiresAt: epochMsToIso(expiresAtMs)
            }
          };
        }
        if (tuple[1] === "gone") {
          return { kind: "gone", ...decodeTerminal(tuple, parsed.observationId) };
        }
        if (tuple[1] === "contended") {
          assertLength(tuple, 3);
          return { kind: "contended", evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
        }
        assertSimpleKind(tuple, "not_found");
        return { kind: "not_found", evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
      });
    },

    async commitObservation(input) {
      const parsed = parseStoreObservationCommitInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.commitObservation,
        [keys.session, keys.terminal],
        [
          parsed.observationId,
          parsed.observerId,
          String(parsed.fencingToken),
          String(parsed.observedAtMs),
          JSON.stringify(parsed.observation)
        ]
      );
      const tuple = decodeSafely(() => decodeTuple(raw));
      if (tuple[1] === "input_error") {
        decodeSafely(() => {
          assertLength(tuple, 3);
          epochMsToIso(parseSafeInteger(tuple[2]));
        });
        throw new LiveObservationStoreInputError();
      }
      return decodeSafely(() => {
        if (tuple[1] === "gone") {
          return { kind: "gone", ...decodeTerminal(tuple, parsed.observationId) };
        }
        if (
          tuple[1] === "committed" ||
          tuple[1] === "lease_lost" ||
          tuple[1] === "stale_observation" ||
          tuple[1] === "not_found"
        ) {
          assertLength(tuple, 3);
          return { kind: tuple[1], evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
        }
        throw unavailable();
      });
    },

    async acquirePresenterBoostLease(input) {
      const parsed = parseStorePresenterLeaseInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.acquirePresenterBoostLease,
        [keys.session, keys.terminal],
        [parsed.observationId, parsed.leaseId]
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (tuple[1] === "gone") {
          return { kind: "gone", ...decodeTerminal(tuple, parsed.observationId) };
        }
        if (tuple[1] === "acquired" || tuple[1] === "already_acquired") {
          const lease = decodePresenterLease(tuple, parsed.leaseId);
          return { kind: tuple[1], ...lease };
        }
        if (tuple[1] === "busy" || tuple[1] === "not_found") {
          assertLength(tuple, 3);
          return { kind: tuple[1], evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
        }
        throw unavailable();
      });
    },

    async renewPresenterBoostLease(input) {
      const parsed = parseStorePresenterLeaseInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.renewPresenterBoostLease,
        [keys.session, keys.terminal],
        [parsed.observationId, parsed.leaseId]
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (tuple[1] === "gone") {
          return { kind: "gone", ...decodeTerminal(tuple, parsed.observationId) };
        }
        if (tuple[1] === "renewed") {
          return {
            kind: "renewed",
            ...decodePresenterLease(tuple, parsed.leaseId)
          };
        }
        if (tuple[1] === "lease_lost" || tuple[1] === "not_found") {
          assertLength(tuple, 3);
          return { kind: tuple[1], evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
        }
        throw unavailable();
      });
    },

    async releasePresenterBoostLease(input) {
      const parsed = parseStorePresenterLeaseInput(input);
      const keys = createRedisLiveObservationStoreKeys(options.keyNamespace, parsed.observationId);
      const raw = await execute(
        options.scripts.releasePresenterBoostLease,
        [keys.session, keys.terminal],
        [parsed.observationId, parsed.leaseId]
      );
      return decodeSafely(() => {
        const tuple = decodeTuple(raw);
        if (tuple[1] === "gone") {
          return { kind: "gone", ...decodeTerminal(tuple, parsed.observationId) };
        }
        if (tuple[1] === "released" || tuple[1] === "lease_lost" || tuple[1] === "not_found") {
          assertLength(tuple, 3);
          return { kind: tuple[1], evaluatedAt: epochMsToIso(parseSafeInteger(tuple[2])) };
        }
        throw unavailable();
      });
    }
  };

  return Object.freeze(store);

  async function execute(
    script: string,
    keys: readonly string[],
    args: readonly string[],
    derivedDurationMs?: number
  ): Promise<unknown> {
    const clockArgument = readLogicalClock(options.logicalNow, derivedDurationMs);
    try {
      const redisClient = await getConnectedClient();
      return await redisClient.eval(script, {
        keys,
        arguments: [clockArgument, keyBase, ...args]
      });
    } catch {
      throw unavailable();
    }
  }

  async function getConnectedClient(): Promise<RedisLiveObservationStoreClient> {
    if (client?.isOpen) return client;
    if (connectPromise) return connectPromise;
    client = createRedisClient(redisUrl);
    if (client.isOpen) return client;
    client.on?.("error", () => undefined);
    const connectingClient = client;
    connectPromise = connectingClient.connect().then(() => connectingClient);
    try {
      const connected = await connectPromise;
      connectPromise = null;
      return connected;
    } catch (error) {
      connectPromise = null;
      client = null;
      throw error;
    }
  }
}

export function createRedisLiveObservationStoreKeys(
  keyNamespace: string,
  observationId: string
): RedisLiveObservationStoreKeys {
  const base = createKeyBase(keyNamespace);
  return {
    session: `${base}:session:${observationId}`,
    terminal: `${base}:terminal:${observationId}`,
    deployment: (deploymentId) => `${base}:deployment:${deploymentId}`
  };
}

function decodeActive(
  tuple: RedisReplyTuple,
  expectedObservationId?: string,
  expectedDeploymentId?: string
): {
  evaluatedAt: ReturnType<typeof epochMsToIso>;
  session: LiveObservationStoreActiveSession;
} {
  assertLength(tuple, 14);
  const observationId = required(tuple, 3);
  const deploymentId = required(tuple, 4);
  const manifestJson = required(tuple, 5);
  const capabilityKid = required(tuple, 6);
  assertUuid(observationId);
  assertUuid(deploymentId);
  assertKid(capabilityKid);
  const evaluatedAtMs = parseSafeInteger(tuple[2]);
  const manifest = parseStoredManifest(manifestJson);
  const tokenVersion = positiveInteger(required(tuple, 7));
  const createdAtMs = parseSafeInteger(required(tuple, 8));
  const expiresAtMs = parseSafeInteger(required(tuple, 9));
  const accepted = nonnegativeInteger(required(tuple, 10));
  const rolling = nonnegativeInteger(required(tuple, 11));
  const pressureTarget = positiveInteger(required(tuple, 12));
  const latestObservation = parseStoredObservation(required(tuple, 13));
  if (
    (expectedObservationId !== undefined && observationId !== expectedObservationId) ||
    (expectedDeploymentId !== undefined && deploymentId !== expectedDeploymentId) ||
    manifest.provenance.deploymentId !== deploymentId ||
    manifest.pressure.target !== pressureTarget ||
    pressureTarget !== 60 ||
    expiresAtMs !== createdAtMs + 900_000 ||
    evaluatedAtMs < createdAtMs ||
    evaluatedAtMs >= expiresAtMs ||
    (latestObservation !== null && Date.parse(latestObservation.observedAt) > evaluatedAtMs) ||
    accepted > 10_000 ||
    rolling > 120 ||
    rolling > accepted
  ) {
    throw unavailable();
  }
  return {
    evaluatedAt: epochMsToIso(evaluatedAtMs),
    session: {
      observationId,
      deploymentId,
      status: "active",
      manifest,
      capability: { kid: capabilityKid, tokenVersion },
      createdAt: epochMsToIso(createdAtMs),
      expiresAt: epochMsToIso(expiresAtMs),
      live: createStoreLiveView(accepted, rolling, pressureTarget, evaluatedAtMs),
      latestObservation
    }
  };
}

function decodeTerminal(
  tuple: RedisReplyTuple,
  expectedObservationId?: string,
  expectedDeploymentId?: string
): {
  evaluatedAt: ReturnType<typeof epochMsToIso>;
  session: LiveObservationStoreTerminalSession;
} {
  assertLength(tuple, 13);
  const observationId = required(tuple, 3);
  const deploymentId = required(tuple, 4);
  const status = required(tuple, 5);
  assertUuid(observationId);
  assertUuid(deploymentId);
  if (status !== "expired" && status !== "stopped") throw unavailable();
  const evaluatedAtMs = parseSafeInteger(tuple[2]);
  const createdAtMs = parseSafeInteger(required(tuple, 6));
  const terminalAtMs = parseSafeInteger(required(tuple, 8));
  const accepted = nonnegativeInteger(required(tuple, 9));
  const rolling = nonnegativeInteger(required(tuple, 10));
  const pressureTarget = positiveInteger(required(tuple, 11));
  const expiresAtMs = parseSafeInteger(required(tuple, 7));
  const finalObservation = parseStoredObservation(required(tuple, 12));
  if (
    (expectedObservationId !== undefined && observationId !== expectedObservationId) ||
    (expectedDeploymentId !== undefined && deploymentId !== expectedDeploymentId) ||
    pressureTarget !== 60 ||
    expiresAtMs !== createdAtMs + 900_000 ||
    terminalAtMs < createdAtMs ||
    evaluatedAtMs < terminalAtMs ||
    evaluatedAtMs >= terminalAtMs + 60_000 ||
    (finalObservation !== null && Date.parse(finalObservation.observedAt) > terminalAtMs) ||
    accepted > 10_000 ||
    rolling > 120 ||
    rolling > accepted ||
    (status === "expired" && terminalAtMs !== expiresAtMs) ||
    (status === "stopped" && terminalAtMs >= expiresAtMs)
  ) {
    throw unavailable();
  }
  return {
    evaluatedAt: epochMsToIso(evaluatedAtMs),
    session: {
      observationId,
      deploymentId,
      status,
      createdAt: epochMsToIso(createdAtMs),
      expiresAt: epochMsToIso(expiresAtMs),
      terminalAt: epochMsToIso(terminalAtMs),
      finalLive: createStoreLiveView(accepted, rolling, pressureTarget, terminalAtMs),
      finalObservation
    }
  };
}

function decodeLive(tuple: RedisReplyTuple): {
  evaluatedAt: ReturnType<typeof epochMsToIso>;
  live: ReturnType<typeof createStoreLiveView>;
} {
  assertLength(tuple, 6);
  const evaluatedAtMs = parseSafeInteger(tuple[2]);
  const accepted = nonnegativeInteger(required(tuple, 3));
  const rolling = nonnegativeInteger(required(tuple, 4));
  const pressureTarget = positiveInteger(required(tuple, 5));
  if (accepted > 10_000 || rolling > 120 || rolling > accepted || pressureTarget !== 60) {
    throw unavailable();
  }
  return {
    evaluatedAt: epochMsToIso(evaluatedAtMs),
    live: createStoreLiveView(accepted, rolling, pressureTarget, evaluatedAtMs)
  };
}

function decodePresenterLease(
  tuple: RedisReplyTuple,
  expectedLeaseId: string
): {
  evaluatedAt: ReturnType<typeof epochMsToIso>;
  lease: { leaseId: string; expiresAt: ReturnType<typeof epochMsToIso> };
} {
  assertLength(tuple, 5);
  const leaseId = required(tuple, 3);
  assertUuid(leaseId);
  const evaluatedAtMs = parseSafeInteger(tuple[2]);
  const expiresAtMs = parseSafeInteger(required(tuple, 4));
  if (
    leaseId !== expectedLeaseId ||
    expiresAtMs <= evaluatedAtMs ||
    expiresAtMs > evaluatedAtMs + 10_000
  ) {
    throw unavailable();
  }
  return {
    evaluatedAt: epochMsToIso(evaluatedAtMs),
    lease: {
      leaseId,
      expiresAt: epochMsToIso(expiresAtMs)
    }
  };
}

function decodeTuple(raw: unknown): RedisReplyTuple {
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string")) {
    throw unavailable();
  }
  const tuple = raw as string[];
  if (tuple.length < 3 || tuple[0] !== "1") throw unavailable();
  if (tuple[1] === "corrupt") throw unavailable();
  if (tuple[1] === "clock_error") throw unavailable();
  return tuple as RedisReplyTuple;
}

function decodeSafely<T>(decode: () => T): T {
  try {
    return decode();
  } catch (error) {
    if (error instanceof LiveObservationStoreUnavailableError) {
      throw error;
    }
    throw unavailable();
  }
}

function assertSimpleKind(tuple: RedisReplyTuple, kind: string): void {
  assertLength(tuple, 3);
  if (tuple[1] !== kind) throw unavailable();
}

function assertLength(tuple: RedisReplyTuple, length: number): void {
  if (tuple.length !== length) throw unavailable();
}

function required(tuple: RedisReplyTuple, index: number): string {
  const value = tuple[index];
  if (value === undefined) throw unavailable();
  return value;
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw unavailable();
}

function assertKid(value: string): void {
  if (!KID_PATTERN.test(value)) throw unavailable();
}

function positiveInteger(value: string): number {
  const parsed = parseSafeInteger(value);
  if (parsed <= 0) throw unavailable();
  return parsed;
}

function nonnegativeInteger(value: string): number {
  const parsed = parseSafeInteger(value);
  if (parsed < 0) throw unavailable();
  return parsed;
}

function readLogicalClock(
  logicalNow: (() => number) | undefined,
  derivedDurationMs?: number
): string {
  if (!logicalNow) return "";
  let value: number;
  try {
    value = logicalNow();
  } catch {
    throw new LiveObservationStoreClockError();
  }
  if (!Number.isSafeInteger(value)) throw new LiveObservationStoreClockError();
  try {
    new Date(value).toISOString();
    if (derivedDurationMs !== undefined) {
      const derived = value + derivedDurationMs;
      if (!Number.isSafeInteger(derived)) throw new LiveObservationStoreClockError();
      new Date(derived).toISOString();
    }
  } catch {
    throw new LiveObservationStoreClockError();
  }
  return String(value);
}

function parseRedisUrl(value: string): string {
  if (typeof value !== "string" || value.trim() === "") throw unavailable();
  return value.trim();
}

function createKeyBase(namespace: string): string {
  if (typeof namespace !== "string" || !NAMESPACE_PATTERN.test(namespace)) {
    throw unavailable();
  }
  return `sketchcatch:live-observation:v2:{${namespace}}`;
}

function createDefaultRedisClient(redisUrl: string): RedisLiveObservationStoreClient {
  return createClient({
    disableOfflineQueue: true,
    socket: { reconnectStrategy: false },
    url: redisUrl
  }) as unknown as RedisLiveObservationStoreClient;
}

function unavailable(): LiveObservationStoreUnavailableError {
  return new LiveObservationStoreUnavailableError();
}
