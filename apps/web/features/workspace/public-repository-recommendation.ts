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
  const dynamicQuestionAnswers = answerEntries.flatMap(([questionId, value]) => {
    const question = questionById.get(questionId);
    if (!question) return [];

    return [{
      questionId,
      question: question.prompt,
      answer: String(value)
    }];
  });
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
    ...(dynamicQuestionAnswers.length > 0 ? { dynamicQuestionAnswers } : {}),
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
        questions: candidate.questions?.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          answerType: question.answerType,
          ...(question.options ? { options: question.options } : {})
        }))
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
    .map((question) => ({
      id: question.id,
      prompt: question.prompt,
      answerType: question.answerType,
      ...(question.options ? { options: question.options } : {})
    }))
    .slice(0, 5);
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
        { label: "Node API 以묒떖", value: "node" },
        { label: "Python API 以묒떖", value: "python" },
        { label: "?????ы븿", value: "both" }
      ],
      prompt: "?대뼡 API ?고??꾩쓣 ?꾪궎?띿쿂???ы븿?좉퉴??"
    });
  }

  if (supportsFrontendChoice && signals.has("React")) {
    questions.push({
      answerType: "boolean",
      id: "include_frontend",
      prompt: "媛먯???React ?꾨줎?몄뿏?쒕? ???쒗뵆由우뿉 ?ы븿?좉퉴??"
    });
  }

  if (supportsDatabaseChoice && signals.has("Database")) {
    questions.push({
      answerType: "boolean",
      id: "include_database",
      prompt: "媛먯????곗씠?곕쿋?댁뒪 怨꾩링?????쒗뵆由우뿉 ?ы븿?좉퉴??"
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
    if (signals.has("React")) reasons.push("?꾨줎?몄뿏?쒖? API瑜?遺꾨━??諛곗튂?섍린 醫뗭뒿?덈떎.");
    if (signals.has("Database")) reasons.push("DB 怨꾩링??private tier濡?遺꾨━?????덉뒿?덈떎.");
    tradeoffs.push("而⑦뀒?대꼫 ?댁쁺 ?좏샇??ECS/EKS ?꾨낫蹂대떎 ??吏곸젒?곸쑝濡?諛섏쁺?⑸땲??");
  }

  if (templateId === "ecs-fargate-container-app") {
    confidence += signals.has("Container") ? 0.2 : 0.02;
    confidence += deploymentType === "container" ? 0.1 : 0;
    reasons.push("Docker/Compose ?좏샇瑜?而⑦뀒?대꼫 ?쒕퉬?ㅻ줈 ?먯뿰?ㅻ읇寃???만 ???덉뒿?덈떎.");
    if (signals.has("Database")) reasons.push("API? DB瑜?蹂꾨룄 愿由?由ъ냼?ㅻ줈 遺꾨━?????덉뒿?덈떎.");
    tradeoffs.push("Kubernetes ?몃? ?ㅼ젙???꾩슂?섎㈃ EKS ?꾨낫媛 ???곹빀?⑸땲??");
  }

  if (templateId === "eks-container-app") {
    confidence += answers.container_runtime === "eks" ? 0.24 : 0.02;
    reasons.push("Kubernetes ?댁쁺???꾩젣濡??????뺤옣?깆씠 醫뗭뒿?덈떎.");
    tradeoffs.push("珥덇린 ?댁쁺 蹂듭옟?꾧? ECS Fargate蹂대떎 ?믪뒿?덈떎.");
  }

  if (templateId === "full-serverless-web-app") {
    confidence += deploymentType === "serverless" ? 0.14 : 0;
    if (signals.has("React")) confidence += 0.06;
    reasons.push("?꾨줎?몄뿏?? API, ?곗씠????μ냼瑜?愿由ы삎 ?쒕퉬??以묒떖?쇰줈 援ъ꽦?⑸땲??");
    tradeoffs.push("而⑦뀒?대꼫 ?대?吏 湲곕컲 諛고룷 ?먮쫫? 吏곸젒 諛섏쁺?섏? ?딆뒿?덈떎.");
  }

  if (templateId === "minimal-serverless-api") {
    confidence += deploymentType === "serverless" ? 0.08 : 0;
    reasons.push("API 以묒떖?쇰줈 ?묎쾶 ?쒖옉?????곹빀?⑸땲??");
    tradeoffs.push("?꾨줎?몄뿏?쒖? DB 怨꾩링???쒖쇅?섎㈃ repository ?꾩껜 援ъ“瑜???諛섏쁺?⑸땲??");
  }

  if (templateId === "static-web-hosting") {
    confidence += signals.has("React") && !signals.has("Database") ? 0.16 : 0;
    reasons.push("?뺤쟻 ?꾨줎?몄뿏??諛고룷???곹빀?⑸땲??");
    tradeoffs.push("諛깆뿏??API? DB ?좏샇媛 ?덉쑝硫?蹂꾨룄 由ъ냼??蹂닿컯???꾩슂?⑸땲??");
  }

  if (reasons.length === 0) {
    reasons.push("??μ냼 洹쇨굅媛 遺議깊빐 ?좏깮??諛고룷 諛⑹떇??留욌뒗 鍮꾧탳 ?꾨낫濡??쒖떆?⑸땲??");
  }

  if (tradeoffs.length === 0) {
    tradeoffs.push("異붽? Repository evidence??follow-up ?듬????곕씪 援ъ꽦???ㅼ떆 議곗젙?댁빞 ?⑸땲??");
  }

  return {
    confidence: Math.min(confidence, 0.96),
    displayTitle: formatPublicRepositoryTemplate(templateId),
    reasons,
    templateId,
    tradeoffs
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
