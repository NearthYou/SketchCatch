import { z } from "zod";
import {
  templateDefinitions,
  type RepositoryAnalysisAnswer,
  type RepositoryAnalysisQuestion,
  type RepositoryDeploymentType,
  type RepositoryTemplateRecommendationCandidate,
  type RepositoryTemplateRecommendationResult,
  type TemplateId
} from "@sketchcatch/types";
import { TEMPLATE_IDS } from "@sketchcatch/types";
import type {
  GitHubRepositoryEvidenceFile,
  GitHubRepositoryEvidenceSnapshot
} from "./github-app-client.js";
import type {
  RepositoryTemplateSelectionInput
} from "./repository-template-selection.js";

export type RepositoryTemplateRecommendationInput = RepositoryTemplateSelectionInput & {
  readonly deploymentType: RepositoryDeploymentType;
  readonly usesCiCd: boolean;
  readonly answers: readonly RepositoryAnalysisAnswer[];
};

export type RepositoryTemplateRecommendationProfile = {
  readonly deploymentTypeDefault: RepositoryDeploymentType | null;
  readonly usesCiCdDefault: boolean | null;
  readonly questions: readonly RepositoryAnalysisQuestion[];
  readonly recommendation: RepositoryTemplateRecommendationResult | null;
};

type CandidateSetItem = {
  readonly templateId: TemplateId;
  readonly baseConfidence: number;
  readonly reasons: readonly string[];
  readonly tradeoffs: readonly string[];
};

const templateIdSchema = z.enum(TEMPLATE_IDS);
const aiCandidateSchema = z.object({
  templateId: templateIdSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().trim().min(1)).min(1).max(4),
  tradeoffs: z.array(z.string().trim().min(1)).min(1).max(4)
});
const aiRecommendationSchema = z.object({
  candidates: z.array(aiCandidateSchema).min(1).max(3)
});

const templateById = new Map(templateDefinitions.map((definition) => [definition.id, definition]));

export function createRepositoryTemplateRecommendationProfile(
  input: RepositoryTemplateSelectionInput
): RepositoryTemplateRecommendationProfile {
  const deploymentTypeDefault = inferRepositoryDeploymentType(input);
  const usesCiCdDefault = inferRepositoryCiCdUsage(input);
  const questions = createRepositoryAnalysisQuestions(input).slice(0, 5);
  const recommendation = deploymentTypeDefault
    ? recommendRepositoryTemplates({
        ...input,
        deploymentType: deploymentTypeDefault,
        usesCiCd: usesCiCdDefault ?? false,
        answers: []
      })
    : null;

  return {
    deploymentTypeDefault,
    usesCiCdDefault,
    questions,
    recommendation
  };
}

export function recommendRepositoryTemplates(
  input: RepositoryTemplateRecommendationInput
): RepositoryTemplateRecommendationResult {
  const deterministicCandidates = createSupportedCandidateSet(input);
  const rankedCandidates = rankSupportedCandidates(input, deterministicCandidates);

  return {
    deploymentType: input.deploymentType,
    usesCiCd: input.usesCiCd,
    candidates: rankedCandidates
  };
}

function inferRepositoryDeploymentType(
  input: RepositoryTemplateSelectionInput
): RepositoryDeploymentType | null {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));

  if (/\beks\b|kubernetes|helm|kustomization|dockerfile|\becs\b|\bfargate\b/.test(text)) {
    return "container";
  }

  if (/serverless\.(?:yml|yaml)|lambda|api gateway|apigateway|amplify|dynamodb/.test(text)) {
    return "serverless";
  }

  if (/\bvpc\b|\balb\b|application load balancer|\basg\b|auto scaling|ec2|rds/.test(text)) {
    return "ec2_vm";
  }

  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  );
  const hasBackend = input.applicationUnits.some(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  );

  if (hasFrontend && !hasBackend) {
    return "serverless";
  }

  return null;
}

function inferRepositoryCiCdUsage(input: RepositoryTemplateSelectionInput): boolean | null {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));

  if (/\.github\/workflows|github actions|gitlab-ci|circleci|buildspec\.ya?ml|jenkinsfile/.test(text)) {
    return true;
  }

  if (/\bdeploy\b|\bpipeline\b|\bci\/cd\b|\bcicd\b/.test(text)) {
    return true;
  }

  return null;
}

