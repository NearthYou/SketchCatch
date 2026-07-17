import type {
  CreateArchitectureDraftRequest,
  RepositoryAnalysisTemplateId,
  RepositoryDeploymentType,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";
import { TEMPLATE_IDS } from "../../../../packages/types/src/template-definitions";
import { listBoardTemplates } from "../resource-settings/template-library";

export type PublicRepositoryTemplateId = RepositoryAnalysisTemplateId;

export type PublicRepositoryQuestion = {
  readonly id: string;
  readonly prompt: string;
  readonly answerType: "boolean" | "single_select" | "free_text";
  readonly options?: readonly { readonly value: string; readonly label: string }[] | undefined;
};

export type PublicRepositoryTemplateCandidate = {
  readonly templateId: PublicRepositoryTemplateId;
  readonly displayTitle: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly questions?: readonly PublicRepositoryQuestion[] | undefined;
};

export type PublicRepositoryRecommendation = {
  readonly candidates: readonly PublicRepositoryTemplateCandidate[];
  readonly questions: readonly PublicRepositoryQuestion[];
};

const TEMPLATE_LABELS: Partial<Record<PublicRepositoryTemplateId, string>> = {
  "ecs-fargate-container-app": "ECS Fargate container app",
  "eks-container-app": "EKS container app",
  "full-serverless-web-app": "Full serverless web app",
  "minimal-serverless-api": "Minimal serverless API",
  "static-web-hosting": "Static web hosting",
  "three-tier-web-app": "Three-tier web app"
};

const KOREAN_QUESTION_COPY: Readonly<Record<
  string,
  { readonly prompt: string; readonly options?: readonly { readonly value: string; readonly label: string }[] }
>> = {
  "application-scope": {
    prompt: "아키텍처에 먼저 포함할 애플리케이션 범위를 선택해주세요.",
    options: [
      { value: "web", label: "공개 웹 프론트엔드" },
      { value: "api", label: "API 백엔드" },
      { value: "web_and_api", label: "웹 프론트엔드와 API 백엔드" }
    ]
  },
  authentication: {
    prompt: "초기 아키텍처에 관리형 사용자 인증을 포함할까요?"
  },
  "data-persistence": {
    prompt: "이 애플리케이션에 영구 데이터 저장소가 필요한가요?",
    options: [
      { value: "none", label: "영구 데이터 없음" },
      { value: "relational", label: "관계형 데이터베이스" },
      { value: "key_value", label: "키-값 또는 문서형 저장소" }
    ]
  },
  include_database: {
    prompt: "감지된 데이터베이스 계층을 이 아키텍처에 포함할까요?"
  },
  include_frontend: {
    prompt: "감지된 React 웹 프론트엔드를 이 아키텍처에 포함할까요?"
  },
  "operations-preference": {
    prompt: "첫 배포에서 선호하는 운영 방식을 선택해주세요.",
    options: [
      { value: "managed", label: "관리형 서비스 우선" },
      { value: "container", label: "컨테이너 런타임" },
      { value: "self_managed_vm", label: "EC2/VM 직접 운영" },
      { value: "ec2", label: "EC2/VM 직접 운영" },
      { value: "ecs", label: "ECS Fargate" },
      { value: "eks", label: "EKS" }
    ]
  },
  primary_runtime: {
    prompt: "아키텍처에서 우선할 API 런타임을 선택해주세요.",
    options: [
      { value: "node", label: "Node API 우선" },
      { value: "python", label: "Python API 우선" },
      { value: "both", label: "두 API 모두 포함" }
    ]
  }
};

export function createPublicRepositoryRecommendation(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
  readonly selectedTemplateId?: PublicRepositoryTemplateId | null;
}): PublicRepositoryRecommendation {
  const candidates = createPublicRepositoryTemplateCandidates(input);
  const selectedTemplateId = input.selectedTemplateId ?? candidates[0]?.templateId;
  const selectedCandidate = candidates.find((candidate) => candidate.templateId === selectedTemplateId);
  const candidateQuestions = selectedCandidate?.questions ?? [];
  const handoffQuestions = createPublicRepositoryHandoffQuestions(input.analysis);
  return {
    candidates,
    questions: candidateQuestions.length > 0
      ? candidateQuestions.slice(0, 5)
      : handoffQuestions.length > 0
        ? handoffQuestions
        : selectedTemplateId
          ? createPublicRepositoryQuestions(input.analysis, selectedTemplateId)
          : []
  };
}

