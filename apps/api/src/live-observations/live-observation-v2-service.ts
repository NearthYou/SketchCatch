import { randomUUID } from "node:crypto";
import type {
  ApiErrorCode,
  CreateLiveObservationV2Response,
  LiveObservationV2Session,
  LiveObservationV2Snapshot,
  LiveObservationV2SnapshotResponse
} from "@sketchcatch/types";
import type { DeploymentLiveObservationManifestRepository } from "./live-observation-manifest-repository.js";
import {
  LiveObservationStoreUnavailableError,
  type LiveObservationStore,
  type LiveObservationStoreActiveSession,
  type LiveObservationStoreTerminalSession
} from "./live-observation-store.js";

export class LiveObservationV2ServiceError extends Error {
  constructor(readonly code: ApiErrorCode) {
    super("Live Observation session request failed");
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationV2ServiceError"
    });
  }
}

export type LiveObservationV2Service = ReturnType<typeof createLiveObservationV2Service>;

export function createLiveObservationV2Service(options: {
  readonly audienceBaseUrl: string;
  readonly capabilityKid: string;
  readonly createObservationId?: (() => string) | undefined;
  readonly manifestRepository: DeploymentLiveObservationManifestRepository;
  readonly store: LiveObservationStore;
}) {
  const audienceBaseUrl = parseAudienceBaseUrl(options.audienceBaseUrl);
  const createObservationId = options.createObservationId ?? randomUUID;

  return Object.freeze({
    async createSession(deploymentId: string): Promise<CreateLiveObservationV2Response> {
      const record = await options.manifestRepository.findByDeploymentId(deploymentId);
      if (record?.status !== "valid" || !record.manifest) {
        throw serviceError("LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE");
      }

      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const result = await options.store.createSession({
            observationId: createObservationId(),
            manifest: record.manifest,
            capability: {
              kid: options.capabilityKid,
              tokenVersion: 1
            }
          });

          if (result.kind === "created" || result.kind === "active_exists") {
            return {
              session: toPublicSession(result.session, audienceBaseUrl),
              snapshot: toActiveSnapshot(result.session)
            };
          }
        }
      } catch (error) {
        throw mapStoreError(error);
      }

      throw serviceError("conflict");
    },

    async readSession(
      deploymentId: string,
      observationId: string
    ): Promise<LiveObservationV2SnapshotResponse> {
      try {
        const result = await options.store.readSession({ observationId });
        if (result.kind === "not_found" || result.session.deploymentId !== deploymentId) {
          throw serviceError("LIVE_OBSERVATION_NOT_FOUND");
        }
        return {
          snapshot:
            result.kind === "active"
              ? toActiveSnapshot(result.session)
              : toTerminalSnapshot(result.session)
        };
      } catch (error) {
        if (error instanceof LiveObservationV2ServiceError) throw error;
        throw mapStoreError(error);
      }
    },

    async stopSession(
      deploymentId: string,
      observationId: string
    ): Promise<LiveObservationV2SnapshotResponse> {
      try {
        const result = await options.store.stopSession({ deploymentId, observationId });
        if (result.kind === "not_found") {
          throw serviceError("LIVE_OBSERVATION_NOT_FOUND");
        }
        return { snapshot: toTerminalSnapshot(result.session) };
      } catch (error) {
        if (error instanceof LiveObservationV2ServiceError) throw error;
        throw mapStoreError(error);
      }
    }
  });
}

function toPublicSession(
  session: LiveObservationStoreActiveSession,
  audienceBaseUrl: string
): LiveObservationV2Session {
  return {
    id: session.observationId,
    deploymentId: session.deploymentId,
    status: session.status,
    audienceUrl: `${audienceBaseUrl}/observe/${session.observationId}`,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt
  };
}

function toActiveSnapshot(session: LiveObservationStoreActiveSession): LiveObservationV2Snapshot {
  return {
    observationId: session.observationId,
    status: session.status,
    live: session.live,
    latestObservation: session.latestObservation,
    terminalAt: null
  };
}

function toTerminalSnapshot(
  session: LiveObservationStoreTerminalSession
): LiveObservationV2Snapshot {
  return {
    observationId: session.observationId,
    status: session.status,
    live: session.finalLive,
    latestObservation: session.finalObservation,
    terminalAt: session.terminalAt
  };
}

function parseAudienceBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid Live Observation audience base URL");
  }
  return url.toString().replace(/\/$/, "");
}

function mapStoreError(error: unknown): LiveObservationV2ServiceError {
  if (error instanceof LiveObservationStoreUnavailableError) {
    return serviceError("LIVE_OBSERVATION_CACHE_UNAVAILABLE");
  }
  return serviceError("LIVE_OBSERVATION_CACHE_UNAVAILABLE");
}

function serviceError(code: ApiErrorCode): LiveObservationV2ServiceError {
  return new LiveObservationV2ServiceError(code);
}
