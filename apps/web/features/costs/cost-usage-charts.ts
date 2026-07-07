import type {
  CostOptimizationRecommendation,
  CostServiceUsage,
  CostUsageTrendPoint
} from "@sketchcatch/types";

export type CostUsageLineChart = {
  readonly maxAmount: number;
  readonly path: string;
  readonly points: readonly {
    readonly amount: number;
    readonly date: string;
    readonly x: number;
    readonly y: number;
  }[];
};

export type CostServiceBar = {
  readonly amount: number;
  readonly label: string;
  readonly percentage: number;
  readonly widthPercentage: number;
};

export function createCostUsageLineChart(
  dailyTrend: readonly CostUsageTrendPoint[],
  options: {
    readonly height?: number;
    readonly width?: number;
  } = {}
): CostUsageLineChart {
  const width = options.width ?? 640;
  const height = options.height ?? 180;
  const maxAmount = Math.max(...dailyTrend.map((point) => point.amount), 1);
  const pointCount = dailyTrend.length;
  const points = dailyTrend.map((point, index) => {
    const x = pointCount <= 1 ? width / 2 : (index / (pointCount - 1)) * width;
    const y = height - (point.amount / maxAmount) * height;

    return {
      amount: point.amount,
      date: point.date,
      x: roundChartCoordinate(x),
      y: roundChartCoordinate(y)
    };
  });

  return {
    maxAmount,
    path: createSvgPath(points),
    points
  };
}

export function createServiceCostBars(
  serviceCosts: readonly CostServiceUsage[],
  limit = 6
): CostServiceBar[] {
  const visibleServices = serviceCosts.slice(0, limit);
  const maxAmount = Math.max(...visibleServices.map((service) => service.amount), 1);

  return visibleServices.map((service) => ({
    amount: service.amount,
    label: service.service,
    percentage: service.percentage,
    widthPercentage: Math.max(4, Math.round((service.amount / maxAmount) * 1000) / 10)
  }));
}

export function sumEstimatedMonthlySavings(
  recommendations: readonly CostOptimizationRecommendation[]
): number {
  return roundUsd(
    recommendations.reduce(
      (sum, recommendation) => sum + recommendation.estimatedMonthlySavings.amount,
      0
    )
  );
}

function createSvgPath(
  points: readonly {
    readonly x: number;
    readonly y: number;
  }[]
): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function roundChartCoordinate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
