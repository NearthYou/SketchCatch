import { createLiveObservationCapability } from "./live-observation-capability.js";
import {
  LiveObservationStoreInputError,
  type LiveObservationStore
} from "./live-observation-store.js";

export type LiveObservationPublicCollectorErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden_origin"
  | "not_found"
  | "gone"
  | "rate_limited"
  | "unavailable";

export class LiveObservationPublicCollectorError extends Error {
  constructor(readonly code: LiveObservationPublicCollectorErrorCode) {
    super("Live Observation collector request failed");
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationPublicCollectorError"
    });
  }
}

type LiveObservationCapability = ReturnType<typeof createLiveObservationCapability>;

export type LiveObservationAuthorizedCollector = Readonly<{
  audienceOrigin: string;
  collectEvent(eventId: string): Promise<{
    accepted: boolean;
    acceptedEventCount: number;
  }>;
}>;

export type LiveObservationPublicCollector = ReturnType<
  typeof createLiveObservationPublicCollector
>;

export function createLiveObservationPublicCollector(options: {
  capability: LiveObservationCapability;
  store: LiveObservationStore;
}) {
  return Object.freeze({
    async authorize(input: {
      authorization: string | undefined;
      observationId: string;
      origin: string | undefined;
    }): Promise<LiveObservationAuthorizedCollector> {
      const credential = parseAuthorization(input.authorization);
      const active = await readActiveSession(options.store, input.observationId);
      const expected = {
        createdAt: active.session.createdAt,
        expiresAt: active.session.expiresAt,
        kid: active.session.capability.kid,
        observationId: active.session.observationId,
        tokenVersion: active.session.capability.tokenVersion
      };

      if (!options.capability.verify(credential, expected, active.evaluatedAt)) {
        throw collectorError("unauthorized");
      }

      const audienceOrigin = requireAudienceOrigin(
        input.origin,
        active.session.manifest.endpoints.audienceBaseUrl
      );

      return Object.freeze({
        audienceOrigin,
        async collectEvent(eventId: string) {
          try {
            const result = await options.store.collectEvent({
              eventId,
              observationId: active.session.observationId
            });

            switch (result.kind) {
              case "accepted":
              case "duplicate":
                return {
                  accepted: result.kind === "accepted",
                  acceptedEventCount: result.live.acceptedEventCount
                };
              case "rate_limited":
              case "event_limit_reached":
                throw collectorError("rate_limited");
              case "gone":
                throw collectorError("gone");
              case "not_found":
                throw collectorError("not_found");
            }
          } catch (error) {
            throw mapStoreError(error);
          }
        }
      });
    },

    async preflight(input: {
      observationId: string;
      origin: string | undefined;
    }): Promise<{ audienceOrigin: string }> {
      const active = await readActiveSession(options.store, input.observationId);
      return {
        audienceOrigin: requireAudienceOrigin(
          input.origin,
          active.session.manifest.endpoints.audienceBaseUrl
        )
      };
    }
  });
}

async function readActiveSession(store: LiveObservationStore, observationId: string) {
  try {
    const result = await store.readSession({ observationId });

    if (result.kind === "not_found") throw collectorError("not_found");
    if (result.kind === "terminal") throw collectorError("gone");
    return result;
  } catch (error) {
    throw mapStoreError(error);
  }
}

function parseAuthorization(value: string | undefined): string {
  if (typeof value !== "string") throw collectorError("unauthorized");
  const match = /^LiveObservation ([A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{43})$/.exec(value);
  if (!match?.[1]) throw collectorError("unauthorized");
  return match[1];
}

function requireAudienceOrigin(origin: string | undefined, audienceBaseUrl: string) {
  if (typeof origin !== "string" || origin !== new URL(audienceBaseUrl).origin) {
    throw collectorError("forbidden_origin");
  }
  return origin;
}

function mapStoreError(error: unknown): LiveObservationPublicCollectorError {
  if (error instanceof LiveObservationPublicCollectorError) return error;
  if (error instanceof LiveObservationStoreInputError) return collectorError("bad_request");
  return collectorError("unavailable");
}

function collectorError(
  code: LiveObservationPublicCollectorErrorCode
): LiveObservationPublicCollectorError {
  return new LiveObservationPublicCollectorError(code);
}
