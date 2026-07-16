import {
  GetDistributionCommand,
  CloudFrontClient,
  type CloudFrontClientConfig
} from "@aws-sdk/client-cloudfront";
import {
  BatchGetImageCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  type ECRClientConfig
} from "@aws-sdk/client-ecr";
import {
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
  type ContainerDefinition,
  type ECSClientConfig,
  type RegisterTaskDefinitionCommandInput,
  type TaskDefinition
} from "@aws-sdk/client-ecs";
import {
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  type ElasticLoadBalancingV2ClientConfig
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { GetBucketVersioningCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import type { JsonValue } from "@sketchcatch/types";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway,
  type AwsTemporaryCredentials
} from "../aws-connections/aws-connection-test-service.js";
import {
  activateFrontendReleaseIndex,
  invalidateFrontendRelease,
  uploadFrontendReleaseAssets,
  verifyPublicFrontendRelease
} from "./aws-frontend-release-gateway.js";
import {
  createEcsDeployReleaseSessionPolicy,
  createFrontendDeployReleaseSessionPolicy,
  createReadOnlyReleaseSessionPolicy,
  type AwsReleaseRuntimeCoordinates
} from "./aws-release-session-policy.js";
import {
  verifyEcsReleaseHealthSnapshot,
  type EcsReleaseHealthSnapshot
} from "./ecs-release-health-verifier.js";
import {
  loadFrontendReleaseCandidateArtifacts,
  loadReleaseCandidateArtifacts,
  type LoadedFrontendReleaseCandidateArtifacts,
  type LoadedReleaseCandidateArtifacts
} from "./release-candidate-artifact-loader.js";
import { publishOciLayoutToEcr, type EcrPublisherClient } from "./oci-ecr-publisher.js";
import { createS3ReleaseCandidateStorage } from "./s3-release-candidate-storage.js";
import type {
  TrustedReleaseContext,
  TrustedReleaseGateway
} from "./trusted-release-worker-service.js";
import {
  createAwsCloudFrontLiveObservationTopologyVerifier,
  type CloudFrontLiveObservationTopologyVerifier
} from "../live-observations/aws-cloudfront-live-observation-topology-verifier.js";

type AwsCommandClient = {
  send(command: { input: object }): Promise<Record<string, unknown>>;
  destroy(): void;
};

type ClientFactories = {
  ecr(configuration: ECRClientConfig): AwsCommandClient;
  ecs(configuration: ECSClientConfig): AwsCommandClient;
  elb(configuration: ElasticLoadBalancingV2ClientConfig): AwsCommandClient;
  s3(configuration: S3ClientConfig): AwsCommandClient;
  cloudFront(configuration: CloudFrontClientConfig): AwsCommandClient;
};

type RuntimeObservation = {
  repositoryUri: string;
  clusterArn: string;
  serviceArn: string;
  currentTaskDefinition: TaskDefinition;
  approvedTaskDefinition: TaskDefinition;
  currentTaskDefinitionArn: string;
  rollbackTaskDefinitionArn: string;
  coordinates: AwsReleaseRuntimeCoordinates;
};

export function createAwsEcsFargateReleaseGateway(options: {
  stsGateway?: AwsConnectionStsGateway;
  clients?: Partial<ClientFactories>;
  loadArtifacts?: typeof loadReleaseCandidateArtifacts;
  loadFrontendArtifacts?: typeof loadFrontendReleaseCandidateArtifacts;
  wait?: (milliseconds: number) => Promise<void>;
  request?: typeof fetch;
  now?: () => Date;
  topologyVerifier?: CloudFrontLiveObservationTopologyVerifier;
} = {}): TrustedReleaseGateway {
  const sts = options.stsGateway ?? createAwsSdkStsGateway();
  const factories = createClientFactories(options.clients);
  const loadArtifacts = options.loadArtifacts ?? loadReleaseCandidateArtifacts;
  const loadFrontendArtifacts =
    options.loadFrontendArtifacts ?? loadFrontendReleaseCandidateArtifacts;
  const wait = options.wait ?? defaultWait;
  const request = options.request ?? fetch;
  const now = options.now ?? (() => new Date());
  let artifacts:
    | LoadedReleaseCandidateArtifacts
    | LoadedFrontendReleaseCandidateArtifacts
    | undefined;
  let observation: RuntimeObservation | undefined;
  let readClients: ReturnType<typeof createReleaseClients> | undefined;
  let deployClients: ReturnType<typeof createReleaseClients> | undefined;

  const verifyApprovedTopology = async (context: TrustedReleaseContext): Promise<void> => {
    const predicted = predictRuntimeCoordinates(context);
    const topologyVerifier =
      options.topologyVerifier ??
      createAwsCloudFrontLiveObservationTopologyVerifier({
        assumeRole: (input) =>
          sts.assumeRole({
            ...input,
            policy: createReadOnlyReleaseSessionPolicy(predicted),
            durationSeconds: 3_600
          }),
        createCloudFrontClient: (configuration) => factories.cloudFront(configuration),
        createEcsClient: (configuration) => factories.ecs(configuration),
        createElbClient: (configuration) => factories.elb(configuration),
        createS3Client: (configuration) => factories.s3(configuration)
      });
    await topologyVerifier.verify({
      connection: {
        roleArn: context.connection.roleArn,
        externalId: context.connection.externalId,
        region: context.connection.region
      },
      expected: {
        accountId: context.connection.accountId,
        region: context.connection.region,
        cloudFrontDistributionId: context.runtime.cloudFrontDistributionId,
        cloudFrontDomainName: context.runtime.cloudFrontDomainName,
        frontendBucketName: context.runtime.frontendBucketName,
        loadBalancerArn: context.runtime.loadBalancerArn,
        loadBalancerDnsName: context.runtime.loadBalancerDnsName,
        targetGroupArn: context.runtime.targetGroupArn,
        clusterName: context.runtime.clusterName,
        serviceName: context.runtime.serviceName
      }
    });
  };

  const gateway: TrustedReleaseGateway = {
    async verifyRuntime(context) {
      const predicted = predictRuntimeCoordinates(context);
      await verifyApprovedTopology(context);
      const readCredentials = await assumeReleaseRole(
        sts,
        context,
        `sketchcatch-recovery-verify-${context.releaseId}`,
        createReadOnlyReleaseSessionPolicy(predicted)
      );
      readClients = createReleaseClients(factories, context.connection.region, readCredentials);
      observation = await verifyRuntime(context, readClients);
      const deployCredentials = await assumeReleaseRole(
        sts,
        context,
        `sc-recovery-ecs-${context.releaseId.slice(0, 32)}`,
        createEcsDeployReleaseSessionPolicy(observation.coordinates)
      );
      deployClients = createReleaseClients(factories, context.connection.region, deployCredentials);
      return { currentTaskDefinitionArn: observation.currentTaskDefinitionArn };
    },
    async verifyCandidate(context) {
      if (new Date(context.candidate.expiresAt).getTime() <= now().getTime()) {
        throw new Error("Approved ReleaseCandidate has expired");
      }
      artifacts = await loadArtifacts(toArtifactReference(context));
      const predicted = predictRuntimeCoordinates(context);
      await verifyApprovedTopology(context);
      const readCredentials = await assumeReleaseRole(
        sts,
        context,
        `sketchcatch-release-verify-${context.releaseId}`,
        createReadOnlyReleaseSessionPolicy(predicted)
      );
      readClients = createReleaseClients(factories, context.connection.region, readCredentials);
      observation = await verifyRuntime(context, readClients);
      deployClients = await createSplitDeployReleaseClients(
        factories,
        sts,
        context,
        observation.coordinates
      );
      return { currentTaskDefinitionArn: observation.currentTaskDefinitionArn } as JsonValue;
    },

    async verifyFrontendCandidate(context) {
      if (new Date(context.candidate.expiresAt).getTime() <= now().getTime()) {
        throw new Error("Approved frontend ReleaseCandidate has expired");
      }
      artifacts = await loadFrontendArtifacts(toArtifactReference(context));
      const predicted = predictRuntimeCoordinates(context);
      await verifyApprovedTopology(context);
      const readCredentials = await assumeReleaseRole(
        sts,
        context,
        `sc-frontend-verify-${context.releaseId.slice(0, 32)}`,
        createReadOnlyReleaseSessionPolicy(predicted)
      );
      readClients = createReleaseClients(factories, context.connection.region, readCredentials);
      observation = await verifyRuntime(context, readClients);
      const deployCredentials = await assumeReleaseRole(
        sts,
        context,
        `sc-frontend-web-${context.releaseId.slice(0, 32)}`,
        createFrontendDeployReleaseSessionPolicy(observation.coordinates)
      );
      deployClients = createReleaseClients(factories, context.connection.region, deployCredentials);
    },

    async publishApi(context, control) {
      const loaded = requireState(artifacts, "Release candidate artifacts were not verified");
      if (!("oci" in loaded)) {
        throw new Error("API OCI Artifact was not loaded for publishing");
      }
      const runtime = requireState(observation, "AWS runtime was not verified");
      const clients = requireState(deployClients, "AWS deploy session is unavailable");
      const published = await publishOciLayoutToEcr(
        loaded.oci,
        { repositoryName: context.runtime.ecrRepositoryName, imageTag: context.candidate.commitSha },
        clients.ecr as unknown as EcrPublisherClient,
        { beforeMutation: control.beforeMutation }
      );
      const verified = await clients.ecr.send(
        new BatchGetImageCommand({
          repositoryName: context.runtime.ecrRepositoryName,
          imageIds: [{ imageDigest: published.imageDigest }],
          acceptedMediaTypes: ["application/vnd.oci.image.manifest.v1+json"]
        })
      );
      const image = asArray(verified["images"]).map(asRecord).find(Boolean);
      const imageDigest = asRecord(image?.["imageId"])?.["imageDigest"];
      if (imageDigest !== published.imageDigest) {
        throw new Error("ECR did not return the published OCI digest");
      }
      return {
        imageDigest: published.imageDigest,
        imageUri: `${runtime.repositoryUri}@${published.imageDigest}`
      };
    },

    async activateEcs({ context, imageDigest, imageUri, beforeMutation }) {
      if (imageDigest !== `sha256:${context.candidate.apiOciDigest}`) {
        throw new Error("ECR image digest does not match the approved candidate");
      }
      const runtime = requireState(observation, "AWS runtime was not verified");
      const clients = requireState(deployClients, "AWS deploy session is unavailable");
      const registration = createTaskDefinitionRegistration(
        runtime.approvedTaskDefinition,
        context,
        imageUri
      );
      await beforeMutation();
      const registered = await clients.ecs.send(new RegisterTaskDefinitionCommand(registration));
      const taskDefinitionArn = asRecord(registered["taskDefinition"])?.["taskDefinitionArn"];
      if (typeof taskDefinitionArn !== "string" || !taskDefinitionArn) {
        throw new Error("ECS did not return a registered Task Definition ARN");
      }
      await beforeMutation();
      await clients.ecs.send(
        new UpdateServiceCommand({
          cluster: runtime.clusterArn,
          service: runtime.serviceArn,
          taskDefinition: taskDefinitionArn,
          forceNewDeployment: false
        })
      );
      return {
        taskDefinitionArn,
        previousTaskDefinitionArn: runtime.rollbackTaskDefinitionArn
      };
    },

    async verifyEcsHealth({ context, taskDefinitionArn }) {
      const runtime = requireState(observation, "AWS runtime was not verified");
      const clients = requireState(deployClients, "AWS deploy session is unavailable");
      return verifyEcsHealthUntilTerminal(
        context,
        runtime,
        taskDefinitionArn,
        { ecs: clients.ecs, elb: clients.elb },
        wait
      );
    },

    async rollbackEcs({ context, taskDefinitionArn, beforeMutation }) {
      const runtime = requireState(observation, "AWS runtime was not verified");
      const clients = requireState(deployClients, "AWS deploy session is unavailable");
      if (taskDefinitionArn !== runtime.rollbackTaskDefinitionArn) {
        throw new Error("Rollback Task Definition does not match the verified baseline");
      }
      await beforeMutation();
      await clients.ecs.send(
        new UpdateServiceCommand({
          cluster: runtime.clusterArn,
          service: runtime.serviceArn,
          taskDefinition: taskDefinitionArn,
          forceNewDeployment: true
        })
      );
      const health = await verifyEcsHealthUntilTerminal(
        context,
        runtime,
        taskDefinitionArn,
        { ecs: clients.ecs, elb: clients.elb },
        wait
      );
      return { state: "restored", taskDefinitionArn, health } as JsonValue;
    },

    async uploadFrontend({ context, beforeMutation }) {
      const loaded = requireState(artifacts, "Release candidate artifacts were not verified");
      const clients = requireState(deployClients, "AWS deploy session is unavailable");
      return uploadFrontendReleaseAssets(
        {
          candidateId: context.candidate.id,
          commitSha: context.candidate.commitSha,
          frontendDirectory: loaded.frontendDirectory,
          manifest: loaded.frontendManifest,
          bucketName: context.runtime.frontendBucketName,
          cloudFrontDistributionId: context.runtime.cloudFrontDistributionId
        },
        clients.s3,
        { beforeMutation }
      );
    },

    async activateFrontend({ context, upload, beforeMutation }) {
      const loaded = requireState(artifacts, "Release candidate artifacts were not verified");
      const clients = requireState(deployClients, "AWS deploy session is unavailable");
      return activateFrontendReleaseIndex(
        {
          candidateId: context.candidate.id,
          commitSha: context.candidate.commitSha,
          frontendDirectory: loaded.frontendDirectory,
          manifest: loaded.frontendManifest,
          bucketName: context.runtime.frontendBucketName,
          cloudFrontDistributionId: context.runtime.cloudFrontDistributionId
        },
        upload,
        clients.s3,
        { beforeMutation }
      );
    },

    async invalidateFrontend({ context, activation, beforeMutation }) {
      const loaded = requireState(artifacts, "Release candidate artifacts were not verified");
      const clients = requireState(deployClients, "AWS deploy session is unavailable");
      return invalidateFrontendRelease(
        {
          candidateId: context.candidate.id,
          commitSha: context.candidate.commitSha,
          frontendDirectory: loaded.frontendDirectory,
          manifest: loaded.frontendManifest,
          bucketName: context.runtime.frontendBucketName,
          cloudFrontDistributionId: context.runtime.cloudFrontDistributionId
        },
        activation,
        clients.cloudFront,
        { wait, beforeMutation }
      );
    },

    async verifyPublic({ context, frontendEvidence }) {
      return verifyPublicFrontendRelease(
        {
          outputUrl: context.runtime.outputUrl,
          expectedMarker: frontendEvidence.commitMarker,
          healthPath: context.runtime.healthCheckPath,
          apiProbePath: context.runtime.apiProbePath,
          apiProbeMethod: "POST",
          apiProbeExpectedStatus: 201
        },
        request
      );
    },

    async cleanupCandidateArtifacts(context, mode) {
      const storage = createS3ReleaseCandidateStorage();
      if (!storage.deleteObjectVersion) {
        throw new Error("ReleaseCandidate storage cleanup is unavailable");
      }
      const deletions = [
        storage.deleteObjectVersion({
          objectKey: context.candidate.apiArchiveObjectKey,
          versionId: context.candidate.apiArchiveObjectVersionId
        })
      ];
      if (mode === "retain_frontend") {
        if (!storage.retainObjectVersionForRetry) {
          throw new Error("Frontend retry Artifact retention is unavailable");
        }
        await storage.retainObjectVersionForRetry({
          objectKey: context.candidate.frontendArchiveObjectKey,
          versionId: context.candidate.frontendArchiveObjectVersionId
        });
      } else {
        deletions.push(
          storage.deleteObjectVersion({
            objectKey: context.candidate.frontendArchiveObjectKey,
            versionId: context.candidate.frontendArchiveObjectVersionId
          })
        );
      }
      await Promise.all(deletions);
    },

    async cleanup() {
      await artifacts?.cleanup();
      readClients?.destroy();
      deployClients?.destroy();
      artifacts = undefined;
      observation = undefined;
      readClients = undefined;
      deployClients = undefined;
    }
  };
  return gateway;
}

async function verifyRuntime(
  context: TrustedReleaseContext,
  clients: ReturnType<typeof createReleaseClients>
): Promise<RuntimeObservation> {
  assertRuntimeArn(context.runtime.ecrRepositoryArn, "ecr", context);
  assertRuntimeArn(context.runtime.targetGroupArn, "elasticloadbalancing", context);
  assertRuntimeArn(context.runtime.taskDefinitionArn, "ecs", context);
  assertRuntimeIamRoleArn(context.runtime.taskRoleArn, context);
  assertRuntimeIamRoleArn(context.runtime.executionRoleArn, context);
  const [repositories, clusters, services, targetGroups, versioning, distribution] =
    await Promise.all([
      clients.ecr.send(
        new DescribeRepositoriesCommand({
          repositoryNames: [context.runtime.ecrRepositoryName]
        })
      ),
      clients.ecs.send(
        new DescribeClustersCommand({ clusters: [context.runtime.clusterName] })
      ),
      clients.ecs.send(
        new DescribeServicesCommand({
          cluster: context.runtime.clusterName,
          services: [context.runtime.serviceName]
        })
      ),
      clients.elb.send(
        new DescribeTargetGroupsCommand({ TargetGroupArns: [context.runtime.targetGroupArn] })
      ),
      clients.s3.send(
        new GetBucketVersioningCommand({ Bucket: context.runtime.frontendBucketName })
      ),
      clients.cloudFront.send(
        new GetDistributionCommand({ Id: context.runtime.cloudFrontDistributionId })
      )
    ]);
  const repository = asArray(repositories["repositories"]).map(asRecord).find(Boolean);
  const repositoryArn = repository?.["repositoryArn"];
  const repositoryUri = repository?.["repositoryUri"];
  if (
    repositoryArn !== context.runtime.ecrRepositoryArn ||
    typeof repositoryUri !== "string" ||
    !repositoryUri
  ) {
    throw new Error("ECR repository does not match Terraform output");
  }
  const cluster = asArray(clusters["clusters"]).map(asRecord).find(Boolean);
  const clusterArn = cluster?.["clusterArn"];
  if (
    typeof clusterArn !== "string" ||
    cluster?.["clusterName"] !== context.runtime.clusterName ||
    cluster?.["status"] !== "ACTIVE"
  ) {
    throw new Error("ECS cluster does not match Terraform output");
  }
  const service = asArray(services["services"]).map(asRecord).find(Boolean);
  const serviceArn = service?.["serviceArn"];
  const currentTaskDefinitionArn = service?.["taskDefinition"];
  if (
    typeof serviceArn !== "string" ||
    typeof currentTaskDefinitionArn !== "string" ||
    service?.["serviceName"] !== context.runtime.serviceName ||
    service?.["status"] !== "ACTIVE"
  ) {
    throw new Error("ECS service does not match Terraform output");
  }
  assertRuntimeArn(clusterArn, "ecs", context);
  assertRuntimeArn(serviceArn, "ecs", context);
  const [taskDefinitionResponse, approvedTaskDefinitionResponse] = await Promise.all([
    clients.ecs.send(
      new DescribeTaskDefinitionCommand({ taskDefinition: currentTaskDefinitionArn })
    ),
    clients.ecs.send(
      new DescribeTaskDefinitionCommand({ taskDefinition: context.runtime.taskDefinitionArn })
    )
  ]);
  const currentTaskDefinition = taskDefinitionResponse["taskDefinition"] as TaskDefinition | undefined;
  const approvedTaskDefinition = approvedTaskDefinitionResponse["taskDefinition"] as
    | TaskDefinition
    | undefined;
  assertTaskDefinitionMatches(currentTaskDefinition, context);
  assertApprovedTaskDefinitionMatches(approvedTaskDefinition, context);
  assertTaskDefinitionRolesMatchApproved(currentTaskDefinition, context, "Current");
  const targetGroup = asArray(targetGroups["TargetGroups"]).map(asRecord).find(Boolean);
  if (
    targetGroup?.["TargetGroupArn"] !== context.runtime.targetGroupArn ||
    targetGroup["TargetType"] !== "ip" ||
    targetGroup["Port"] !== context.runtime.containerPort
  ) {
    throw new Error("Target Group does not match Terraform output or ECS Fargate IP mode");
  }
  if (versioning["Status"] !== "Enabled") {
    throw new Error("Frontend S3 bucket versioning must be Enabled");
  }
  const observedDistribution = asRecord(distribution["Distribution"]);
  const distributionConfig = asRecord(observedDistribution?.["DistributionConfig"]);
  const outputUrl = new URL(context.runtime.outputUrl);
  if (
    outputUrl.protocol !== "https:" ||
    outputUrl.hostname !== context.runtime.cloudFrontDomainName ||
    observedDistribution?.["DomainName"] !== context.runtime.cloudFrontDomainName ||
    observedDistribution["Status"] !== "Deployed" ||
    distributionConfig?.["Enabled"] !== true
  ) {
    throw new Error("CloudFront distribution does not match the approved HTTPS output");
  }

  let rollbackTaskDefinitionArn = currentTaskDefinitionArn;
  if (context.baseline) {
    const baselineResponse = await clients.ecs.send(
      new DescribeTaskDefinitionCommand({ taskDefinition: context.baseline.taskDefinitionArn })
    );
    const baseline = baselineResponse["taskDefinition"] as TaskDefinition | undefined;
    assertTaskDefinitionMatches(baseline, context);
    assertTaskDefinitionRolesMatchApproved(baseline, context, "Baseline");
    const image = baseline?.containerDefinitions?.find(
      (container) => container.name === context.runtime.containerName
    )?.image;
    const expectedDigest = normalizeImageDigest(context.baseline.imageDigest);
    if (!image?.endsWith(`@${expectedDigest}`)) {
      throw new Error("Baseline release image digest no longer matches AWS");
    }
    rollbackTaskDefinitionArn = context.baseline.taskDefinitionArn;
  }
  const coordinates: AwsReleaseRuntimeCoordinates = {
    accountId: context.connection.accountId,
    region: context.connection.region,
    ecrRepositoryArn: context.runtime.ecrRepositoryArn,
    ecsClusterArn: clusterArn,
    ecsServiceArn: serviceArn,
    targetGroupArn: context.runtime.targetGroupArn,
    frontendBucketName: context.runtime.frontendBucketName,
    cloudFrontDistributionId: context.runtime.cloudFrontDistributionId,
    taskRoleArn: context.runtime.taskRoleArn,
    executionRoleArn: context.runtime.executionRoleArn
  };
  return {
    repositoryUri,
    clusterArn,
    serviceArn,
    currentTaskDefinition,
    approvedTaskDefinition,
    currentTaskDefinitionArn,
    rollbackTaskDefinitionArn,
    coordinates
  };
}

function createTaskDefinitionRegistration(
  taskDefinition: TaskDefinition,
  context: TrustedReleaseContext,
  imageUri: string
): RegisterTaskDefinitionCommandInput {
  const containerDefinitions = taskDefinition.containerDefinitions?.map((container) =>
    container.name === context.runtime.containerName ? { ...container, image: imageUri } : container
  );
  if (
    !taskDefinition.family ||
    !containerDefinitions?.some((container) => container.name === context.runtime.containerName)
  ) {
    throw new Error("Current ECS Task Definition cannot be cloned safely");
  }
  return {
    family: taskDefinition.family,
    containerDefinitions: containerDefinitions as ContainerDefinition[],
    ...(taskDefinition.taskRoleArn ? { taskRoleArn: taskDefinition.taskRoleArn } : {}),
    ...(taskDefinition.executionRoleArn
      ? { executionRoleArn: taskDefinition.executionRoleArn }
      : {}),
    ...(taskDefinition.networkMode ? { networkMode: taskDefinition.networkMode } : {}),
    ...(taskDefinition.volumes ? { volumes: taskDefinition.volumes } : {}),
    ...(taskDefinition.placementConstraints
      ? { placementConstraints: taskDefinition.placementConstraints }
      : {}),
    ...(taskDefinition.requiresCompatibilities
      ? { requiresCompatibilities: taskDefinition.requiresCompatibilities }
      : {}),
    ...(taskDefinition.cpu ? { cpu: taskDefinition.cpu } : {}),
    ...(taskDefinition.memory ? { memory: taskDefinition.memory } : {}),
    ...(taskDefinition.pidMode ? { pidMode: taskDefinition.pidMode } : {}),
    ...(taskDefinition.ipcMode ? { ipcMode: taskDefinition.ipcMode } : {}),
    ...(taskDefinition.proxyConfiguration
      ? { proxyConfiguration: taskDefinition.proxyConfiguration }
      : {}),
    ...(taskDefinition.inferenceAccelerators
      ? { inferenceAccelerators: taskDefinition.inferenceAccelerators }
      : {}),
    ...(taskDefinition.ephemeralStorage
      ? { ephemeralStorage: taskDefinition.ephemeralStorage }
      : {}),
    ...(taskDefinition.runtimePlatform
      ? { runtimePlatform: taskDefinition.runtimePlatform }
      : {}),
    tags: [
      { key: "ManagedBy", value: "SketchCatch" },
      { key: "SketchCatchProject", value: context.projectId },
      { key: "SketchCatchReleaseCandidate", value: context.candidate.id }
    ]
  };
}

async function verifyEcsHealthUntilTerminal(
  context: TrustedReleaseContext,
  runtime: RuntimeObservation,
  taskDefinitionArn: string,
  clients: { ecs: AwsCommandClient; elb: AwsCommandClient },
  wait: (milliseconds: number) => Promise<void>
): Promise<JsonValue> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const snapshot = await observeEcsHealth(context, runtime, taskDefinitionArn, clients);
    try {
      return verifyEcsReleaseHealthSnapshot(snapshot, taskDefinitionArn) as unknown as JsonValue;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("ECS health verification failed");
    }
    await wait(5_000);
  }
  throw lastError ?? new Error("ECS release health timed out");
}

