import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  type ECSClient
} from "@aws-sdk/client-ecs";
import { createDeploymentTargetIdentity } from "../runtime-convergence/deployment-target-identity.js";
import {
  inspectEcsDirectRuntime
} from "./aws-codebuild-direct-application-release-gateway.js";
import type { DirectApplicationReleaseContext } from "./direct-application-release-service.js";

const artifactFingerprint = "a".repeat(64);
const digest = "b".repeat(64);

test("Direct ECS inspector derives no-op state only from read-only provider evidence", async () => {
  const context = createContext();
  const target = {
    adapterKind: "ecs_service_fargate" as const,
    orchestrator: { kind: "ecs_service" as const, clusterName: "cluster", serviceName: "service" },
    compute: { kind: "container" as const, containerName: "web" },
    capacity: { kind: "fargate" as const, platformVersion: "1.4.0" },
    rollout: {
      kind: "ecs_rolling" as const,
      minimumHealthyPercent: 0,
      maximumPercent: 100,
      circuitBreakerRollback: true
    },
    health: { kind: "https" as const, outputUrl: "https://app.example.com", path: "/health" }
  };
  const targetFingerprint = createDeploymentTargetIdentity({
    contractVersion: "runtime-convergence/v1",
    scope: {
      projectId: context.deployment.projectId,
      provider: "aws",
      accountId: context.connection.accountId,
      region: context.connection.region
    },
    target
  }).deploymentTargetFingerprint;
  let calls = 0;
  let observedPlatformVersion = "1.4.0";
  let serviceStatus = "ACTIVE";
  let deploymentConfiguration: {
    minimumHealthyPercent: number;
    maximumPercent: number;
    deploymentCircuitBreaker: { enable: boolean; rollback: boolean };
  } | undefined = {
    minimumHealthyPercent: 0,
    maximumPercent: 100,
    deploymentCircuitBreaker: { enable: true, rollback: true }
  };
  const client = {
    async send(command: unknown) {
      calls += 1;
      if (command instanceof DescribeServicesCommand) {
        return {
          services: [{
            status: serviceStatus,
            taskDefinition: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/app:2",
            desiredCount: 1,
            runningCount: 1,
            pendingCount: 0,
            launchType: "FARGATE",
            deployments: [{ platformVersion: observedPlatformVersion }],
            deploymentConfiguration
          }],
          failures: []
        };
      }
      if (command instanceof DescribeTaskDefinitionCommand) {
        return {
          taskDefinition: {
            containerDefinitions: [{
              name: "web",
              image: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/app@sha256:${digest}`
            }]
          },
          tags: [{
            key: "sketchcatch:runtime-convergence",
            value: `sketchcatch:artifact=${artifactFingerprint};target=${targetFingerprint}`
          }]
        };
      }
      throw new Error("unexpected command");
    },
    destroy() {}
  };

  const state = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });

  assert.equal(calls, 2);
  assert.equal(state.deploymentTargetFingerprint, targetFingerprint);
  assert.equal(state.artifact.artifactFingerprint, artifactFingerprint);
  assert.equal(state.artifact.digest, digest);
  assert.equal(state.health.status, "healthy");

  observedPlatformVersion = "1.3.0";
  const drifted = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });
  assert.equal(drifted.health.status, "unhealthy");

  observedPlatformVersion = "1.4.0";
  serviceStatus = "DRAINING";
  const draining = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });
  assert.equal(draining.health.status, "unhealthy");

  serviceStatus = "ACTIVE";
  deploymentConfiguration = undefined;
  const missingDeploymentConfiguration = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });
  assert.equal(missingDeploymentConfiguration.health.status, "unhealthy");
});

function createContext(): DirectApplicationReleaseContext {
  return {
    sourceRepository: {
      id: "repository-1",
      provider: "github",
      installationId: "installation-1",
      owner: "NearthYou",
      name: "SketchCatch"
    },
    deployment: {
      id: "deployment-1",
      projectId: "project-1",
      scope: "application",
      source: "direct",
      targetKind: "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: {
        sourceRoot: ".",
        evidence: [],
        installPreset: "none",
        buildPreset: "docker_build",
        artifactOutputPath: null,
        runtimeEntrypoint: null,
        healthCheckPath: "/health",
        dockerfilePath: "Dockerfile",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: "c".repeat(40),
        confirmedAt: "2026-07-16T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "app-build",
        ecrRepositoryName: "app",
        clusterName: "cluster",
        serviceName: "service",
        containerName: "web",
        outputUrl: "https://app.example.com"
      },
      runtimeTarget: null,
      deploymentTargetFingerprint: null
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  };
}
