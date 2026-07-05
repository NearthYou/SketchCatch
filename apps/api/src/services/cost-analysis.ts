import type {
  ArchitectureJson,
  CostEstimatePeriod,
  CostEstimateRequest,
  CostEstimateResult,
  CostEstimateSupportLevel,
  CostPricingSource,
  CostUsageAssumption,
  ResourceConfig,
  ResourceCostEstimate,
  ResourceNode,
  ResourceType
} from "@sketchcatch/types";

export type CostPricingUsageType =
  | "ec2_instance_hour"
  | "rds_instance_hour"
  | "rds_storage_gb_month"
  | "s3_storage_gb_month"
  | "nat_gateway_hour"
  | "alb_hour"
  | "lambda_request"
  | "api_gateway_request"
  | "cloudfront_data_gb";

export type CostPricingQuery = {
  usageType: CostPricingUsageType;
  resourceType: ResourceType;
  region: string;
  instanceType?: string | undefined;
  databaseEngine?: string | undefined;
  storageClass?: string | undefined;
};

export type CostPricingRate = {
  amount: number;
  unit: "hour" | "gb_month" | "request" | "gb";
  description?: string | undefined;
};

export type CostPricingRateProvider = (
  query: CostPricingQuery
) => Promise<CostPricingRate | null>;

export type AnalyzeCostOptions = {
  pricingRateProvider?: CostPricingRateProvider | undefined;
};

export const DEFAULT_COST_ESTIMATE_PERIOD: CostEstimatePeriod = "month";
export const DEFAULT_EXPECTED_USER_COUNT = 1000;
export const DEFAULT_COST_REGION = "ap-northeast-2";

const MONTH_HOURS = 730;
const PERIOD_MONTH_FACTOR: Record<CostEstimatePeriod, number> = {
  day: 1 / 30,
  week: 7 / 30,
  month: 1
};

const FALLBACK_EC2_MONTHLY_USD: Record<string, number> = {
  "t2.micro": 8.5,
  "t3.micro": 8.5,
  "t3.small": 17.0,
  "t3.medium": 34.0
};

const FALLBACK_RDS_INSTANCE_MONTHLY_USD: Record<string, number> = {
  "db.t3.micro": 36.5,
  "db.t4g.micro": 36.5,
  "db.t3.small": 62.0,
  "db.t4g.small": 62.0
};

const FALLBACK_RDS_STORAGE_GB_MONTH_USD = 0.115;
const FALLBACK_S3_STORAGE_GB_MONTH_USD = 0.023;
const FALLBACK_NAT_GATEWAY_MONTHLY_USD = 32.85;
const FALLBACK_ALB_MONTHLY_USD = 16.2;
const FALLBACK_LAMBDA_REQUEST_USD = 0.0000002;
const FALLBACK_API_GATEWAY_REQUEST_USD = 0.0000035;
const FALLBACK_CLOUDFRONT_DATA_GB_USD = 0.085;

export function createCostEstimateRequest(input: {
  architectureJson: ArchitectureJson;
  period?: CostEstimatePeriod | undefined;
  expectedUserCount?: number | undefined;
  region?: string | undefined;
}): CostEstimateRequest {
  return {
    architectureJson: input.architectureJson,
    period: input.period ?? DEFAULT_COST_ESTIMATE_PERIOD,
    expectedUserCount: normalizeExpectedUserCount(input.expectedUserCount),
    region: normalizeRegion(input.region)
  };
}