async function observeEcsHealth(
  context: TrustedReleaseContext,
  runtime: RuntimeObservation,
  taskDefinitionArn: string,
  clients: { ecs: AwsCommandClient; elb: AwsCommandClient }
): Promise<EcsReleaseHealthSnapshot> {
  const [services, taskArnsResponse, targetHealth] = await Promise.all([
    clients.ecs.send(
      new DescribeServicesCommand({ cluster: runtime.clusterArn, services: [runtime.serviceArn] })
    ),
    clients.ecs.send(
      new ListTasksCommand({
        cluster: runtime.clusterArn,
        serviceName: context.runtime.serviceName,
        desiredStatus: "RUNNING"
      })
    ),
    clients.elb.send(
      new DescribeTargetHealthCommand({ TargetGroupArn: context.runtime.targetGroupArn })
    )
  ]);
  const service = asArray(services["services"]).map(asRecord).find(Boolean);
  const taskArns = asArray(taskArnsResponse["taskArns"]).filter(
    (value): value is string => typeof value === "string"
  );
  const tasksResponse = taskArns.length
    ? await clients.ecs.send(
        new DescribeTasksCommand({ cluster: runtime.clusterArn, tasks: taskArns })
      )
    : { tasks: [] };
  const deployments = asArray(service?.["deployments"]).map(asRecord).filter(Boolean);
  const deployment = deployments.find(
    (candidate) => candidate?.["taskDefinition"] === taskDefinitionArn
  );
  return {
    serviceTaskDefinitionArn: String(service?.["taskDefinition"] ?? ""),
    desiredCount: Number(service?.["desiredCount"] ?? 0),
    runningCount: Number(service?.["runningCount"] ?? 0),
    pendingCount: Number(service?.["pendingCount"] ?? 0),
    rolloutState: typeof deployment?.["rolloutState"] === "string" ? deployment["rolloutState"] : null,
    tasks: asArray(tasksResponse["tasks"])
      .map(asRecord)
      .filter((task): task is Record<string, unknown> => Boolean(task))
      .map((task) => ({
        taskArn: String(task["taskArn"] ?? ""),
        taskDefinitionArn: String(task["taskDefinitionArn"] ?? ""),
        lastStatus: String(task["lastStatus"] ?? ""),
        healthStatus: typeof task["healthStatus"] === "string" ? task["healthStatus"] : null,
        privateIpv4Addresses: extractTaskPrivateIpv4Addresses(task)
      })),
    targets: asArray(targetHealth["TargetHealthDescriptions"])
      .map(asRecord)
      .filter((target): target is Record<string, unknown> => Boolean(target))
      .map((target) => {
        const id = asRecord(target["Target"]);
        const health = asRecord(target["TargetHealth"]);
        return {
          id: String(id?.["Id"] ?? ""),
          port: typeof id?.["Port"] === "number" ? id["Port"] : null,
          state: typeof health?.["State"] === "string" ? health["State"] : null,
          reason: typeof health?.["Reason"] === "string" ? health["Reason"] : null
        };
      })
  };
}

