import type {
  CostOptimizationRecommendation,
  CostServiceUsage,
  CostUsageTrendPoint
} from "@sketchcatch/types";

export type CostUsageLineChart = {
  readonly height: number;
  readonly maxAmount: number;
  readonly path: string;
  readonly plot: {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  };
  readonly points: readonly {
    readonly amount: number;
    readonly date: string;
    readonly x: number;
    readonly y: number;
  }[];
  readonly width: number;
  readonly xTicks: readonly {
    readonly date: string;
    readonly label: string;
    readonly x: number;
  }[];
  readonly yTicks: readonly {
    readonly amount: number;
    readonly label: string;
    readonly y: number;
  }[];
};

export type CostServiceBar = {
  readonly amount: number;
  readonly label: string;
  readonly percentage: number;
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
  const height = options.height ?? 220;
  const plot = {
    bottom: height - 28,
    left: 44,
    right: width - 12,
    top: 12
  };
  const maxAmount = Math.max(...dailyTrend.map((point) => point.amount), 0);
  const yAxis = createCostYAxis(maxAmount);
  const pointCount = dailyTrend.length;
  const points = dailyTrend.map((point, index) => {
    const x = pointCount <= 1
      ? (plot.left + plot.right) / 2
      : plot.left + (index / (pointCount - 1)) * (plot.right - plot.left);
    const y = plot.bottom - (point.amount / yAxis.maxAmount) * (plot.bottom - plot.top);

    return {
      amount: point.amount,
      date: point.date,
      x: roundChartCoordinate(x),
      y: roundChartCoordinate(y)
    };
  });

  return {
    height,
    maxAmount,
    path: createSvgPath(points),
    plot,
    points,
    width,
    xTicks: createCostDateTicks(points),
    yTicks: yAxis.amounts.map((amount) => ({
      amount,
      label: formatCostAxisAmount(amount),
      y: roundChartCoordinate(
        plot.bottom - (amount / yAxis.maxAmount) * (plot.bottom - plot.top)
      )
    }))
  };
}

export function createServiceCostBars(
  serviceCosts: readonly CostServiceUsage[],
  limit = 6
): CostServiceBar[] {
  const visibleServices = serviceCosts.slice(0, limit);

  return visibleServices.map((service) => ({
    amount: service.amount,
    label: service.service,
    percentage: service.percentage
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

function createCostDateTicks(
  points: CostUsageLineChart["points"],
  maxTickCount = 6
): CostUsageLineChart["xTicks"] {
  if (points.length === 0) return [];

  const tickCount = Math.min(points.length, maxTickCount);
  const indices = tickCount === 1
    ? [0]
    : Array.from(
        { length: tickCount },
        (_, index) => Math.round((index / (tickCount - 1)) * (points.length - 1))
      );

  return [...new Set(indices)].map((index) => {
    const point = points[index]!;

    return {
      date: point.date,
      label: formatCostAxisDate(point.date),
      x: point.x
    };
  });
}

function createCostYAxis(maxAmount: number): {
  readonly amounts: readonly number[];
  readonly maxAmount: number;
} {
  if (maxAmount <= 0) {
    return {
      amounts: [0, 2, 4],
      maxAmount: 4
    };
  }

  const step = Math.max(createNiceCostStep(maxAmount / 3), 0.01);
  const axisMaxAmount = roundUsd(Math.ceil(maxAmount / step) * step);
  const intervalCount = Math.round(axisMaxAmount / step);

  return {
    amounts: Array.from(
      { length: intervalCount + 1 },
      (_, index) => roundUsd(index * step)
    ),
    maxAmount: axisMaxAmount
  };
}

function createNiceCostStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const niceStep = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;

  return niceStep * magnitude;
}

function formatCostAxisDate(date: string): string {
  const [, month = "", day = ""] = date.split("-");

  return `${Number(month)}.${Number(day)}`;
}

function formatCostAxisAmount(amount: number): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : amount < 1 ? 2 : 1;

  return `$${amount.toFixed(fractionDigits).replace(/\.0+$/, "")}`;
}

function roundChartCoordinate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
