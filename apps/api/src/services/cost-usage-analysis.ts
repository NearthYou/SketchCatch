import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandOutput
} from "@aws-sdk/client-cost-explorer";
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import type {
  AwsConnection,
  CostMetricSeries,
  CostOptimizationRecommendation,
  CostProjectUsage,
  CostResourceUsage,
  CostServiceUsage,
  CostUsageAnalysisRange,
  CostUsageAnalysisResponse,
  CostUsageMonthlyComparison,
  CostUsageMonthlyPoint,
  CostUsageTrendPoint,
  CostWasteResourceInsight,
  MoneyEstimate,
  Project,
  RiskLevel
} from "@sketchcatch/types";
import {
  prepareTerraformAwsCredentialEnv,
  type TerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";

const projectTagKey = "SketchCatchProjectId";
const costExplorerRegion = "us-east-1";
const supportedWasteResourceTypes = new Set([
  "aws_instance",
  "aws_db_instance",
  "aws_lb",
  "aws_nat_gateway"
]);

export type CostUsageDeployment = {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly completedAt: Date | null;
  readonly startedAt: Date | null;
  readonly updatedAt: Date;
};

export type CostUsageDeployedResource = {
  readonly id: string;
  readonly deploymentId: string;
  readonly terraformAddress: string;
  readonly terraformType: string;
  readonly resourceId: string | null;
  readonly region: string;
};

export type CostUsageAnalysisProviderInput = {
  readonly awsConnection: AwsConnection | null;
  readonly deployedResources: readonly CostUsageDeployedResource[];
  readonly deployments: readonly CostUsageDeployment[];
  readonly now?: Date | undefined;
  readonly projectId?: string | undefined;
  readonly projects: readonly Project[];
  readonly range: CostUsageAnalysisRange;
  readonly userId: string;
};

export type CostUsageAnalysisProvider = (
  input: CostUsageAnalysisProviderInput
) => Promise<CostUsageAnalysisResponse>;

export type CostWasteMetricSnapshot = {
  readonly averageValue: number;
  readonly metricName: string;
  readonly project?: Project | undefined;
  readonly resource: CostUsageDeployedResource;
  readonly service: string;
  readonly unit: string;
};

type CostRangeDates = {
  readonly dailyPointCount: number;
  readonly endDate: string;
  readonly endExclusiveDate: string;
  readonly startDate: string;
};

type AwsCostUsageAnalysisProviderOptions = {
  readonly stsGateway?: AwsConnectionStsGateway | undefined;
};

type AwsSdkCredentials =
  | {
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
    }
  | {
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly sessionToken: string;
    };

export async function analyzeCostUsage(
  input: CostUsageAnalysisProviderInput,
  provider: CostUsageAnalysisProvider = createAwsCostUsageAnalysisProvider()
): Promise<CostUsageAnalysisResponse> {
  if (input.awsConnection === null) {
    return createSampleCostUsageAnalysis(input);
  }

  try {
    return await provider(input);
  } catch {
    return createSampleCostUsageAnalysis(input);
  }
}

export function createAwsCostUsageAnalysisProvider(
  options: AwsCostUsageAnalysisProviderOptions = {}
): CostUsageAnalysisProvider {
  const stsGateway = options.stsGateway ?? createAwsSdkStsGateway();

  return async (input) => {
    if (input.awsConnection === null) {
      throw new Error("Verified AWS connection is required for actual cost analysis");
    }

    const now = input.now ?? new Date();
    const rangeDates = createCostRangeDates(input.range, now);
    const preparedCredentials = await prepareTerraformAwsCredentialEnv(
      input.awsConnection,
      stsGateway
    );
    const credentials = toAwsSdkCredentials(preparedCredentials.env);
    const costExplorer = new CostExplorerClient({
      credentials,
      region: costExplorerRegion
    });
    const cloudWatch = new CloudWatchClient({
      credentials,
      region: input.awsConnection.region
    });
    const [
      dailyTrend,
      monthlyTrend,
      serviceCosts,
      taggedProjectCosts,
      taggedProjectMonthlyTrends
    ] = await Promise.all([
      fetchDailyCostTrend(costExplorer, rangeDates),
      fetchMonthlyCostTrend(costExplorer, now),
      fetchServiceCosts(costExplorer, rangeDates),
      fetchTaggedProjectCosts(costExplorer, rangeDates),
      fetchTaggedProjectMonthlyTrends(costExplorer, now)
    ]);
    const totalCostAmount = roundUsd(
      dailyTrend.reduce((sum, point) => sum + point.amount, 0) ||
        serviceCosts.reduce((sum, item) => sum + item.amount, 0)
    );
    const projectCosts = createProjectUsageCosts({
      accountMonthlyTrend: monthlyTrend,
      deployedResources: input.deployedResources,
      deployments: input.deployments,
      projects: input.projects,
      taggedProjectCosts,
      taggedProjectMonthlyTrends,
      totalCostAmount
    });
    const resourceCosts = createResourceUsageCosts({
      deployedResources: input.deployedResources,
      deployments: input.deployments,
      projectCosts,
      projects: input.projects,
      totalCostAmount
    });
    const metricSnapshots = await fetchWasteMetricSnapshots({
      cloudWatch,
      deployedResources: input.deployedResources,
      deployments: input.deployments,
      endTime: new Date(`${rangeDates.endExclusiveDate}T00:00:00.000Z`),
      projects: input.projects,
      startTime: new Date(`${rangeDates.startDate}T00:00:00.000Z`)
    });
    const wasteResources = createWasteInsightsFromMetricSnapshots(metricSnapshots);
    const recommendations = createRecommendationsFromWaste(wasteResources);
    const response: CostUsageAnalysisResponse = {
      currency: "USD",
      dailyTrend,
      dataSource: "aws_cost_explorer",
      endDate: rangeDates.endDate,
      fallbackUsed: false,
      forecastMonthEndCost: createMoneyEstimate(
        forecastMonthEndCost(totalCostAmount, rangeDates, now)
      ),
      generatedAt: now.toISOString(),
      metricSeries: createMetricSeries(metricSnapshots),
      monthlyComparison: createMonthlyComparison(monthlyTrend, now),
      monthlyTrend,
      projectCosts,
      resourceCosts,
      range: input.range,
      recommendations,
      serviceCosts,
      startDate: rangeDates.startDate,
      totalCost: createMoneyEstimate(totalCostAmount),
      wasteResources
    };

    return scopeCostUsageAnalysisResponseToProject(response, input.projectId);
  };
}

export function createSampleCostUsageAnalysis(
  input: CostUsageAnalysisProviderInput
): CostUsageAnalysisResponse {
  const now = input.now ?? new Date();
  const rangeDates = createCostRangeDates(input.range, now);
  const dailyTrend = createSampleDailyTrend(rangeDates);
  const monthlyTrend = createSampleMonthlyTrend(now);
  const totalCostAmount = roundUsd(dailyTrend.reduce((sum, point) => sum + point.amount, 0));
  const serviceCosts = createServiceCosts([
    ["Amazon Relational Database Service", totalCostAmount * 0.42],
    ["Amazon Elastic Compute Cloud", totalCostAmount * 0.31],
    ["Amazon Virtual Private Cloud", totalCostAmount * 0.16],
    ["Elastic Load Balancing", totalCostAmount * 0.11]
  ]);
  const taggedProjectCosts = new Map<string, number>();
  const projectCosts = createProjectUsageCosts({
    accountMonthlyTrend: monthlyTrend,
    deployedResources: input.deployedResources,
    deployments: input.deployments,
    projects: input.projects,
    taggedProjectCosts,
    totalCostAmount
  });
  const resourceCosts = createResourceUsageCosts({
    allowSampleResources: true,
    deployedResources: input.deployedResources,
    deployments: input.deployments,
    projectCosts,
    projects: input.projects,
    totalCostAmount
  });
  const fallbackProject =
    input.projects.find((project) => project.id === input.projectId) ?? input.projects[0];
  const sampleWasteResources = createSampleWasteResources(fallbackProject);
  const response: CostUsageAnalysisResponse = {
    currency: "USD",
    dailyTrend,
    dataSource: "sample",
    endDate: rangeDates.endDate,
    fallbackUsed: true,
    forecastMonthEndCost: createMoneyEstimate(
      forecastMonthEndCost(totalCostAmount, rangeDates, now)
    ),
    generatedAt: now.toISOString(),
    metricSeries: createSampleMetricSeries(rangeDates),
    monthlyComparison: createMonthlyComparison(monthlyTrend, now),
    monthlyTrend,
    projectCosts,
    resourceCosts,
    range: input.range,
    recommendations: createRecommendationsFromWaste(sampleWasteResources),
    serviceCosts,
    startDate: rangeDates.startDate,
    totalCost: createMoneyEstimate(totalCostAmount),
    wasteResources: sampleWasteResources
  };

  return scopeCostUsageAnalysisResponseToProject(response, input.projectId);
}

function scopeCostUsageAnalysisResponseToProject(
  response: CostUsageAnalysisResponse,
  projectId: string | undefined
): CostUsageAnalysisResponse {
  if (projectId === undefined) {
    return response;
  }

  const projectCost = response.projectCosts.find((row) => row.projectId === projectId);
  const selectedTotalAmount = projectCost?.amount ?? 0;
  const resourceCosts = response.resourceCosts
    .filter((resource) => resource.projectId === projectId)
    .map((resource) => ({
      ...resource,
      percentage: calculatePercentage(resource.amount, selectedTotalAmount)
    }));
  const wasteResources = response.wasteResources.filter(
    (resource) => resource.projectId === projectId
  );
  const resourceCostIds = new Set(resourceCosts.map((resource) => resource.id));
  const monthlyTrend = projectCost?.monthlyTrend.length
    ? projectCost.monthlyTrend
    : scaleCostUsageMonthlyTrend(
        response.monthlyTrend,
        response.totalCost.amount,
        selectedTotalAmount
      );

  return {
    ...response,
    dailyTrend: scaleCostUsageDailyTrend(
      response.dailyTrend,
      response.totalCost.amount,
      selectedTotalAmount
    ),
    forecastMonthEndCost: createMoneyEstimate(
      scaleCostUsageAmount(
        response.forecastMonthEndCost.amount,
        response.totalCost.amount,
        selectedTotalAmount
      )
    ),
    metricSeries: response.metricSeries.filter((series) =>
      [...resourceCostIds].some((resourceId) => series.id.startsWith(`${resourceId}-`))
    ),
    monthlyComparison: createMonthlyComparison(monthlyTrend, new Date(response.generatedAt)),
    monthlyTrend,
    projectCosts: projectCost === undefined ? [] : [projectCost],
    recommendations: response.recommendations.filter(
      (recommendation) => recommendation.projectId === projectId
    ),
    resourceCosts,
    serviceCosts: createProjectScopedServiceCosts({
      accountServiceCosts: response.serviceCosts,
      accountTotalAmount: response.totalCost.amount,
      resourceCosts,
      selectedTotalAmount
    }),
    totalCost: createMoneyEstimate(selectedTotalAmount),
    wasteResources
  };
}

function createProjectScopedServiceCosts(input: {
  readonly accountServiceCosts: readonly CostServiceUsage[];
  readonly accountTotalAmount: number;
  readonly resourceCosts: readonly CostResourceUsage[];
  readonly selectedTotalAmount: number;
}): CostServiceUsage[] {
  if (input.selectedTotalAmount <= 0) {
    return [];
  }

  if (input.resourceCosts.length > 0) {
    const serviceCosts = new Map<string, number>();

    for (const resource of input.resourceCosts) {
      serviceCosts.set(resource.service, (serviceCosts.get(resource.service) ?? 0) + resource.amount);
    }

    return createServiceCosts([...serviceCosts.entries()]);
  }

  if (input.accountTotalAmount <= 0) {
    return [];
  }

  const scale = input.selectedTotalAmount / input.accountTotalAmount;

  return createServiceCosts(
    input.accountServiceCosts.map((service) => [service.service, service.amount * scale])
  );
}

function scaleCostUsageDailyTrend(
  dailyTrend: readonly CostUsageTrendPoint[],
  sourceTotalAmount: number,
  targetTotalAmount: number
): CostUsageTrendPoint[] {
  if (sourceTotalAmount <= 0 || targetTotalAmount <= 0) {
    return dailyTrend.map((point) => ({
      amount: 0,
      date: point.date
    }));
  }

  const scale = targetTotalAmount / sourceTotalAmount;

  return dailyTrend.map((point) => ({
    amount: roundUsd(point.amount * scale),
    date: point.date
  }));
}

function scaleCostUsageAmount(
  amount: number,
  sourceTotalAmount: number,
  targetTotalAmount: number
): number {
  if (sourceTotalAmount <= 0 || targetTotalAmount <= 0) {
    return 0;
  }

  return roundUsd(amount * (targetTotalAmount / sourceTotalAmount));
}

export function createProjectUsageCosts(input: {
  readonly accountMonthlyTrend?: readonly CostUsageMonthlyPoint[] | undefined;
  readonly deployedResources: readonly CostUsageDeployedResource[];
  readonly deployments: readonly CostUsageDeployment[];
  readonly projects: readonly Project[];
  readonly taggedProjectCosts: ReadonlyMap<string, number>;
  readonly taggedProjectMonthlyTrends?: ReadonlyMap<string, readonly CostUsageMonthlyPoint[]> | undefined;
  readonly totalCostAmount: number;
}): CostProjectUsage[] {
  const taggedProjectUsageCosts = input.taggedProjectCosts.size > 0
    ? createTaggedProjectUsageCosts(input)
    : [];
  const taggedProjectIds = new Set(
    taggedProjectUsageCosts.flatMap((row) => row.projectId === null ? [] : [row.projectId])
  );
  const taggedAmount = taggedProjectUsageCosts.reduce((sum, row) => sum + row.amount, 0);
  const approximateProjectUsageCosts = createApproximateProjectUsageCosts({
    ...input,
    accountTotalAmountForMonthlyTrend: input.totalCostAmount,
    projects: input.projects.filter((project) => !taggedProjectIds.has(project.id)),
    totalCostAmount: Math.max(0, roundUsd(input.totalCostAmount - taggedAmount))
  });

  const projectRows = [...taggedProjectUsageCosts, ...approximateProjectUsageCosts]
    .map((row) => ({
      ...row,
      percentage: calculatePercentage(row.amount, input.totalCostAmount)
    }));

  return reconcileProjectMonthlyTrends({
    accountMonthlyTrend: input.accountMonthlyTrend ?? [],
    projectRows,
    taggedProjectMonthlyTrends: input.taggedProjectMonthlyTrends ?? new Map()
  }).sort(compareCostProjectUsageRows);
}

export function createWasteInsightsFromMetricSnapshots(
  snapshots: readonly CostWasteMetricSnapshot[]
): CostWasteResourceInsight[] {
  return snapshots.flatMap((snapshot) => {
    const finding = createWasteFinding(snapshot);

    if (finding === null) {
      return [];
    }

    const resourceName = snapshot.resource.resourceId ?? snapshot.resource.terraformAddress;

    return [
      {
        estimatedMonthlyWaste: createMoneyEstimate(finding.estimatedMonthlyWaste),
        finding: finding.message,
        id: `waste-${snapshot.resource.id}-${snapshot.metricName}`,
        metricName: snapshot.metricName,
        ...(snapshot.project === undefined
          ? {}
          : {
              projectId: snapshot.project.id,
              projectName: snapshot.project.name
            }),
        resourceId: snapshot.resource.resourceId,
        resourceName,
        resourceType: snapshot.resource.terraformType,
        service: snapshot.service,
        unit: snapshot.unit,
        averageValue: roundMetric(snapshot.averageValue)
      }
    ];
  });
}

export function createResourceUsageCosts(input: {
  readonly allowSampleResources?: boolean;
  readonly deployedResources: readonly CostUsageDeployedResource[];
  readonly deployments: readonly CostUsageDeployment[];
  readonly projectCosts: readonly CostProjectUsage[];
  readonly projects: readonly Project[];
  readonly totalCostAmount: number;
}): CostResourceUsage[] {
  if (input.deployedResources.length === 0) {
    return input.allowSampleResources === true
      ? createSampleResourceUsageCosts(input.projectCosts, input.totalCostAmount)
      : [];
  }

  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const projectCostById = new Map(
    input.projectCosts
      .filter((projectCost) => projectCost.projectId !== null)
      .map((projectCost) => [projectCost.projectId as string, projectCost])
  );
  const projectIdByDeploymentId = new Map(
    input.deployments.map((deployment) => [deployment.id, deployment.projectId])
  );
  const resourcesByProjectId = new Map<string, CostUsageDeployedResource[]>();

  for (const resource of input.deployedResources) {
    const projectId = projectIdByDeploymentId.get(resource.deploymentId);

    if (projectId === undefined || !projectCostById.has(projectId)) {
      continue;
    }

    resourcesByProjectId.set(projectId, [...(resourcesByProjectId.get(projectId) ?? []), resource]);
  }

  return [...resourcesByProjectId.entries()]
    .flatMap(([projectId, resources]) => {
      const projectCost = projectCostById.get(projectId);
      const project = projectById.get(projectId);

      if (projectCost === undefined || resources.length === 0) {
        return [];
      }

      const amountPerResource = projectCost.amount / resources.length;

      return resources.map((resource, index) => {
        const amount =
          index === resources.length - 1
            ? roundUsd(projectCost.amount - roundUsd(amountPerResource) * (resources.length - 1))
            : roundUsd(amountPerResource);

        return {
          amount,
          id: resource.id,
          percentage: calculatePercentage(amount, input.totalCostAmount),
          projectId,
          projectName: project?.name ?? projectCost.projectName,
          resourceId: resource.resourceId,
          resourceName: resource.resourceId ?? resource.terraformAddress,
          resourceType: resource.terraformType,
          service: getCostServiceForTerraformType(resource.terraformType),
          source: "deployed_resource_estimate" as const,
          terraformAddress: resource.terraformAddress
        };
      });
    })
    .sort(compareCostResourceUsageRows);
}

function createTaggedProjectUsageCosts(input: {
  readonly accountMonthlyTrend?: readonly CostUsageMonthlyPoint[] | undefined;
  readonly projects: readonly Project[];
  readonly taggedProjectCosts: ReadonlyMap<string, number>;
  readonly taggedProjectMonthlyTrends?: ReadonlyMap<string, readonly CostUsageMonthlyPoint[]> | undefined;
  readonly totalCostAmount: number;
}): CostProjectUsage[] {
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const deployedProjectIds = new Set(projectsById.keys());
  const totalTaggedCost = [...input.taggedProjectCosts.values()].reduce(
    (sum, amount) => sum + amount,
    0
  );
  const taggedProjectEntries = [...input.taggedProjectCosts.entries()].filter(([projectId]) =>
    deployedProjectIds.has(projectId)
  );
  const rows = taggedProjectEntries.map(([projectId, amount]) => {
    const project = projectsById.get(projectId);

    return {
      amount: roundUsd(amount),
      percentage: calculatePercentage(amount, input.totalCostAmount || totalTaggedCost),
      projectId: project?.id ?? projectId,
      projectName: project?.name ?? `태그 프로젝트 ${projectId}`,
      resourceCount: 0,
      monthlyTrend: createAllocatedMonthlyTrend({
        accountMonthlyTrend: input.accountMonthlyTrend ?? [],
        accountTotalAmount: input.totalCostAmount || totalTaggedCost,
        projectAmount: amount
      }),
      source: "cost_explorer_tag" as const
    };
  });

  return rows.sort(compareCostProjectUsageRows);
}

function createApproximateProjectUsageCosts(input: {
  readonly accountTotalAmountForMonthlyTrend?: number | undefined;
  readonly accountMonthlyTrend?: readonly CostUsageMonthlyPoint[] | undefined;
  readonly deployedResources: readonly CostUsageDeployedResource[];
  readonly deployments: readonly CostUsageDeployment[];
  readonly projects: readonly Project[];
  readonly totalCostAmount: number;
}): CostProjectUsage[] {
  if (input.projects.length === 0) {
    return [];
  }

  const deploymentProjectById = new Map(
    input.deployments.map((deployment) => [deployment.id, deployment.projectId])
  );
  const resourcesByProjectId = new Map<string, number>();

  for (const resource of input.deployedResources) {
    const projectId = deploymentProjectById.get(resource.deploymentId);

    if (projectId !== undefined) {
      resourcesByProjectId.set(projectId, (resourcesByProjectId.get(projectId) ?? 0) + 1);
    }
  }

  const totalResourceCount = [...resourcesByProjectId.values()].reduce(
    (sum, count) => sum + count,
    0
  );
  const weightedProjects = input.projects.map((project, index) => {
    const resourceCount = resourcesByProjectId.get(project.id) ?? 0;

    return {
      project,
      resourceCount,
      weight:
        totalResourceCount === 0
          ? createProjectFallbackUsageWeight(project, index)
          : resourceCount
    };
  });
  const billableProjects = weightedProjects.filter((project) => project.weight > 0);
  const totalWeight = billableProjects.reduce((sum, project) => sum + project.weight, 0);
  const amountByProjectId = new Map<string, number>();
  let allocatedAmount = 0;

  billableProjects.forEach((project, index) => {
    const amount =
      index === billableProjects.length - 1
        ? roundUsd(input.totalCostAmount - allocatedAmount)
        : roundUsd((input.totalCostAmount * project.weight) / totalWeight);

    amountByProjectId.set(project.project.id, amount);
    allocatedAmount = roundUsd(allocatedAmount + amount);
  });

  return weightedProjects
    .map(({ project, resourceCount }) => {
      const amount = amountByProjectId.get(project.id) ?? 0;

      return {
        amount,
        percentage: calculatePercentage(amount, input.totalCostAmount),
        projectId: project.id,
        projectName: project.name,
        resourceCount,
        monthlyTrend: createAllocatedMonthlyTrend({
          accountMonthlyTrend: input.accountMonthlyTrend ?? [],
          accountTotalAmount: input.accountTotalAmountForMonthlyTrend ?? input.totalCostAmount,
          projectAmount: amount
        }),
        source: "deployed_resource_estimate" as const
      };
    })
    .sort(compareCostProjectUsageRows);
}

function createSampleResourceUsageCosts(
  projectCosts: readonly CostProjectUsage[],
  totalCostAmount: number
): CostResourceUsage[] {
  return projectCosts.flatMap((projectCost) => {
    const resourceTemplates = createSampleResourceTemplates(projectCost);
    const totalWeight = resourceTemplates.reduce((sum, resource) => sum + resource.weight, 0);

    return resourceTemplates.map((resource, index) => {
      const amount =
        index === resourceTemplates.length - 1
          ? roundUsd(
              projectCost.amount -
                resourceTemplates
                  .slice(0, -1)
                  .reduce(
                    (sum, previous) =>
                      sum + roundUsd((projectCost.amount * previous.weight) / totalWeight),
                    0
                  )
            )
          : roundUsd((projectCost.amount * resource.weight) / totalWeight);

      return {
        amount,
        id: `${projectCost.projectId ?? projectCost.projectName}-${resource.terraformAddress}`,
        percentage: calculatePercentage(amount, totalCostAmount),
        ...(projectCost.projectId === null
          ? {}
          : {
              projectId: projectCost.projectId,
              projectName: projectCost.projectName
            }),
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        resourceType: resource.resourceType,
        service: resource.service,
        source: "sample" as const,
        terraformAddress: resource.terraformAddress
      };
    });
  });
}

function createSampleResourceTemplates(projectCost: CostProjectUsage): Array<{
  readonly resourceId: string | null;
  readonly resourceName: string;
  readonly resourceType: string;
  readonly service: string;
  readonly terraformAddress: string;
  readonly weight: number;
}> {
  const projectSlug = (projectCost.projectId ?? projectCost.projectName)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");

  return [
    {
      resourceId: `${projectSlug}-db`,
      resourceName: `${projectCost.projectName} DB`,
      resourceType: "aws_db_instance",
      service: "Amazon Relational Database Service",
      terraformAddress: "aws_db_instance.main",
      weight: 4
    },
    {
      resourceId: `${projectSlug}-ec2`,
      resourceName: `${projectCost.projectName} API`,
      resourceType: "aws_instance",
      service: "Amazon Elastic Compute Cloud",
      terraformAddress: "aws_instance.api",
      weight: 3
    },
    {
      resourceId: `${projectSlug}-alb`,
      resourceName: `${projectCost.projectName} ALB`,
      resourceType: "aws_lb",
      service: "Elastic Load Balancing",
      terraformAddress: "aws_lb.public",
      weight: 2
    }
  ];
}

async function fetchDailyCostTrend(
  client: CostExplorerClient,
  rangeDates: CostRangeDates
): Promise<CostUsageTrendPoint[]> {
  const output = await client.send(
    new GetCostAndUsageCommand({
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
      TimePeriod: {
        End: rangeDates.endExclusiveDate,
        Start: rangeDates.startDate
      }
    })
  );

  return (output.ResultsByTime ?? []).map((result) => ({
    amount: roundUsd(Number(result.Total?.UnblendedCost?.Amount ?? 0)),
    date: result.TimePeriod?.Start ?? rangeDates.startDate
  }));
}

async function fetchServiceCosts(
  client: CostExplorerClient,
  rangeDates: CostRangeDates
): Promise<CostUsageAnalysisResponse["serviceCosts"]> {
  const output = await client.send(
    new GetCostAndUsageCommand({
      Granularity: "MONTHLY",
      GroupBy: [
        {
          Key: "SERVICE",
          Type: "DIMENSION"
        }
      ],
      Metrics: ["UnblendedCost"],
      TimePeriod: {
        End: rangeDates.endExclusiveDate,
        Start: rangeDates.startDate
      }
    })
  );

  return createServiceCosts(parseGroupedCostAmount(output));
}

async function fetchTaggedProjectCosts(
  client: CostExplorerClient,
  rangeDates: CostRangeDates
): Promise<Map<string, number>> {
  const output = await client.send(
    new GetCostAndUsageCommand({
      Granularity: "MONTHLY",
      GroupBy: [
        {
          Key: projectTagKey,
          Type: "TAG"
        }
      ],
      Metrics: ["UnblendedCost"],
      TimePeriod: {
        End: rangeDates.endExclusiveDate,
        Start: rangeDates.startDate
      }
    })
  );
  const projectCosts = new Map<string, number>();

  for (const [rawProjectId, amount] of parseGroupedCostAmount(output)) {
    const projectId = parseCostExplorerTagValue(rawProjectId);

    if (projectId.length > 0 && amount > 0) {
      projectCosts.set(projectId, roundUsd((projectCosts.get(projectId) ?? 0) + amount));
    }
  }

  return projectCosts;
}

async function fetchTaggedProjectMonthlyTrends(
  client: CostExplorerClient,
  now: Date
): Promise<Map<string, CostUsageMonthlyPoint[]>> {
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const output = await client.send(
    new GetCostAndUsageCommand({
      Granularity: "MONTHLY",
      GroupBy: [
        {
          Key: projectTagKey,
          Type: "TAG"
        }
      ],
      Metrics: ["UnblendedCost"],
      TimePeriod: {
        End: toIsoDate(addUtcDays(
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          1
        )),
        Start: toIsoDate(addUtcMonths(currentMonth, -5))
      }
    })
  );

  return createCostExplorerProjectMonthlyTrends(output, now);
}

export function createCostExplorerProjectMonthlyTrends(
  output: Pick<GetCostAndUsageCommandOutput, "ResultsByTime">,
  now: Date
): Map<string, CostUsageMonthlyPoint[]> {
  const amountsByProject = new Map<string, Map<string, number>>();

  for (const result of output.ResultsByTime ?? []) {
    const month = result.TimePeriod?.Start?.slice(0, 7) ?? "";

    for (const group of result.Groups ?? []) {
      const projectId = parseCostExplorerTagValue(group.Keys?.[0] ?? "");
      const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0);

      if (month.length === 0 || projectId.length === 0) {
        continue;
      }

      const amountsByMonth = amountsByProject.get(projectId) ?? new Map<string, number>();
      amountsByMonth.set(month, roundUsd((amountsByMonth.get(month) ?? 0) + amount));
      amountsByProject.set(projectId, amountsByMonth);
    }
  }

  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return new Map(
    [...amountsByProject.entries()].map(([projectId, amountsByMonth]) => [
      projectId,
      Array.from({ length: 6 }, (_, index) => {
        const month = toIsoMonth(addUtcMonths(currentMonth, index - 5));

        return {
          amount: amountsByMonth.get(month) ?? 0,
          isEstimated: !amountsByMonth.has(month),
          isPartial: index === 5,
          month
        };
      })
    ])
  );
}