function extractTaskPrivateIpv4Addresses(task: Record<string, unknown>): string[] {
  const addresses: string[] = [];
  for (const attachment of asArray(task["attachments"]).map(asRecord).filter(Boolean)) {
    for (const detail of asArray(attachment?.["details"]).map(asRecord).filter(Boolean)) {
      if (detail?.["name"] === "privateIPv4Address" && typeof detail["value"] === "string") {
        addresses.push(detail["value"]);
      }
    }
  }
  return [...new Set(addresses)];
}

function assertTaskDefinitionMatches(
  taskDefinition: TaskDefinition | undefined,
  context: TrustedReleaseContext
): asserts taskDefinition is TaskDefinition {
  const container = taskDefinition?.containerDefinitions?.find(
    (candidate) => candidate.name === context.runtime.containerName
  );
  const hasPort = container?.portMappings?.some(
    (mapping) => mapping.containerPort === context.runtime.containerPort
  );
  if (
    !taskDefinition?.taskDefinitionArn ||
    taskDefinition.family !== context.runtime.taskDefinitionFamily ||
    !container ||
    !hasPort
  ) {
    throw new Error("ECS Task Definition does not match Terraform runtime coordinates");
  }
}

function assertApprovedTaskDefinitionMatches(
  taskDefinition: TaskDefinition | undefined,
  context: TrustedReleaseContext
): asserts taskDefinition is TaskDefinition {
  assertTaskDefinitionMatches(taskDefinition, context);
  if (taskDefinition.taskDefinitionArn !== context.runtime.taskDefinitionArn) {
    throw new Error("Approved ECS Task Definition ARN does not match Terraform output");
  }
  assertTaskDefinitionRolesMatchApproved(taskDefinition, context, "Approved");
}

