import type {
  ArchitectureJson,
  DiagramJson,
  RepositoryDeploymentType,
  SourceRepositoryAnalysisResult,
  ResourceType
} from "@sketchcatch/types";
import type { TemplateId } from "../../../../packages/types/src/template-definitions";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";

export type PublicRepositoryTemplateId = TemplateId;

export type PublicRepositoryQuestion = {
  readonly id: string;
  readonly prompt: string;
  readonly answerType: "boolean" | "single_select";
  readonly options?: readonly { readonly value: string; readonly label: string }[];
};

export type PublicRepositoryTemplateCandidate = {
  readonly templateId: TemplateId;
  readonly displayTitle: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly tradeoffs: readonly string[];
};

export type PublicRepositoryRecommendation = {
  readonly candidates: readonly PublicRepositoryTemplateCandidate[];
  readonly questions: readonly PublicRepositoryQuestion[];
};

const TEMPLATE_LABELS: Readonly<Record<TemplateId, string>> = {
  "ecs-fargate-container-app": "ECS Fargate 컨테이너 앱",
  "eks-container-app": "EKS 컨테이너 앱",
  "full-serverless-web-app": "전체 서버리스 웹 앱",
  "minimal-serverless-api": "최소 서버리스 API",
  "static-web-hosting": "정적 웹사이트",
  "three-tier-web-app": "3계층 웹 서비스"
};

export function createPublicRepositoryRecommendation(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
  readonly selectedTemplateId?: TemplateId | null;
}): PublicRepositoryRecommendation {
  const candidates = createPublicRepositoryTemplateCandidates(input);
  const selectedTemplateId = input.selectedTemplateId ?? candidates[0]?.templateId;
  return {
    candidates,
    questions: selectedTemplateId
      ? createPublicRepositoryQuestions(input.analysis, selectedTemplateId)
      : []
  };
}

export function createPublicRepositoryDiagram(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
  readonly projectName: string;
  readonly templateId: TemplateId;
  readonly usesCiCd: boolean;
}): DiagramJson {
  return convertArchitectureJsonToDiagramJson(
    createPublicRepositoryArchitecture({
      analysis: input.analysis,
      answers: input.answers,
      deploymentType: input.deploymentType,
      templateId: input.templateId,
      usesCiCd: input.usesCiCd
    })
  );
}

export function formatPublicRepositoryTemplate(templateId: string): string {
  return TEMPLATE_LABELS[templateId as TemplateId] ?? "맞는 템플릿 없음";
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
  const isStaticFrontend = analysis.recommendedTemplateId === "template-static-website"
    && signals.has("React")
    && !signals.has("Node API")
    && !signals.has("Python API");

  return !hasExplicitDeploymentSignal && !isStaticFrontend;
}

export function getPublicRepositoryTemplateDeploymentType(
  templateId: TemplateId
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
    return backendCandidates;
  }

  const signals = new Set(input.analysis.detectedSignals);
  const candidateIds = new Set<TemplateId>();
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

  return [...candidateIds]
    .map((templateId) => {
      const candidate = createCandidate(templateId, signals, input.deploymentType, input.answers);
      return templateId === primaryTemplateId
        ? { ...candidate, confidence: Math.min(candidate.confidence + 0.08, 0.96) }
        : candidate;
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4);
}

function createPublicRepositoryQuestions(
  analysis: SourceRepositoryAnalysisResult,
  templateId: TemplateId
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
        { label: "Node API 중심", value: "node" },
        { label: "Python API 중심", value: "python" },
        { label: "둘 다 포함", value: "both" }
      ],
      prompt: "어떤 API 런타임을 아키텍처에 포함할까요?"
    });
  }

  if (supportsFrontendChoice && signals.has("React")) {
    questions.push({
      answerType: "boolean",
      id: "include_frontend",
      prompt: "감지된 React 프론트엔드를 이 템플릿에 포함할까요?"
    });
  }

  if (supportsDatabaseChoice && signals.has("Database")) {
    questions.push({
      answerType: "boolean",
      id: "include_database",
      prompt: "감지된 데이터베이스 계층을 이 템플릿에 포함할까요?"
    });
  }

  return questions.slice(0, 5);
}