function parseGroupedCostAmount(output: GetCostAndUsageCommandOutput): Array<[string, number]> {
  const groupedCosts = new Map<string, number>();

  for (const result of output.ResultsByTime ?? []) {
    for (const group of result.Groups ?? []) {
      const key = group.Keys?.[0] ?? "Unknown";
      const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0);
      groupedCosts.set(key, (groupedCosts.get(key) ?? 0) + amount);
    }
  }

  return [...groupedCosts.entries()];
}

async function fetchWasteMetricSnapshots(input: {
  readonly cloudWatch: CloudWatchClient;
  readonly deployedResources: readonly CostUsageDeployedResource[];
  readonly deployments: readonly CostUsageDeployment[];
  readonly endTime: Date;
  readonly projects: readonly Project[];
  readonly startTime: Date;
}): Promise<CostWasteMetricSnapshot[]> {
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const projectIdByDeploymentId = new Map(
    input.deployments.map((deployment) => [deployment.id, deployment.projectId])
  );
  const snapshots: CostWasteMetricSnapshot[] = [];

  for (const resource of input.deployedResources) {
    if (!supportedWasteResourceTypes.has(resource.terraformType) || resource.resourceId === null) {
      continue;
    }

    const metricRequests = createWasteMetricRequests(resource);
    const project = projectById.get(projectIdByDeploymentId.get(resource.deploymentId) ?? "");

    for (const metricRequest of metricRequests) {
      const averageValue = await fetchAverageMetric({
        cloudWatch: input.cloudWatch,
        dimensions: metricRequest.dimensions,
        endTime: input.endTime,
        metricName: metricRequest.metricName,
        namespace: metricRequest.namespace,
        startTime: input.startTime
      });

      if (averageValue === null) {
        continue;
      }

      snapshots.push({
        averageValue,
        metricName: metricRequest.metricName,
        ...(project === undefined ? {} : { project }),
        resource,
        service: metricRequest.service,
        unit: metricRequest.unit
      });
    }
  }

  return snapshots;
}