export function createPublicRepositoryArchitectureDraftRequest(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
  readonly templateId: PublicRepositoryTemplateId;
  readonly usesCiCd: boolean;
}): CreateArchitectureDraftRequest {
  const questions = createPublicRepositoryRecommendation({
    analysis: input.analysis,
    answers: input.answers,
    deploymentType: input.deploymentType,
    selectedTemplateId: input.templateId
  }).questions;
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const answerEntries = Object.entries(input.answers).sort(([left], [right]) => left.localeCompare(right));
  const answerLines = answerEntries.map(([questionId, value]) => {
    const question = questionById.get(questionId);
    const optionLabel = question?.options?.find((option) => option.value === String(value))?.label;
    const displayValue = createFollowUpAnswerDisplayValue(questionId, value, optionLabel);

    return `- ${question?.prompt ?? questionId} [${questionId}]: ${displayValue}`;
  });
  const answerConstraints = answerEntries
    .map(([questionId, value]) => createFollowUpAnswerConstraint(questionId, value))
    .filter((constraint): constraint is string => constraint !== null);
  const applicationUnitLines = (input.analysis.aiHandoff?.applicationUnits ?? []).map((unit) =>
    `- ${unit.kind} at ${unit.rootPath || "."}; frameworks: ${unit.frameworks.join(", ") || "unknown"}`
  );
  const evidenceFileLines = input.analysis.evidenceFiles
    .filter((file) => file.found)
    .map((file) => `- ${file.path}`);
  const architectureFacts = input.analysis.aiHandoff?.architectureFacts ?? [];
  const strictRepositoryEvidence = architectureFacts.length > 0;
  const excludedCapabilities = new Set(
    architectureFacts
      .filter((fact) => fact.kind === "excluded_capability")
      .map((fact) => fact.value)
  );
  const detectedSignals = input.analysis.detectedSignals.filter((signal) => {
    if (!strictRepositoryEvidence) return true;
    if (signal === "Auto Scaling" && architectureFacts.some(
      (fact) => fact.kind === "runtime_scale" && fact.value === "single_task"
    )) return false;
    if (signal === "Database" && excludedCapabilities.has("database")) return false;
    if (signal === "Redis" && excludedCapabilities.has("redis")) return false;
    if (signal === "WebSocket" && excludedCapabilities.has("websocket")) return false;
    if (signal === "Authentication" && excludedCapabilities.has("authentication")) return false;
    return true;
  });
  const architectureFactLines = architectureFacts.map((fact) =>
    `- ${fact.kind}: ${fact.value} (source: ${fact.sourcePath})`
  );
  const inferredRequirementLines = createInferredRepositoryRequirementLines(input);

  return {
    ...(isBuiltInTemplateId(input.templateId) ? { templateId: input.templateId } : {}),
    ...(architectureFacts.length > 0
      ? {
          repositoryEvidence: {
            mode: "strict" as const,
            facts: architectureFacts,
            repositoryName: getRepositoryName(input.analysis.repositoryUrl)
          }
        }
      : {}),
    prompt: [
      "Generate a production-quality Practice Architecture for this source repository.",
      "Priority rules:",
      "1. The selected Template is the highest-priority constraint. Keep its core service and deployment model.",
      "2. Apply every confirmed follow-up answer by adding, removing, or configuring supporting resources when compatible with the selected Template.",
      "3. Use Repository Analysis evidence to refine runtime boundaries and resource connections without replacing the selected Template.",
      "4. If a follow-up answer conflicts with the selected Template, preserve the Template and reflect the answer only where compatible; record the conflict as an assumption.",
      `Selected Template: ${input.templateId} (${formatPublicRepositoryTemplate(input.templateId)}).`,
      `Repository: ${input.analysis.repositoryUrl} at ${input.analysis.defaultBranch}.`,
      `Deployment type: ${input.deploymentType}.`,
      `Git/CI/CD handoff requested: ${input.usesCiCd ? "yes" : "no"}.`,
      `Detected signals: ${detectedSignals.join(", ") || "none"}.`,
      strictRepositoryEvidence
        ? "Repository recommendation context: candidate ranking only; authoritative architecture facts below control the draft."
        : `Repository recommendation context: ${input.analysis.recommendationReason}`,
      "Repository-inferred requirement profile:",
      ...inferredRequirementLines,
      "Confirmed follow-up answers:",
      ...(answerLines.length > 0 ? answerLines : ["- none"]),
      "Normalized answer constraints:",
      ...(answerConstraints.length > 0 ? answerConstraints.map((constraint) => `- ${constraint}`) : ["- none"]),
      "Detected application units:",
      ...(applicationUnitLines.length > 0 ? applicationUnitLines : ["- none"]),
      "Repository evidence files:",
      ...(evidenceFileLines.length > 0 ? evidenceFileLines : ["- none"]),
      "Repository architecture facts (authoritative; do not replace with generic production assumptions):",
      ...(architectureFactLines.length > 0 ? architectureFactLines : ["- none"]),
      "Required Components:",
      `- Preserve every core resource and relationship from ${input.templateId}.`,
      "- Add only the supporting resources required by the confirmed answers and Repository Analysis.",
      "Architecture Flow:",
      "- Keep the selected Template traffic and deployment flow, then connect answer-driven data or delivery resources to the appropriate workload.",
      "Validation Checklist:",
      "- The selected Template core remains visible and connected.",
      "- Every confirmed follow-up answer is reflected or documented as a Template conflict assumption.",
      "Generate a connected, readable diagram with only supported resource types. Avoid unrelated resources and duplicate nodes."
    ].join("\n")
  };
}

