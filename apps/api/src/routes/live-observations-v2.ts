import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  LiveObservationV2ServiceError,
  type LiveObservationV2Service
} from "../live-observations/live-observation-v2-service.js";

const deploymentParamsSchema = z.object({ deploymentId: z.uuid() });
const observationParamsSchema = deploymentParamsSchema.extend({ observationId: z.uuid() });
const streamQuerySchema = z.object({ once: z.enum(["true", "false"]).optional() });

export type LiveObservationV2RouteOptions = {
  readonly enabled: boolean;
  readonly liveObservationService: LiveObservationV2Service;
  readonly prepareDeploymentManifest: (
    request: FastifyRequest,
    deploymentId: string
  ) => Promise<void>;
  readonly requireDeploymentAccess: (
    request: FastifyRequest,
    deploymentId: string
  ) => Promise<void>;
};

export async function registerLiveObservationV2Routes(
  app: FastifyInstance,
  options: LiveObservationV2RouteOptions
): Promise<void> {
  if (!options.enabled) return;

  app.post("/deployments/:deploymentId/live-observations", async (request, reply) => {
    try {
      const params = deploymentParamsSchema.parse(request.params);
      await options.prepareDeploymentManifest(request, params.deploymentId);
      const response = await options.liveObservationService.createSession(params.deploymentId);
      return reply.status(201).send(response);
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.get(
    "/deployments/:deploymentId/live-observations/:observationId",
    async (request, reply) => {
      try {
        const params = observationParamsSchema.parse(request.params);
        await options.requireDeploymentAccess(request, params.deploymentId);
        return reply
          .status(200)
          .send(
            await options.liveObservationService.readSession(
              params.deploymentId,
              params.observationId
            )
          );
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  app.get(
    "/deployments/:deploymentId/live-observations/:observationId/stream",
    async (request, reply) => {
      try {
        const params = observationParamsSchema.parse(request.params);
        const query = streamQuerySchema.parse(request.query);
        await options.requireDeploymentAccess(request, params.deploymentId);
        return streamSnapshots({
          deploymentId: params.deploymentId,
          observationId: params.observationId,
          once: query.once === "true",
          reply,
          request,
          service: options.liveObservationService
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  app.post(
    "/deployments/:deploymentId/live-observations/:observationId/stop",
    async (request, reply) => {
      try {
        const params = observationParamsSchema.parse(request.params);
        await options.requireDeploymentAccess(request, params.deploymentId);
        return reply
          .status(200)
          .send(
            await options.liveObservationService.stopSession(
              params.deploymentId,
              params.observationId
            )
          );
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );
}

async function streamSnapshots(input: {
  deploymentId: string;
  observationId: string;
  once: boolean;
  reply: FastifyReply;
  request: FastifyRequest;
  service: LiveObservationV2Service;
}): Promise<void> {
  input.reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    Vary: "Cookie"
  });
  input.reply.hijack();

  let closed = false;
  let updating = false;
  const timers: {
    snapshot?: NodeJS.Timeout;
    heartbeat?: NodeJS.Timeout;
  } = {};
  const close = () => {
    if (closed) return;
    closed = true;
    if (timers.snapshot) clearInterval(timers.snapshot);
    if (timers.heartbeat) clearInterval(timers.heartbeat);
    if (!input.reply.raw.writableEnded && !input.reply.raw.destroyed) input.reply.raw.end();
  };
  const writeSnapshot = async () => {
    if (closed || updating) return;
    updating = true;
    try {
      const response = await input.service.readSession(
        input.deploymentId,
        input.observationId
      );
      if (closed) return;
      input.reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(response.snapshot)}\n\n`);
      if (response.snapshot.status !== "active") close();
    } catch {
      close();
    } finally {
      updating = false;
    }
  };

  input.request.raw.on("close", close);
  await writeSnapshot();
  if (input.once || closed) {
    close();
    return;
  }

  timers.snapshot = setInterval(() => void writeSnapshot(), 1_000);
  timers.heartbeat = setInterval(() => {
    if (!closed) input.reply.raw.write(": heartbeat\n\n");
  }, 15_000);
  timers.snapshot.unref();
  timers.heartbeat.unref();
}

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ error: "bad_request", message: error.message });
  }
  if (error instanceof LiveObservationV2ServiceError) {
    return reply.status(statusFor(error.code)).send({
      error: error.code,
      message: "Live Observation session request failed"
    });
  }
  throw error;
}

function statusFor(code: LiveObservationV2ServiceError["code"]): 404 | 409 | 410 | 429 | 503 {
  switch (code) {
    case "LIVE_OBSERVATION_CACHE_UNAVAILABLE":
    case "service_unavailable":
      return 503;
    case "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE":
    case "LIVE_OBSERVATION_OUTPUT_INVALID":
    case "conflict":
      return 409;
    case "LIVE_OBSERVATION_GONE":
      return 410;
    case "LIVE_OBSERVATION_RATE_LIMITED":
    case "too_many_requests":
      return 429;
    default:
      return 404;
  }
}