function createWasteMetricRequests(resource: CostUsageDeployedResource): Array<{
  readonly dimensions: Array<{ Name: string; Value: string }>;
  readonly metricName: string;
  readonly namespace: string;
  readonly service: string;
  readonly unit: string;
}> {
  const resourceId = resource.resourceId ?? "";

  switch (resource.terraformType) {
    case "aws_instance":
      return [
        {
          dimensions: [{ Name: "InstanceId", Value: resourceId }],
          metricName: "CPUUtilization",
          namespace: "AWS/EC2",
          service: "Amazon Elastic Compute Cloud",
          unit: "Percent"
        }
      ];
    case "aws_db_instance":
      return [
        {
          dimensions: [{ Name: "DBInstanceIdentifier", Value: resourceId }],
          metricName: "CPUUtilization",
          namespace: "AWS/RDS",
          service: "Amazon Relational Database Service",
          unit: "Percent"
        },
        {
          dimensions: [{ Name: "DBInstanceIdentifier", Value: resourceId }],
          metricName: "DatabaseConnections",
          namespace: "AWS/RDS",
          service: "Amazon Relational Database Service",
          unit: "Count"
        }
      ];
    case "aws_lb":
      return [
        {
          dimensions: [{ Name: "LoadBalancer", Value: parseLoadBalancerDimension(resourceId) }],
          metricName: "RequestCount",
          namespace: "AWS/ApplicationELB",
          service: "Elastic Load Balancing",
          unit: "Count"
        }
      ];
    case "aws_nat_gateway":
      return [
        {
          dimensions: [{ Name: "NatGatewayId", Value: resourceId }],
          metricName: "BytesOutToDestination",
          namespace: "AWS/NATGateway",
          service: "Amazon Virtual Private Cloud",
          unit: "Bytes"
        }
      ];
    default:
      return [];
  }
}