export async function analyzeCost(
  rawInput: CostEstimateRequest,
  options: AnalyzeCostOptions = {}
): Promise<CostEstimateResult> {
  const input = createCostEstimateRequest(rawInput);
  const resources = await Promise.all(
    input.architectureJson.nodes.map((node) => estimateResourceCost(node, input, options))
  );
  const totalMonthlyAmount = roundUsd(
    resources.reduce((sum, resource) => sum + resource.monthlyEstimate.amount, 0)
  );
  const totalEstimateAmount = roundUsd(totalMonthlyAmount * PERIOD_MONTH_FACTOR[input.period]);
  const billableResources = resources.filter((resource) => resource.monthlyEstimate.amount > 0);
  const fallbackUsed = billableResources.some((resource) => resource.pricingSource !== "aws_pricing_api");
  const pricingSource: CostPricingSource =
    billableResources.length > 0 && !fallbackUsed ? "aws_pricing_api" : "fallback";
  const totalEstimate = {
    amount: totalEstimateAmount,
    currency: "USD" as const
  };
  const totalMonthlyEstimate = {
    amount: totalMonthlyAmount,
    currency: "USD" as const
  };

  return {
    totalEstimate,
    totalMonthlyEstimate,
    period: input.period,
    expectedUserCount: input.expectedUserCount,
    region: input.region,
    pricingSource,
    fallbackUsed,
    assumptions: createCostAssumptions(input),
    resources,
    reviewMessages: createReviewMessages(totalEstimate.amount, input.period, billableResources),
    pricingAssumption: createPricingAssumption(fallbackUsed, pricingSource)
  };
}

async function estimateResourceCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceCostEstimate> {
  if (node.type === "EC2") {
    return estimateEc2Cost(node, input, options);
  }

  if (node.type === "RDS") {
    if (getTerraformResourceType(node) === "aws_db_snapshot") {
      return createZeroCostEstimate(node);
    }

    return estimateRdsCost(node, input, options);
  }

  if (node.type === "S3") {
    return estimateS3Cost(node, input, options);
  }

  if (isNatGateway(node)) {
    return estimateAlwaysOnServiceCost(node, {
      monthlyAmount: FALLBACK_NAT_GATEWAY_MONTHLY_USD,
      costDrivers: ["NAT Gateway hourly runtime", "data processing"],
      explanation: "NAT Gateway는 켜져 있는 시간과 데이터 처리량에 따라 비용이 계속 발생합니다.",
      recommendation: "NAT Gateway가 꼭 필요한 구조인지 먼저 확인해보시는 걸 권장드립니다.",
      usageAssumptions: [
        { label: "runtime", value: `${MONTH_HOURS}h/month` },
        { label: "region", value: input.region }
      ]
    });
  }

  if (isApplicationLoadBalancer(node)) {
    return estimateAlwaysOnServiceCost(node, {
      monthlyAmount: FALLBACK_ALB_MONTHLY_USD,
      costDrivers: ["ALB hourly runtime", "load balancer capacity"],
      explanation: "Load Balancer는 트래픽이 적어도 시간 기준 비용이 발생합니다.",
      recommendation: "단일 EC2 실습이면 Load Balancer 필요성을 먼저 확인해보시는 걸 권장드립니다.",
      usageAssumptions: [
        { label: "runtime", value: `${MONTH_HOURS}h/month` },
        { label: "region", value: input.region }
      ]
    });
  }

  if (node.type === "LAMBDA") {
    return estimateUsageBasedCost(node, {
      monthlyAmount: roundUsd(input.expectedUserCount * 300 * FALLBACK_LAMBDA_REQUEST_USD),
      costDrivers: ["expected requests"],
      explanation: "Lambda는 예상 요청 수와 실행 시간 가정에 따라 비용이 달라집니다.",
      usageAssumptions: [
        { label: "expected requests", value: `${formatInteger(input.expectedUserCount * 300)}/month` }
      ]
    });
  }

  if (node.type === "API_GATEWAY_REST_API") {
    return estimateUsageBasedCost(node, {
      monthlyAmount: roundUsd(input.expectedUserCount * 300 * FALLBACK_API_GATEWAY_REQUEST_USD),
      costDrivers: ["expected API requests"],
      explanation: "API Gateway는 예상 요청 수가 비용의 주요 입력입니다.",
      usageAssumptions: [
        { label: "expected requests", value: `${formatInteger(input.expectedUserCount * 300)}/month` }
      ]
    });
  }

  if (node.type === "CLOUDFRONT") {
    const dataGb = estimateDataTransferGb(input.expectedUserCount);

    return estimateUsageBasedCost(node, {
      monthlyAmount: roundUsd(dataGb * FALLBACK_CLOUDFRONT_DATA_GB_USD),
      costDrivers: ["estimated data transfer"],
      explanation: "CloudFront는 예상 데이터 전송량이 비용에 영향을 줍니다.",
      usageAssumptions: [{ label: "data transfer", value: `${formatNumber(dataGb)}GB/month` }]
    });
  }

  return createZeroCostEstimate(node);
}

