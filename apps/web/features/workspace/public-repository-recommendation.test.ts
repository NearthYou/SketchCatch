import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceRepositoryAnalysisResult } from "@sketchcatch/types";
import {
  createPublicRepositoryDiagram,
  createPublicRepositoryRecommendation,
  getPublicRepositoryDeploymentDefault,
  getPublicRepositoryTemplateDeploymentType,
  shouldAskPublicRepositoryDeploymentType
} from "./public-repository-recommendation";

test("public repository recommendation returns multiple candidates and follow-up questions", () => {
  const analysis = createAnalysis();
  const deploymentType = getPublicRepositoryDeploymentDefault(analysis);
  const recommendation = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType,
    selectedTemplateId: "ecs-fargate-container-app"
  });

  assert.equal(deploymentType, "container");
  assert.equal(shouldAskPublicRepositoryDeploymentType(analysis), false);
  assert.ok(recommendation.candidates.length >= 3);
  assert.equal(recommendation.candidates[0]?.templateId, "ecs-fargate-container-app");
  assert.deepEqual(
    recommendation.questions.map((question) => question.id),
    ["include_frontend", "include_database"]
  );
});

test("follow-up questions change with the selected template", () => {
  const analysis = createAnalysis();
  const serverless = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType: "serverless",
    selectedTemplateId: "full-serverless-web-app"
  });
  const staticSite = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType: "serverless",
    selectedTemplateId: "static-web-hosting"
  });

  assert.deepEqual(
    serverless.questions.map((question) => question.id),
    ["primary_runtime", "include_database"]
  );
  assert.deepEqual(staticSite.questions, []);
  assert.ok(serverless.questions.length <= 5);
});

test("repository recommendation keeps comparison candidates when analysis signals are sparse", () => {
  const analysis: SourceRepositoryAnalysisResult = {
    ...createAnalysis(),
    detectedSignals: ["Container"]
  };
  const recommendation = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType: "container"
  });

  assert.equal(recommendation.candidates.length, 4);
  assert.equal(recommendation.candidates[0]?.templateId, "ecs-fargate-container-app");
  assert.deepEqual(
    new Set(recommendation.candidates.map((candidate) => candidate.templateId)),
    new Set([
      "ecs-fargate-container-app",
      "eks-container-app",
      "three-tier-web-app",
      "full-serverless-web-app"
    ])
  );
});

test("deployment type is only requested when repository evidence cannot determine it", () => {
  const ambiguousAnalysis: SourceRepositoryAnalysisResult = {
    ...createAnalysis(),
    detectedSignals: ["Node API", "Database"]
  };

  assert.equal(shouldAskPublicRepositoryDeploymentType(ambiguousAnalysis), true);
  assert.equal(getPublicRepositoryTemplateDeploymentType("ecs-fargate-container-app"), "container");
  assert.equal(getPublicRepositoryTemplateDeploymentType("full-serverless-web-app"), "serverless");
  assert.equal(getPublicRepositoryTemplateDeploymentType("three-tier-web-app"), "ec2_vm");
});

test("public repository diagram enriches the selected template with repository signals", () => {
  const diagram = createPublicRepositoryDiagram({
    analysis: createAnalysis(),
    answers: {
      container_runtime: "ecs",
      include_database: true,
      include_frontend: true,
      primary_runtime: "both",
      traffic_profile: "scale"
    },
    deploymentType: "container",
    projectName: "Jungle AI Board",
    templateId: "ecs-fargate-container-app",
    usesCiCd: true
  });

  const nodeTypes = new Set(diagram.nodes.map((node) => node.type));
  assert.equal(nodeTypes.has("aws_ecs_service"), true);
  assert.equal(nodeTypes.has("aws_db_instance"), true);
  assert.equal(nodeTypes.has("aws_cloudfront_distribution"), true);
  assert.equal(nodeTypes.has("aws_codepipeline"), true);
  assert.ok(diagram.edges.length >= 5);
  assert.ok(diagram.nodes.every((node) => node.label && !/^PUBLIC SUB/i.test(node.label)));
  assert.ok(diagram.nodes.some((node) => node.label === "애플리케이션 로드 밸런서"));
  assert.ok(diagram.nodes.some((node) => node.label === "CI/CD 파이프라인"));
});

function createAnalysis(): SourceRepositoryAnalysisResult {
  return {
    defaultBranch: "main",
    detectedSignals: ["React", "Node API", "Python API", "Database", "Container"],
    evidenceFiles: [],
    recommendationReason: "React, Node API, Python API, Database, Container 신호가 있습니다.",
    recommendedTemplateId: "template-api-db",
    repositoryUrl: "https://github.com/example/fullstack"
  };
}