function assertTaskDefinitionRolesMatchApproved(
  taskDefinition: TaskDefinition,
  context: TrustedReleaseContext,
  label: string
): void {
  if (
    taskDefinition.taskRoleArn !== context.runtime.taskRoleArn ||
    taskDefinition.executionRoleArn !== context.runtime.executionRoleArn
  ) {
    throw new Error(`${label} ECS Task Definition roles differ from Terraform output`);
  }
}

function predictRuntimeCoordinates(context: TrustedReleaseContext): AwsReleaseRuntimeCoordinates {
  const prefix = `arn:aws:ecs:${context.connection.region}:${context.connection.accountId}`;
  return {
    accountId: context.connection.accountId,
    region: context.connection.region,
    ecrRepositoryArn: context.runtime.ecrRepositoryArn,
    ecsClusterArn: `${prefix}:cluster/${context.runtime.clusterName}`,
    ecsServiceArn: `${prefix}:service/${context.runtime.clusterName}/${context.runtime.serviceName}`,
    targetGroupArn: context.runtime.targetGroupArn,
    frontendBucketName: context.runtime.frontendBucketName,
    cloudFrontDistributionId: context.runtime.cloudFrontDistributionId,
    taskRoleArn: context.runtime.taskRoleArn,
    executionRoleArn: context.runtime.executionRoleArn
  };
}