async function estimateEc2Cost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceCostEstimate> {
  const instanceType = getTextConfig(node.config, ["instanceType", "instance_type"]) ?? "t3.micro";
  const priced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "ec2_instance_hour",
      resourceType: node.type,
      region: input.region,
      instanceType
    },
    MONTH_HOURS,
    FALLBACK_EC2_MONTHLY_USD[instanceType] ?? FALLBACK_EC2_MONTHLY_USD["t3.micro"] ?? 8.5
  );

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: priced.amount,
      currency: "USD"
    },
    supportLevel: getSupportLevel(priced.pricingSource),
    supportReason: getSupportReason(priced.pricingSource),
    costDrivers: [`${instanceType} instance`, `${MONTH_HOURS}h/month runtime`],
    explanation: "EC2는 인스턴스 크기와 실행 시간이 비용에 직접 영향을 줍니다.",
    pricingSource: priced.pricingSource,
    usageAssumptions: [
      { label: "instance type", value: instanceType },
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      { label: "region", value: input.region }
    ],
    recommendation: "이 리소스의 인스턴스 크기를 줄여보시는 걸 권장드립니다."
  };
}

async function estimateRdsCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceCostEstimate> {
  const instanceClass = getTextConfig(node.config, ["instanceClass", "instance_class"]) ?? "db.t4g.micro";
  const engine = getTextConfig(node.config, ["engine"]) ?? "postgres";
  const storageGb = getNumberConfig(node.config, ["allocatedStorage", "allocated_storage"], 20);
  const instancePriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "rds_instance_hour",
      resourceType: node.type,
      region: input.region,
      instanceType: instanceClass,
      databaseEngine: engine
    },
    MONTH_HOURS,
    FALLBACK_RDS_INSTANCE_MONTHLY_USD[instanceClass] ??
      FALLBACK_RDS_INSTANCE_MONTHLY_USD["db.t4g.micro"] ??
      36.5
  );
  const storagePriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "rds_storage_gb_month",
      resourceType: node.type,
      region: input.region,
      databaseEngine: engine
    },
    storageGb,
    0
  );
  const fallbackStorageAmount =
    storagePriced.pricingSource === "aws_pricing_api"
      ? storagePriced.amount
      : storageGb * FALLBACK_RDS_STORAGE_GB_MONTH_USD;
  const pricingSource =
    instancePriced.pricingSource === "aws_pricing_api" && storagePriced.pricingSource === "aws_pricing_api"
      ? "aws_pricing_api"
      : "fallback";

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(instancePriced.amount + fallbackStorageAmount),
      currency: "USD"
    },
    supportLevel: getSupportLevel(pricingSource),
    supportReason: getSupportReason(pricingSource),
    costDrivers: [`${instanceClass} DB instance`, `${storageGb}GB storage`, `${MONTH_HOURS}h/month runtime`],
    explanation: "RDS는 실행 시간과 스토리지 비용이 함께 발생합니다.",
    pricingSource,
    usageAssumptions: [
      { label: "instance class", value: instanceClass },
      { label: "storage", value: `${storageGb}GB` },
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      { label: "region", value: input.region }
    ],
    recommendation: "이 리소스의 인스턴스 크기를 줄여보시는 걸 권장드립니다."
  };
}

async function estimateS3Cost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceCostEstimate> {
  const storageGb = estimateObjectStorageGb(input.expectedUserCount);
  const priced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "s3_storage_gb_month",
      resourceType: node.type,
      region: input.region,
      storageClass: "standard"
    },
    storageGb,
    storageGb * FALLBACK_S3_STORAGE_GB_MONTH_USD
  );

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: priced.amount,
      currency: "USD"
    },
    supportLevel: getSupportLevel(priced.pricingSource),
    supportReason: getSupportReason(priced.pricingSource),
    costDrivers: ["estimated object storage"],
    explanation: "S3는 예상 저장 용량과 요청 수에 따라 비용이 달라집니다.",
    pricingSource: priced.pricingSource,
    usageAssumptions: [
      { label: "expected storage", value: `${formatNumber(storageGb)}GB/month` },
      { label: "expected users", value: `${formatInteger(input.expectedUserCount)}` },
      { label: "region", value: input.region }
    ]
  };
}

