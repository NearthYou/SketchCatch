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

export type CostUsageTrendInsight = {
  readonly severity: "normal" | "warning";
  readonly title: string;
  readonly message: string;
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

export function analyzeCostUsageTrendShape(
  dailyTrend: readonly CostUsageTrendPoint[]
): CostUsageTrendInsight {
  if (dailyTrend.length < 3) {
    return {
      message: "Cost Explorer 일별 데이터가 충분하지 않습니다. 최소 3일 이상 누적 후 추세를 다시 확인하세요.",
      severity: "warning",
      title: "데이터 부족"
    };
  }

  const amounts = dailyTrend.map((point) => point.amount);
  const averageAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const maxAmount = Math.max(...amounts);
  const firstAmount = amounts[0] ?? 0;
  const lastAmount = amounts[amounts.length - 1] ?? 0;
  const averageDailyChange =
    amounts.slice(1).reduce((sum, amount, index) => {
      const previousAmount = amounts[index] ?? amount;
      return sum + Math.abs(amount - previousAmount);
    }, 0) / Math.max(amounts.length - 1, 1);

  if (averageAmount <= 0) {
    return {
      message: "분석 기간에 청구 비용이 거의 없습니다. 배포 리소스가 실제로 실행 중인지 먼저 확인하세요.",
      severity: "normal",
      title: "비용 없음"
    };
  }

  if (maxAmount / averageAmount >= 1.8) {
    return {
      message: "특정 일자 비용이 평균보다 크게 튑니다. 배포 이벤트, 트래픽 급증, NAT/데이터 전송량을 먼저 확인하세요.",
      severity: "warning",
      title: "일별 비용 급증"
    };
  }

  if (lastAmount > firstAmount * 1.35 && lastAmount - firstAmount > 1) {
    return {
      message: "최근 비용이 계속 올라가는 흐름입니다. 새로 추가된 리소스나 스케일링 설정을 확인하세요.",
      severity: "warning",
      title: "상승 추세"
    };
  }

  if (averageDailyChange / averageAmount > 0.28) {
    return {
      message: "일별 비용 변동폭이 큽니다. 주기적 배치, 로그 증가, 요청량 변동을 서비스별 비용과 함께 비교하세요.",
      severity: "warning",
      title: "변동성 큼"
    };
  }

  return {
    message: "분석 기간의 비용 흐름이 비교적 안정적입니다. 큰 이상 징후는 보이지 않습니다.",
    severity: "normal",
    title: "추세 안정"
  };
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
