import type { FastifyRequest } from "fastify";
import type { AwsConnection, DeploymentLiveObservationManifestRecord } from "@sketchcatch/types";
import type { DatabaseClient } from "../db/client.js";
import { requireActiveUserId } from "../auth/current-user.js";
import type { RuntimeEnv } from "../config/env.js";
import {
  createPostgresDeploymentRepository,
  getDeployment,
  listTerraformOutputs,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext
} from "../deployments/deployment-service.js";
import {
  createAwsCloudFrontLiveObservationTopologyVerifier,
  type CloudFrontLiveObservationTopologyVerifier
} from "./aws-cloudfront-live-observation-topology-verifier.js";
import { createAwsLiveObservationSnapshotProvider } from "./aws-live-observation-snapshot-provider.js";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";
import {
  createLiveObservationCapability,
  type LiveObservationCapabilityKeyring
} from "./live-observation-capability.js";
import {
  assertDeploymentLiveObservationManifestReusable,
  materializeDeploymentLiveObservationManifest,
  type VerifiedCloudFrontLiveObservationTopology
} from "./live-observation-manifest-materializer.js";
import {
  createPostgresDeploymentLiveObservationManifestRepository,
  LiveObservationManifestPersistenceConflictError,
  type DeploymentLiveObservationManifestRepository
} from "./live-observation-manifest-repository.js";
import { createLiveObservationPublicCollector } from "./live-observation-public-collector.js";
import { createLiveObservationHttpsTransport } from "./live-observation-https-transport.js";
import { createLiveObservationObserverService } from "./live-observation-observer-service.js";
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
  readonly refreshObservation: (
    request: FastifyRequest,
    deploymentId: string,
    observationId: string
  ) => Promise<void>;
};

export async function prepareDeploymentManifest(input: {
  readonly accessContext: ProjectAccessContext;
  readonly audienceBaseUrl: string;
  readonly connection: AwsConnection;
  readonly deployment: DeploymentRecord;
  readonly deploymentRepository: DeploymentRepository;
  readonly manifestRepository: DeploymentLiveObservationManifestRepository;
  readonly topologyVerifier: CloudFrontLiveObservationTopologyVerifier;
}): Promise<void> {
  const existing = await input.manifestRepository.findByDeploymentId(input.deployment.id);
  if (existing?.status === "valid") {
    requireReusableManifest({ ...input, record: existing });
    return;
  }

  const architecture = await input.deploymentRepository.findArchitectureInProject(
    input.deployment.architectureId,
    input.deployment.projectId
  );
  if (!architecture) {
    await persistInvalidOrReuseWinner(input, "deployment architecture verification failed");
    return;
  }

  const terraformOutputs = await listTerraformOutputs(
    {
      deploymentId: input.deployment.id,
      accessContext: input.accessContext
    },
    input.deploymentRepository
  );
  const outputs = Object.fromEntries(
    terraformOutputs
      .filter((output) => !output.sensitive && output.value !== null)
      .map((output) => [output.name, output.value])
  );

  let topology: VerifiedCloudFrontLiveObservationTopology | undefined;
  if (typeof outputs["cloudfront_distribution_id"] === "string") {
    try {
      topology = await input.topologyVerifier.verify({
        connection: input.connection,
        expected: {
          accountId: requireString(input.connection.accountId),
          region: input.connection.region,
          cloudFrontDistributionId: requireOutputString(outputs, "cloudfront_distribution_id"),
          cloudFrontDomainName: requireOutputString(outputs, "cloudfront_domain_name"),
          frontendBucketName: requireOutputString(outputs, "static_bucket_name"),
          loadBalancerArn: requireOutputString(outputs, "alb_arn"),
          loadBalancerDnsName: requireOutputString(outputs, "alb_dns_name"),
          targetGroupArn: requireOutputString(outputs, "target_group_arn"),
          clusterName: requireOutputString(outputs, "ecs_cluster_name"),
          serviceName: requireOutputString(outputs, "ecs_service_name")
        }
      });
    } catch {
      await persistInvalidOrReuseWinner(input, "cloudfront topology verification failed");
      return;
    }
  }

  let record: DeploymentLiveObservationManifestRecord;
  try {
    record = await materializeDeploymentLiveObservationManifest(
      {
        audienceBaseUrl: input.audienceBaseUrl,
        architecture: architecture.architectureJson,
        deployment: input.deployment,
        connection: input.connection,
        outputs,
        topology
      },
      input.manifestRepository
    );
  } catch (error) {
    if (!(error instanceof LiveObservationManifestPersistenceConflictError)) {
      throw error;
    }
    record = await readManifestWinnerOrThrow(input);
  }
  if (record.status !== "valid") {
    throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE");
  }
  requireReusableManifest({ ...input, record });
}

async function persistInvalidOrReuseWinner(
  input: {
    readonly audienceBaseUrl: string;
    readonly connection: AwsConnection;
    readonly deployment: DeploymentRecord;
    readonly manifestRepository: DeploymentLiveObservationManifestRepository;
  },
  reason: string
): Promise<void> {
  let record: DeploymentLiveObservationManifestRecord;
  try {
    record = await input.manifestRepository.saveInvalid({
      deploymentId: input.deployment.id,
      reason
    });
  } catch (error) {
    if (!(error instanceof LiveObservationManifestPersistenceConflictError)) {
      throw error;
    }
    record = await readManifestWinnerOrThrow(input);
  }
  if (record.status !== "valid") {
    throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE");
  }
  requireReusableManifest({ ...input, record });
}

