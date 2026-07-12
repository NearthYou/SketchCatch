import type {
  RepositoryAnalysisTemplateId,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

export type RepositoryEvidenceFile = {
  readonly content: string;
  readonly path: string;
};

type RepositorySignalRule = {
  readonly label: string;
  readonly patterns: readonly string[];
};

const SIGNAL_RULES: readonly RepositorySignalRule[] = [
  { label: "React", patterns: ["react", "vite", "next"] },
  { label: "Node API", patterns: ["express", "fastify", "nestjs", "@nestjs"] },
  { label: "Python API", patterns: ["fastapi", "uvicorn", "django", "flask"] },
  { label: "Database", patterns: ["prisma", "typeorm", "sequelize", "postgres", "mysql"] },
  { label: "Container", patterns: ["dockerfile", "docker-compose", "services:"] },
  { label: "Auto Scaling", patterns: ["autoscaling", "auto scaling", "load balancer", "alb"] }
];

export function analyzeRepositoryEvidence({
  defaultBranch,
  evidence,
  repositoryUrl
}: {
  readonly defaultBranch: string;
  readonly evidence: readonly RepositoryEvidenceFile[];
  readonly repositoryUrl: string;
}): SourceRepositoryAnalysisResult {
  const combinedEvidence = evidence.map((file) => `${file.path}\n${file.content}`).join("\n").toLowerCase();
  const detectedSignals = SIGNAL_RULES.filter((rule) =>
    rule.patterns.some((pattern) => combinedEvidence.includes(pattern))
  ).map((rule) => rule.label);
  const recommendedTemplateId = selectRepositoryTemplate(detectedSignals);

  return {
    defaultBranch,
    detectedSignals,
    evidenceFiles: evidence
      .map((file) => ({ found: true, path: file.path }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    recommendationReason: getRecommendationReason(recommendedTemplateId, detectedSignals),
    recommendedTemplateId,
    repositoryUrl
  };
}

function selectRepositoryTemplate(
  signals: readonly string[]
): RepositoryAnalysisTemplateId | null {
  if (signals.includes("Auto Scaling")) {
    return "template-3tier";
  }

  if (signals.includes("Database") || signals.includes("Node API") || signals.includes("Python API")) {
    return "template-api-db";
  }

  if (signals.includes("React")) {
    return "template-static-website";
  }

  return null;
}

function getRecommendationReason(
  templateId: RepositoryAnalysisTemplateId | null,
  signals: readonly string[]
): string {
  if (templateId === null) {
    return "판단할 근거가 부족합니다. Repository 구조에 맞는 Template을 직접 선택해주세요.";
  }

  return `${signals.join(", ")} 근거를 바탕으로 가장 가까운 Template을 추천했습니다.`;
}