function createRepositoryAnalysisQuestions(
  input: RepositoryTemplateSelectionInput
): RepositoryAnalysisQuestion[] {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));
  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  );
  const hasBackend = input.applicationUnits.some(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  );
  const questions: RepositoryAnalysisQuestion[] = [];

  if (!/rds|dynamodb|postgres|mysql|prisma|typeorm|sequelize/.test(text)) {
    questions.push({
      id: "data-persistence",
      prompt: "Does this application need persistent data storage?",
      answerType: "single_select",
      options: [
        { value: "none", label: "No persistent data" },
        { value: "relational", label: "Relational database" },
        { value: "key_value", label: "Key-value or document data" }
      ],
      required: true,
      reason: "Repository evidence did not clearly identify the data layer."
    });
  }

  if (!hasFrontend || !hasBackend) {
    questions.push({
      id: "application-scope",
      prompt: "Which runtime surface should the template prepare first?",
      answerType: "single_select",
      options: [
        { value: "web", label: "Public web frontend" },
        { value: "api", label: "API backend" },
        { value: "web_and_api", label: "Web frontend and API backend" }
      ],
      required: true,
      reason: "Repository analysis could not prove every application surface."
    });
  }

  if (!/cognito|auth|oauth|login|session/.test(text)) {
    questions.push({
      id: "authentication",
      prompt: "Should the initial architecture include managed user authentication?",
      answerType: "boolean",
      required: true,
      reason: "Authentication requirements were not explicit in repository evidence."
    });
  }

  if (!/kubernetes|eks|ecs|fargate/.test(text)) {
    questions.push({
      id: "operations-preference",
      prompt: "What operations model do you prefer for the first deployment?",
      answerType: "single_select",
      options: [
        { value: "managed", label: "Managed services first" },
        { value: "container", label: "Container runtime" },
        { value: "self_managed_vm", label: "EC2/VM operations" }
      ],
      required: false,
      reason: "Deployment operations preference was not present in the repository."
    });
  }

  return questions;
}

function createSupportedCandidateSet(
  input: RepositoryTemplateRecommendationInput
): readonly CandidateSetItem[] {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));
  const answers = createAnswerMap(input.answers);
  const applicationScope = answers.get("application-scope");
  const dataPersistence = answers.get("data-persistence");
  const authentication = answers.get("authentication");
  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  ) || applicationScope === "web" || applicationScope === "web_and_api";
  const hasBackend = input.applicationUnits.some(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  ) || applicationScope === "api" || applicationScope === "web_and_api";
  const hasRelationalData = /rds|postgres|mysql|prisma|typeorm|sequelize/.test(text) ||
    dataPersistence === "relational";
  const wantsAuth = authentication === true || /cognito|auth|oauth|login|session/.test(text);
  const wantsEks = /\beks\b|kubernetes|helm|kustomization/.test(text);

  if (input.deploymentType === "ec2_vm") {
    return [
      candidate("three-tier-web-app", 0.82, [
        "EC2/VM deployment maps to the supported ALB, Auto Scaling, and RDS starter."
      ], [
        "Requires more infrastructure operations than serverless or Fargate templates."
      ])
    ];
  }

  if (input.deploymentType === "container") {
    const orderedIds: TemplateId[] = wantsEks
      ? ["eks-container-app", "ecs-fargate-container-app"]
      : ["ecs-fargate-container-app", "eks-container-app"];

    return orderedIds.map((templateId, index) =>
      candidate(templateId, index === 0 ? 0.84 : 0.68, [
        templateId === "eks-container-app"
          ? "Kubernetes or EKS evidence fits the managed cluster template."
          : "Docker/container evidence fits the ECS Fargate service template."
      ], [
        templateId === "eks-container-app"
          ? "EKS adds cluster operations and Kubernetes object management."
          : "Fargate is simpler, but less portable than a Kubernetes-first setup."
      ])
    );
  }

  if (hasFrontend && hasBackend && wantsAuth) {
    return [
      candidate("full-serverless-web-app", 0.86, [
        "Web, API, and authentication needs fit the full serverless web app template."
      ], [
        "The template starts with DynamoDB and Cognito; relational data needs later adjustment."
      ]),
      candidate("minimal-serverless-api", 0.7, [
        "The API portion can start from the minimal serverless API template."
      ], [
        "It does not include frontend hosting or Cognito by default."
      ])
    ];
  }

  if (hasBackend && (hasRelationalData || dataPersistence === "key_value")) {
    return [
      candidate("minimal-serverless-api", 0.8, [
        "API and data persistence needs fit the Lambda API starter."
      ], [
        "Relational database needs require replacing or extending the default DynamoDB layer."
      ]),
      candidate("full-serverless-web-app", 0.66, [
        "A web-and-API flow can grow from the full serverless app template."
      ], [
        "Includes auth and frontend resources that may be unnecessary for an API-only service."
      ])
    ];
  }

  if (hasFrontend && !hasBackend) {
    return [
      candidate("static-web-hosting", 0.83, [
        "Frontend-only evidence fits CloudFront plus S3 static hosting."
      ], [
        "Dynamic API, auth, or server rendering needs require adding backend resources later."
      ]),
      candidate("full-serverless-web-app", 0.62, [
        "It leaves room for API and auth if the web app grows."
      ], [
        "It is heavier than a static website starter."
      ])
    ];
  }

  return [
    candidate("minimal-serverless-api", 0.72, [
      "Serverless was selected and the API starter is the smallest supported deployable baseline."
    ], [
      "Repository evidence is limited, so review the generated architecture before handoff."
    ]),
    candidate("static-web-hosting", 0.6, [
      "A static hosting template remains viable for frontend-only repositories."
    ], [
      "It does not include backend compute."
    ])
  ];
}

