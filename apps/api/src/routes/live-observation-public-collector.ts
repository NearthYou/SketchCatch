import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type LiveObservationAuthorizedCollector,
  LiveObservationPublicCollectorError,
  type LiveObservationPublicCollector,
  type LiveObservationPublicCollectorErrorCode
} from "../live-observations/live-observation-public-collector.js";

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
      return sendPublicError(reply, "bad_request", 413);
    }
    if (hasErrorCode(error, "FST_ERR_CTP_INVALID_JSON_BODY")) {
      return sendPublicError(reply, "bad_request", 400);
    }
    throw error;
  });

  app.options("/live-observations/public/:observationId/events", async (request, reply) => {
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
    "/live-observations/public/:observationId/events",
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
        if (!authorized) {
          throw new LiveObservationPublicCollectorError("unavailable");
        }
        const body = bodySchema.parse(request.body);
        const response = await authorized.collectEvent(body.eventId);
        return reply.status(response.accepted ? 202 : 200).send(response);
      } catch (error) {
        return handlePublicError(error, reply);
      }
    }
  );
}

function applyCors(reply: FastifyReply, audienceOrigin: string): void {
  reply.header("Access-Control-Allow-Origin", audienceOrigin);
  reply.header("Access-Control-Allow-Methods", "POST,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "authorization,content-type");
  reply.header("Vary", "Origin");
}

function handlePublicError(error: unknown, reply: FastifyReply) {
  if (error instanceof z.ZodError) {
    return sendPublicError(reply, "bad_request", 400);
  }
  if (error instanceof LiveObservationPublicCollectorError) {
    return sendPublicError(reply, error.code, statusFor(error.code));
  }
  throw error;
}

function sendPublicError(
  reply: FastifyReply,
  code: LiveObservationPublicCollectorErrorCode,
  status: 400 | 401 | 403 | 404 | 410 | 413 | 429 | 503
) {
  return reply.status(status).send({
    error: `LIVE_OBSERVATION_COLLECTOR_${code.toUpperCase()}`,
    message: "Live Observation collector request failed"
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
