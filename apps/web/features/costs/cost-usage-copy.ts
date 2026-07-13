import type {
  CostProjectUsageSource,
  CostUsageAnalysisResponse
} from "@sketchcatch/types";

type CostUsageDisplayCopyOptions = {
  readonly dataSource: CostUsageAnalysisResponse["dataSource"] | null;
  readonly hasSelectedProject: boolean;
  readonly projectSource?: CostProjectUsageSource | null | undefined;
};

type CostUsageDisplayCopy = {
  readonly controlKicker: string;
  readonly loadingMessage: string;
  readonly metricCostLabel: string;
  readonly projectCostTitle: string;
  readonly sampleNotice: string | null;
  readonly summaryKicker: string;
  readonly summaryTitle: string;
};

// 실제 AWS 비용과 Sample data가 화면에서 섞이지 않도록 문구를 고릅니다.
export function createCostUsageDisplayCopy({
  dataSource,
  hasSelectedProject,
  projectSource
}: CostUsageDisplayCopyOptions): CostUsageDisplayCopy {
  if (dataSource === "sample") {
    return {
      controlKicker: "Sample usage",
      loadingMessage: "사용량 분석 데이터를 불러오는 중입니다.",
      metricCostLabel: hasSelectedProject ? "프로젝트 비용 예시" : "총 비용 예시",
      projectCostTitle: "프로젝트별 비용 예시",
      sampleNotice:
        "검증된 AWS Role이 없어 예시 데이터를 표시합니다. 실제 청구액이 아닙니다.",
      summaryKicker: "Sample data",
      summaryTitle: hasSelectedProject ? "프로젝트 비용 예시" : "비용 예시"
    };
  }

  if (dataSource === "aws_cost_explorer") {
    if (hasSelectedProject && projectSource === "deployed_resource_estimate") {
      return {
        controlKicker: "Allocated usage",
        loadingMessage: "사용량 분석 데이터를 불러오는 중입니다.",
        metricCostLabel: "프로젝트 비용 배분액",
        projectCostTitle: "프로젝트별 비용 배분액",
        sampleNotice:
          "프로젝트 Cost Explorer tag가 없어 실제 계정 비용을 배포 리소스 비율로 배분한 값입니다.",
        summaryKicker: "Allocated cost",
        summaryTitle: "프로젝트 비용 배분"
      };
    }

    return {
      controlKicker: "Actual usage",
      loadingMessage: "사용량 분석 데이터를 불러오는 중입니다.",
      metricCostLabel: hasSelectedProject ? "프로젝트 실제 비용" : "총 실제 비용",
      projectCostTitle: "프로젝트별 실제 비용",
      sampleNotice: null,
      summaryKicker: "Actual cost",
      summaryTitle: hasSelectedProject ? "프로젝트 사용 비용" : "현재 사용 비용"
    };
  }

  return {
    controlKicker: "Usage analysis",
    loadingMessage: "사용량 분석 데이터를 불러오는 중입니다.",
    metricCostLabel: hasSelectedProject ? "프로젝트 사용 비용" : "총 사용 비용",
    projectCostTitle: "프로젝트별 사용 비용",
    sampleNotice: null,
    summaryKicker: "Usage summary",
    summaryTitle: hasSelectedProject ? "프로젝트 사용 비용" : "사용 비용"
  };
}