async function fetchAverageMetric(input: {
  readonly cloudWatch: CloudWatchClient;
  readonly dimensions: Array<{ Name: string; Value: string }>;
  readonly endTime: Date;
  readonly metricName: string;
  readonly namespace: string;
  readonly startTime: Date;
}): Promise<number | null> {
  const output = await input.cloudWatch.send(
    new GetMetricStatisticsCommand({
      Dimensions: input.dimensions,
      EndTime: input.endTime,
      MetricName: input.metricName,
      Namespace: input.namespace,
      Period: 86400,
      StartTime: input.startTime,
      Statistics: ["Average"]
    })
  );
  const datapoints = (output.Datapoints ?? [])
    .map((datapoint) => datapoint.Average)
    .filter((value): value is number => typeof value === "number");

  if (datapoints.length === 0) {
    return null;
  }

  return datapoints.reduce((sum, value) => sum + value, 0) / datapoints.length;
}

function createWasteFinding(
  snapshot: CostWasteMetricSnapshot
): { readonly estimatedMonthlyWaste: number; readonly message: string } | null {
  if (snapshot.metricName === "CPUUtilization" && snapshot.averageValue < 5) {
    const isDatabase = snapshot.resource.terraformType === "aws_db_instance";
    const estimatedMonthlyWaste = isDatabase ? 18 : 7.5;

    return {
      estimatedMonthlyWaste,
      message: isDatabase
        ? `최근 평균 CPU가 ${roundMetric(snapshot.averageValue)}%라 DB 사용량이 낮습니다. 테스트 DB라면 db.t4g.micro 같은 작은 클래스로 낮추는 것을 먼저 검토하세요.`
        : `최근 평균 CPU가 ${roundMetric(snapshot.averageValue)}%라 인스턴스 사용량이 낮습니다. 테스트 서버라면 t3.nano 또는 t4g.nano처럼 더 작은 인스턴스로 낮추는 것을 먼저 검토하세요.`
    };
  }

  if (snapshot.metricName === "DatabaseConnections" && snapshot.averageValue < 1) {
    return {
      estimatedMonthlyWaste: 18,
      message: `최근 평균 DB 연결 수가 ${roundMetric(snapshot.averageValue)}개라 거의 사용되지 않습니다. 테스트 DB라면 db.t4g.micro로 낮추거나 스냅샷 후 중지를 검토하세요.`
    };
  }

  if (snapshot.metricName === "RequestCount" && snapshot.averageValue < 100) {
    return {
      estimatedMonthlyWaste: 16,
      message: `일 평균 요청량이 ${roundMetric(snapshot.averageValue)}건으로 낮습니다. 테스트용 진입점이면 ALB를 제거하거나 하나의 공유 ALB로 합치는 편이 비용을 줄일 수 있습니다.`
    };
  }

  if (snapshot.metricName === "BytesOutToDestination" && snapshot.averageValue < 1024 * 1024) {
    return {
      estimatedMonthlyWaste: 8,
      message: `NAT Gateway 전송량이 하루 평균 ${formatBytes(snapshot.averageValue)} 수준입니다. 프라이빗 서브넷의 외부 호출이 꼭 필요하지 않다면 NAT 제거 또는 사용 시간 축소를 검토하세요.`
    };
  }

  return null;
}

