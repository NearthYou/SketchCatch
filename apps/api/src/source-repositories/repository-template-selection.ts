import type {
  RepositoryAnalysisAiHandoff,
  RepositoryAnalysisEvidence,
  RepositoryApplicationUnit,
  RepositoryEvidenceKind
} from "@sketchcatch/types";
import type { GitHubRepositoryEvidenceSnapshot } from "./github-app-client.js";

type RepositoryTemplateSelectionInput = {
  readonly snapshot: GitHubRepositoryEvidenceSnapshot;
  readonly applicationUnits: readonly RepositoryApplicationUnit[];
  readonly evidence: readonly RepositoryAnalysisEvidence[];
  readonly missingEvidence: readonly RepositoryEvidenceKind[];
};

type RepositoryTemplateMatch = {
  readonly templateId: Extract<
    RepositoryAnalysisAiHandoff,
    { status: "template_selected" }
  >["templateId"];
  readonly selectionReason: string;
};

// 명시적인 repository 신호가 한 Template과 일치할 때만 선택한다.
export function selectRepositoryTemplate(
  input: RepositoryTemplateSelectionInput
): RepositoryAnalysisAiHandoff {
  const searchableEvidence = [
    ...input.snapshot.treePaths,
    ...input.snapshot.files.map((file) => `${file.path}\n${file.content}`)
  ]
    .join("\n")
    .toLowerCase();
  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  );
  const hasBackend = input.applicationUnits.some(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  );
  const hasServerlessApi =
    /serverless\.(?:yml|yaml)|template\.(?:yml|yaml)/.test(searchableEvidence) &&
    /functions:|lambda/.test(searchableEvidence) &&
    /httpapi|api gateway|apigateway/.test(searchableEvidence);
  const hasCognito = /cognito|userpool|user_pool/.test(searchableEvidence);
  const hasThreeTierInfrastructure =
    /\bvpc\b/.test(searchableEvidence) &&
    /\balb\b|application load balancer/.test(searchableEvidence) &&
    /\basg\b|auto scaling group/.test(searchableEvidence) &&
    /\brds\b|relational database service/.test(searchableEvidence);
  const hasDockerfile = input.evidence.some((item) => item.kind === "dockerfile");
  const hasEcsFargate = /\becs\b/.test(searchableEvidence) && /\bfargate\b/.test(searchableEvidence);
  const hasEksKubernetes =
    /\beks\b/.test(searchableEvidence) &&
    /kubernetes|kustomization|helm|deployment\.ya?ml/.test(searchableEvidence);
  const matches: readonly RepositoryTemplateMatch[] = [
    ...(hasFrontend &&
    !hasBackend &&
    !hasServerlessApi &&
    !hasDockerfile &&
    !hasThreeTierInfrastructure
      ? [
          {
            templateId: "static-web-hosting",
            selectionReason: "정적 build가 가능한 frontend Application Unit만 감지했습니다."
          } satisfies RepositoryTemplateMatch
        ]
      : []),
    ...(hasServerlessApi && hasBackend && !hasFrontend
      ? [
          {
            templateId: "minimal-serverless-api",
            selectionReason: "backend Application Unit과 Lambda/API Gateway 설정을 감지했습니다."
          } satisfies RepositoryTemplateMatch
        ]
      : []),
    ...(hasServerlessApi && hasCognito && hasFrontend && hasBackend
      ? [
          {
            templateId: "full-serverless-web-app",
            selectionReason: "frontend와 serverless API, Cognito 인증 신호를 감지했습니다."
          } satisfies RepositoryTemplateMatch
        ]
      : []),
    ...(hasThreeTierInfrastructure && hasFrontend && hasBackend
      ? [
          {
            templateId: "three-tier-web-app",
            selectionReason: "frontend/backend와 VPC, ALB, Auto Scaling, RDS를 감지했습니다."
          } satisfies RepositoryTemplateMatch
        ]
      : []),
    ...(hasDockerfile && hasEcsFargate
      ? [
          {
            templateId: "ecs-fargate-container-app",
            selectionReason: "Dockerfile과 ECS Fargate 배포 신호를 감지했습니다."
          } satisfies RepositoryTemplateMatch
        ]
      : []),
    ...(hasDockerfile && hasEksKubernetes
      ? [
          {
            templateId: "eks-container-app",
            selectionReason: "Dockerfile과 Kubernetes, EKS 배포 신호를 감지했습니다."
          } satisfies RepositoryTemplateMatch
        ]
      : [])
  ];
  const [match] = matches;

  if (matches.length === 1 && match) {
    return createTemplateSelection(input, match.templateId, [match.selectionReason]);
  }

  return createTemplateSelectionFailure(
    input,
    matches.length > 1
      ? "둘 이상의 Template 신호가 동시에 명확해 하나를 확정할 수 없습니다."
      : "지원 Template 하나를 확정할 만큼 명확한 evidence가 없습니다."
  );
}

// 성공 결과에는 후보 목록 없이 선택한 Template 하나만 넣는다.
function createTemplateSelection(
  input: RepositoryTemplateSelectionInput,
  templateId: Extract<RepositoryAnalysisAiHandoff, { status: "template_selected" }>["templateId"],
  selectionReasons: readonly string[]
): RepositoryAnalysisAiHandoff {
  return {
    status: "template_selected",
    templateId,
    applicationUnits: input.applicationUnits,
    evidence: input.evidence,
    missingEvidence: input.missingEvidence,
    selectionReasons
  };
}

// 지원 Template과 일치하지 않을 때 fallback 없이 명시적 실패를 만든다.
function createTemplateSelectionFailure(
  input: RepositoryTemplateSelectionInput,
  mismatchReason: string
): RepositoryAnalysisAiHandoff {
  return {
    status: "template_selection_failed",
    templateId: null,
    applicationUnits: input.applicationUnits,
    evidence: input.evidence,
    missingEvidence: input.missingEvidence,
    mismatchReasons: [mismatchReason]
  };
}
