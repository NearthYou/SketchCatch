import type { FastifyRequest } from "fastify";
import type { DatabaseClient } from "../db/client.js";
import { requireActiveUserId } from "../auth/current-user.js";
import type { RuntimeEnv } from "../config/env.js";
import {
  createPostgresDeploymentRepository,
  getDeployment,
  listTerraformOutputs,
  type ProjectAccessContext
} from "../deployments/deployment-service.js";
import type { RuntimeCache } from "../runtime-cache/index.js";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";
import { createLiveObservationCapability, type LiveObservationCapabilityKeyring } from "./live-observation-capability.js";
import {
  assertDeploymentLiveObservationManifestReusable,
  materializeDeploymentLiveObservationManifest
} from "./live-observation-manifest-materializer.js";
import {
  createPostgresDeploymentLiveObservationManifestRepository,
  type DeploymentLiveObservationManifestRepository
} from "./live-observation-manifest-repository.js";
import { createLiveObservationPublicCollector } from "./live-observation-public-collector.js";
import { createLiveObservationHttpsTransport } from "./live-observation-https-transport.js";
import { createLiveObservationPublicRequestRateLimiter } from "./live-observation-public-request-rate-limiter.js";
import {
  LiveObservationStoreUnavailableError,
  type LiveObservationStore
} from "./live-observation-store.js";
import {
  createLiveObservationV2Service,
  LiveObservationV2ServiceError
} from "./live-observation-v2-service.js";
import { createRedisLiveObservationStore } from "./redis-live-observation-store.js";

export type LiveObservationV2Runtime = {
  readonly collector: ReturnType<typeof createLiveObservationPublicCollector>;
  readonly liveObservationService: ReturnType<typeof createLiveObservationV2Service>;
  readonly prepareDeploymentManifest: (
    request: FastifyRequest,
    deploymentId: string
  ) => Promise<void>;
  readonly requireDeploymentAccess: (
    request: FastifyRequest,
    deploymentId: string
  ) => Promise<void>;
};

export function createLiveObservationV2Runtime(options: {
  readonly getDatabaseClient: () => DatabaseClient;
  readonly keyring: LiveObservationCapabilityKeyring;
  readonly runtimeCache: RuntimeCache;
  readonly runtimeEnv: RuntimeEnv;
}): LiveObservationV2Runtime {
  const audienceBaseUrl = requireAudienceBaseUrl(options.runtimeEnv);
  const capability = createLiveObservationCapability({ keyring: options.keyring });
  const store = createStore(options.runtimeEnv);
  const manifestRepository = createLazyManifestRepository(options.getDatabaseClient);
  const liveObservationService = createLiveObservationV2Service({
    audienceBaseUrl,
    capabilityKid: capability.currentKid,
    manifestRepository,
    store
  });
  const collector = createLiveObservationPublicCollector({
    capability,
    requestRateLimiter: createLiveObservationPublicRequestRateLimiter({
      runtimeCache: options.runtimeCache,
      requireRedis: options.runtimeEnv.nodeEnv === "production"
    }),
    store,
    trafficTransport: createLiveObservationHttpsTransport()
  });

  async function loadDeployment(request: FastifyRequest, deploymentId: string) {
    const client = options.getDatabaseClient();
    const userId = await requireActiveUserId(request, () => client);
    const accessContext: ProjectAccessContext = { kind: "user", userId };
    const deploymentRepository = createPostgresDeploymentRepository(client.db);
    const deployment = await getDeployment(
      { deploymentId, accessContext },
      deploymentRepository
    );
    return { accessContext, client, deployment, deploymentRepository };
  }

  return {
    collector,
    liveObservationService,
    async prepareDeploymentManifest(request, deploymentId) {
      const context = await loadDeployment(request, deploymentId);
      const repository = createPostgresDeploymentLiveObservationManifestRepository(
        context.client.db
      );
      const connection = context.deployment.awsConnectionId
        ? await context.deploymentRepository.findVerifiedAwsConnectionById(
            context.deployment.awsConnectionId,
            context.accessContext
          ) ?? null
        : null;
      if (context.deployment.status !== "SUCCESS" || !connection) {
        throw new LiveObservationV2ServiceError(
          "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE"
        );
      }
      const existing = await repository.findByDeploymentId(deploymentId);
      if (existing) {
        try {
          assertDeploymentLiveObservationManifestReusable({
            audienceBaseUrl,
            connection,
            deployment: context.deployment,
            record: existing
          });
          return;
        } catch {
          throw new LiveObservationV2ServiceError(
            "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE"
          );
        }
      }

      const terraformOutputs = await listTerraformOutputs(
        { deploymentId, accessContext: context.accessContext },
        context.deploymentRepository
      );
      const outputs = Object.fromEntries(
        terraformOutputs
          .filter((output) => !output.sensitive && output.value !== null)
          .map((output) => [output.name, output.value])
      );

      await materializeDeploymentLiveObservationManifest(
        {
          audienceBaseUrl,
          deployment: context.deployment,
          connection,
          outputs
        },
        repository
      );
    },
    async requireDeploymentAccess(request, deploymentId) {
      await loadDeployment(request, deploymentId);
    }
  };
}

function createStore(env: RuntimeEnv): LiveObservationStore {
  if (env.nodeEnv !== "production") {
    return createInMemoryLiveObservationStore();
  }
  if (!env.redisUrl?.trim()) return createUnavailableStore();
  return createRedisLiveObservationStore({
    keyNamespace: "sketchcatch:live-observation:v2",
    redisUrl: env.redisUrl.trim()
  });
}

function createLazyManifestRepository(
  getDatabaseClient: () => DatabaseClient
): DeploymentLiveObservationManifestRepository {
  const current = () =>
    createPostgresDeploymentLiveObservationManifestRepository(getDatabaseClient().db);
  return {
    findByDeploymentId: (deploymentId) => current().findByDeploymentId(deploymentId),
    saveValid: (manifest) => current().saveValid(manifest),
    saveInvalid: (input) => current().saveInvalid(input)
  };
}

function createUnavailableStore(): LiveObservationStore {
  const unavailable = async (): Promise<never> => {
    throw new LiveObservationStoreUnavailableError();
  };
  return {
    createSession: unavailable,
    readSession: unavailable,
    collectEvent: unavailable,
    stopSession: unavailable,
    claimObserverLease: unavailable,
    commitObservation: unavailable,
    acquirePresenterBoostLease: unavailable,
    renewPresenterBoostLease: unavailable,
    releasePresenterBoostLease: unavailable
  };
}

function requireAudienceBaseUrl(env: RuntimeEnv): string {
  const value = env.sketchcatchPublicBaseUrl?.trim();
  if (!value) throw new Error("SKETCHCATCH_PUBLIC_BASE_URL is required for Live Observation");
  return value;
}