export function createRecommendationsFromWaste(
  wasteResources: readonly CostWasteResourceInsight[]
): CostOptimizationRecommendation[] {
  return wasteResources.map((resource) => ({
    actionLabel: getRecommendationActionLabel(resource),
    estimatedMonthlySavings: resource.estimatedMonthlyWaste,
    id: `rec-${resource.id}`,
    reason: resource.finding,
    ...(resource.projectId === undefined ? {} : { projectId: resource.projectId }),
    resourceId: resource.resourceId ?? resource.resourceName,
    service: resource.service,
    severity: getRecommendationSeverity(resource.estimatedMonthlyWaste.amount),
    targetType: "resource",
    title: `${resource.resourceName} 절감 검토`
  }));
}

function createServiceCosts(costEntries: readonly (readonly [string, number])[]) {
  const totalAmount = costEntries.reduce((sum, [, amount]) => sum + amount, 0);

  return costEntries
    .map(([service, amount]) => ({
      amount: roundUsd(amount),
      percentage: calculatePercentage(amount, totalAmount),
      service
    }))
    .filter((item) => item.amount > 0)
    .sort((left, right) => right.amount - left.amount);
}

function createMetricSeries(snapshots: readonly CostWasteMetricSnapshot[]): CostMetricSeries[] {
  return snapshots.map((snapshot) => ({
    id: `${snapshot.resource.id}-${snapshot.metricName}`,
    label: `${snapshot.resource.resourceId ?? snapshot.resource.terraformAddress} ${snapshot.metricName}`,
    points: [
      {
        timestamp: new Date().toISOString(),
        value: roundMetric(snapshot.averageValue)
      }
    ],
    unit: snapshot.unit
  }));
}

