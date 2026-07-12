import { z } from "zod";
import type {
  ApiErrorCode,
  CollectLiveObservationEventResponse,
  CreateLiveObservationResponse,
  LiveObservationSnapshotResponse,
  StopLiveObservationResponse
} from "@sketchcatch/types";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import {
  getRuntimeEnv,
  isLiveObservationEnabled,
  type RuntimeEnv
} from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  createPostgresDeploymentRepository,
  DeploymentNotFoundError,
  getDeployment,
  listTerraformOutputs,
  type DeploymentRepository,
  type ProjectAccessContext
} from "../deployments/deployment-service.js";
import { createAwsDeploymentObservabilityProvider } from "../live-observations/aws-deployment-observability-provider.js";
import type { DeploymentObservabilityProvider } from "../live-observations/deployment-observability-provider.js";
import {
  createLiveObservationService,
  LiveObservationServiceError,
  type CreateLiveObservationSessionInput,
  type LiveObservationService
} from "../live-observations/live-observation-service.js";
import {
  createSimulatedCloudWatchAgentObservabilityProvider,
  recordSimulatedCloudWatchAgentTraffic,
  resetSimulatedCloudWatchAgentTraffic
} from "../live-observations/simulated-cloudwatch-agent-observability-provider.js";
import {
  createRuntimeCacheFromEnv,
  type RuntimeCache
} from "../runtime-cache/index.js";

const deploymentParamsSchema = z.object({
  deploymentId: z.uuid()
});
const observationParamsSchema = deploymentParamsSchema.extend({
  observationId: z.uuid()
});
const publicCollectorParamsSchema = z.object({
  token: z.string().min(43).max(86).regex(/^[A-Za-z0-9_-]+$/)
});
const publicCollectorBodySchema = z.object({
  eventId: z.uuid()
});
const streamQuerySchema = z.object({
  once: z.enum(["true", "false"]).optional()
});

export type LoadLiveObservationDeploymentContext = (
  request: FastifyRequest,
  deploymentId: string
) => Promise<CreateLiveObservationSessionInput>;

export type LiveObservationRouteOptions = {
  readonly prefix?: string | undefined;
  readonly enabled?: boolean | undefined;
  readonly runtimeEnv?: RuntimeEnv | undefined;
  readonly runtimeCache?: RuntimeCache | undefined;
  readonly liveObservationService?: LiveObservationService | undefined;
  readonly getDatabaseClient?: (() => DatabaseClient) | undefined;
  readonly createDeploymentRepository?: (
    db: DatabaseClient["db"]
  ) => DeploymentRepository;
  readonly loadDeploymentContext?: LoadLiveObservationDeploymentContext | undefined;
  readonly publicApiBaseUrl?: string | undefined;
  readonly webOrigins?: readonly string[] | undefined;
};