function getRepositoryName(repositoryUrl: string): string {
  try {
    const pathSegments = new URL(repositoryUrl).pathname.split("/").filter(Boolean);
    return (pathSegments.at(-1) ?? "application").replace(/\.git$/iu, "");
  } catch {
    return "application";
  }
}

function createFollowUpAnswerDisplayValue(
  questionId: string,
  value: string | boolean,
  optionLabel: string | undefined
): string {
  const normalizedQuestionId = questionId.replaceAll("_", "-");
  const normalizedValue = typeof value === "string" ? value.replaceAll("_", "-") : value;

  if (
    normalizedQuestionId === "operations-preference"
    && (normalizedValue === "self-managed-vm" || normalizedValue === "ec2")
  ) {
    return "Direct host operations preference (advisory only; selected Template remains authoritative)";
  }

  return optionLabel ?? (typeof value === "boolean" ? (value ? "Yes" : "No") : value);
}

function createInferredRepositoryRequirementLines(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
  readonly templateId: PublicRepositoryTemplateId;
  readonly usesCiCd: boolean;
}): string[] {
  const normalizedAnswers = new Map(
    Object.entries(input.answers).map(([questionId, value]) => [questionId.replaceAll("_", "-"), value])
  );
  const applicationScope = normalizedAnswers.get("application-scope");
  const dataPersistence = normalizedAnswers.get("data-persistence");
  const operationsPreference = normalizedAnswers.get("operations-preference");
  const architectureFacts = input.analysis.aiHandoff?.architectureFacts ?? [];
  const hasArchitectureFact = (kind: string, value: string): boolean =>
    architectureFacts.some((fact) => fact.kind === kind && fact.value === value);
  const frameworks = [...new Set(
    (input.analysis.aiHandoff?.applicationUnits ?? []).flatMap((unit) => unit.frameworks)
  )];
  const applicationUnits = input.analysis.aiHandoff?.applicationUnits ?? [];
  const hasFrontendUnit = applicationUnits.some((unit) =>
    unit.kind === "frontend" || unit.kind === "fullstack"
  );
  const hasBackendUnit = applicationUnits.some((unit) =>
    unit.kind === "backend" || unit.kind === "fullstack"
  );
  const applicationType = applicationScope === "api"
    ? "API server/backend service, not a public website frontend"
    : applicationScope === "web"
      ? "public web frontend"
      : applicationScope === "web_and_api"
      ? "dynamic web application with a public frontend and API backend"
        : hasFrontendUnit && hasBackendUnit
          ? "web frontend and API backend detected as separate application units"
        : input.analysis.detectedSignals.includes("React")
          ? "web application inferred from the detected frontend"
          : "API server/backend service inferred from Repository Analysis";
  const databaseRequirement = dataPersistence === "relational"
    ? "managed relational database required"
    : dataPersistence === "key_value"
      ? "managed key-value or document database required"
      : dataPersistence === "none"
        ? "no persistent database required"
        : hasArchitectureFact("excluded_capability", "database")
          ? "no persistent database required by explicit repository evidence"
          : input.analysis.detectedSignals.includes("Database")
          ? "database tier inferred from repository evidence"
          : "no database evidence; keep persistence minimal";
  const frontendRequirement = applicationScope === "api"
    ? "no public frontend"
    : input.analysis.detectedSignals.includes("React")
      ? "SPA frontend detected"
      : "no frontend framework detected";
  const backendRequirement = frameworks.length > 0
    ? `backend/runtime frameworks: ${frameworks.join(", ")}`
    : "API backend inferred from the selected application scope and container evidence";
  const managementPreference = operationsPreference === "self_managed_vm"
    ? "direct host operations preferred where compatible; selected Template remains authoritative"
    : operationsPreference === "container"
      ? "managed container runtime preferred"
      : "managed services preferred where compatible";
  const runtimeScale = hasArchitectureFact("runtime_scale", "single_task")
    ? "one runtime task; do not add dynamic task scaling unless the user explicitly overrides this repository contract"
    : "not established by repository evidence";
  const transportSecurity = hasArchitectureFact("transport_security", "alb_tls_termination")
    ? "HTTPS with TLS terminated at the Application Load Balancer"
    : "not established by repository evidence";
  const ciCd = hasArchitectureFact("ci_cd", "github_actions")
    ? "GitHub Actions builds and deploys; do not substitute CodePipeline, CodeBuild, or CodeDeploy"
    : input.usesCiCd
      ? "Git/CI/CD handoff requested, but the pipeline implementation is not established by repository evidence"
      : "not required in this draft";

  return [
    `- Application type: ${applicationType}.`,
    "- Traffic: not established by repository evidence; do not infer burst scaling.",
    `- Database: ${databaseRequirement}.`,
    `- Frontend: ${frontendRequirement}.`,
    `- Backend: ${backendRequirement}.`,
    "- Primary region: ap-northeast-2 (Seoul) for the initial draft.",
    "- Budget: cost-conscious initial deployment without sacrificing the selected Template core.",
    `- HTTPS: ${transportSecurity}; domain and certificate details are not available from Repository Analysis.`,
    "- File upload: not required; Repository Analysis found no supporting evidence.",
    "- Realtime features: not required; Repository Analysis found no supporting evidence.",
    `- Management preference: ${managementPreference}.`,
    "- Performance target: not established by repository evidence.",
    `- Runtime scale: ${runtimeScale}.`,
    "- Traffic pattern: not established by repository evidence.",
    "- Availability target: not established by repository evidence.",
    `- Git/CI/CD: ${ciCd}.`
  ];
}