function createSampleDailyTrend(rangeDates: CostRangeDates): CostUsageTrendPoint[] {
  const start = new Date(`${rangeDates.startDate}T00:00:00.000Z`);

  return Array.from({ length: rangeDates.dailyPointCount }, (_, index) => {
    const date = addUtcDays(start, index);
    const baseline = 4.8 + index * 0.18;
    const wave = [0.4, 0.1, 0.7, 0.3, 0.9, 0.2, 0.5][index % 7] ?? 0;

    return {
      amount: roundUsd(baseline + wave),
      date: toIsoDate(date)
    };
  });
}

async function fetchMonthlyCostTrend(
  client: CostExplorerClient,
  now: Date
): Promise<CostUsageMonthlyPoint[]> {
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const output = await client.send(
    new GetCostAndUsageCommand({
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      TimePeriod: {
        End: toIsoDate(addUtcDays(
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          1
        )),
        Start: toIsoDate(addUtcMonths(currentMonth, -5))
      }
    })
  );

  return createCostExplorerMonthlyTrend(output, now);
}

export function createCostExplorerMonthlyTrend(
  output: Pick<GetCostAndUsageCommandOutput, "ResultsByTime">,
  now: Date
): CostUsageMonthlyPoint[] {
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const amountsByMonth = new Map(
    (output.ResultsByTime ?? []).map((result) => [
      result.TimePeriod?.Start?.slice(0, 7) ?? "",
      roundUsd(Number(result.Total?.UnblendedCost?.Amount ?? 0))
    ])
  );

  return Array.from({ length: 6 }, (_, index) => {
    const month = toIsoMonth(addUtcMonths(currentMonth, index - 5));

    return {
      amount: amountsByMonth.get(month) ?? 0,
      isEstimated: false,
      isPartial: index === 5,
      month
    };
  });
}

