import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLegacyRuntimeDeploymentTarget } from "@sketchcatch/types";

import {
  assertGitOpsTarget,
  GitCicdHandoffProviderConflictError,
  resolveGitOpsHandoffRuntimeTargetIdentity,
  type GitCicdHandoffDeploymentTargetRecord,
  type GitCicdHandoffSourceRepositoryRecord
} from "./git-cicd-handoff-service.js";

test("GitOps handoff reports a stable code when the deployment target is missing", () => {
  assert.throws(
    () =>
      assertGitOpsTarget(
        undefined,
        {} as GitCicdHandoffSourceRepositoryRecord,
        { mode: "repository_root", path: "." }
      ),
    (error: unknown) =>
      error instanceof GitCicdHandoffProviderConflictError &&
      error.code === "PROJECT_DEPLOYMENT_TARGET_REQUIRED"
  );
});

test("ECS GitOps handoff reports the required output URL for a null runtime config", () => {
  const target = {
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {},
    runtimeConfig: null,
    awsRoleArn: "arn:aws:iam::123456789012:role/SketchCatch"
  } as unknown as GitCicdHandoffDeploymentTargetRecord;

  assert.throws(
    () => assertGitOpsTarget(
      target,
      {} as GitCicdHandoffSourceRepositoryRecord,
      { mode: "repository_root", path: "." }
    ),
    (error: unknown) =>
      error instanceof GitCicdHandoffProviderConflictError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_REQUIRED"
  );
});

test("ECS GitOps handoff accepts current Docker evidence from the linked repository analysis record", () => {
  const commitSha = "a".repeat(40);
  const target = {
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      buildPreset: "docker_build",
      sourceRoot: ".",
      dockerfilePath: "apps/api/Dockerfile",
      confirmedCommitSha: commitSha
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      outputUrl: "https://app.example.com"
    },
    awsRoleArn: "arn:aws:iam::123456789012:role/SketchCatch"
  } as unknown as GitCicdHandoffDeploymentTargetRecord;
  const sourceRepository = {
    analysisRevision: null,
    analysisResult: null,
    repositoryAnalysisRevision: commitSha,
    repositoryAnalysisResult: {
      repositoryUrl: "https://github.com/sketchcatch/app",
      repositoryRevision: commitSha,
      defaultBranch: "main",
      availableBranches: ["main"],
      evidenceFiles: [],
      detectedSignals: [],
      recommendedTemplateId: null,
      recommendationReason: "",
      aiHandoff: {
        status: "template_selection_failed",
        templateId: null,
        mismatchReasons: [],
        applicationUnits: [],
        evidence: [{ kind: "dockerfile", path: "apps/api/Dockerfile" }],
        missingEvidence: []
      }
    }
  } as unknown as GitCicdHandoffSourceRepositoryRecord;

  assert.doesNotThrow(() =>
    assertGitOpsTarget(
      target,
      sourceRepository,
      { mode: "repository_root", path: "." }
    )
  );
});

test("GitOps handoff rejects divergent canonical and legacy runtime targets", () => {
  const runtimeConfig = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "app-build",
    ecrRepositoryName: "app",
    clusterName: "cluster",
    serviceName: "service",
    containerName: "web",
    outputUrl: "https://app.example.com"
  };
  const canonical = normalizeLegacyRuntimeDeploymentTarget(runtimeConfig, {
    healthCheckPath: "/health"
  });
  if (canonical.adapterKind !== "ecs_service_fargate") {
    throw new Error("expected ECS Fargate target");
  }
  const target = {
    awsAccountId: "123456789012",
    region: "ap-northeast-2",
    runtimeConfig,
    runtimeTarget: {
      ...canonical,
      orchestrator: { ...canonical.orchestrator, serviceName: "other-service" }
    },
    deploymentTargetFingerprint: null,
    confirmedBuildConfig: { healthCheckPath: "/health" }
  } as unknown as GitCicdHandoffDeploymentTargetRecord & {
    confirmedBuildConfig: NonNullable<GitCicdHandoffDeploymentTargetRecord["confirmedBuildConfig"]>;
    runtimeConfig: NonNullable<GitCicdHandoffDeploymentTargetRecord["runtimeConfig"]>;
  };

  assert.throws(
    () => resolveGitOpsHandoffRuntimeTargetIdentity("project-1", target),
    GitCicdHandoffProviderConflictError
  );
});