export async function registerLiveObservationRoutes(
  app: FastifyInstance,
  options: LiveObservationRouteOptions = {}
): Promise<void> {
  const runtimeEnv = options.runtimeEnv ?? getRuntimeEnv();
  const enabled = options.enabled ?? isLiveObservationEnabled(runtimeEnv);
  const runtimeCache = options.runtimeCache ?? createRuntimeCacheFromEnv({ env: runtimeEnv });
  const publicApiBaseUrl =
    options.publicApiBaseUrl ??
    runtimeEnv.sketchcatchPublicBaseUrl?.trim() ??
    "http://localhost:4000";
  const liveObservationService =
    options.liveObservationService ??
    createLiveObservationService({
      observabilityProvider: createLiveObservationObservabilityProvider(runtimeEnv),
      invalidateObservationCacheOnEvent: isSimulatedCloudWatchAgentEnabled(runtimeEnv),
      onSessionTerminal: isSimulatedCloudWatchAgentEnabled(runtimeEnv)
        ? resetSimulatedCloudWatchAgentTraffic
        : undefined,
      publicApiBaseUrl,
      requireSharedCache: runtimeEnv.nodeEnv === "production",
      runtimeCache
    });
  const loadDeploymentContext =
    options.loadDeploymentContext ??
    createDefaultDeploymentContextLoader(options);
  const webOrigins = new Set(
    options.webOrigins ?? createDefaultWebOrigins(publicApiBaseUrl)
  );

  app.post("/deployments/:deploymentId/live-observations", async (request, reply) => {
    if (!enabled) {
      return sendDisabled(reply);
    }

    try {
      const params = deploymentParamsSchema.parse(request.params);
      const deploymentContext = await loadDeploymentContext(
        request,
        params.deploymentId
      );
      const response: CreateLiveObservationResponse =
        await liveObservationService.createSession(deploymentContext);

      return reply.status(201).send(response);
    } catch (error) {
      return handleLiveObservationError(error, reply);
    }
  });

  app.get(
    "/deployments/:deploymentId/live-observations/:observationId",
    async (request, reply) => {
      if (!enabled) {
        return sendDisabled(reply);
      }

      try {
        const params = observationParamsSchema.parse(request.params);
        await loadDeploymentContext(request, params.deploymentId);
        const response: LiveObservationSnapshotResponse = {
          snapshot: await liveObservationService.getSnapshotForDeployment(
            params.observationId,
            params.deploymentId
          )
        };

        return reply.status(200).send(response);
      } catch (error) {
        return handleLiveObservationError(error, reply);
      }
    }
  );

  app.get(
    "/deployments/:deploymentId/live-observations/:observationId/stream",
    async (request, reply) => {
      if (!enabled) {
        return sendDisabled(reply);
      }

      try {
        const params = observationParamsSchema.parse(request.params);
        const query = streamQuerySchema.parse(request.query);
        await loadDeploymentContext(request, params.deploymentId);
        await liveObservationService.getSnapshotForDeployment(
          params.observationId,
          params.deploymentId
        );

        return streamLiveObservationSnapshots({
          deploymentId: params.deploymentId,
          observationId: params.observationId,
          once: query.once === "true",
          reply,
          request,
          service: liveObservationService
        });
      } catch (error) {
        return handleLiveObservationError(error, reply);
      }
    }
  );

  app.post(
    "/deployments/:deploymentId/live-observations/:observationId/stop",
    async (request, reply) => {
      if (!enabled) {
        return sendDisabled(reply);
      }

      try {
        const params = observationParamsSchema.parse(request.params);
        await loadDeploymentContext(request, params.deploymentId);
        const response: StopLiveObservationResponse = {
          snapshot: await liveObservationService.stopSession(
            params.observationId,
            params.deploymentId
          )
        };

        return reply.status(200).send(response);
      } catch (error) {
        return handleLiveObservationError(error, reply);
      }
    }
  );

  app.post("/traffic", async (_request, reply) => {
    if (!enabled) {
      return sendDisabled(reply);
    }

    return reply.status(204).send();
  });

  app.options(
    "/live-observations/public/:token/events",
    async (request, reply) => {
      if (!enabled) {
        return reply.status(410).send();
      }

      try {
        const params = publicCollectorParamsSchema.parse(request.params);
        const session = await liveObservationService.getSessionForPublicToken(
          params.token
        );
        applyCollectorCors(request, reply, session.audienceUrl, webOrigins);
        return reply.status(204).send();
      } catch (error) {
        return handleLiveObservationError(error, reply);
      }
    }
  );

  app.post(
    "/live-observations/public/:token/events",
    async (request, reply) => {
      if (!enabled) {
        return reply.status(410).send({
          error: "LIVE_OBSERVATION_GONE",
          message: "Live Observation session is not available"
        });
      }

      try {
        const params = publicCollectorParamsSchema.parse(request.params);
        const body = publicCollectorBodySchema.parse(request.body);
        const session = await liveObservationService.getSessionForPublicToken(
          params.token
        );
        applyCollectorCors(request, reply, session.audienceUrl, webOrigins);
        const response: CollectLiveObservationEventResponse =
          await liveObservationService.collectEvent({
            eventId: body.eventId,
            publicToken: params.token
          });

        if (response.accepted && isSimulatedCloudWatchAgentEnabled(runtimeEnv)) {
          recordSimulatedCloudWatchAgentTraffic(session.id);
        }

        return reply.status(response.accepted ? 202 : 200).send(response);
      } catch (error) {
        return handleLiveObservationError(error, reply);
      }
    }
  );
}

function createLiveObservationObservabilityProvider(
  runtimeEnv: RuntimeEnv
): DeploymentObservabilityProvider {
  if (isSimulatedCloudWatchAgentEnabled(runtimeEnv)) {
    return createSimulatedCloudWatchAgentObservabilityProvider();
  }

  return createAwsDeploymentObservabilityProvider();
}

function isSimulatedCloudWatchAgentEnabled(runtimeEnv: RuntimeEnv): boolean {
  return runtimeEnv.liveObservationSimulatedAgent?.trim().toLowerCase() === "true";
}

