import type {
  RepositoryAnalysisAiHandoff,
  RepositoryAnalysisEvidence,
  RepositoryApplicationUnit,
  RepositoryEvidenceKind
} from "@sketchcatch/types";
import type { GitHubRepositoryEvidenceSnapshot } from "./github-app-client.js";

export type RepositoryTemplateSelectionInput = {
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
  const applicationUnitEvidence = input.applicationUnits.map((unit) => ({
    unit,
    text: getApplicationUnitEvidenceText(input, unit.id)
  }));
  const serverlessApplicationUnits = applicationUnitEvidence.filter(
    ({ unit, text }) =>
      (unit.kind === "backend" || unit.kind === "fullstack") &&
      /serverless\.(?:yml|yaml)|template\.(?:yml|yaml)/.test(text) &&
      /functions:|lambda/.test(text) &&
      /httpapi|api gateway|apigateway/.test(text)
  );
  const hasServerlessApi = serverlessApplicationUnits.length > 0;
  const hasCognito = serverlessApplicationUnits.some(({ text }) =>
    /cognito|userpool|user_pool/.test(text)
  );
  const hasThreeTierInfrastructure =
    /\bvpc\b/.test(searchableEvidence) &&
    /\balb\b|application load balancer/.test(searchableEvidence) &&
    /\basg\b|auto scaling group/.test(searchableEvidence) &&
    /\brds\b|relational database service/.test(searchableEvidence);
  const hasDockerfile = input.evidence.some((item) => item.kind === "dockerfile");
  const dockerApplicationUnits = applicationUnitEvidence.filter(({ unit }) =>
    input.evidence.some(
      (item) => item.kind === "dockerfile" && item.applicationUnitId === unit.id
    )
  );
  const hasEcsFargate = dockerApplicationUnits.some(
    ({ text }) => /\becs\b/.test(text) && /\bfargate\b/.test(text)
  );
  const hasEksKubernetes = dockerApplicationUnits.some(
    ({ text }) =>
      /\beks\b/.test(text) &&
      /kubernetes|kustomization|helm|deployment\.ya?ml/.test(text)
  );
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

// Template 신호가 다른 Application Unit의 README나 설정과 섞이지 않도록 근거를 묶는다.
function getApplicationUnitEvidenceText(
  input: RepositoryTemplateSelectionInput,
  applicationUnitId: string
): string {
  const evidencePaths = new Set(
    input.evidence
      .filter((item) => item.applicationUnitId === applicationUnitId)
      .map((item) => item.path)
  );

  return [
    ...evidencePaths,
    ...input.snapshot.files
      .filter((file) => evidencePaths.has(file.path))
      .map((file) => file.content)
  ]
    .join("\n")
    .toLowerCase();
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