function createSampleMonthlyTrend(now: Date): CostUsageMonthlyPoint[] {
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = addUtcMonths(currentMonth, index - 5);
    const isPartial = index === 5;

    return {
      amount: isPartial ? roundUsd(now.getUTCDate() * 5.5) : roundUsd(132 + index * 4.8),
      isEstimated: true,
      isPartial,
      month: toIsoMonth(monthDate)
    };
  });
}

function createMonthlyComparison(
  monthlyTrend: readonly CostUsageMonthlyPoint[],
  now: Date
): CostUsageMonthlyComparison {
  const previousMonthActual = monthlyTrend.at(-2)?.amount ?? 0;
  const currentMonthToDate = monthlyTrend.at(-1)?.amount ?? 0;
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const currentMonthForecast = roundUsd(
    (currentMonthToDate / Math.max(now.getUTCDate(), 1)) * daysInMonth
  );
  const forecastChangeAmount = roundUsd(currentMonthForecast - previousMonthActual);

  return {
    currentMonthForecast: createMoneyEstimate(currentMonthForecast),
    currentMonthToDate: createMoneyEstimate(currentMonthToDate),
    forecastChangeAmount: createMoneyEstimate(forecastChangeAmount),
    forecastChangePercentage: previousMonthActual <= 0
      ? null
      : Math.round((forecastChangeAmount / previousMonthActual) * 1000) / 10,
    previousMonthActual: createMoneyEstimate(previousMonthActual)
  };
}

function scaleCostUsageMonthlyTrend(
  monthlyTrend: readonly CostUsageMonthlyPoint[],
  accountTotalAmount: number,
  selectedTotalAmount: number
): CostUsageMonthlyPoint[] {
  return monthlyTrend.map((point) => ({
    ...point,
    amount: scaleCostUsageAmount(point.amount, accountTotalAmount, selectedTotalAmount),
    isEstimated: true
  }));
}

function createAllocatedMonthlyTrend(input: {
  readonly accountMonthlyTrend: readonly CostUsageMonthlyPoint[];
  readonly accountTotalAmount: number;
  readonly projectAmount: number;
}): CostUsageMonthlyPoint[] {
  return input.accountMonthlyTrend.map((point) => ({
    ...point,
    amount: scaleCostUsageAmount(
      point.amount,
      input.accountTotalAmount,
      input.projectAmount
    ),
    isEstimated: true
  }));
}

function mergeTaggedMonthlyTrend(
  allocatedTrend: readonly CostUsageMonthlyPoint[],
  taggedTrend: readonly CostUsageMonthlyPoint[] | undefined
): CostUsageMonthlyPoint[] {
  if (taggedTrend === undefined) {
    return [...allocatedTrend];
  }

  const allocatedByMonth = new Map(allocatedTrend.map((point) => [point.month, point]));

  return taggedTrend.map((point) =>
    point.isEstimated ? allocatedByMonth.get(point.month) ?? point : point
  );
}

function reconcileProjectMonthlyTrends(input: {
  readonly accountMonthlyTrend: readonly CostUsageMonthlyPoint[];
  readonly projectRows: readonly CostProjectUsage[];
  readonly taggedProjectMonthlyTrends: ReadonlyMap<string, readonly CostUsageMonthlyPoint[]>;
}): CostProjectUsage[] {
  if (input.accountMonthlyTrend.length === 0) {
    return input.projectRows.map((row) => ({
      ...row,
      monthlyTrend: mergeTaggedMonthlyTrend(
        row.monthlyTrend,
        row.projectId === null
          ? undefined
          : input.taggedProjectMonthlyTrends.get(row.projectId)
      )
    }));
  }

  const monthlyTrendByProjectId = new Map<string | null, CostUsageMonthlyPoint[]>();

  for (const accountPoint of input.accountMonthlyTrend) {
    const exactPointByProjectId = new Map(
      input.projectRows.flatMap((row) => {
        if (row.projectId === null) return [];
        const taggedPoint = input.taggedProjectMonthlyTrends
          .get(row.projectId)
          ?.find((point) => point.month === accountPoint.month && !point.isEstimated);

        return taggedPoint === undefined ? [] : [[row.projectId, taggedPoint] as const];
      })
    );
    const exactAmount = [...exactPointByProjectId.values()].reduce(
      (sum, point) => sum + point.amount,
      0
    );
    const estimatedRows = input.projectRows.filter(
      (row) => row.projectId === null || !exactPointByProjectId.has(row.projectId)
    );
    const totalWeight = estimatedRows.reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
    const remainingAmount = Math.max(0, roundUsd(accountPoint.amount - exactAmount));
    let allocatedAmount = 0;

    for (const row of input.projectRows) {
      const exactPoint = row.projectId === null
        ? undefined
        : exactPointByProjectId.get(row.projectId);
      let point: CostUsageMonthlyPoint;

      if (exactPoint !== undefined) {
        point = exactPoint;
      } else {
        const estimatedIndex = estimatedRows.findIndex((estimatedRow) => estimatedRow === row);
        const amount = estimatedIndex === estimatedRows.length - 1
          ? roundUsd(remainingAmount - allocatedAmount)
          : roundUsd(
              remainingAmount * (
                totalWeight > 0
                  ? Math.max(row.amount, 0) / totalWeight
                  : 1 / Math.max(estimatedRows.length, 1)
              )
            );
        allocatedAmount = roundUsd(allocatedAmount + amount);
        point = {
          amount,
          isEstimated: true,
          isPartial: accountPoint.isPartial,
          month: accountPoint.month
        };
      }

      monthlyTrendByProjectId.set(row.projectId, [
        ...(monthlyTrendByProjectId.get(row.projectId) ?? []),
        point
      ]);
    }
  }

  return input.projectRows.map((row) => ({
    ...row,
    monthlyTrend: monthlyTrendByProjectId.get(row.projectId) ?? []
  }));
}

