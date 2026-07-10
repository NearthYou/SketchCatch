import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatSyncCommand } from "@aws-sdk/client-qbusiness";
import {
  createAmazonQArchitectureDraftResponse,
  createDeterministicArchitectureIntentPlan
} from "./aiArchitectureDrafts.js";
import {
  createAmazonQArchitectureDraftProvider,
  resolveArchitecturePatternIds
} from "./aiArchitectureQBusiness.js";
import type { ArchitecturePatternId } from "./aiArchitectureRequirementNormalizer.js";

type QualityCase = {
  readonly id: string;
  readonly requirement: string;
  readonly expected: readonly ArchitecturePatternId[];
  readonly database?: string | undefined;
  readonly backend?: string | undefined;
  readonly management?: string | undefined;
  readonly websiteType?: string | undefined;
};

const baseCases: readonly QualityCase[] = [
  ...createCases("alb", "alb-asg-ec2", [
    "ALB and Auto Scaling Group manage 3 EC2 instances across two private subnets.",
    "Application Load Balancer routes traffic to an ASG EC2 fleet.",
    "Use EC2 behind ALB with autoscaling in private subnets.",
    "Production runtime is three EC2 instances managed by an Auto Scaling Group and ALB.",
    "Self-managed EC2 web servers scale behind an Application Load Balancer.",
    "Create a private EC2 fleet with launch template, ASG, and ALB."
  ]),
  ...createCases("serverless", "serverless-api", [
    "Use API Gateway and Lambda only. Serverless runtime, no EC2.",
    "Build a serverless REST API with Lambda and API Gateway without EC2.",
    "Lambda handles the backend behind API Gateway; EC2 is excluded.",
    "Fully managed API Gateway integration invokes Lambda only.",
    "No EC2 capacity. Use an API Gateway REST API and Lambda permission.",
    "Serverless runtime with API Gateway stage, deployment, and Lambda."
  ], { management: "management preference: fully managed serverless" }),
  ...createCases("spa", "spa-cloudfront-s3", [
    "React SPA is stored in private S3 and delivered through CloudFront. No backend.",
    "Host static Vue assets in private S3 with a CloudFront distribution.",
    "Angular single page application uses S3 origin and CloudFront only.",
    "Static frontend: private S3 bucket plus CloudFront CDN, no API.",
    "Deploy a SPA to S3 and expose it only through CloudFront.",
    "Frontend-only website with CloudFront and a non-public S3 origin."
  ], {
    websiteType: "website type: SPA Single Page Application React Vue",
    backend: "backend: none no backend static site",
    database: "database: none no database static content only",
    management: "management preference: fully managed serverless"
  }),
  ...createCases("ecs", "ecs-fargate", [
    "Use ECS Fargate service and task definition behind ALB. No EC2 capacity.",
    "Run containers as private Fargate tasks in an ECS service behind ALB.",
    "ECS cluster, Fargate task definition, and service use an ALB target group.",
    "Deploy the container image from ECR to ECS Fargate without EC2.",
    "Private Fargate runtime scales behind an Application Load Balancer.",
    "Containerized backend uses ECS Fargate service, task definition, ECR, and ALB."
  ]),
  ...createCases("cicd", "github-cicd-codedeploy", [
    "GitHub main deploys through CodeStar Connection, CodePipeline, CodeBuild, and CodeDeploy.",
    "Use CodePipeline with CodeBuild Project and CodeDeploy App for GitHub delivery.",
    "CodeStar Connection sources GitHub into CodePipeline and CodeDeploy Deployment Group.",
    "Build GitHub main in CodeBuild and release with CodeDeploy through CodePipeline.",
    "Create a GitHub CI/CD path with CodeStar, CodePipeline, CodeBuild, and CodeDeploy.",
    "Artifact deployment uses CodePipeline, CodeBuild Project, CodeDeploy App, and Deployment Group."
  ]),
  ...createCases("rds", "multi-az-rds", [
    "Use private encrypted Multi-AZ RDS with a DB subnet group.",
    "Production database is RDS in private subnets across two availability zones.",
    "Create one Multi-AZ RDS database with Secrets Manager and an alarm.",
    "RDS must not be public and must use a two-AZ DB subnet group.",
    "Use encrypted private RDS with secret-managed credentials and monitoring.",
    "Relational data runs on a Multi-AZ RDS primary in private database subnets."
  ], { database: "database: simple data user posts under 10GB" })
];

const composedCases: readonly QualityCase[] = [
  {
    id: "alb+cicd",
    requirement: "GitHub main uses CodePipeline and CodeBuild to deploy three EC2 instances in an ASG behind ALB.",
    expected: ["alb-asg-ec2", "github-cicd-codedeploy"]
  },
  {
    id: "alb+cicd+rds",
    requirement: "CodeStar Connection, CodePipeline, CodeBuild and CodeDeploy release to ALB, ASG, EC2 3 instances, and private Multi-AZ RDS.",
    expected: ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"],
    database: "database: simple data user posts under 10GB"
  },
  {
    id: "spa+serverless",
    requirement: "React SPA uses private S3 and CloudFront; API Gateway invokes Lambda without EC2.",
    expected: ["serverless-api", "spa-cloudfront-s3"],
    management: "management preference: fully managed serverless"
  },
  {
    id: "spa+serverless+rds",
    requirement: "CloudFront serves a private S3 SPA, API Gateway invokes Lambda, and data is stored in private Multi-AZ RDS. No EC2.",
    expected: ["serverless-api", "spa-cloudfront-s3", "multi-az-rds"],
    database: "database: simple data user posts under 10GB",
    management: "management preference: fully managed serverless"
  },
  {
    id: "ecs+rds",
    requirement: "ECS Fargate service behind ALB uses private Multi-AZ RDS. No EC2 capacity.",
    expected: ["ecs-fargate", "multi-az-rds"],
    database: "database: simple data user posts under 10GB"
  },
  {
    id: "cicd+ecs",
    requirement: "GitHub CodeStar Connection, CodePipeline, and CodeBuild deploy an ECS Fargate service behind ALB without EC2.",
    expected: ["ecs-fargate", "github-cicd-codedeploy"]
  }
];