async function readManifestWinnerOrThrow(input: {
  readonly deployment: DeploymentRecord;
  readonly manifestRepository: DeploymentLiveObservationManifestRepository;
}): Promise<DeploymentLiveObservationManifestRecord> {
  const winner = await input.manifestRepository.findByDeploymentId(input.deployment.id);
  if (!winner) {
    throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE");
  }
  return winner;
}

function requireReusableManifest(input: {
  readonly audienceBaseUrl: string;
  readonly connection: AwsConnection;
  readonly deployment: DeploymentRecord;
  readonly record: DeploymentLiveObservationManifestRecord;
}): void {
  try {
    assertDeploymentLiveObservationManifestReusable(input);
  } catch {
    throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE");
  }
}

export function createLiveObservationV2Runtime(options: {
  readonly getDatabaseClient: () => DatabaseClient;
  readonly keyring: LiveObservationCapabilityKeyring;
  readonly runtimeEnv: RuntimeEnv;
  readonly topologyVerifier?: CloudFrontLiveObservationTopologyVerifier | undefined;
}): LiveObservationV2Runtime {
  const audienceBaseUrl = requireAudienceBaseUrl(options.runtimeEnv);
  const capability = createLiveObservationCapability({ keyring: options.keyring });
  const store = createStore(options.runtimeEnv);
  const manifestRepository = createLazyManifestRepository(options.getDatabaseClient);
  const topologyVerifier =
    options.topologyVerifier ?? createAwsCloudFrontLiveObservationTopologyVerifier();
  const liveObservationService = createLiveObservationV2Service({
    audienceBaseUrl,
    capabilityKid: capability.currentKid,
    manifestRepository,
    store
  });
  const observerService = createLiveObservationObserverService({
    provider: createAwsLiveObservationSnapshotProvider(),
    store
  });
  const collector = createLiveObservationPublicCollector({
    capability,
    store,
    trafficTransport: createLiveObservationHttpsTransport()
  });

  async function loadDeployment(request: FastifyRequest, deploymentId: string) {
    const client = options.getDatabaseClient();
    const userId = await requireActiveUserId(request, () => client);
    const accessContext: ProjectAccessContext = { kind: "user", userId };
    const deploymentRepository = createPostgresDeploymentRepository(client.db);
    const deployment = await getDeployment({ deploymentId, accessContext }, deploymentRepository);
    return { accessContext, client, deployment, deploymentRepository };
  }

  return {
    collector,
    liveObservationService,
    prepareDeploymentManifest: async (request, deploymentId) => {
      const context = await loadDeployment(request, deploymentId);
      const repository = createPostgresDeploymentLiveObservationManifestRepository(
        context.client.db
      );
      const connection = context.deployment.awsConnectionId
        ? ((await context.deploymentRepository.findVerifiedAwsConnectionById(
            context.deployment.awsConnectionId,
            context.accessContext
          )) ?? null)
        : null;
      if (!isLiveObservationEligibleDeploymentStatus(context.deployment.status) || !connection) {
        throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE");
      }
      await prepareDeploymentManifest({
        accessContext: context.accessContext,
        audienceBaseUrl,
        connection,
        deployment: context.deployment,
        deploymentRepository: context.deploymentRepository,
        manifestRepository: repository,
        topologyVerifier
      });
    },
    async requireDeploymentAccess(request, deploymentId) {
      await loadDeployment(request, deploymentId);
    },
    async refreshObservation(request, deploymentId, observationId) {
      const context = await loadDeployment(request, deploymentId);
      const connection = context.deployment.awsConnectionId
        ? ((await context.deploymentRepository.findVerifiedAwsConnectionById(
            context.deployment.awsConnectionId,
            context.accessContext
          )) ?? null)
        : null;
      await observerService.refresh({
        observationId,
        expectedDeploymentId: deploymentId,
        connection
      });
    }
  };
}

function isLiveObservationEligibleDeploymentStatus(status: string): boolean {
  return status === "SUCCESS" || status === "PARTIALLY_FAILED" || status === "PARTIALLY_CANCELED";
}

function requireOutputString(outputs: Readonly<Record<string, unknown>>, name: string): string {
  const value = outputs[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

function requireString(value: string | null): string {
  if (!value) throw new Error("Missing verified AWS account ID");
  return value;
}

function createStore(env: RuntimeEnv): LiveObservationStore {
  if (env.nodeEnv !== "production") {
    return createInMemoryLiveObservationStore();
  }
  if (!env.redisUrl?.trim()) return createUnavailableStore();
  return createRedisLiveObservationStore({
    keyNamespace: "production",
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
    commitObservation: unavailable
  };
}

function requireAudienceBaseUrl(env: RuntimeEnv): string {
  const value = env.sketchcatchPublicBaseUrl?.trim();
  if (!value) throw new Error("SKETCHCATCH_PUBLIC_BASE_URL is required for Live Observation");
  return value;
}