function estimateAlwaysOnServiceCost(
  node: ResourceNode,
  estimate: {
    monthlyAmount: number;
    costDrivers: string[];
    explanation: string;
    recommendation: string;
    usageAssumptions: CostUsageAssumption[];
  }
): ResourceCostEstimate {
  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(estimate.monthlyAmount),
      currency: "USD"
    },
    supportLevel: "fallback_estimate",
    supportReason: "AWS Pricing API 조회가 아직 연결되지 않아 SketchCatch fallback 단가로 계산했습니다.",
    costDrivers: estimate.costDrivers,
    explanation: estimate.explanation,
    pricingSource: "fallback",
    usageAssumptions: estimate.usageAssumptions,
    recommendation: estimate.recommendation
  };
}

function estimateUsageBasedCost(
  node: ResourceNode,
  estimate: {
    monthlyAmount: number;
    costDrivers: string[];
    explanation: string;
    usageAssumptions: CostUsageAssumption[];
  }
): ResourceCostEstimate {
  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(estimate.monthlyAmount),
      currency: "USD"
    },
    supportLevel: "fallback_estimate",
    supportReason: "AWS Pricing API 조회가 아직 연결되지 않아 SketchCatch fallback 단가로 계산했습니다.",
    costDrivers: estimate.costDrivers,
    explanation: estimate.explanation,
    pricingSource: "fallback",
    usageAssumptions: estimate.usageAssumptions
  };
}

function createZeroCostEstimate(node: ResourceNode): ResourceCostEstimate {
  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: 0,
      currency: "USD"
    },
    supportLevel: "not_estimated",
    supportReason: "이 Resource는 아직 비용 산정 규칙이 없어 합계에 포함하지 않았습니다.",
    costDrivers: [],
    explanation: "이 Resource는 현재 비용 산정 대상이 아니거나 다른 Resource 비용에 포함됩니다.",
    pricingSource: "fallback",
    usageAssumptions: []
  };
}

async function estimateMonthlyAmountFromRate(
  pricingRateProvider: CostPricingRateProvider | undefined,
  query: CostPricingQuery,
  quantity: number,
  fallbackMonthlyAmount: number
): Promise<{ amount: number; pricingSource: CostPricingSource }> {
  if (pricingRateProvider === undefined) {
    return {
      amount: roundUsd(fallbackMonthlyAmount),
      pricingSource: "fallback"
    };
  }

  try {
    const rate = await pricingRateProvider(query);

    if (rate !== null && Number.isFinite(rate.amount) && rate.amount >= 0) {
      return {
        amount: roundUsd(rate.amount * quantity),
        pricingSource: "aws_pricing_api"
      };
    }
  } catch {
    return {
      amount: roundUsd(fallbackMonthlyAmount),
      pricingSource: "fallback"
    };
  }

  return {
    amount: roundUsd(fallbackMonthlyAmount),
    pricingSource: "fallback"
  };
}

function createCostAssumptions(input: CostEstimateRequest): string[] {
  return [
    `기간은 ${input.period} 기준으로 계산합니다.`,
    `예상 사용자 수 ${formatInteger(input.expectedUserCount)}명은 실제 사용량이 아니라 비용 추정용 가정치입니다.`,
    `리전은 ${input.region} 기준으로 계산합니다.`,
    "EC2, RDS, NAT Gateway, Load Balancer는 켜져 있는 시간 기준 비용으로 계산합니다.",
    "S3, Lambda, API Gateway, CloudFront는 예상 사용자 수에서 파생한 저장량과 요청량으로 계산합니다."
  ];
}