function toArtifactReference(context: TrustedReleaseContext) {
  return {
    projectId: context.projectId,
    candidateId: context.candidate.id,
    commitSha: context.candidate.commitSha,
    configFingerprint: context.candidate.configFingerprint,
    compositeDigest: context.candidate.compositeDigest,
    apiOciDigest: context.candidate.apiOciDigest,
    apiArchiveDigest: context.candidate.apiArchiveDigest,
    apiArchiveByteSize: context.candidate.apiArchiveByteSize,
    frontendArchiveDigest: context.candidate.frontendArchiveDigest,
    frontendArchiveByteSize: context.candidate.frontendArchiveByteSize,
    frontendManifestDigest: context.candidate.frontendManifestDigest,
    frontendIndexDigest: context.candidate.frontendIndexDigest,
    apiArchiveObjectKey: context.candidate.apiArchiveObjectKey,
    apiArchiveObjectVersionId: context.candidate.apiArchiveObjectVersionId,
    frontendArchiveObjectKey: context.candidate.frontendArchiveObjectKey,
    frontendArchiveObjectVersionId: context.candidate.frontendArchiveObjectVersionId,
    frontendManifestObjectKey: context.candidate.frontendManifestObjectKey,
    frontendManifestObjectVersionId: context.candidate.frontendManifestObjectVersionId,
    manifestObjectKey: context.candidate.manifestObjectKey,
    manifestObjectVersionId: context.candidate.manifestObjectVersionId
  };
}