function rankSupportedCandidates(
  input: RepositoryTemplateRecommendationInput,
  deterministicCandidates: readonly CandidateSetItem[]
): readonly RepositoryTemplateRecommendationCandidate[] {
  const allowedTemplateIds = new Set(deterministicCandidates.map((candidate) => candidate.templateId));
  const aiRanking = aiRecommendationSchema.parse({
    candidates: deterministicCandidates.slice(0, 3).map((candidate, index) => ({
      templateId: candidate.templateId,
      confidence: adjustConfidence(candidate.baseConfidence, input, index),
      reasons: candidate.reasons,
      tradeoffs: candidate.tradeoffs
    }))
  });

  return aiRanking.candidates
    .filter((candidate) => allowedTemplateIds.has(candidate.templateId))
    .map((candidate) => {
      const definition = templateById.get(candidate.templateId);

      if (!definition) {
        throw new Error(`Unsupported TemplateId in repository recommendation: ${candidate.templateId}`);
      }

      return {
        templateId: candidate.templateId,
        displayTitle: definition.title,
        confidence: candidate.confidence,
        reasons: candidate.reasons,
        tradeoffs: candidate.tradeoffs
      };
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

function adjustConfidence(
  baseConfidence: number,
  input: RepositoryTemplateRecommendationInput,
  index: number
): number {
  const ciCdBonus = input.usesCiCd ? 0.03 : 0;
  const answerBonus = input.answers.length > 0 ? 0.04 : 0;
  const orderPenalty = index * 0.04;

  return Math.max(0, Math.min(0.98, roundConfidence(baseConfidence + ciCdBonus + answerBonus - orderPenalty)));
}

function candidate(
  templateId: TemplateId,
  baseConfidence: number,
  reasons: readonly string[],
  tradeoffs: readonly string[]
): CandidateSetItem {
  return {
    templateId,
    baseConfidence,
    reasons,
    tradeoffs
  };
}

function createAnswerMap(answers: readonly RepositoryAnalysisAnswer[]): Map<string, string | boolean> {
  return new Map(answers.map((answer) => [answer.questionId, answer.value]));
}

function createSearchableText(
  snapshot: Pick<GitHubRepositoryEvidenceSnapshot, "treePaths" | "files">,
  extraPaths: readonly string[] = []
): string {
  return [
    ...snapshot.treePaths,
    ...extraPaths,
    ...snapshot.files.map((file: GitHubRepositoryEvidenceFile) => `${file.path}\n${file.content}`)
  ]
    .join("\n")
    .toLowerCase();
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
