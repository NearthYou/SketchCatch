import assert from "node:assert/strict";
import test from "node:test";
import { createAwsEcsFargateReleaseGateway } from "./aws-ecs-fargate-release-gateway.js";
import type { LoadedReleaseCandidateArtifacts } from "./release-candidate-artifact-loader.js";
import type { TrustedReleaseContext } from "./trusted-release-worker-service.js";

test("runtime verification uses read-only then exact-resource deploy STS sessions", async () => {
  const context = createContext();
  const policies: string[] = [];
  const clients = createRuntimeClients(context);
  const loaded = createLoadedArtifacts();
  const gateway = createAwsEcsFargateReleaseGateway({
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    stsGateway: {
      async assumeRole(input) {
        policies.push(input.policy ?? "");
        return { accessKeyId: "key", secretAccessKey: "secret", sessionToken: "token" };
      },
      async getCallerIdentity() {
        return { accountId: context.connection.accountId, callerArn: "arn:caller" };
      }
    },
    clients,
    topologyVerifier: createTopologyVerifier(context),
    loadArtifacts: async () => loaded
  });

  await gateway.verifyCandidate(context);
  assert.equal(policies.length, 3);
  assert.doesNotMatch(policies[0] ?? "", /UpdateService|PutImage|PutObject/u);
  assert.match(policies[1] ?? "", new RegExp(context.runtime.ecrRepositoryArn, "u"));
  assert.match(policies[1] ?? "", /ecs-tasks\.amazonaws\.com/u);
  assert.doesNotMatch(policies[1] ?? "", /PutObject|CreateInvalidation/u);
  assert.match(policies[2] ?? "", new RegExp(context.runtime.frontendBucketName, "u"));
  assert.match(policies[2] ?? "", new RegExp(context.runtime.cloudFrontDistributionId, "u"));
  assert.doesNotMatch(policies[2] ?? "", /PutImage|UpdateService|PassRole/u);
  await gateway.cleanup?.();
  assert.equal(loaded.cleaned, true);
});

test("runtime verification rejects a CloudFront domain different from Terraform output", async () => {
  const context = createContext();
  const clients = createRuntimeClients(context, { cloudFrontDomain: "other.cloudfront.net" });
  const gateway = createAwsEcsFargateReleaseGateway({
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    stsGateway: {
      async assumeRole() {
        return { accessKeyId: "key", secretAccessKey: "secret", sessionToken: "token" };
      },
      async getCallerIdentity() {
        return { accountId: context.connection.accountId, callerArn: "arn:caller" };
      }
    },
    clients,
    topologyVerifier: createTopologyVerifier(context),
    loadArtifacts: async () => createLoadedArtifacts()
  });
  await assert.rejects(gateway.verifyCandidate(context), /CloudFront distribution does not match/u);
  await gateway.cleanup?.();
});

test("release and frontend retry reject topology drift before opening AWS sessions", async () => {
  const context = createContext();
  let assumeRoleCalls = 0;
  const createGateway = () =>
    createAwsEcsFargateReleaseGateway({
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      stsGateway: {
        async assumeRole() {
          assumeRoleCalls += 1;
          return { accessKeyId: "key", secretAccessKey: "secret", sessionToken: "token" };
        },
        async getCallerIdentity() {
          return { accountId: context.connection.accountId, callerArn: "arn:caller" };
        }
      },
      clients: createRuntimeClients(context),
      topologyVerifier: {
        async verify() {
          throw new Error("CloudFront topology drift detected");
        }
      },
      loadArtifacts: async () => createLoadedArtifacts(),
      loadFrontendArtifacts: async () => createLoadedArtifacts()
    });

  await assert.rejects(
    createGateway().verifyCandidate(context),
    /CloudFront topology drift detected/u
  );
  await assert.rejects(
    createGateway().verifyFrontendCandidate!(context),
    /CloudFront topology drift detected/u
  );
  assert.equal(assumeRoleCalls, 0);
});

test("runtime verification rejects task-role drift from the approved Terraform revision", async () => {
  const context = createContext();
  const gateway = createAwsEcsFargateReleaseGateway({
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    stsGateway: createStsGateway(context),
    clients: createRuntimeClients(context, {
      currentTaskDefinitionArn:
        "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo-task:2",
      currentTaskRoleArn: "arn:aws:iam::123456789012:role/unapproved-task-role"
    }),
    topologyVerifier: createTopologyVerifier(context),
    loadArtifacts: async () => createLoadedArtifacts()
  });

  await assert.rejects(
    gateway.verifyCandidate(context),
    /Current ECS Task Definition roles differ from Terraform output/u
  );
});