function selectPrimaryTemplateId(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
}): TemplateId {
  if (input.analysis.recommendedTemplateId === "template-static-website") {
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
  templateId: TemplateId,
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
    if (signals.has("React")) reasons.push("프론트엔드와 API를 분리해 배치하기 좋습니다.");
    if (signals.has("Database")) reasons.push("DB 계층을 private tier로 분리할 수 있습니다.");
    tradeoffs.push("컨테이너 운영 신호는 ECS/EKS 후보보다 덜 직접적으로 반영됩니다.");
  }

  if (templateId === "ecs-fargate-container-app") {
    confidence += signals.has("Container") ? 0.2 : 0.02;
    confidence += deploymentType === "container" ? 0.1 : 0;
    reasons.push("Docker/Compose 신호를 컨테이너 서비스로 자연스럽게 옮길 수 있습니다.");
    if (signals.has("Database")) reasons.push("API와 DB를 별도 관리 리소스로 분리할 수 있습니다.");
    tradeoffs.push("Kubernetes 세부 설정이 필요하면 EKS 후보가 더 적합합니다.");
  }

  if (templateId === "eks-container-app") {
    confidence += answers.container_runtime === "eks" ? 0.24 : 0.02;
    reasons.push("Kubernetes 운영을 전제로 할 때 확장성이 좋습니다.");
    tradeoffs.push("초기 운영 복잡도가 ECS Fargate보다 높습니다.");
  }

  if (templateId === "full-serverless-web-app") {
    confidence += deploymentType === "serverless" ? 0.14 : 0;
    if (signals.has("React")) confidence += 0.06;
    reasons.push("프론트엔드, API, 데이터 저장소를 관리형 서비스 중심으로 구성합니다.");
    tradeoffs.push("컨테이너 이미지 기반 배포 흐름은 직접 반영하지 않습니다.");
  }

  if (templateId === "minimal-serverless-api") {
    confidence += deploymentType === "serverless" ? 0.08 : 0;
    reasons.push("API 중심으로 작게 시작할 때 적합합니다.");
    tradeoffs.push("프론트엔드와 DB 계층을 제외하면 repository 전체 구조를 덜 반영합니다.");
  }

  if (templateId === "static-web-hosting") {
    confidence += signals.has("React") && !signals.has("Database") ? 0.16 : 0;
    reasons.push("정적 프론트엔드 배포에 적합합니다.");
    tradeoffs.push("백엔드 API와 DB 신호가 있으면 별도 리소스 보강이 필요합니다.");
  }

  return {
    confidence: Math.min(confidence, 0.96),
    displayTitle: TEMPLATE_LABELS[templateId],
    reasons,
    templateId,
    tradeoffs
  };
}