function createSampleMetricSeries(rangeDates: CostRangeDates): CostMetricSeries[] {
  const start = new Date(`${rangeDates.startDate}T00:00:00.000Z`);
  const points = Array.from({ length: Math.min(rangeDates.dailyPointCount, 14) }, (_, index) => ({
    timestamp: addUtcDays(start, index).toISOString(),
    value: roundMetric(2.8 + (index % 4) * 0.5)
  }));

  return [
    {
      id: "sample-ec2-cpu",
      label: "sample-api CPUUtilization",
      points,
      unit: "Percent"
    }
  ];
}

function createSampleWasteResources(
  project: Pick<Project, "id" | "name"> | undefined
): CostWasteResourceInsight[] {
  return [
    {
      estimatedMonthlyWaste: createMoneyEstimate(18),
      finding:
        "최근 평균 CPU가 3.2%라 DB 사용량이 낮습니다. 테스트 DB라면 db.t4g.micro 같은 작은 클래스로 낮추는 것을 먼저 검토하세요.",
      id: "sample-waste-rds-cpu",
      metricName: "CPUUtilization",
      ...(project === undefined
        ? {}
        : {
            projectId: project.id,
            projectName: project.name
          }),
      resourceId: "sample-db",
      resourceName: "sample-db",
      resourceType: "aws_db_instance",
      service: "Amazon Relational Database Service",
      unit: "Percent",
      averageValue: 3.2
    },
    {
      estimatedMonthlyWaste: createMoneyEstimate(16),
      finding:
        "일 평균 요청량이 42건으로 낮습니다. 테스트용 진입점이면 ALB를 제거하거나 하나의 공유 ALB로 합치는 편이 비용을 줄일 수 있습니다.",
      id: "sample-waste-alb-requests",
      metricName: "RequestCount",
      ...(project === undefined
        ? {}
        : {
            projectId: project.id,
            projectName: project.name
          }),
      resourceId: "sample-alb",
      resourceName: "sample-alb",
      resourceType: "aws_lb",
      service: "Elastic Load Balancing",
      unit: "Count",
      averageValue: 42
    }
  ];
}

function createCostRangeDates(range: CostUsageAnalysisRange, now: Date): CostRangeDates {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start =
    range === "month_to_date"
      ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      : addUtcDays(today, -(getRangeDayCount(range) - 1));
  const dailyPointCount = Math.max(1, diffUtcDays(start, today) + 1);

  return {
    dailyPointCount,
    endDate: toIsoDate(today),
    endExclusiveDate: toIsoDate(addUtcDays(today, 1)),
    startDate: toIsoDate(start)
  };
}

function getRangeDayCount(range: CostUsageAnalysisRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "month_to_date":
      return 1;
  }
}

function forecastMonthEndCost(amount: number, rangeDates: CostRangeDates, now: Date): number {
  const elapsedDayCount = rangeDates.dailyPointCount;
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();

  return roundUsd((amount / Math.max(elapsedDayCount, 1)) * daysInMonth);
}

function parseCostExplorerTagValue(value: string): string {
  const separatorIndex = value.indexOf("$");

  if (separatorIndex >= 0) {
    return value.slice(separatorIndex + 1).trim();
  }

  return value.trim();
}

function addUtcMonths(date: Date, monthCount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthCount, 1));
}

function toIsoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseLoadBalancerDimension(resourceId: string): string {
  const marker = "loadbalancer/";
  const markerIndex = resourceId.indexOf(marker);

  return markerIndex >= 0 ? resourceId.slice(markerIndex + marker.length) : resourceId;
}

function toAwsSdkCredentials(env: TerraformAwsCredentialEnv): AwsSdkCredentials {
  const credentials = {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  };

  if (env.AWS_SESSION_TOKEN === undefined) {
    return credentials;
  }

  return {
    ...credentials,
    sessionToken: env.AWS_SESSION_TOKEN
  };
}

function createMoneyEstimate(amount: number): MoneyEstimate {
  return {
    amount: roundUsd(amount),
    currency: "USD"
  };
}

function calculatePercentage(amount: number, totalAmount: number): number {
  if (totalAmount <= 0) {
    return 0;
  }

  return Math.round((amount / totalAmount) * 1000) / 10;
}

function createProjectFallbackUsageWeight(project: Pick<Project, "id" | "name">, index: number): number {
  const seed = `${project.id}:${project.name}`;

  return 8 + (createStableHash(seed) % 11) + index;
}

function createStableHash(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function compareCostProjectUsageRows(left: CostProjectUsage, right: CostProjectUsage): number {
  return right.amount - left.amount || left.projectName.localeCompare(right.projectName);
}

function compareCostResourceUsageRows(left: CostResourceUsage, right: CostResourceUsage): number {
  return (
    right.amount - left.amount ||
    (left.projectName ?? "").localeCompare(right.projectName ?? "") ||
    left.resourceName.localeCompare(right.resourceName)
  );
}

function getCostServiceForTerraformType(terraformType: string): string {
  switch (terraformType) {
    case "aws_db_instance":
      return "Amazon Relational Database Service";
    case "aws_instance":
      return "Amazon Elastic Compute Cloud";
    case "aws_lb":
      return "Elastic Load Balancing";
    case "aws_nat_gateway":
      return "Amazon Virtual Private Cloud";
    case "aws_s3_bucket":
      return "Amazon Simple Storage Service";
    default:
      return terraformType.replace(/^aws_/, "AWS ");
  }
}

function getRecommendationSeverity(amount: number): RiskLevel {
  if (amount >= 25) {
    return "high";
  }

  if (amount >= 10) {
    return "medium";
  }

  return "low";
}

function getRecommendationActionLabel(resource: CostWasteResourceInsight): string {
  switch (resource.resourceType) {
    case "aws_instance":
      return "t3.nano/t4g.nano로 낮추기 검토";
    case "aws_db_instance":
      return "db.t4g.micro로 낮추기 검토";
    case "aws_lb":
      return "공유 ALB 또는 제거 검토";
    case "aws_nat_gateway":
      return "NAT Gateway 제거 검토";
    default:
      return "리소스 사용량 재검토";
  }
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${roundMetric(value)}B`;
  }

  if (value < 1024 * 1024) {
    return `${roundMetric(value / 1024)}KB`;
  }

  return `${roundMetric(value / 1024 / 1024)}MB`;
}

function addUtcDays(date: Date, days: number): Date {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function diffUtcDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