test("ECS activation clones the approved Terraform task definition, not mutable service drift", async () => {
  const context = createContext();
  let registeredEnvironment: unknown;
  const gateway = createAwsEcsFargateReleaseGateway({
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    stsGateway: createStsGateway(context),
    clients: createRuntimeClients(context, {
      currentTaskDefinitionArn:
        "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo-task:2",
      currentContainerEnvironment: [{ name: "SOURCE", value: "service-drift" }],
      approvedContainerEnvironment: [{ name: "SOURCE", value: "terraform-approved" }],
      approvedContainerSecrets: [{
        name: "CHECK_IN_SIGNING_SECRET",
        valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:check-in"
      }],
      onRegister(input) {
        registeredEnvironment = input["containerDefinitions"];
      }
    }),
    topologyVerifier: createTopologyVerifier(context),
    loadArtifacts: async () => createLoadedArtifacts()
  });

  await gateway.verifyCandidate(context);
  await gateway.activateEcs({
    context,
    imageDigest: `sha256:${"c".repeat(64)}`,
    imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/demo-api@sha256:${"c".repeat(64)}`,
    beforeMutation: async () => undefined
  });

  assert.match(JSON.stringify(registeredEnvironment), /terraform-approved/u);
  assert.match(JSON.stringify(registeredEnvironment), /CHECK_IN_SIGNING_SECRET/u);
  assert.match(JSON.stringify(registeredEnvironment), /arn:aws:secretsmanager/u);
  assert.doesNotMatch(JSON.stringify(registeredEnvironment), /service-drift/u);
  assert.doesNotMatch(JSON.stringify(registeredEnvironment), /bootstrap-command/u);
});

test("ECR publishes with the approved OCI digest tag instead of the commit SHA", async () => {
  const context = createContext();
  let imageTag: string | undefined;
  const gateway = createAwsEcsFargateReleaseGateway({
    now: () => new Date("2026-07-15T12:00:00.000Z"),
    stsGateway: createStsGateway(context),
    clients: createRuntimeClients(context, {
      onEcrCommand(name, input) {
        if (name === "BatchGetImageCommand") {
          const imageId = (input["imageIds"] as Array<Record<string, unknown>> | undefined)?.[0];
          if (typeof imageId?.["imageTag"] === "string") {
            imageTag = imageId["imageTag"];
            return { failures: [] };
          }
          if (typeof imageId?.["imageDigest"] === "string") {
            return { images: [{ imageId: { imageDigest: imageId["imageDigest"] } }] };
          }
          return { failures: [] };
        }
        if (name === "PutImageCommand") {
          return {
            image: { imageId: { imageDigest: `sha256:${context.candidate.apiOciDigest}` } }
          };
        }
        return undefined;
      }
    }),
    topologyVerifier: createTopologyVerifier(context),
    loadArtifacts: async () => createLoadedArtifacts()
  });

  await gateway.verifyCandidate(context);
  await gateway.publishApi(context, { beforeMutation: async () => undefined });

  assert.equal(imageTag, context.candidate.apiOciDigest);
});

function createRuntimeClients(
  context: TrustedReleaseContext,
  overrides: {
    cloudFrontDomain?: string;
    currentTaskDefinitionArn?: string;
    currentTaskRoleArn?: string;
    currentContainerEnvironment?: Array<{ name: string; value: string }>;
    approvedContainerEnvironment?: Array<{ name: string; value: string }>;
    approvedContainerSecrets?: Array<{ name: string; valueFrom: string }>;
    onRegister?: (input: Record<string, unknown>) => void;
    onEcrCommand?: (
      name: string,
      input: Record<string, unknown>
    ) => Record<string, unknown> | undefined;
  } = {}
) {
  const approvedTaskDefinition = {
    taskDefinitionArn: context.runtime.taskDefinitionArn,
    family: "demo-task",
    taskRoleArn: context.runtime.taskRoleArn,
    executionRoleArn: context.runtime.executionRoleArn,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "256",
    memory: "512",
    containerDefinitions: [
      {
        name: "api",
        image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/demo-api@sha256:" +
          "9".repeat(64),
        portMappings: [{ containerPort: 3000, protocol: "tcp" }],
        entryPoint: ["/bin/sh", "-c"],
        command: ["bootstrap-command"],
        environment: overrides.approvedContainerEnvironment,
        secrets: overrides.approvedContainerSecrets
      }
    ]
  };
  const currentTaskDefinition = {
    ...approvedTaskDefinition,
    taskDefinitionArn: overrides.currentTaskDefinitionArn ?? approvedTaskDefinition.taskDefinitionArn,
    taskRoleArn: overrides.currentTaskRoleArn ?? approvedTaskDefinition.taskRoleArn,
    containerDefinitions: approvedTaskDefinition.containerDefinitions.map((container) => ({
      ...container,
      environment: overrides.currentContainerEnvironment ?? container.environment
    }))
  };
  const create = (service: string) => () => ({
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      if (service === "ecr") {
        const response = overrides.onEcrCommand?.(command.constructor.name, command.input);
        if (response !== undefined) return response;
      }
      switch (`${service}:${command.constructor.name}`) {
        case "ecr:DescribeRepositoriesCommand":
          return {
            repositories: [
              {
                repositoryName: "demo-api",
                repositoryArn: context.runtime.ecrRepositoryArn,
                repositoryUri:
                  "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/demo-api"
              }
            ]
          };
        case "ecs:DescribeClustersCommand":
          return {
            clusters: [
              {
                clusterName: "demo",
                clusterArn: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/demo",
                status: "ACTIVE"
              }
            ]
          };
        case "ecs:DescribeServicesCommand":
          return {
            services: [
              {
                serviceName: "demo-api",
                serviceArn:
                  "arn:aws:ecs:ap-northeast-2:123456789012:service/demo/demo-api",
                status: "ACTIVE",
                taskDefinition: currentTaskDefinition.taskDefinitionArn
              }
            ]
          };
        case "ecs:DescribeTaskDefinitionCommand":
          return {
            taskDefinition:
              command.input["taskDefinition"] === context.runtime.taskDefinitionArn
                ? approvedTaskDefinition
                : currentTaskDefinition
          };
        case "ecs:RegisterTaskDefinitionCommand":
          overrides.onRegister?.(command.input);
          return {
            taskDefinition: {
              taskDefinitionArn:
                "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo-task:3"
            }
          };
        case "ecs:UpdateServiceCommand":
          return {};
        case "elb:DescribeTargetGroupsCommand":
          return {
            TargetGroups: [
              {
                TargetGroupArn: context.runtime.targetGroupArn,
                TargetType: "ip",
                Port: 3000
              }
            ]
          };
        case "s3:GetBucketVersioningCommand":
          return { Status: "Enabled" };
        case "cloudFront:GetDistributionCommand":
          return {
            Distribution: {
              DomainName: overrides.cloudFrontDomain ?? context.runtime.cloudFrontDomainName,
              Status: "Deployed",
              DistributionConfig: { Enabled: true }
            }
          };
        default:
          return {};
      }
    },
    destroy() {}
  });
  return {
    ecr: create("ecr"),
    ecs: create("ecs"),
    elb: create("elb"),
    s3: create("s3"),
    cloudFront: create("cloudFront")
  };
}

function createStsGateway(context: TrustedReleaseContext) {
  return {
    async assumeRole() {
      return { accessKeyId: "key", secretAccessKey: "secret", sessionToken: "token" };
    },
    async getCallerIdentity() {
      return { accountId: context.connection.accountId, callerArn: "arn:caller" };
    }
  };
}

function createLoadedArtifacts(): LoadedReleaseCandidateArtifacts & { cleaned: boolean } {
  const value = {
    rootDirectory: "/tmp/release",
    oci: {
      manifest: "{}",
      manifestDigest: `sha256:${"c".repeat(64)}`,
      manifestMediaType: "application/vnd.oci.image.manifest.v1+json" as const,
      blobs: []
    },
    frontendDirectory: "/tmp/release/frontend",
    frontendManifest: {
      schemaVersion: 1 as const,
      commitSha: "a".repeat(40),
      candidateId: "candidate-1",
      marker: `${"a".repeat(40)}:candidate-1`,
      index: { path: "index.html" as const, sha256: "4".repeat(64) },
      files: [
        {
          path: "index.html",
          sha256: "4".repeat(64),
          size: 1,
          contentType: "text/html"
        }
      ]
    },
    cleaned: false,
    async cleanup() {
      value.cleaned = true;
    }
  };
  return value;
}

function createContext(): TrustedReleaseContext {
  return {
    projectId: "12345678-1234-1234-1234-1234567890ab",
    deploymentId: "87654321-1234-1234-1234-1234567890ab",
    releaseId: "release-1",
    source: "direct",
    fencingHolderId: "release-1",
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
      externalId: "external-id",
      region: "ap-northeast-2"
    },
    candidate: {
      id: "candidate-1",
      commitSha: "a".repeat(40),
      compositeDigest: "b".repeat(64),
      configFingerprint: "1".repeat(64),
      apiOciDigest: "c".repeat(64),
      apiArchiveDigest: "2".repeat(64),
      apiArchiveByteSize: 100,
      frontendArchiveDigest: "3".repeat(64),
      frontendArchiveByteSize: 200,
      frontendManifestDigest: "d".repeat(64),
      frontendIndexDigest: "4".repeat(64),
      apiArchiveObjectKey:
        "deployments/deployment/release-candidates/candidate/api-image.oci.tar",
      apiArchiveObjectVersionId: "api-v1",
      frontendArchiveObjectKey:
        "deployments/deployment/release-candidates/candidate/frontend.tar.zst",
      frontendArchiveObjectVersionId: "frontend-v1",
      frontendManifestObjectKey:
        "deployments/deployment/release-candidates/candidate/frontend-manifest.json",
      frontendManifestObjectVersionId: "manifest-v1",
      manifestObjectKey:
        "deployments/deployment/release-candidates/candidate/candidate-manifest.json",
      manifestObjectVersionId: "candidate-v1",
      expiresAt: "2026-07-16T12:00:00.000Z"
    },
    baseline: null,
    runtime: {
      clusterName: "demo",
      serviceName: "demo-api",
      containerName: "api",
      containerPort: 3000,
      taskDefinitionFamily: "demo-task",
      taskDefinitionArn:
        "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo-task:1",
      taskRoleArn: "arn:aws:iam::123456789012:role/demo-task",
      executionRoleArn: "arn:aws:iam::123456789012:role/demo-execution",
      targetGroupArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/abc",
      loadBalancerArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/abc",
      loadBalancerDnsName: "demo-alb.ap-northeast-2.elb.amazonaws.com",
      ecrRepositoryName: "demo-api",
      ecrRepositoryArn:
        "arn:aws:ecr:ap-northeast-2:123456789012:repository/demo-api",
      frontendBucketName: "demo-web",
      cloudFrontDistributionId: "E123456",
      cloudFrontDomainName: "demo.cloudfront.net",
      outputUrl: "https://demo.cloudfront.net",
      healthCheckPath: "/health",
      apiProbePath: "/api/check-ins",
      runtimeEntrypoint: null
    }
  };
}

function createTopologyVerifier(context: TrustedReleaseContext) {
  return {
    async verify(input: { expected: { cloudFrontDistributionId: string } }) {
      assert.equal(
        input.expected.cloudFrontDistributionId,
        context.runtime.cloudFrontDistributionId
      );
      return {
        accountId: context.connection.accountId,
        region: context.connection.region,
        cloudFrontDistributionId: context.runtime.cloudFrontDistributionId,
        cloudFrontDomainName: context.runtime.cloudFrontDomainName,
        frontendBucketName: context.runtime.frontendBucketName,
        loadBalancerArn: context.runtime.loadBalancerArn,
        loadBalancerDnsName: context.runtime.loadBalancerDnsName,
        targetGroupArn: context.runtime.targetGroupArn,
        clusterName: context.runtime.clusterName,
        serviceName: context.runtime.serviceName,
        defaultOriginId: "frontend",
        originAccessControlId: "oac-1",
        apiOriginId: "api",
        apiPathPattern: "/api/*" as const,
        healthPathPattern: "/health" as const,
        frontendBucketPublicAccessBlocked: true as const,
        bucketPolicyAllowsCloudFrontRead: true as const,
        topologyVerifiedAt: "2026-07-15T12:00:00.000Z"
      };
    }
  };
}