const qualityCases = [...baseCases, ...composedCases];

test("42 project-answer profiles select exact verified pattern combinations", () => {
  assert.equal(qualityCases.length, 42);

  for (const scenario of qualityCases) {
    const plan = createDeterministicArchitectureIntentPlan(createCompleteProjectPrompt(scenario));

    assert.deepEqual(
      resolveArchitecturePatternIds(plan),
      scenario.expected,
      `${scenario.id}: unexpected pattern selection`
    );
  }
});

test("12 representative project profiles materialize stable and distinct canonical diagrams", async () => {
  const representativeCases = [
    ...baseCases.filter((_, index) => index % 6 === 0),
    ...composedCases
  ];
  const signatures = new Map<string, string>();

  for (const scenario of representativeCases) {
    const first = await materializeScenario(scenario);
    const second = await materializeScenario(scenario);
    const firstSignature = createArchitectureSignature(first.architectureJson);
    const secondSignature = createArchitectureSignature(second.architectureJson);

    assert.equal(first.metadata.source, "amazon_q", `${scenario.id}: verified plan must be used`);
    assert.equal(firstSignature, secondSignature, `${scenario.id}: canonical signature changed`);
    assert.deepEqual(findOrphanNodeIds(first.architectureJson), [], `${scenario.id}: orphan nodes`);
    signatures.set(scenario.id, firstSignature);
  }

  const baseSignatures = baseCases
    .filter((_, index) => index % 6 === 0)
    .map((scenario) => signatures.get(scenario.id));
  assert.equal(new Set(baseSignatures).size, 6, "base pattern families collapsed to the same diagram");
  assert.equal(new Set(signatures.values()).size, representativeCases.length, "composed diagrams collapsed");
});

function createCases(
  prefix: string,
  patternId: ArchitecturePatternId,
  requirements: readonly string[],
  overrides: Partial<QualityCase> = {}
): QualityCase[] {
  return requirements.map((requirement, index) => ({
    id: `${prefix}-${index + 1}`,
    requirement,
    expected: [patternId],
    ...overrides
  }));
}

function createCompleteProjectPrompt(scenario: QualityCase): string {
  return [
    scenario.requirement,
    scenario.websiteType ?? "website type: dynamic web application shopping board membership system",
    "traffic: medium daily traffic 1000 concurrent users 50",
    scenario.database ?? "database: none no database static content only",
    "frontend: React/Vue/Angular SPA framework",
    scenario.backend ?? "backend: complex business logic Spring Boot Django",
    "region: Korea only Seoul region ap-northeast-2",
    "budget cost: 50-200 high performance",
    "SSL HTTPS: required security important",
    "file upload: none no file upload text only",
    "realtime: none no realtime features",
    scenario.management ?? "management preference: semi-managed operations",
    "loading time: 3 seconds",
    "website size: 10MB-100MB",
    "traffic pattern: time-based daytime traffic",
    "downtime tolerance: 99.9% availability"
  ].join("\n");
}

async function materializeScenario(scenario: QualityCase) {
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async (command: ChatSyncCommand) => {
        const patternId = command.input.attributeFilter?.equalsTo?.value?.stringValue;

        return {
          systemMessage: `Verified ${patternId}.`,
          sourceAttributions: [{ documentId: `sketchcatch-pattern-${patternId}-v1` }]
        };
      }
    }
  });
  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createCompleteProjectPrompt(scenario) },
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
    assert.fail(`${scenario.id}: unexpected clarification ${response.question}`);
  }

  return response;
}

function createArchitectureSignature(architectureJson: {
  readonly nodes: readonly { readonly type: string }[];
  readonly edges: readonly { readonly sourceId: string; readonly targetId: string; readonly label?: string | undefined }[];
}): string {
  const nodeCounts = Object.entries(
    architectureJson.nodes.reduce<Record<string, number>>((counts, node) => {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
      return counts;
    }, {})
  ).sort(([left], [right]) => left.localeCompare(right));
  const edgeLabels = architectureJson.edges.map((edge) => edge.label ?? "").sort();

  return JSON.stringify({ nodeCounts, edgeLabels });
}

function findOrphanNodeIds(architectureJson: {
  readonly nodes: readonly { readonly id: string }[];
  readonly edges: readonly { readonly sourceId: string; readonly targetId: string }[];
}): string[] {
  const connectedNodeIds = new Set(
    architectureJson.edges.flatMap((edge) => [edge.sourceId, edge.targetId])
  );

  return architectureJson.nodes
    .filter((node) => !connectedNodeIds.has(node.id))
    .map((node) => node.id);
}