function createReviewMessages(
  totalAmount: number,
  period: CostEstimatePeriod,
  billableResources: readonly ResourceCostEstimate[]
): string[] {
  const messages = [`현재 상황에서의 총 예상 비용은 $${formatMoney(totalAmount)} / ${period}입니다.`];
  const resourceTypes = new Set(billableResources.map((resource) => resource.resourceType));
  const hasNatGateway = billableResources.some(isNatGatewayEstimate);
  const hasLoadBalancer = billableResources.some(isLoadBalancerEstimate);
  const topResource = [...billableResources].sort(
    (left, right) => right.monthlyEstimate.amount - left.monthlyEstimate.amount
  )[0];

  if (resourceTypes.has("RDS")) {
    messages.push("RDS는 실행 시간과 스토리지 비용이 함께 발생합니다.");
  }

  if (resourceTypes.has("EC2")) {
    messages.push("EC2는 인스턴스 크기와 실행 시간이 비용에 직접 영향을 줍니다.");
  }

  if (hasNatGateway) {
    messages.push("NAT Gateway는 트래픽이 적어도 시간당 비용이 계속 발생합니다.");
  }

  if (hasLoadBalancer) {
    messages.push("Load Balancer는 트래픽이 적어도 시간 기준 비용이 발생합니다.");
  }

  if (topResource?.recommendation !== undefined) {
    messages.push(topResource.recommendation);
  }

  return [...new Set(messages)];
}

function createPricingAssumption(fallbackUsed: boolean, pricingSource: CostPricingSource): string {
  if (pricingSource === "aws_pricing_api" && !fallbackUsed) {
    return "AWS Pricing API에서 조회한 단가를 기준으로 계산했습니다.";
  }

  return "AWS Pricing API로 조회하지 못한 항목은 SketchCatch fallback 단가로 계산했습니다.";
}

function getSupportLevel(pricingSource: CostPricingSource): CostEstimateSupportLevel {
  return pricingSource === "aws_pricing_api" ? "aws_pricing_api" : "fallback_estimate";
}

function getSupportReason(pricingSource: CostPricingSource): string {
  if (pricingSource === "aws_pricing_api") {
    return "AWS Pricing API에서 조회한 단가로 계산했습니다.";
  }

  return "AWS Pricing API 조회가 꺼져 있거나 실패해 SketchCatch fallback 단가로 계산했습니다.";
}

function isNatGateway(node: ResourceNode): boolean {
  return readServiceName(node.config).includes("nat_gateway") || readServiceName(node.config).includes("nat-gateway");
}

function isApplicationLoadBalancer(node: ResourceNode): boolean {
  const serviceName = readServiceName(node.config);

  return (
    serviceName === "aws_lb" ||
    serviceName.includes("application_load_balancer") ||
    serviceName.includes("load_balancer") ||
    serviceName.includes("alb")
  );
}

function isNatGatewayEstimate(resource: ResourceCostEstimate): boolean {
  return resource.costDrivers.some((driver) => driver.toLowerCase().includes("nat gateway"));
}

function isLoadBalancerEstimate(resource: ResourceCostEstimate): boolean {
  return resource.costDrivers.some((driver) => driver.toLowerCase().includes("alb"));
}

function readServiceName(config: ResourceConfig): string {
  return (
    getTextConfig(config, ["service", "terraformResourceType", "terraformType", "resourceType", "type"])?.toLowerCase() ??
    ""
  );
}

function getTerraformResourceType(node: ResourceNode): string | undefined {
  return getTextConfig(node.config, ["terraformResourceType", "terraformType", "resourceType", "type"]);
}

function getTextConfig(config: ResourceConfig, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = config[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function getNumberConfig(config: ResourceConfig, keys: readonly string[], fallback: number): number {
  for (const key of keys) {
    const value = config[key];

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);

      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return fallback;
}

function normalizeExpectedUserCount(expectedUserCount: number | undefined): number {
  if (expectedUserCount === undefined || !Number.isFinite(expectedUserCount)) {
    return DEFAULT_EXPECTED_USER_COUNT;
  }

  return Math.max(1, Math.min(1_000_000, Math.round(expectedUserCount)));
}

function normalizeRegion(region: string | undefined): string {
  const normalized = region?.trim();

  return normalized === undefined || normalized.length === 0 ? DEFAULT_COST_REGION : normalized;
}

function estimateObjectStorageGb(expectedUserCount: number): number {
  return Math.max(1, roundOneDecimal(expectedUserCount * 0.02));
}

function estimateDataTransferGb(expectedUserCount: number): number {
  return Math.max(1, roundOneDecimal(expectedUserCount * 0.1));
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function roundOneDecimal(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 10) / 10;
}

function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

function formatNumber(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function formatInteger(amount: number): string {
  return Math.round(amount).toLocaleString("en-US");
}