async function assumeReleaseRole(
  sts: AwsConnectionStsGateway,
  context: TrustedReleaseContext,
  roleSessionName: string,
  policy: string
): Promise<AwsTemporaryCredentials> {
  return sts.assumeRole({
    roleArn: context.connection.roleArn,
    externalId: context.connection.externalId,
    region: context.connection.region,
    roleSessionName,
    policy,
    durationSeconds: 3_600
  });
}

function createClientFactories(overrides: Partial<ClientFactories> = {}): ClientFactories {
  return {
    ecr:
      overrides.ecr ??
      ((configuration) => new ECRClient(configuration) as unknown as AwsCommandClient),
    ecs:
      overrides.ecs ??
      ((configuration) => new ECSClient(configuration) as unknown as AwsCommandClient),
    elb:
      overrides.elb ??
      ((configuration) =>
        new ElasticLoadBalancingV2Client(configuration) as unknown as AwsCommandClient),
    s3:
      overrides.s3 ??
      ((configuration) => new S3Client(configuration) as unknown as AwsCommandClient),
    cloudFront:
      overrides.cloudFront ??
      ((configuration) => new CloudFrontClient(configuration) as unknown as AwsCommandClient)
  };
}

function createReleaseClients(
  factories: ClientFactories,
  region: string,
  credentials: AwsTemporaryCredentials
) {
  const configuration = { region, credentials };
  const clients = {
    ecr: factories.ecr(configuration),
    ecs: factories.ecs(configuration),
    elb: factories.elb(configuration),
    s3: factories.s3(configuration),
    cloudFront: factories.cloudFront(configuration)
  };
  return {
    ...clients,
    destroy() {
      clients.ecr.destroy();
      clients.ecs.destroy();
      clients.elb.destroy();
      clients.s3.destroy();
      clients.cloudFront.destroy();
    }
  };
}