export function formatPublicRepositoryTemplate(templateId: string): string {
  return TEMPLATE_LABELS[templateId as PublicRepositoryTemplateId]
    ?? getPublicRepositoryTemplateTitle(templateId)
    ?? "留욌뒗 ?쒗뵆由??놁쓬";
}

export function isBuiltInTemplateId(templateId: PublicRepositoryTemplateId): templateId is (typeof TEMPLATE_IDS)[number] {
  return (TEMPLATE_IDS as readonly string[]).includes(templateId);
}

function getPublicRepositoryTemplateTitle(templateId: string): string | undefined {
  return listBoardTemplates().find((template) => template.id === templateId)?.title;
}

export function getPublicRepositoryDeploymentDefault(
  analysis: SourceRepositoryAnalysisResult
): RepositoryDeploymentType {
  if (analysis.aiHandoff?.deploymentTypeDefault) {
    return analysis.aiHandoff.deploymentTypeDefault;
  }

  const signals = new Set(analysis.detectedSignals);
  if (signals.has("Container")) return "container";
  if (signals.has("Serverless") || signals.has("Lambda")) return "serverless";
  if (signals.has("EC2") || signals.has("VM")) return "ec2_vm";
  if (signals.has("React") && !signals.has("Node API") && !signals.has("Python API")) return "serverless";
  return "ec2_vm";
}