function createDefaultDeploymentContextLoader(
  options: LiveObservationRouteOptions
): LoadLiveObservationDeploymentContext {
  const getLiveObservationDatabaseClient =
    options.getDatabaseClient ?? getDatabaseClient;

  return async (request, deploymentId) => {
    const client = getLiveObservationDatabaseClient();
    const userId = await requireActiveUserId(request, () => client);
    const accessContext: ProjectAccessContext = { kind: "user", userId };
    const repository =
      options.createDeploymentRepository?.(client.db) ??
      createPostgresDeploymentRepository(client.db);
    const deployment = await getDeployment(
      { deploymentId, accessContext },
      repository
    );

    if (!deployment.awsConnectionId) {
      throw new LiveObservationServiceError(
        "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE",
        "Live Observation deployment has no AWS connection"
      );
    }

    const awsConnection = await repository.findVerifiedAwsConnectionById(
      deployment.awsConnectionId,
      accessContext
    );

    if (!awsConnection?.roleArn) {
      throw new LiveObservationServiceError(
        "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE",
        "Live Observation requires a verified AWS connection"
      );
    }

    const terraformOutputs = await listTerraformOutputs(
      { deploymentId, accessContext },
      repository
    );
    const outputs = Object.fromEntries(
      terraformOutputs
        .filter((output) => !output.sensitive && output.value !== null)
        .map((output) => [output.name, output.value])
    );

    return {
      deploymentId,
      status: deployment.status,
      liveProfile: deployment.liveProfile,
      outputs,
      observationTarget: {
        awsConnectionId: awsConnection.id,
        roleArn: awsConnection.roleArn,
        externalId: awsConnection.externalId,
        region: awsConnection.region
      }
    };
  };
}

function createDefaultWebOrigins(publicApiBaseUrl: string): string[] {
  const origins = ["http://localhost:3000", "http://127.0.0.1:3000"];

  try {
    origins.push(new URL(publicApiBaseUrl).origin);
  } catch {
    return origins;
  }

  return origins;
}

function applyCollectorCors(
  request: FastifyRequest,
  reply: FastifyReply,
  audienceUrl: string,
  webOrigins: ReadonlySet<string>
): void {
  const origin = firstHeaderValue(request.headers.origin);

  if (!origin) {
    return;
  }

  const audienceOrigin = new URL(audienceUrl).origin;

  if (origin !== audienceOrigin && !webOrigins.has(origin)) {
    return;
  }

  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Methods", "POST,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "content-type");
  reply.header("Vary", "Origin");
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sendDisabled(reply: FastifyReply) {
  return reply.status(404).send({
    error: "not_found",
    message: "Live Observation is disabled"
  });
}

function handleLiveObservationError(error: unknown, reply: FastifyReply) {
  if (error instanceof LiveObservationServiceError) {
    return reply.status(getServiceErrorStatus(error.code)).send({
      error: error.code,
      message: error.message
    });
  }

  if (error instanceof DeploymentNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error.message
    });
  }

  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "bad_request",
      message: error.message
    });
  }

  throw error;
}

function getServiceErrorStatus(code: ApiErrorCode): 404 | 409 | 410 | 429 | 503 {
  switch (code) {
    case "LIVE_OBSERVATION_CACHE_UNAVAILABLE":
      return 503;
    case "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE":
    case "LIVE_OBSERVATION_OUTPUT_INVALID":
      return 409;
    case "LIVE_OBSERVATION_GONE":
      return 410;
    case "LIVE_OBSERVATION_RATE_LIMITED":
      return 429;
    default:
      return 404;
  }
}

export type LiveObservationStreamScheduler = {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
};

const liveObservationStreamScheduler: LiveObservationStreamScheduler = {
  clearInterval(handle) {
    clearInterval(handle as NodeJS.Timeout);
  },
  setInterval(callback, delayMs) {
    return setInterval(callback, delayMs);
  }
};

export async function streamLiveObservationSnapshots(input: {
  readonly deploymentId: string;
  readonly observationId: string;
  readonly once: boolean;
  readonly reply: FastifyReply;
  readonly request: FastifyRequest;
  readonly scheduler?: LiveObservationStreamScheduler | undefined;
  readonly service: LiveObservationService;
}): Promise<void> {
  const scheduler = input.scheduler ?? liveObservationStreamScheduler;
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
    snapshot?: unknown;
    heartbeat?: unknown;
  } = {};
  const close = () => {
    if (closed) {
      return;
    }

    closed = true;

    if (timers.snapshot) {
      scheduler.clearInterval(timers.snapshot);
    }

    if (timers.heartbeat) {
      scheduler.clearInterval(timers.heartbeat);
    }

    if (!input.reply.raw.writableEnded && !input.reply.raw.destroyed) {
      input.reply.raw.end();
    }
  };
  const writeSnapshot = async () => {
    if (closed || updating) {
      return;
    }

    updating = true;

    try {
      const snapshot = await input.service.getSnapshotForDeployment(
        input.observationId,
        input.deploymentId
      );
      if (closed) {
        return;
      }
      input.reply.raw.write(
        `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
      );

      if (snapshot.status !== "active") {
        close();
      }
    } catch {
      input.request.log.warn(
        { observationId: input.observationId },
        "Live Observation stream update failed"
      );
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

  timers.snapshot = scheduler.setInterval(() => {
    void writeSnapshot();
  }, 1_000);
  timers.heartbeat = scheduler.setInterval(() => {
    if (!closed) {
      input.reply.raw.write(": heartbeat\n\n");
    }
  }, 15_000);
}
