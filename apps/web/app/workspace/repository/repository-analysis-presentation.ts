import type {
  RepositoryAnalysisAiHandoff,
  RepositoryArchitectureFact,
  RepositoryEvidenceKind,
  SourceRepository,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

export type RepositoryEvidenceSummaryItem = {
  label: string;
  value: string;
};

const ARCHITECTURE_FACT_PRESENTATION: Readonly<
  Record<string, RepositoryEvidenceSummaryItem>
> = {
  "backend_runtime:ecs_fargate_service": {
    label: "실행 방식",
    value: "ECS Fargate Service"
  },
  "frontend_delivery:s3_cloudfront_static": {
    label: "프론트엔드",
    value: "S3 · CloudFront"
  },
  "traffic_entry:application_load_balancer": {
    label: "공개 진입점",
    value: "Application Load Balancer"
  },
  "runtime_scale:autoscaling_1_3": {
    label: "확장",
    value: "1–3개 Task 자동 확장"
  },
  "runtime_scale:single_task": {
    label: "확장",
    value: "단일 Task"
  },
  "container_registry:ecr": {
    label: "이미지 저장소",
    value: "Amazon ECR"
  },
  "observability:cloudwatch": {
    label: "관측",
    value: "Amazon CloudWatch"
  },
  "ci_cd:github_actions": {
    label: "배포",
    value: "GitHub Actions"
  }
};

const SIGNAL_PRESENTATION: Readonly<Record<string, RepositoryEvidenceSummaryItem>> = {
  Container: { label: "실행 방식", value: "Container" },
  Serverless: { label: "실행 방식", value: "Serverless" },
  "Node API": { label: "백엔드", value: "Node.js API" },
  "Python API": { label: "백엔드", value: "Python API" },
  React: { label: "프론트엔드", value: "React" },
  "Next.js": { label: "프론트엔드", value: "Next.js" },
  Vite: { label: "프론트엔드", value: "Vite" },
  NestJS: { label: "백엔드", value: "Node.js API" },
  Fastify: { label: "백엔드", value: "Node.js API" },
  Express: { label: "백엔드", value: "Node.js API" },
  "Serverless Framework": { label: "실행 방식", value: "Serverless" },
  Database: { label: "데이터", value: "Database" },
  Redis: { label: "데이터", value: "Redis" }
};

const EVIDENCE_KIND_PRESENTATION: Readonly<
  Partial<Record<RepositoryEvidenceKind, RepositoryEvidenceSummaryItem>>
> = {
  dockerfile: { label: "실행 방식", value: "Dockerfile" },
  static_output: { label: "빌드 결과", value: "정적 웹 빌드" }
};

function getAiHandoff(
  source: SourceRepositoryAnalysisResult | SourceRepository
): RepositoryAnalysisAiHandoff | undefined {
  if ("analysis" in source) {
    return source.analysis?.aiHandoff;
  }

  return source.aiHandoff;
}

function getArchitectureFacts(
  source: SourceRepositoryAnalysisResult | SourceRepository
): readonly RepositoryArchitectureFact[] {
  return getAiHandoff(source)?.architectureFacts ?? [];
}

export function createRepositoryEvidenceSummary(
  source: SourceRepositoryAnalysisResult | SourceRepository
): RepositoryEvidenceSummaryItem[] {
  const mappedFacts = getArchitectureFacts(source)
    .map((fact) => ARCHITECTURE_FACT_PRESENTATION[`${fact.kind}:${fact.value}`])
    .filter((item): item is RepositoryEvidenceSummaryItem => Boolean(item));
  const mappedSignals =
    "detectedSignals" in source
      ? source.detectedSignals
          .map((signal) => SIGNAL_PRESENTATION[signal])
          .filter((item): item is RepositoryEvidenceSummaryItem => Boolean(item))
      : [];
  const mappedEvidence = (getAiHandoff(source)?.evidence ?? []).flatMap((evidence) => {
    const kindPresentation = EVIDENCE_KIND_PRESENTATION[evidence.kind];

    return [
      ...evidence.signals
        .map((signal) => SIGNAL_PRESENTATION[signal])
        .filter((item): item is RepositoryEvidenceSummaryItem => Boolean(item)),
      ...(kindPresentation ? [kindPresentation] : [])
    ];
  });
  const seenLabels = new Set<string>();

  return [...mappedFacts, ...mappedSignals, ...mappedEvidence]
    .filter((item) => {
      if (seenLabels.has(item.label)) {
        return false;
      }
      seenLabels.add(item.label);
      return true;
    })
    .slice(0, 4);
}

export function getRepositoryDisplayIdentity(
  source: SourceRepositoryAnalysisResult | SourceRepository
): {
  branch: string;
  name: string;
  owner: string;
} {
  if ("owner" in source) {
    return {
      branch: source.defaultBranch,
      name: source.name,
      owner: source.owner
    };
  }

  const parsedUrl = parseRepositoryUrl(source.repositoryUrl);

  return {
    branch: source.defaultBranch,
    name: parsedUrl.name,
    owner: parsedUrl.owner
  };
}

function parseRepositoryUrl(repositoryUrl: string): {
  name: string;
  owner: string;
} {
  try {
    const pathname = new URL(repositoryUrl).pathname.replace(/\/+$/, "");
    const [owner = "GitHub", rawName = "Repository"] = pathname
      .split("/")
      .filter(Boolean)
      .slice(-2);

    return {
      name: rawName.replace(/\.git$/, "") || "Repository",
      owner: owner || "GitHub"
    };
  } catch {
    return {
      name: "Repository",
      owner: "GitHub"
    };
  }
}
