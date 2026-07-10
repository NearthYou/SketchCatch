import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatSyncCommand, ChatSyncCommandInput } from "@aws-sdk/client-qbusiness";
import {
  createAmazonQArchitectureDraftProvider,
  createArchitecturePatternAttributeFilter,
  resolveArchitecturePatternIds
} from "./aiArchitectureQBusiness.js";
import {
  createAmazonQArchitectureDraftResponse,
  createDeterministicArchitectureIntentPlan
} from "./aiArchitectureDrafts.js";

test("OpenAI-normalized pattern ids become an Amazon Q attribute filter", () => {
  assert.deepEqual(
    createArchitecturePatternAttributeFilter({
      patternIds: ["alb-asg-ec2", "github-cicd-codedeploy"]
    }),
    {
      orAllFilters: [
        {
          equalsTo: {
            name: "pattern_id",
            value: { stringValue: "alb-asg-ec2" }
          }
        },
        {
          equalsTo: {
            name: "pattern_id",
            value: { stringValue: "github-cicd-codedeploy" }
          }
        }
      ]
    }
  );
});

test("pattern selection covers compute, serverless, SPA, ECS, CI/CD, and database requests", () => {
  const cases = [
    [{ requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2"] }, "alb-asg-ec2"],
    [{ requiredResources: ["API_GATEWAY_REST_API", "LAMBDA"] }, "serverless-api"],
    [{ intent: "spa", requiredResources: ["CLOUDFRONT", "S3"] }, "spa-cloudfront-s3"],
    [{ requiredResources: ["ECS_SERVICE", "ECS_TASK_DEFINITION"] }, "ecs-fargate"],
    [{ requiredResources: ["CODEPIPELINE", "CODEDEPLOY_APP"] }, "github-cicd-codedeploy"],
    [{ requiredResources: ["RDS", "DB_SUBNET_GROUP"] }, "multi-az-rds"]
  ] as const;

  for (const [plan, expectedPatternId] of cases) {
    assert.equal(resolveArchitecturePatternIds(plan).includes(expectedPatternId), true);
  }
});

test("project answers exclude contradictory EC2 patterns and recognize Fargate", () => {
  const serverless = createDeterministicArchitectureIntentPlan([
    "Use API Gateway and Lambda only. Serverless runtime, no EC2.",
    "management preference: fully managed serverless",
    "backend: simple API"
  ].join("\n"));
  const fargate = createDeterministicArchitectureIntentPlan([
    "Use ECS Fargate service and task definition behind ALB. No EC2 capacity.",
    "management preference: semi-managed operations",
    "backend: complex business logic"
  ].join("\n"));

  assert.deepEqual(resolveArchitecturePatternIds(serverless), ["serverless-api"]);
  assert.equal(serverless?.requiredResources?.includes("EC2"), false);
  assert.deepEqual(resolveArchitecturePatternIds(fargate), ["ecs-fargate"]);
  assert.equal(fargate?.requiredResources?.includes("EC2"), false);
  assert.equal(fargate?.requiredResources?.includes("ECS_SERVICE"), true);
  assert.equal(fargate?.requiredResources?.includes("ECS_TASK_DEFINITION"), true);
});

test("architecture provider retrieves each selected pattern and returns a canonical plan", async () => {
  const retrievalInputs: ChatSyncCommandInput[] = [];
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async (command: ChatSyncCommand) => {
        retrievalInputs.push(command.input);
        const filter = command.input.attributeFilter?.equalsTo?.value?.stringValue;

        return {
          systemMessage: `Verified ${filter} knowledge.`,
          sourceAttributions: [
            {
              title: filter,
              documentId: `sketchcatch-pattern-${filter}-v1`,
              snippet: `Verified ${filter} pattern.`
            }
          ]
        };
      }
    }
  });

  const response = await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a highly available web runtime.",
    payload: {
      normalizedRequirement: {
        patternIds: ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"],
        requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2", "CODEPIPELINE", "RDS"],
        resourceQuantities: { EC2: 3 },
        runtimeTopology: {
          trafficEntry: "LOAD_BALANCER",
          compute: "EC2",
          computeCount: 3,
          placement: "private_subnets",
          spreadAcrossPrivateSubnets: true,
          autoScaling: true
        }
      },
      supportedResourceTypes: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2", "CODEPIPELINE", "RDS"]
    }
  });

  assert.equal(retrievalInputs.length, 3);
  assert.deepEqual(
    retrievalInputs.map((input) => input.attributeFilter?.equalsTo?.value?.stringValue),
    ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]
  );
  assert.equal(retrievalInputs.every((input) => input.applicationId === "retrieval-app"), true);
  assert.equal(retrievalInputs.every((input) => input.chatMode === "RETRIEVAL_MODE"), true);
  const plan = JSON.parse(response.text) as {
    status?: string;
    patternIds?: string[];
    requiredResources?: string[];
  };
  assert.equal(plan.status, "plan");
  assert.deepEqual(plan.patternIds, ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]);
  assert.equal(plan.requiredResources?.includes("LOAD_BALANCER_TARGET_GROUP"), true);
  assert.equal(plan.requiredResources?.includes("CODEDEPLOY_DEPLOYMENT_GROUP"), true);
  assert.equal(plan.requiredResources?.includes("DB_SUBNET_GROUP"), true);
});

