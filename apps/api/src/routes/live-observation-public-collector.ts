import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type LiveObservationAuthorizedCollector,
  LiveObservationPublicCollectorError,
  type LiveObservationPublicCollector,
  type LiveObservationPublicCollectorErrorCode
} from "../live-observations/live-observation-public-collector.js";
import { getDeveloperErrorMessage } from "../network/developer-error-message.js";

const paramsSchema = z.object({ observationId: z.uuid() });
const bodySchema = z.object({ eventId: z.uuid() }).strict();
const BODY_LIMIT_BYTES = 1_024;

export async function registerLiveObservationPublicCollectorRoutes(
  app: FastifyInstance,
  options: {
    collector: LiveObservationPublicCollector;
    enabled: boolean;
  }
): Promise<void> {
  if (!options.enabled) return;
  const authorizedRequests = new WeakMap<FastifyRequest, LiveObservationAuthorizedCollector>();

  app.setErrorHandler((error, _request, reply) => {
    if (hasErrorCode(error, "FST_ERR_CTP_BODY_TOO_LARGE")) {
      return sendPublicError(reply, "bad_request", 413, error);
    }
    if (hasErrorCode(error, "FST_ERR_CTP_INVALID_JSON_BODY")) {
      return sendPublicError(reply, "bad_request", 400, error);
    }
    throw error;
  });

  app.post("/live-observations/public/:observationId/bootstrap", async (request, reply) => {
    try {
      const params = paramsSchema.parse(request.params);
      const result = await options.collector.bootstrap({
        observationId: params.observationId,
        origin: firstHeaderValue(request.headers.origin)
      });
      applyCors(reply, result.audienceOrigin);
      reply.header("Cache-Control", "no-store");
      return reply.status(200).send({ credential: result.credential });
    } catch (error) {
      return handlePublicError(error, reply);
    }
  });

  for (const eventPath of ["requests", "receipts"] as const) {
    app.options(`/live-observations/public/:observationId/${eventPath}`, async (request, reply) => {
      try {
        const params = paramsSchema.parse(request.params);
        const result = await options.collector.preflight({
          observationId: params.observationId,
          origin: firstHeaderValue(request.headers.origin)
        });
        applyCors(reply, result.audienceOrigin);
        return reply.status(204).send();
      } catch (error) {
        return handlePublicError(error, reply);
      }
    });

    app.post(
      `/live-observations/public/:observationId/${eventPath}`,
      {
        bodyLimit: BODY_LIMIT_BYTES,
        async onRequest(request, reply) {
          try {
            const params = paramsSchema.parse(request.params);
            const authorized = await options.collector.authorize({
              authorization: firstHeaderValue(request.headers.authorization),
              observationId: params.observationId,
              origin: firstHeaderValue(request.headers.origin)
            });
            applyCors(reply, authorized.audienceOrigin);
            authorizedRequests.set(request, authorized);
          } catch (error) {
            return handlePublicError(error, reply);
          }
        }
      },
      async (request, reply) => {
        try {
          const authorized = authorizedRequests.get(request);
          if (!authorized) throw new LiveObservationPublicCollectorError("unavailable");
          const body = bodySchema.parse(request.body);
          const response = await authorized[eventPath === "receipts" ? "receipt" : "request"]({
            eventId: body.eventId
          });
          return reply.status(response.accepted ? 202 : 200).send(response);
        } catch (error) {
          return handlePublicError(error, reply);
        }
      }
    );
  }
}

function applyCors(reply: FastifyReply, audienceOrigin: string): void {
  reply.header("Access-Control-Allow-Origin", audienceOrigin);
  reply.header("Access-Control-Allow-Methods", "POST,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "authorization,content-type");
  reply.header("Vary", "Origin");
}

function handlePublicError(error: unknown, reply: FastifyReply) {
  if (error instanceof z.ZodError) {
    return sendPublicError(reply, "bad_request", 400, error);
  }
  if (error instanceof LiveObservationPublicCollectorError) {
    return sendPublicError(reply, error.code, statusFor(error.code), error);
  }
  throw error;
}

function sendPublicError(
  reply: FastifyReply,
  code: LiveObservationPublicCollectorErrorCode,
  status: 400 | 401 | 403 | 404 | 410 | 413 | 429 | 503,
  error?: unknown
) {
  return reply.status(status).send({
    error: `LIVE_OBSERVATION_COLLECTOR_${code.toUpperCase()}`,
    message: getDeveloperErrorMessage(error, "Live Observation collector request failed")
  });
}

function statusFor(
  code: LiveObservationPublicCollectorErrorCode
): 400 | 401 | 403 | 404 | 410 | 429 | 503 {
  switch (code) {
    case "bad_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden_origin":
      return 403;
    case "not_found":
      return 404;
    case "gone":
      return 410;
    case "rate_limited":
      return 429;
    case "unavailable":
      return 503;
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