export function shouldAskPublicRepositoryDeploymentType(
  analysis: SourceRepositoryAnalysisResult
): boolean {
  const signals = new Set(analysis.detectedSignals);
  const hasExplicitDeploymentSignal = ["Container", "Serverless", "Lambda", "EC2", "VM"]
    .some((signal) => signals.has(signal));
  const isStaticFrontend = analysis.recommendedTemplateId === "static-web-hosting"
    && signals.has("React")
    && !signals.has("Node API")
    && !signals.has("Python API");

  return !hasExplicitDeploymentSignal && !isStaticFrontend;
}

export function getPublicRepositoryTemplateDeploymentType(
  templateId: PublicRepositoryTemplateId
): RepositoryDeploymentType {
  if (templateId === "ecs-fargate-container-app" || templateId === "eks-container-app") {
    return "container";
  }

  if (
    templateId === "full-serverless-web-app"
    || templateId === "minimal-serverless-api"
    || templateId === "static-web-hosting"
  ) {
    return "serverless";
  }

  return "ec2_vm";
}

function createPublicRepositoryTemplateCandidates(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
}): readonly PublicRepositoryTemplateCandidate[] {
  const backendCandidates = input.analysis.aiHandoff?.recommendation?.candidates;

  if (backendCandidates && backendCandidates.length > 0) {
    return backendCandidates
      .map((candidate) => ({
        ...candidate,
        displayTitle: formatPublicRepositoryTemplate(candidate.templateId),
        questions: candidate.questions?.map(localizePublicRepositoryQuestion)
      }))
      .slice(0, 3);
  }

  const signals = new Set(input.analysis.detectedSignals);
  const candidateIds = new Set<PublicRepositoryTemplateId>();
  const primaryTemplateId = selectPrimaryTemplateId(input);

  candidateIds.add(primaryTemplateId);

  if (signals.has("Container")) {
    candidateIds.add("ecs-fargate-container-app");
  }

  if (signals.has("React") && (signals.has("Node API") || signals.has("Python API"))) {
    candidateIds.add("three-tier-web-app");
    candidateIds.add("full-serverless-web-app");
  }

  if (signals.has("React") && !signals.has("Database")) {
    candidateIds.add("static-web-hosting");
  }

  if (signals.has("Node API") || signals.has("Python API")) {
    candidateIds.add("minimal-serverless-api");
  }

  const comparisonCandidates: Readonly<Record<RepositoryDeploymentType, readonly PublicRepositoryTemplateId[]>> = {
    container: ["ecs-fargate-container-app", "eks-container-app"],
    ec2_vm: ["three-tier-web-app", "ecs-fargate-container-app"],
    serverless: ["full-serverless-web-app", "minimal-serverless-api"]
  };

  for (const templateId of comparisonCandidates[input.deploymentType]) {
    candidateIds.add(templateId);
  }

  return [...candidateIds]
    .map((templateId) => {
      const candidate = createCandidate(templateId, signals, input.deploymentType, input.answers);
      return templateId === primaryTemplateId
        ? { ...candidate, confidence: Math.min(candidate.confidence + 0.08, 0.96) }
        : candidate;
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}


function createPublicRepositoryHandoffQuestions(
  analysis: SourceRepositoryAnalysisResult
): readonly PublicRepositoryQuestion[] {
  return (analysis.aiHandoff?.questions ?? [])
    .map(localizePublicRepositoryQuestion)
    .slice(0, 5);
}

export function localizePublicRepositoryQuestion(question: PublicRepositoryQuestion): PublicRepositoryQuestion {
  const localized = KOREAN_QUESTION_COPY[question.id];

  if (!localized) return question;

  const allowedOptionValues = new Set(question.options?.map((option) => option.value) ?? []);
  const localizedOptions = localized.options?.filter(
    (option) => allowedOptionValues.size === 0 || allowedOptionValues.has(option.value)
  );

  return {
    ...question,
    prompt: localized.prompt,
    ...(localizedOptions && localizedOptions.length > 0 ? { options: localizedOptions } : {})
  };
}

function createPublicRepositoryQuestions(
  analysis: SourceRepositoryAnalysisResult,
  templateId: PublicRepositoryTemplateId
): readonly PublicRepositoryQuestion[] {
  const signals = new Set(analysis.detectedSignals);
  const questions: PublicRepositoryQuestion[] = [];
  const supportsRuntimeChoice = [
    "three-tier-web-app",
    "full-serverless-web-app",
    "minimal-serverless-api"
  ].includes(templateId);
  const supportsFrontendChoice = [
    "ecs-fargate-container-app",
    "three-tier-web-app"
  ].includes(templateId);
  const supportsDatabaseChoice = templateId !== "static-web-hosting";

  if (supportsRuntimeChoice && signals.has("Node API") && signals.has("Python API")) {
    questions.push({
      answerType: "single_select",
      id: "primary_runtime",
      options: [
        { label: "Node API 우선", value: "node" },
        { label: "Python API 우선", value: "python" },
        { label: "두 API 모두 포함", value: "both" }
      ],
      prompt: "아키텍처에서 우선할 API 런타임을 선택해주세요."
    });
  }

  if (supportsFrontendChoice && signals.has("React")) {
    questions.push({
      answerType: "boolean",
      id: "include_frontend",
      prompt: "감지된 React 웹 프론트엔드를 이 아키텍처에 포함할까요?"
    });
  }

  if (supportsDatabaseChoice && signals.has("Database")) {
    questions.push({
      answerType: "boolean",
      id: "include_database",
      prompt: "감지된 데이터베이스 계층을 이 아키텍처에 포함할까요?"
    });
  }

  return questions.slice(0, 5);
}

function selectPrimaryTemplateId(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
}): PublicRepositoryTemplateId {
  if (input.analysis.recommendedTemplateId === "static-web-hosting") {
    return "static-web-hosting";
  }

  if (input.deploymentType === "container") {
    return input.answers.container_runtime === "eks" ? "eks-container-app" : "ecs-fargate-container-app";
  }

  if (input.deploymentType === "serverless") {
    return input.answers.include_frontend === false || input.answers.include_database === false
      ? "minimal-serverless-api"
      : "full-serverless-web-app";
  }

  return "three-tier-web-app";
}

function createCandidate(
  templateId: PublicRepositoryTemplateId,
  signals: ReadonlySet<string>,
  deploymentType: RepositoryDeploymentType,
  answers: Record<string, string | boolean>
): PublicRepositoryTemplateCandidate {
  const reasons: string[] = [];
  const tradeoffs: string[] = [];
  let confidence = 0.62;

  if (templateId === "three-tier-web-app") {
    confidence += deploymentType === "ec2_vm" ? 0.18 : 0.03;
    if (signals.has("Database")) confidence += 0.08;
    reasons.push("웹, 애플리케이션, 데이터 계층을 분리해 각각의 네트워크와 확장 경계를 명확히 할 수 있습니다.");
    if (signals.has("React")) reasons.push("프론트엔드와 API를 웹·애플리케이션 계층으로 분리해 배치할 수 있습니다.");
    if (signals.has("Database")) reasons.push("감지된 데이터베이스를 private data tier로 분리할 수 있습니다.");
    tradeoffs.push("컨테이너 배포 근거는 ECS/EKS 후보보다 직접적으로 반영되지 않습니다.");
    tradeoffs.push("EC2 패치, Auto Scaling, ALB와 RDS의 상시 비용을 함께 운영해야 합니다.");
  }

  if (templateId === "ecs-fargate-container-app") {
    confidence += signals.has("Container") ? 0.2 : 0.02;
    confidence += deploymentType === "container" ? 0.1 : 0;
    reasons.push("Docker와 Compose 근거를 ECS Task와 Service 경계로 직접 옮길 수 있습니다.");
    if (signals.has("Database")) reasons.push("API와 데이터베이스를 별도 관리형 리소스로 분리할 수 있습니다.");
    tradeoffs.push("Kubernetes 이식성과 세밀한 오케스트레이션이 필요하면 EKS가 더 적합할 수 있습니다.");
    tradeoffs.push("ALB와 Fargate의 기본 비용, Task 네트워크와 상태 확인 설정을 검증해야 합니다.");
  }

  if (templateId === "eks-container-app") {
    confidence += answers.container_runtime === "eks" ? 0.24 : 0.02;
    reasons.push("여러 컨테이너를 Kubernetes 워크로드로 분리하고 독립적으로 확장할 수 있습니다.");
    tradeoffs.push("초기 클러스터와 Kubernetes 오브젝트 운영 복잡도가 ECS Fargate보다 높습니다.");
    tradeoffs.push("EKS 제어 영역과 애드온의 고정 비용, 업그레이드 책임을 검토해야 합니다.");
  }

  if (templateId === "full-serverless-web-app") {
    confidence += deploymentType === "serverless" ? 0.14 : 0;
    if (signals.has("React")) confidence += 0.06;
    reasons.push("프론트엔드, API, 인증과 데이터 저장소를 관리형 서버리스 서비스로 연결할 수 있습니다.");
    tradeoffs.push("컨테이너 이미지 기반 배포 흐름은 직접 반영되지 않습니다.");
    tradeoffs.push("Lambda 콜드 스타트와 실행 제한, 분산 로그 추적 방식을 확인해야 합니다.");
  }

  if (templateId === "minimal-serverless-api") {
    confidence += deploymentType === "serverless" ? 0.08 : 0;
    reasons.push("API 중심 Application Unit을 API Gateway와 Lambda의 작은 범위로 시작하기 적합합니다.");
    tradeoffs.push("프론트엔드와 데이터베이스 계층을 제외하면 저장소 전체 구조를 모두 반영하지 못합니다.");
    tradeoffs.push("지속 부하나 장시간 작업에서는 Lambda 실행 제한과 요청당 비용을 비교해야 합니다.");
  }

  if (templateId === "static-web-hosting") {
    confidence += signals.has("React") && !signals.has("Database") ? 0.16 : 0;
    reasons.push("정적 프론트엔드 산출물을 S3와 CloudFront로 배포하는 흐름에 적합합니다.");
    tradeoffs.push("백엔드 API나 데이터베이스 근거가 있으면 별도 런타임을 보강해야 합니다.");
    tradeoffs.push("CloudFront 캐시 무효화와 정적 빌드 산출물의 CI/CD 배포 절차를 정의해야 합니다.");
  }

  reasons.push(
    `감지된 ${[...signals].join(", ") || "제한된 저장소"} 근거를 ${formatPublicRepositoryTemplate(templateId)}의 리소스 범위와 비교했습니다.`
  );
  tradeoffs.push("실제 트래픽, 가용성 목표와 비용 한도는 저장소만으로 확정할 수 없어 배포 전 검증이 필요합니다.");

  return {
    confidence: Math.min(confidence, 0.96),
    displayTitle: formatPublicRepositoryTemplate(templateId),
    reasons: [...new Set(reasons)].slice(0, 4),
    templateId,
    tradeoffs: [...new Set(tradeoffs)].slice(0, 4)
  };
}

function createFollowUpAnswerConstraint(
  questionId: string,
  value: string | boolean
): string | null {
  const normalizedQuestionId = questionId.replaceAll("_", "-");
  const normalizedValue = typeof value === "string" ? value.replaceAll("_", "-") : value;

  if (normalizedQuestionId === "data-persistence") {
    if (normalizedValue === "none" || normalizedValue === false) return "Do not add a persistent data store.";
    if (normalizedValue === "relational" || normalizedValue === true) {
      return "Include a managed relational database such as RDS and connect the backend workload to it.";
    }
    if (normalizedValue === "key-value") return "Include a managed key-value or document database.";
  }

  if (normalizedQuestionId === "application-scope") {
    if (normalizedValue === "web") return "Include the public web frontend scope only.";
    if (normalizedValue === "api") return "Include the API backend scope and omit a public web frontend.";
    if (normalizedValue === "web-and-api") return "Include both a public web frontend and an API backend.";
  }

  if (normalizedQuestionId === "operations-preference") {
    if (normalizedValue === "managed") return "Prefer managed services where compatible with the selected Template.";
    if (normalizedValue === "container") return "Prefer a managed container runtime within the selected Template.";
    if (normalizedValue === "self-managed-vm" || normalizedValue === "ec2") {
      return "The user prefers direct host operations, but this is advisory: preserve the selected Template core and record incompatible operational preferences as an assumption.";
    }
  }

  if (normalizedQuestionId === "include-database") {
    return value === true ? "Include the database tier." : "Do not include a database tier.";
  }

  if (normalizedQuestionId === "include-frontend") {
    return value === true ? "Include the frontend tier." : "Do not include the frontend tier.";
  }

  if (normalizedQuestionId === "primary-runtime" && typeof value === "string") {
    return `Use ${value} as the primary application runtime.`;
  }

  return null;
}