test("architecture provider rejects retrieval evidence from the wrong document", async () => {
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async () => ({
        systemMessage: "Wrong pattern.",
        sourceAttributions: [{ documentId: "sketchcatch-pattern-serverless-api-v1" }]
      })
    }
  });

  await assert.rejects(
    provider.generate({
      target: "architecture_draft",
      instructions: "Return a plan.",
      prompt: "Create an ALB fleet.",
      payload: { normalizedRequirement: { patternIds: ["alb-asg-ec2"] } }
    }),
    /citation/i
  );
});

test("canonical Q plans materialize serverless, Fargate, and composed deployment diagrams", async () => {
  const cases = [
    {
      id: "serverless",
      requirement: "Use API Gateway and Lambda only. Serverless runtime, no EC2.",
      database: "database: none no database static content only",
      management: "management preference: fully managed serverless",
      required: ["API_GATEWAY_REST_API", "LAMBDA", "LAMBDA_PERMISSION"],
      forbidden: ["EC2", "AMI", "AUTO_SCALING_GROUP"]
    },
    {
      id: "fargate",
      requirement: "Use ECS Fargate service and task definition behind ALB. No EC2 capacity.",
      database: "database: none no database static content only",
      management: "management preference: semi-managed operations",
      required: ["LOAD_BALANCER", "ECS_CLUSTER", "ECS_TASK_DEFINITION", "ECS_SERVICE"],
      forbidden: ["EC2", "AMI", "IAM_INSTANCE_PROFILE", "ECS_CAPACITY_PROVIDER"]
    },
    {
      id: "composed",
      requirement: [
        "GitHub main deploys with CodeStar Connection, CodePipeline, CodeBuild Project, CodeDeploy App and Deployment Group.",
        "Runtime is ALB, Auto Scaling Group and EC2 3 instances in private subnets.",
        "Use private Multi-AZ RDS."
      ].join(" "),
      database: "database: simple data user posts under 10GB",
      management: "management preference: self-managed operations",
      required: [
        "LOAD_BALANCER",
        "AUTO_SCALING_GROUP",
        "EC2",
        "CODESTAR_CONNECTION",
        "CODEPIPELINE",
        "CODEBUILD_PROJECT",
        "CODEDEPLOY_APP",
        "CODEDEPLOY_DEPLOYMENT_GROUP",
        "S3",
        "IAM_ROLE",
        "RDS",
        "DB_SUBNET_GROUP"
      ],
      forbidden: []
    }
  ] as const;

  for (const scenario of cases) {
    const provider = createAmazonQArchitectureDraftProvider({
      region: "ap-southeast-2",
      retrievalApplicationId: "retrieval-app",
      retrievalClient: {
        send: async (command) => {
          const patternId = command.input.attributeFilter?.equalsTo?.value?.stringValue;

          return {
            systemMessage: `Verified ${patternId}.`,
            sourceAttributions: [{ documentId: `sketchcatch-pattern-${patternId}-v1` }]
          };
        }
      }
    });
    const response = await createAmazonQArchitectureDraftResponse(
      {
        prompt: createCompleteProjectPrompt(
          scenario.requirement,
          scenario.database,
          scenario.management
        )
      },
      {
        provider,
        creditPolicy: {
          bedrock: false,
          amazonQ: true,
          transcribe: false,
          billingMode: "aws_credit_only"
        }
      }
    );

    if ("status" in response) {
      assert.fail(`${scenario.id}: expected diagram, got clarification ${response.question}`);
    }

    const nodeTypes = response.architectureJson.nodes.map((node) => node.type);
    assert.equal(response.metadata.source, "amazon_q", `${scenario.id}: must use the verified Q plan`);

    for (const requiredType of scenario.required) {
      assert.equal(nodeTypes.includes(requiredType), true, `${scenario.id}: missing ${requiredType}`);
    }

    for (const forbiddenType of scenario.forbidden) {
      assert.equal(nodeTypes.includes(forbiddenType), false, `${scenario.id}: contains ${forbiddenType}`);
    }

    if (scenario.id === "composed") {
      assert.equal(nodeTypes.filter((nodeType) => nodeType === "EC2").length, 3);
    }

    const connectedNodeIds = new Set(
      response.architectureJson.edges.flatMap((edge) => [edge.sourceId, edge.targetId])
    );
    const orphanNodeIds = response.architectureJson.nodes
      .filter((node) => !connectedNodeIds.has(node.id))
      .map((node) => node.id);
    assert.deepEqual(orphanNodeIds, [], `${scenario.id}: orphan nodes`);
  }
});

test("non-architecture targets never enter the architecture retrieval pipeline", async () => {
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: { send: async () => assert.fail("architecture retrieval must not run") }
  });

  await assert.rejects(
    provider.generate({
      target: "terraform_error_explanation",
      instructions: "Explain.",
      prompt: "Explain this error.",
      payload: {}
    }),
    /architecture_draft/
  );
});

function createCompleteProjectPrompt(
  requirement: string,
  database: string,
  management: string
): string {
  return [
    requirement,
    "website type: dynamic web application shopping board membership system",
    "traffic: medium daily traffic 1000 concurrent users 50",
    database,
    "frontend: React/Vue/Angular SPA framework",
    "backend: complex business logic Spring Boot Django",
    "region: Korea only Seoul region ap-northeast-2",
    "budget cost: 50-200 high performance",
    "SSL HTTPS: required security important",
    "file upload: none no file upload text only",
    "realtime: none no realtime features",
    management,
    "loading time: 3 seconds",
    "website size: 10MB-100MB",
    "traffic pattern: time-based daytime traffic",
    "downtime tolerance: 99.9% availability"
  ].join("\n");
}
