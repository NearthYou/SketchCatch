import type {
  AwsConnection,
  CostProjectEstimateListResponse,
  Deployment,
  Project,
  SourceRepository
} from "@sketchcatch/types";
import {
  listAwsConnections,
  listCostProjectEstimates,
  listDeployments,
  listProjects,
  listSourceRepositories
} from "../workspace/api";

export type RecentDeploymentItem = {
  readonly deployment: Deployment;
  readonly project: Project;
};

export type DashboardOverviewData = {
  readonly awsConnections: readonly AwsConnection[] | null;
  readonly connectedRepositoryCount: number | null;
  readonly costEstimate: CostProjectEstimateListResponse | null;
  readonly partialWarnings: readonly string[];
  readonly projects: readonly Project[];
  readonly recentDeployments: readonly RecentDeploymentItem[];
};

type DeploymentResult = {
  readonly failedProjectCount: number;
  readonly items: readonly RecentDeploymentItem[];
};

type RepositoryResult = {
  readonly activeCount: number;
  readonly failedProjectCount: number;
};

const DASHBOARD_PROJECT_REQUEST_CONCURRENCY = 6;

export async function loadDashboardOverviewData(): Promise<DashboardOverviewData> {
  const projects = await listProjects();
  const [awsResult, costResult, deploymentResult, repositoryResult] = await Promise.all([
    settleRequest(() => listAwsConnections()),
    settleRequest(() =>
      listCostProjectEstimates({
        expectedUserCount: 1000,
        period: "month"
      })
    ),
    loadRecentDeployments(projects),
    loadRepositoryConnections(projects)
  ]);
  const partialWarnings: string[] = [];

  if (!awsResult.ok) {
    partialWarnings.push("AWS Role 연결 상태를 불러오지 못했습니다.");
  }

  if (!costResult.ok) {
    partialWarnings.push("Cost Analysis 요약을 불러오지 못했습니다.");
  }

  if (deploymentResult.failedProjectCount > 0) {
    partialWarnings.push(
      `${deploymentResult.failedProjectCount}개 프로젝트의 Deployment 상태를 확인하지 못했습니다.`
    );
  }

  if (repositoryResult.failedProjectCount > 0) {
    partialWarnings.push(
      `${repositoryResult.failedProjectCount}개 프로젝트의 Source Repository 연결을 확인하지 못했습니다.`
    );
  }

  return {
    awsConnections: awsResult.ok ? awsResult.value : null,
    connectedRepositoryCount: repositoryResult.activeCount,
    costEstimate: costResult.ok ? costResult.value : null,
    partialWarnings,
    projects: [...projects].sort(compareProjectsByUpdatedAt),
    recentDeployments: deploymentResult.items
  };
}

// 일부 프로젝트 조회가 실패해도 성공한 최근 Deployment는 유지합니다.
async function loadRecentDeployments(projects: readonly Project[]): Promise<DeploymentResult> {
  const results = await settleRequestsInBatches(
    projects,
    DASHBOARD_PROJECT_REQUEST_CONCURRENCY,
    async (project) => {
      const deployments = await listDeployments(project.id);

      return deployments.map((deployment) => ({ deployment, project }));
    }
  );
  const items = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  return {
    failedProjectCount: results.filter((result) => result.status === "rejected").length,
    items: items.sort(compareDeploymentsByUpdatedAt).slice(0, 6)
  };
}

async function loadRepositoryConnections(projects: readonly Project[]): Promise<RepositoryResult> {
  const results = await settleRequestsInBatches(
    projects,
    DASHBOARD_PROJECT_REQUEST_CONCURRENCY,
    (project) => listSourceRepositories(project.id)
  );
  const repositories = results.flatMap<SourceRepository>((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  return {
    activeCount: repositories.filter((repository) => repository.status === "active").length,
    failedProjectCount: results.filter((result) => result.status === "rejected").length
  };
}

export async function settleRequestsInBatches<T, TResult>(
  items: readonly T[],
  batchSize: number,
  request: (item: T) => Promise<TResult>
): Promise<PromiseSettledResult<TResult>[]> {
  const results: PromiseSettledResult<TResult>[] = [];
  const safeBatchSize = Math.max(1, Math.floor(batchSize));

  for (let index = 0; index < items.length; index += safeBatchSize) {
    const batch = items.slice(index, index + safeBatchSize);
    results.push(...(await Promise.allSettled(batch.map((item) => request(item)))));
  }

  return results;
}

// 보조 API 하나가 실패해도 Dashboard 전체가 사라지지 않게 결과를 감쌉니다.
async function settleRequest<T>(
  request: () => Promise<T>
): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false }> {
  try {
    return { ok: true, value: await request() };
  } catch {
    return { ok: false };
  }
}

function compareProjectsByUpdatedAt(left: Project, right: Project): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function compareDeploymentsByUpdatedAt(
  left: RecentDeploymentItem,
  right: RecentDeploymentItem
): number {
  return Date.parse(right.deployment.updatedAt) - Date.parse(left.deployment.updatedAt);
}