function createPublicRepositoryArchitecture(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly answers: Record<string, string | boolean>;
  readonly deploymentType: RepositoryDeploymentType;
  readonly templateId: TemplateId;
  readonly usesCiCd: boolean;
}): ArchitectureJson {
  const signals = new Set(input.analysis.detectedSignals);
  const includeFrontend = signals.has("React") && input.answers.include_frontend !== false;
  const includeDatabase = signals.has("Database") && input.answers.include_database !== false;
  const includeNodeApi = signals.has("Node API") && input.answers.primary_runtime !== "python";
  const includePythonApi = signals.has("Python API") && input.answers.primary_runtime !== "node";
  const nodes: ArchitectureJson["nodes"] = [];
  const edges: ArchitectureJson["edges"] = [];

  const addNode = createNodeAdder(nodes);
  const addEdge = createEdgeAdder(edges);

  if (input.templateId === "static-web-hosting") {
    if (includeFrontend) {
      addNode("frontend", "S3", "React 정적 사이트", 260, 180);
      addNode("cdn", "CLOUDFRONT", "CloudFront", 520, 180);
      addEdge("frontend-cdn", "cdn", "frontend", "origin");
    }
    if (includeNodeApi || includePythonApi) {
      addNode("api", "LAMBDA", includePythonApi ? "Python API" : "Node API", 520, 360);
      addEdge("cdn-api", "cdn", "api", "API 요청");
    }
  } else if (input.templateId === "full-serverless-web-app" || input.templateId === "minimal-serverless-api") {
    if (includeFrontend && input.templateId === "full-serverless-web-app") {
      addNode("frontend", "AMPLIFY_APP", "React 프론트엔드", 160, 180);
    }
    addNode("api", "API_GATEWAY_REST_API", "API Gateway", 420, 180);
    if (includeNodeApi) addNode("node-api", "LAMBDA", "Node API", 680, 120);
    if (includePythonApi) addNode("python-api", "LAMBDA", "Python API", 680, 260);
    if (includeDatabase) addNode("table", "DYNAMODB_TABLE", "애플리케이션 데이터", 940, 180);
    if (includeFrontend && input.templateId === "full-serverless-web-app") addEdge("frontend-api", "frontend", "api", "호출");
    if (includeNodeApi) addEdge("api-node", "api", "node-api", "invoke");
    if (includePythonApi) addEdge("api-python", "api", "python-api", "invoke");
    if (includeDatabase) {
      if (includeNodeApi) addEdge("node-data", "node-api", "table", "읽기/쓰기");
      if (includePythonApi) addEdge("python-data", "python-api", "table", "읽기/쓰기");
    }
  } else if (input.templateId === "ecs-fargate-container-app") {
    addNode("vpc", "VPC", "서비스 VPC", 360, 80);
    addNode("alb", "LOAD_BALANCER", "애플리케이션 로드 밸런서", 180, 260);
    addNode("cluster", "ECS_CLUSTER", "ECS 클러스터", 460, 260);
    addNode("service", "ECS_SERVICE", "Fargate 서비스", 720, 260);
    addNode("task", "ECS_TASK_DEFINITION", "앱 컨테이너 태스크", 980, 260);
    addEdge("alb-service", "alb", "service", "트래픽");
    addEdge("service-task", "service", "task", "실행");
    if (includeFrontend) {
      addNode("frontend", "S3", "React 정적 사이트", 180, 460);
      addNode("cdn", "CLOUDFRONT", "CloudFront", 460, 460);
      addEdge("cdn-frontend", "cdn", "frontend", "origin");
      addEdge("cdn-alb", "cdn", "alb", "API 요청");
    }
    if (includeDatabase) {
      addNode("db", "RDS", "RDS 데이터베이스", 980, 460);
      addEdge("task-db", "task", "db", "읽기/쓰기");
    }
  } else if (input.templateId === "eks-container-app") {
    addNode("vpc", "VPC", "서비스 VPC", 320, 80);
    addNode("cluster", "EKS_CLUSTER", "EKS 클러스터", 360, 260);
    addNode("namespace", "KUBERNETES_NAMESPACE", "앱 Namespace", 620, 220);
    addNode("deployment", "KUBERNETES_DEPLOYMENT", "API Deployment", 860, 220);
    addNode("service", "KUBERNETES_SERVICE", "Service", 860, 380);
    addEdge("cluster-ns", "cluster", "namespace", "hosts");
    addEdge("ns-deployment", "namespace", "deployment", "contains");
    addEdge("deployment-service", "deployment", "service", "exposes");
    if (includeDatabase) {
      addNode("db", "RDS", "RDS 데이터베이스", 1120, 300);
      addEdge("service-db", "service", "db", "읽기/쓰기");
    }
  } else {
    addNode("vpc", "VPC", "서비스 VPC", 360, 80);
    addNode("alb", "LOAD_BALANCER", "애플리케이션 로드 밸런서", 180, 260);
    addNode("asg", "AUTO_SCALING_GROUP", "API Auto Scaling 그룹", 460, 260);
    addNode("ec2", "EC2", createEc2Label(includeNodeApi, includePythonApi), 720, 260);
    addEdge("alb-asg", "alb", "asg", "트래픽");
    addEdge("asg-ec2", "asg", "ec2", "실행");
    if (includeFrontend) {
      addNode("frontend", "S3", "React 정적 사이트", 180, 460);
      addNode("cdn", "CLOUDFRONT", "CloudFront", 460, 460);
      addEdge("cdn-frontend", "cdn", "frontend", "origin");
      addEdge("cdn-alb", "cdn", "alb", "API 요청");
    }
    if (includeDatabase) {
      addNode("db", "RDS", "RDS 데이터베이스", 980, 260);
      addEdge("ec2-db", "ec2", "db", "읽기/쓰기");
    }
  }

  if (input.usesCiCd) {
    addNode("pipeline", "CODEPIPELINE", "CI/CD 파이프라인", 180, 640);
    const deployTarget = nodes.find((node) =>
      ["ECS_SERVICE", "KUBERNETES_DEPLOYMENT", "AUTO_SCALING_GROUP", "LAMBDA", "AMPLIFY_APP"].includes(node.type)
    );
    if (deployTarget) addEdge("pipeline-deploy", "pipeline", deployTarget.id, "배포");
  }

  return { edges, nodes };
}

function createEc2Label(includeNodeApi: boolean, includePythonApi: boolean): string {
  if (includeNodeApi && includePythonApi) return "Node + Python API";
  if (includePythonApi) return "Python API";
  return "Node API";
}

function createNodeAdder(nodes: ArchitectureJson["nodes"]) {
  return (id: string, type: ResourceType, label: string, positionX: number, positionY: number): void => {
    nodes.push({ config: {}, id, label, positionX, positionY, type });
  };
}

function createEdgeAdder(edges: ArchitectureJson["edges"]) {
  return (id: string, sourceId: string, targetId: string, label: string): void => {
    edges.push({ id, label, sourceId, targetId });
  };
}