async function createSplitDeployReleaseClients(
  factories: ClientFactories,
  sts: AwsConnectionStsGateway,
  context: TrustedReleaseContext,
  coordinates: AwsReleaseRuntimeCoordinates
): Promise<ReturnType<typeof createReleaseClients>> {
  const [ecsCredentials, frontendCredentials] = await Promise.all([
    assumeReleaseRole(
      sts,
      context,
      `sc-release-ecs-${context.releaseId.slice(0, 32)}`,
      createEcsDeployReleaseSessionPolicy(coordinates)
    ),
    assumeReleaseRole(
      sts,
      context,
      `sc-release-web-${context.releaseId.slice(0, 32)}`,
      createFrontendDeployReleaseSessionPolicy(coordinates)
    )
  ]);
  const ecsConfiguration = { region: context.connection.region, credentials: ecsCredentials };
  const frontendConfiguration = {
    region: context.connection.region,
    credentials: frontendCredentials
  };
  const clients = {
    ecr: factories.ecr(ecsConfiguration),
    ecs: factories.ecs(ecsConfiguration),
    elb: factories.elb(ecsConfiguration),
    s3: factories.s3(frontendConfiguration),
    cloudFront: factories.cloudFront(frontendConfiguration)
  };
  return {
    ...clients,
    destroy() {
      clients.ecr.destroy();
      clients.ecs.destroy();
      clients.elb.destroy();
      clients.s3.destroy();
      clients.cloudFront.destroy();
    }
  };
}

function assertRuntimeArn(
  arn: string,
  service: "ecr" | "ecs" | "elasticloadbalancing",
  context: TrustedReleaseContext
): void {
  const prefix = `arn:aws:${service}:${context.connection.region}:${context.connection.accountId}:`;
  if (!arn.startsWith(prefix)) {
    throw new Error(`${service} runtime ARN does not match the connected AWS account and region`);
  }
}

function assertRuntimeIamRoleArn(arn: string, context: TrustedReleaseContext): void {
  const prefix = `arn:aws:iam::${context.connection.accountId}:role/`;
  if (!arn.startsWith(prefix)) {
    throw new Error("IAM runtime ARN does not match the connected AWS account");
  }
}

function normalizeImageDigest(value: string): string {
  const digest = value.startsWith("sha256:") ? value : `sha256:${value}`;
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) throw new Error("Baseline image digest is invalid");
  return digest;
}

function requireState<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function defaultWait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
