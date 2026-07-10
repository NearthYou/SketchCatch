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
  | "ebs_storage_gb_month"
  | "rds_instance_hour"
  | "rds_storage_gb_month"
  | "rds_snapshot_gb_month"
  | "s3_storage_gb_month"
  | "vpc_endpoint_hour"
  | "vpc_peering_data_gb"
  | "eip_hour"
  | "nat_gateway_hour"
  | "alb_hour"
  | "efs_storage_gb_month"
  | "dynamodb_storage_gb_month"
  | "dynamodb_request"
  | "elasticache_node_hour"
  | "kms_key_month"
  | "kms_request"
  | "secretsmanager_secret_month"
  | "lambda_request"
  | "api_gateway_request"
  | "sqs_request"
  | "sns_request"
  | "eventbridge_event"
  | "scheduler_invocation"
  | "cloudfront_data_gb"
  | "route53_hosted_zone_month"
  | "cloudwatch_log_ingest_gb"
  | "cloudwatch_log_storage_gb_month"
  | "cloudwatch_alarm_month"
  | "cloudwatch_dashboard_month"
  | "cloudtrail_event"
  | "xray_trace"
  | "ecs_fargate_vcpu_hour"
  | "ecs_fargate_gb_hour"
  | "ecr_storage_gb_month"
  | "eks_cluster_hour"
  | "codebuild_minute"
  | "codepipeline_pipeline_month"
  | "config_item"
  | "config_rule_eval"
  | "waf_web_acl_month"
  | "waf_request"
  | "shield_protection_month"
  | "guardduty_event_gb";

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
  unit: "hour" | "gb_month" | "request" | "gb" | "month" | "minute" | "event";
  description?: string | undefined;
};

export type CostPricingRateProvider = (
  query: CostPricingQuery
) => Promise<CostPricingRate | null>;

export type AnalyzeCostOptions = {
  pricingRateProvider?: CostPricingRateProvider | undefined;
};

type ResourceMonthlyCostEstimate = Omit<ResourceCostEstimate, "periodEstimate">;

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
  "t2.small": 17.0,
  "t2.medium": 34.0,
  "t3.nano": 2.13,
  "t3.micro": 8.5,
  "t3.small": 17.0,
  "t3.medium": 34.0,
  "t3.large": 68.0,
  "t3.xlarge": 136.0,
  "t3.2xlarge": 272.0,
  "t3a.nano": 1.91,
  "t3a.micro": 7.65,
  "t3a.small": 15.3,
  "t3a.medium": 30.6,
  "t3a.large": 61.2,
  "t4g.nano": 1.7,
  "t4g.micro": 6.8,
  "t4g.small": 13.6,
  "t4g.medium": 27.2,
  "t4g.large": 54.4,
  "m5.large": 70.0,
  "m5.xlarge": 140.0,
  "m5.2xlarge": 280.0,
  "m6i.large": 70.0,
  "m6i.xlarge": 140.0,
  "m6i.2xlarge": 280.0,
  "c5.large": 62.0,
  "c5.xlarge": 124.0,
  "c5.2xlarge": 248.0,
  "c6i.large": 62.0,
  "c6i.xlarge": 124.0,
  "c6i.2xlarge": 248.0,
  "r5.large": 91.0,
  "r5.xlarge": 182.0,
  "r5.2xlarge": 364.0,
  "r6i.large": 91.0,
  "r6i.xlarge": 182.0,
  "r6i.2xlarge": 364.0
};

const FALLBACK_RDS_INSTANCE_MONTHLY_USD: Record<string, number> = {
  "db.t3.micro": 36.5,
  "db.t3.small": 62.0,
  "db.t3.medium": 124.0,
  "db.t3.large": 248.0,
  "db.t3.xlarge": 496.0,
  "db.t4g.micro": 36.5,
  "db.t4g.small": 62.0,
  "db.t4g.medium": 124.0,
  "db.t4g.large": 248.0,
  "db.t4g.xlarge": 496.0,
  "db.m5.large": 250.0,
  "db.m5.xlarge": 500.0,
  "db.m5.2xlarge": 1000.0,
  "db.m6i.large": 250.0,
  "db.m6i.xlarge": 500.0,
  "db.m6i.2xlarge": 1000.0,
  "db.r5.large": 330.0,
  "db.r5.xlarge": 660.0,
  "db.r5.2xlarge": 1320.0,
  "db.r6i.large": 330.0,
  "db.r6i.xlarge": 660.0,
  "db.r6i.2xlarge": 1320.0
};

const FALLBACK_ELASTICACHE_MONTHLY_USD: Record<string, number> = {
  "cache.t3.micro": 13.0,
  "cache.t3.small": 26.0,
  "cache.t3.medium": 52.0,
  "cache.t4g.micro": 13.0,
  "cache.t4g.small": 26.0,
  "cache.t4g.medium": 52.0,
  "cache.m6g.large": 110.0,
  "cache.m6g.xlarge": 220.0,
  "cache.r6g.large": 145.0,
  "cache.r6g.xlarge": 290.0
};

const FALLBACK_EC2_FAMILY_MICRO_MONTHLY_USD: Record<string, number> = {
  t2: 8.5,
  t3: 8.5,
  t3a: 7.65,
  t4g: 6.8,
  m5: 8.75,
  m6i: 8.75,
  c5: 7.75,
  c6i: 7.75,
  r5: 11.375,
  r6i: 11.375
};

const FALLBACK_RDS_FAMILY_MICRO_MONTHLY_USD: Record<string, number> = {
  t3: 36.5,
  t4g: 36.5,
  m5: 31.25,
  m6i: 31.25,
  r5: 41.25,
  r6i: 41.25
};

const FALLBACK_ELASTICACHE_FAMILY_MICRO_MONTHLY_USD: Record<string, number> = {
  t3: 13.0,
  t4g: 13.0,
  m6g: 13.75,
  r6g: 18.125
};

const INSTANCE_SIZE_MULTIPLIER: Record<string, number> = {
  nano: 0.25,
  micro: 1,
  small: 2,
  medium: 4,
  large: 8,
  xlarge: 16,
  "2xlarge": 32,
  "4xlarge": 64,
  "8xlarge": 128,
  "12xlarge": 192,
  "16xlarge": 256,
  "24xlarge": 384,
  "32xlarge": 512
};

const FALLBACK_RDS_STORAGE_GB_MONTH_USD = 0.115;
const FALLBACK_RDS_SNAPSHOT_GB_MONTH_USD = 0.095;
const FALLBACK_S3_STORAGE_GB_MONTH_USD = 0.023;
const FALLBACK_VPC_ENDPOINT_MONTHLY_USD = 7.3;
const FALLBACK_VPC_PEERING_DATA_GB_USD = 0.01;
const FALLBACK_EIP_MONTHLY_USD = 3.65;
const FALLBACK_NAT_GATEWAY_MONTHLY_USD = 32.85;
const FALLBACK_ALB_MONTHLY_USD = 16.2;
const FALLBACK_EBS_STORAGE_GB_MONTH_USD = 0.08;
const FALLBACK_EFS_STORAGE_GB_MONTH_USD = 0.3;
const FALLBACK_DYNAMODB_STORAGE_GB_MONTH_USD = 0.25;
const FALLBACK_DYNAMODB_REQUEST_USD = 0.00000125;
const FALLBACK_ELASTICACHE_DEFAULT_MONTHLY_USD = 13.0;
const FALLBACK_KMS_KEY_MONTHLY_USD = 1.0;
const FALLBACK_KMS_REQUEST_USD = 0.000003;
const FALLBACK_SECRETSMANAGER_SECRET_MONTHLY_USD = 0.4;
const FALLBACK_LAMBDA_REQUEST_USD = 0.0000002;
const FALLBACK_API_GATEWAY_REQUEST_USD = 0.0000035;
const FALLBACK_SQS_REQUEST_USD = 0.0000004;
const FALLBACK_SNS_REQUEST_USD = 0.0000005;
const FALLBACK_EVENTBRIDGE_EVENT_USD = 0.000001;
const FALLBACK_SCHEDULER_INVOCATION_USD = 0.000001;
const FALLBACK_CLOUDFRONT_DATA_GB_USD = 0.085;
const FALLBACK_ROUTE53_HOSTED_ZONE_MONTHLY_USD = 0.5;
const FALLBACK_CLOUDWATCH_LOG_INGEST_GB_USD = 0.5;
const FALLBACK_CLOUDWATCH_LOG_STORAGE_GB_MONTH_USD = 0.03;
const FALLBACK_CLOUDWATCH_ALARM_MONTHLY_USD = 0.1;
const FALLBACK_CLOUDWATCH_DASHBOARD_MONTHLY_USD = 3.0;
const FALLBACK_CLOUDTRAIL_EVENT_USD = 0.000001;
const FALLBACK_XRAY_TRACE_USD = 0.000005;
const FALLBACK_ECS_FARGATE_VCPU_HOUR_USD = 0.04048;
const FALLBACK_ECS_FARGATE_GB_HOUR_USD = 0.004445;
const FALLBACK_ECR_STORAGE_GB_MONTH_USD = 0.1;
const FALLBACK_EKS_CLUSTER_MONTHLY_USD = 73.0;
const FALLBACK_CODEBUILD_MINUTE_USD = 0.005;
const FALLBACK_CODEPIPELINE_MONTHLY_USD = 1.0;
const FALLBACK_CONFIG_ITEM_USD = 0.003;
const FALLBACK_CONFIG_RULE_EVAL_USD = 0.001;
const FALLBACK_WAF_WEB_ACL_MONTHLY_USD = 5.0;
const FALLBACK_WAF_REQUEST_USD = 0.0000006;
const FALLBACK_SHIELD_PROTECTION_MONTHLY_USD = 3000.0;
const FALLBACK_GUARDDUTY_EVENT_GB_USD = 1.0;

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
  const monthlyResources = await Promise.all(
    input.architectureJson.nodes.map((node) => estimateResourceCost(node, input, options))
  );
  const resources = monthlyResources.map((resource) => withPeriodEstimate(resource, input.period));
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

function withPeriodEstimate(
  resource: ResourceMonthlyCostEstimate,
  period: CostEstimatePeriod
): ResourceCostEstimate {
  return {
    ...resource,
    periodEstimate: {
      amount: roundUsd(resource.monthlyEstimate.amount * PERIOD_MONTH_FACTOR[period]),
      currency: resource.monthlyEstimate.currency
    }
  };
}

async function estimateResourceCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const terraformResourceType = getTerraformResourceType(node);

  switch (terraformResourceType) {
    case "aws_nat_gateway":
      return estimateRateBasedCost(node, input, options, {
        usageType: "nat_gateway_hour",
        quantity: MONTH_HOURS * estimateUserScaleFactor(input.expectedUserCount),
        fallbackMonthlyAmount: roundUsd(
          FALLBACK_NAT_GATEWAY_MONTHLY_USD * estimateUserScaleFactor(input.expectedUserCount)
        ),
        costDrivers: [
          "NAT Gateway hourly runtime",
          "data processing",
          `expected capacity x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
        ],
        explanation: "NAT Gateway는 켜져 있는 시간과 데이터 처리량에 따라 비용이 계속 발생합니다.",
        recommendation: "NAT Gateway가 꼭 필요한 구조인지 먼저 확인해보시는 걸 권장드립니다.",
        usageAssumptions: [
          { label: "runtime", value: `${MONTH_HOURS}h/month` },
          {
            label: "expected capacity factor",
            value: `x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
          },
          { label: "region", value: input.region }
        ]
      });
    case "aws_vpc_endpoint":
      return estimateRateBasedCost(node, input, options, {
        usageType: "vpc_endpoint_hour",
        quantity: MONTH_HOURS * estimateUserScaleFactor(input.expectedUserCount),
        fallbackMonthlyAmount: roundUsd(
          FALLBACK_VPC_ENDPOINT_MONTHLY_USD * estimateUserScaleFactor(input.expectedUserCount)
        ),
        costDrivers: [
          "VPC endpoint hourly runtime",
          `expected capacity x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
        ],
        explanation: "VPC Endpoint는 endpoint가 켜져 있는 시간과 데이터 처리량에 따라 비용이 발생할 수 있습니다.",
        usageAssumptions: [
          { label: "runtime", value: `${MONTH_HOURS}h/month` },
          {
            label: "expected capacity factor",
            value: `x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
          },
          { label: "region", value: input.region }
        ]
      });
    case "aws_vpc_peering_connection": {
      const dataGb = estimateDataTransferGb(input.expectedUserCount);

      return estimateRateBasedCost(node, input, options, {
        usageType: "vpc_peering_data_gb",
        quantity: dataGb,
        fallbackMonthlyAmount: roundUsd(dataGb * FALLBACK_VPC_PEERING_DATA_GB_USD),
        costDrivers: ["estimated peering data transfer"],
        explanation: "VPC Peering 자체는 고정 시간 비용보다 데이터 전송량이 비용에 영향을 줍니다.",
        usageAssumptions: [{ label: "data transfer", value: `${formatNumber(dataGb)}GB/month` }]
      });
    }
    case "aws_eip":
      return estimateRateBasedCost(node, input, options, {
        usageType: "eip_hour",
        quantity: MONTH_HOURS,
        fallbackMonthlyAmount: FALLBACK_EIP_MONTHLY_USD,
        costDrivers: ["public IPv4 address hourly charge"],
        explanation: "Elastic IP는 public IPv4 주소 보유 시간에 따라 비용이 발생할 수 있습니다.",
        usageAssumptions: [{ label: "runtime", value: `${MONTH_HOURS}h/month` }]
      });
    case "aws_lb":
      return estimateLoadBalancerCost(node, input, options);
    case "aws_instance":
      return estimateEc2Cost(node, input, options);
    case "aws_autoscaling_group":
      return createNoDirectCostEstimate(
        node,
        "Auto Scaling Group 자체는 직접 과금보다 연결된 EC2, Load Balancer, CloudWatch 리소스 비용에 포함됩니다."
      );
    case "aws_ebs_volume":
      return estimateEbsVolumeCost(node, input, options);
    case "aws_s3_bucket":
    case "aws_s3_object":
      return estimateS3Cost(node, input, options);
    case "aws_efs_file_system":
      return estimateEfsCost(node, input, options);
    case "aws_db_instance":
    case "aws_rds_cluster_instance":
      return estimateRdsCost(node, input, options);
    case "aws_db_snapshot":
      return estimateRdsSnapshotCost(node, input, options);
    case "aws_rds_cluster":
      return estimateRdsClusterCost(node, input, options);
    case "aws_dynamodb_table":
      return estimateDynamoDbCost(node, input, options);
    case "aws_elasticache_replication_group":
      return estimateElastiCacheCost(node, input, options);
    case "aws_kms_key":
      return estimateKmsCost(node, input, options);
    case "aws_secretsmanager_secret":
      return estimateSecretsManagerCost(node, input, options);
    case "aws_acm_certificate":
      return createNoDirectCostEstimate(
        node,
        "Public ACM certificate는 보통 직접 비용이 없습니다. Private CA 기반이면 AWS Private CA 비용을 별도로 확인해야 합니다."
      );
    case "aws_lambda_function":
      return estimateLambdaCost(node, input, options);
    case "aws_api_gateway_rest_api":
    case "aws_api_gateway_stage":
    case "aws_apigatewayv2_api":
      return estimateApiGatewayCost(node, input, options);
    case "aws_sqs_queue":
      return estimateRequestBasedCost(node, input, options, {
        usageType: "sqs_request",
        requestCount: estimateMonthlyRequests(input.expectedUserCount),
        fallbackUnitAmount: FALLBACK_SQS_REQUEST_USD,
        costDrivers: ["estimated SQS requests"],
        explanation: "SQS는 예상 요청 수가 비용의 주요 입력입니다."
      });
    case "aws_sns_topic":
      return estimateRequestBasedCost(node, input, options, {
        usageType: "sns_request",
        requestCount: estimateMonthlyRequests(input.expectedUserCount),
        fallbackUnitAmount: FALLBACK_SNS_REQUEST_USD,
        costDrivers: ["estimated SNS publish requests"],
        explanation: "SNS는 예상 publish 요청 수와 delivery 방식이 비용에 영향을 줍니다."
      });
    case "aws_sns_topic_subscription":
      return createNoDirectCostEstimate(
        node,
        "SNS subscription 자체보다 연결된 SNS publish와 delivery 방식에서 비용이 발생합니다."
      );
    case "aws_cloudwatch_event_rule":
      return estimateEventBasedCost(node, input, options, {
        usageType: "eventbridge_event",
        eventCount: estimateMonthlyRequests(input.expectedUserCount),
        fallbackUnitAmount: FALLBACK_EVENTBRIDGE_EVENT_USD,
        costDrivers: ["estimated EventBridge events"],
        explanation: "EventBridge rule은 처리되는 이벤트 수가 비용에 영향을 줍니다."
      });
    case "aws_scheduler_schedule":
      return estimateEventBasedCost(node, input, options, {
        usageType: "scheduler_invocation",
        eventCount: estimateMonthlyRequests(input.expectedUserCount),
        fallbackUnitAmount: FALLBACK_SCHEDULER_INVOCATION_USD,
        costDrivers: ["estimated Scheduler invocations"],
        explanation: "EventBridge Scheduler는 예상 호출 수가 비용에 영향을 줍니다."
      });
    case "aws_cloudfront_distribution":
      return estimateCloudFrontCost(node, input, options);
    case "aws_route53_zone":
      return estimateRateBasedCost(node, input, options, {
        usageType: "route53_hosted_zone_month",
        quantity: 1,
        fallbackMonthlyAmount: FALLBACK_ROUTE53_HOSTED_ZONE_MONTHLY_USD,
        costDrivers: ["hosted zone monthly charge"],
        explanation: "Route 53 hosted zone은 hosted zone 단위 월 비용이 발생합니다.",
        usageAssumptions: [{ label: "hosted zones", value: "1" }]
      });
    case "aws_cloudwatch_log_group":
      return estimateCloudWatchLogCost(node, input, options);
    case "aws_cloudwatch_metric_alarm":
      return estimateRateBasedCost(node, input, options, {
        usageType: "cloudwatch_alarm_month",
        quantity: 1,
        fallbackMonthlyAmount: FALLBACK_CLOUDWATCH_ALARM_MONTHLY_USD,
        costDrivers: ["metric alarm monthly charge"],
        explanation: "CloudWatch alarm은 alarm 개수 기준 월 비용이 발생할 수 있습니다.",
        usageAssumptions: [{ label: "alarms", value: "1" }]
      });
    case "aws_cloudwatch_dashboard":
      return estimateRateBasedCost(node, input, options, {
        usageType: "cloudwatch_dashboard_month",
        quantity: 1,
        fallbackMonthlyAmount: FALLBACK_CLOUDWATCH_DASHBOARD_MONTHLY_USD,
        costDrivers: ["dashboard monthly charge"],
        explanation: "CloudWatch dashboard는 dashboard 개수 기준 월 비용이 발생할 수 있습니다.",
        usageAssumptions: [{ label: "dashboards", value: "1" }]
      });
    case "aws_cloudtrail":
      return estimateEventBasedCost(node, input, options, {
        usageType: "cloudtrail_event",
        eventCount: estimateMonthlyRequests(input.expectedUserCount),
        fallbackUnitAmount: FALLBACK_CLOUDTRAIL_EVENT_USD,
        costDrivers: ["estimated management or data events"],
        explanation: "CloudTrail은 이벤트 기록량과 trail 설정에 따라 비용이 달라집니다."
      });
    case "aws_xray_group":
    case "aws_xray_sampling_rule":
      return estimateEventBasedCost(node, input, options, {
        usageType: "xray_trace",
        eventCount: estimateMonthlyRequests(input.expectedUserCount),
        fallbackUnitAmount: FALLBACK_XRAY_TRACE_USD,
        costDrivers: ["estimated traced requests"],
        explanation: "X-Ray는 기록/조회되는 trace 수가 비용에 영향을 줍니다."
      });
    case "aws_ecs_service":
      return estimateEcsServiceCost(node, input, options);
    case "aws_ecr_repository":
      return estimateEcrCost(node, input, options);
    case "aws_eks_cluster":
      return estimateRateBasedCost(node, input, options, {
        usageType: "eks_cluster_hour",
        quantity: MONTH_HOURS,
        fallbackMonthlyAmount: FALLBACK_EKS_CLUSTER_MONTHLY_USD,
        costDrivers: ["EKS cluster hourly runtime"],
        explanation: "EKS cluster는 control plane 실행 시간 기준 비용이 발생합니다.",
        usageAssumptions: [{ label: "runtime", value: `${MONTH_HOURS}h/month` }]
      });
    case "aws_eks_node_group":
      return estimateEc2Cost(node, input, options);
    case "aws_codebuild_project":
      return estimateCodeBuildCost(node, input, options);
    case "aws_codepipeline":
      return estimateRateBasedCost(node, input, options, {
        usageType: "codepipeline_pipeline_month",
        quantity: 1,
        fallbackMonthlyAmount: FALLBACK_CODEPIPELINE_MONTHLY_USD,
        costDrivers: ["active pipeline monthly charge"],
        explanation: "CodePipeline은 활성 pipeline 단위 월 비용이 발생할 수 있습니다.",
        usageAssumptions: [{ label: "pipelines", value: "1" }]
      });
    case "aws_config_configuration_recorder":
      return estimateConfigRecorderCost(node, input, options);
    case "aws_config_config_rule":
      return estimateConfigRuleCost(node, input, options);
    case "aws_wafv2_web_acl":
      return estimateWafCost(node, input, options);
    case "aws_shield_protection":
      return estimateRateBasedCost(node, input, options, {
        usageType: "shield_protection_month",
        quantity: 1,
        fallbackMonthlyAmount: FALLBACK_SHIELD_PROTECTION_MONTHLY_USD,
        costDrivers: ["Shield Advanced protection monthly charge"],
        explanation: "Shield Advanced protection은 월 단위 비용이 매우 클 수 있습니다.",
        recommendation: "실습 환경에서는 Shield Advanced 사용 필요성을 꼭 다시 확인하세요.",
        usageAssumptions: [{ label: "protected resources", value: "1" }]
      });
    case "aws_guardduty_detector": {
      const dataGb = estimateMonitoringDataGb(input.expectedUserCount);

      return estimateRateBasedCost(node, input, options, {
        usageType: "guardduty_event_gb",
        quantity: dataGb,
        fallbackMonthlyAmount: roundUsd(dataGb * FALLBACK_GUARDDUTY_EVENT_GB_USD),
        costDrivers: ["estimated security event analysis"],
        explanation: "GuardDuty는 분석되는 이벤트/로그 양에 따라 비용이 달라집니다.",
        usageAssumptions: [{ label: "security event data", value: `${formatNumber(dataGb)}GB/month` }]
      });
    }
  }

  if (node.type === "EC2") {
    return estimateEc2Cost(node, input, options);
  }

  if (node.type === "RDS") {
    return estimateRdsCost(node, input, options);
  }

  if (node.type === "S3") {
    return estimateS3Cost(node, input, options);
  }

  if (isNatGateway(node)) {
    return estimateRateBasedCost(node, input, options, {
      usageType: "nat_gateway_hour",
      quantity: MONTH_HOURS * estimateUserScaleFactor(input.expectedUserCount),
      fallbackMonthlyAmount: roundUsd(
        FALLBACK_NAT_GATEWAY_MONTHLY_USD * estimateUserScaleFactor(input.expectedUserCount)
      ),
      costDrivers: [
        "NAT Gateway hourly runtime",
        "data processing",
        `expected capacity x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
      ],
      explanation: "NAT Gateway는 켜져 있는 시간과 데이터 처리량에 따라 비용이 계속 발생합니다.",
      recommendation: "NAT Gateway가 꼭 필요한 구조인지 먼저 확인해보시는 걸 권장드립니다.",
      usageAssumptions: [
        { label: "runtime", value: `${MONTH_HOURS}h/month` },
        {
          label: "expected capacity factor",
          value: `x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
        },
        { label: "region", value: input.region }
      ]
    });
  }

  if (isApplicationLoadBalancer(node)) {
    return estimateLoadBalancerCost(node, input, options);
  }

  if (node.type === "LAMBDA") {
    return estimateLambdaCost(node, input, options);
  }

  if (node.type === "API_GATEWAY_REST_API") {
    return estimateApiGatewayCost(node, input, options);
  }

  if (node.type === "CLOUDFRONT") {
    return estimateCloudFrontCost(node, input, options);
  }

  return createZeroCostEstimate(node);
}

async function estimateEc2Cost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const instanceType = getTextConfig(node.config, ["instanceType", "instance_type"]) ?? "t3.micro";
  const userScaleFactor = estimateUserScaleFactor(input.expectedUserCount);
  const priced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "ec2_instance_hour",
      resourceType: node.type,
      region: input.region,
      instanceType
    },
    MONTH_HOURS * userScaleFactor,
    getFallbackEc2MonthlyAmount(instanceType) * userScaleFactor
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
    costDrivers: [`${instanceType} instance`, `${MONTH_HOURS}h/month runtime`, `expected capacity x${formatNumber(userScaleFactor)}`],
    explanation: "EC2는 인스턴스 크기와 실행 시간이 비용에 직접 영향을 줍니다.",
    pricingSource: priced.pricingSource,
    usageAssumptions: [
      { label: "instance type", value: instanceType },
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      { label: "expected capacity factor", value: `x${formatNumber(userScaleFactor)}` },
      { label: "region", value: input.region }
    ],
    recommendation: "이 리소스의 인스턴스 크기를 줄여보시는 걸 권장드립니다."
  };
}

async function estimateRdsCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const instanceClass = getTextConfig(node.config, ["instanceClass", "instance_class"]) ?? "db.t4g.micro";
  const engine = getTextConfig(node.config, ["engine"]) ?? "postgres";
  const userScaleFactor = estimateUserScaleFactor(input.expectedUserCount);
  const storageGb = getNumberConfig(node.config, ["allocatedStorage", "allocated_storage"], 20) * userScaleFactor;
  const instancePriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "rds_instance_hour",
      resourceType: node.type,
      region: input.region,
      instanceType: instanceClass,
      databaseEngine: engine
    },
    MONTH_HOURS * userScaleFactor,
    getFallbackRdsMonthlyAmount(instanceClass) * userScaleFactor
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
    costDrivers: [
      `${instanceClass} DB instance`,
      `${formatNumber(storageGb)}GB storage`,
      `${MONTH_HOURS}h/month runtime`,
      `expected capacity x${formatNumber(userScaleFactor)}`
    ],
    explanation: "RDS는 실행 시간과 스토리지 비용이 함께 발생합니다.",
    pricingSource,
    usageAssumptions: [
      { label: "instance class", value: instanceClass },
      { label: "storage", value: `${formatNumber(storageGb)}GB` },
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      { label: "expected capacity factor", value: `x${formatNumber(userScaleFactor)}` },
      { label: "region", value: input.region }
    ],
    recommendation: "이 리소스의 인스턴스 크기를 줄여보시는 걸 권장드립니다."
  };
}

async function estimateLoadBalancerCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  return estimateRateBasedCost(node, input, options, {
    usageType: "alb_hour",
    quantity: MONTH_HOURS * estimateUserScaleFactor(input.expectedUserCount),
    fallbackMonthlyAmount: roundUsd(
      FALLBACK_ALB_MONTHLY_USD * estimateUserScaleFactor(input.expectedUserCount)
    ),
    costDrivers: [
      "ALB hourly runtime",
      "load balancer capacity",
      `expected capacity x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
    ],
    explanation: "Load Balancer는 트래픽이 적어도 시간 기준 비용이 발생합니다.",
    recommendation: "단일 EC2 실습이면 Load Balancer 필요성을 먼저 확인해보시는 걸 권장드립니다.",
    usageAssumptions: [
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      {
        label: "expected capacity factor",
        value: `x${formatNumber(estimateUserScaleFactor(input.expectedUserCount))}`
      },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateEbsVolumeCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const userScaleFactor = estimateUserScaleFactor(input.expectedUserCount);
  const storageGb = getNumberConfig(node.config, ["size", "sizeGb", "volumeSize"], 20) * userScaleFactor;
  const volumeType = getTextConfig(node.config, ["type", "volumeType", "volume_type"]) ?? "gp3";

  return estimateRateBasedCost(node, input, options, {
    usageType: "ebs_storage_gb_month",
    quantity: storageGb,
    fallbackMonthlyAmount: roundUsd(storageGb * FALLBACK_EBS_STORAGE_GB_MONTH_USD),
    storageClass: volumeType,
    costDrivers: [`${formatNumber(storageGb)}GB EBS storage`],
    explanation: "EBS Volume은 provisioned storage 용량 기준 월 비용이 발생합니다.",
    usageAssumptions: [
      { label: "storage", value: `${formatNumber(storageGb)}GB` },
      { label: "expected capacity factor", value: `x${formatNumber(userScaleFactor)}` },
      { label: "volume type", value: volumeType },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateEfsCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const storageGb = Math.max(5, estimateObjectStorageGb(input.expectedUserCount));

  return estimateRateBasedCost(node, input, options, {
    usageType: "efs_storage_gb_month",
    quantity: storageGb,
    fallbackMonthlyAmount: roundUsd(storageGb * FALLBACK_EFS_STORAGE_GB_MONTH_USD),
    costDrivers: ["estimated file system storage"],
    explanation: "EFS는 저장 용량과 throughput mode에 따라 비용이 달라집니다.",
    usageAssumptions: [
      { label: "expected storage", value: `${formatNumber(storageGb)}GB/month` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateRdsSnapshotCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const userScaleFactor = estimateUserScaleFactor(input.expectedUserCount);
  const storageGb = getNumberConfig(node.config, ["allocatedStorage", "allocated_storage", "storageGb"], 20) * userScaleFactor;

  return estimateRateBasedCost(node, input, options, {
    usageType: "rds_snapshot_gb_month",
    quantity: storageGb,
    fallbackMonthlyAmount: roundUsd(storageGb * FALLBACK_RDS_SNAPSHOT_GB_MONTH_USD),
    costDrivers: [`${formatNumber(storageGb)}GB snapshot storage`],
    explanation: "RDS snapshot은 보관 중인 snapshot storage 용량 기준 비용이 발생할 수 있습니다.",
    usageAssumptions: [
      { label: "snapshot storage", value: `${formatNumber(storageGb)}GB` },
      { label: "expected capacity factor", value: `x${formatNumber(userScaleFactor)}` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateRdsClusterCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const instanceClass = getTextConfig(node.config, ["instanceClass", "instance_class"]) ?? "db.t4g.medium";
  const userScaleFactor = estimateUserScaleFactor(input.expectedUserCount);

  return estimateRateBasedCost(node, input, options, {
    usageType: "rds_instance_hour",
    quantity: MONTH_HOURS * userScaleFactor,
    fallbackMonthlyAmount: getFallbackRdsMonthlyAmount(instanceClass) * userScaleFactor,
    databaseEngine: getTextConfig(node.config, ["engine"]) ?? "aurora-postgresql",
    instanceType: instanceClass,
    costDrivers: [
      `${instanceClass} compatible cluster runtime`,
      `${MONTH_HOURS}h/month runtime`,
      `expected capacity x${formatNumber(userScaleFactor)}`
    ],
    explanation: "RDS/Aurora cluster는 cluster 구성, instance, storage, I/O에 따라 비용이 달라집니다.",
    usageAssumptions: [
      { label: "instance class assumption", value: instanceClass },
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      { label: "expected capacity factor", value: `x${formatNumber(userScaleFactor)}` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateDynamoDbCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const storageGb = estimateObjectStorageGb(input.expectedUserCount);
  const requestCount = estimateMonthlyRequests(input.expectedUserCount);
  const storagePriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "dynamodb_storage_gb_month",
      resourceType: node.type,
      region: input.region
    },
    storageGb,
    storageGb * FALLBACK_DYNAMODB_STORAGE_GB_MONTH_USD
  );
  const requestPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "dynamodb_request",
      resourceType: node.type,
      region: input.region
    },
    requestCount,
    requestCount * FALLBACK_DYNAMODB_REQUEST_USD
  );
  const pricingSource = mergePricingSources([storagePriced.pricingSource, requestPriced.pricingSource]);

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(storagePriced.amount + requestPriced.amount),
      currency: "USD"
    },
    supportLevel: getSupportLevel(pricingSource),
    supportReason: getSupportReason(pricingSource),
    costDrivers: ["estimated table storage", "estimated read/write requests"],
    explanation: "DynamoDB는 저장 용량과 read/write 요청량이 비용에 영향을 줍니다.",
    pricingSource,
    usageAssumptions: [
      { label: "storage", value: `${formatNumber(storageGb)}GB/month` },
      { label: "requests", value: `${formatInteger(requestCount)}/month` },
      { label: "region", value: input.region }
    ]
  };
}

async function estimateElastiCacheCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const nodeType = getTextConfig(node.config, ["nodeType", "node_type", "instanceType"]) ?? "cache.t4g.micro";
  const userScaleFactor = estimateUserScaleFactor(input.expectedUserCount);

  return estimateRateBasedCost(node, input, options, {
    usageType: "elasticache_node_hour",
    quantity: MONTH_HOURS * userScaleFactor,
    fallbackMonthlyAmount: getFallbackElastiCacheMonthlyAmount(nodeType) * userScaleFactor,
    instanceType: nodeType,
    costDrivers: [`${nodeType} cache node`, `${MONTH_HOURS}h/month runtime`, `expected capacity x${formatNumber(userScaleFactor)}`],
    explanation: "ElastiCache는 cache node 타입과 실행 시간이 비용에 직접 영향을 줍니다.",
    usageAssumptions: [
      { label: "node type", value: nodeType },
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      { label: "expected capacity factor", value: `x${formatNumber(userScaleFactor)}` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateKmsCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const requestCount = estimateMonthlyRequests(input.expectedUserCount);
  const keyPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "kms_key_month",
      resourceType: node.type,
      region: input.region
    },
    1,
    FALLBACK_KMS_KEY_MONTHLY_USD
  );
  const requestPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "kms_request",
      resourceType: node.type,
      region: input.region
    },
    requestCount,
    requestCount * FALLBACK_KMS_REQUEST_USD
  );
  const pricingSource = mergePricingSources([keyPriced.pricingSource, requestPriced.pricingSource]);

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(keyPriced.amount + requestPriced.amount),
      currency: "USD"
    },
    supportLevel: getSupportLevel(pricingSource),
    supportReason: getSupportReason(pricingSource),
    costDrivers: ["KMS key monthly charge", "estimated cryptographic requests"],
    explanation: "KMS Key는 key 보유 비용과 암호화/복호화 요청 수가 비용에 영향을 줍니다.",
    pricingSource,
    usageAssumptions: [
      { label: "requests", value: `${formatInteger(requestCount)}/month` },
      { label: "region", value: input.region }
    ]
  };
}

async function estimateSecretsManagerCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  return estimateRateBasedCost(node, input, options, {
    usageType: "secretsmanager_secret_month",
    quantity: 1,
    fallbackMonthlyAmount: FALLBACK_SECRETSMANAGER_SECRET_MONTHLY_USD,
    costDrivers: ["secret monthly charge"],
    explanation: "Secrets Manager secret은 secret 보유 단위 월 비용이 발생합니다.",
    usageAssumptions: [
      { label: "secrets", value: "1" },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateLambdaCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  return estimateRequestBasedCost(node, input, options, {
    usageType: "lambda_request",
    requestCount: estimateMonthlyRequests(input.expectedUserCount),
    fallbackUnitAmount: FALLBACK_LAMBDA_REQUEST_USD,
    costDrivers: ["expected requests"],
    explanation: "Lambda는 예상 요청 수와 실행 시간 가정에 따라 비용이 달라집니다."
  });
}

async function estimateApiGatewayCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  return estimateRequestBasedCost(node, input, options, {
    usageType: "api_gateway_request",
    requestCount: estimateMonthlyRequests(input.expectedUserCount),
    fallbackUnitAmount: FALLBACK_API_GATEWAY_REQUEST_USD,
    costDrivers: ["expected API requests"],
    explanation: "API Gateway는 예상 요청 수가 비용의 주요 입력입니다."
  });
}

async function estimateCloudFrontCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const dataGb = estimateDataTransferGb(input.expectedUserCount);

  return estimateRateBasedCost(node, input, options, {
    usageType: "cloudfront_data_gb",
    quantity: dataGb,
    fallbackMonthlyAmount: roundUsd(dataGb * FALLBACK_CLOUDFRONT_DATA_GB_USD),
    costDrivers: ["estimated data transfer"],
    explanation: "CloudFront는 예상 데이터 전송량이 비용에 영향을 줍니다.",
    usageAssumptions: [{ label: "data transfer", value: `${formatNumber(dataGb)}GB/month` }]
  });
}

async function estimateCloudWatchLogCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const logGb = estimateMonitoringDataGb(input.expectedUserCount);
  const ingestPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "cloudwatch_log_ingest_gb",
      resourceType: node.type,
      region: input.region
    },
    logGb,
    logGb * FALLBACK_CLOUDWATCH_LOG_INGEST_GB_USD
  );
  const storagePriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "cloudwatch_log_storage_gb_month",
      resourceType: node.type,
      region: input.region
    },
    logGb,
    logGb * FALLBACK_CLOUDWATCH_LOG_STORAGE_GB_MONTH_USD
  );
  const pricingSource = mergePricingSources([ingestPriced.pricingSource, storagePriced.pricingSource]);

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(ingestPriced.amount + storagePriced.amount),
      currency: "USD"
    },
    supportLevel: getSupportLevel(pricingSource),
    supportReason: getSupportReason(pricingSource),
    costDrivers: ["estimated log ingest", "estimated log storage"],
    explanation: "CloudWatch Logs는 로그 수집량과 보관량이 비용에 영향을 줍니다.",
    pricingSource,
    usageAssumptions: [
      { label: "logs", value: `${formatNumber(logGb)}GB/month` },
      { label: "region", value: input.region }
    ]
  };
}

async function estimateEcsServiceCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const userScaleFactor = estimateUserScaleFactor(input.expectedUserCount);
  const vcpu = getNumberConfig(node.config, ["vcpu", "cpu"], 0.25);
  const memoryGb = getNumberConfig(node.config, ["memoryGb", "memory"], 0.5);
  const vcpuHours = vcpu * MONTH_HOURS * userScaleFactor;
  const memoryGbHours = memoryGb * MONTH_HOURS * userScaleFactor;
  const vcpuPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "ecs_fargate_vcpu_hour",
      resourceType: node.type,
      region: input.region
    },
    vcpuHours,
    vcpuHours * FALLBACK_ECS_FARGATE_VCPU_HOUR_USD
  );
  const memoryPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "ecs_fargate_gb_hour",
      resourceType: node.type,
      region: input.region
    },
    memoryGbHours,
    memoryGbHours * FALLBACK_ECS_FARGATE_GB_HOUR_USD
  );
  const pricingSource = mergePricingSources([vcpuPriced.pricingSource, memoryPriced.pricingSource]);

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(vcpuPriced.amount + memoryPriced.amount),
      currency: "USD"
    },
    supportLevel: getSupportLevel(pricingSource),
    supportReason: getSupportReason(pricingSource),
    costDrivers: [
      "estimated Fargate vCPU hours",
      "estimated Fargate memory GB hours",
      `expected capacity x${formatNumber(userScaleFactor)}`
    ],
    explanation: "ECS Service는 launch type에 따라 Fargate vCPU/memory 또는 EC2 하위 리소스 비용이 발생합니다.",
    pricingSource,
    usageAssumptions: [
      { label: "vCPU", value: `${formatNumber(vcpu)}` },
      { label: "memory", value: `${formatNumber(memoryGb)}GB` },
      { label: "runtime", value: `${MONTH_HOURS}h/month` },
      { label: "expected capacity factor", value: `x${formatNumber(userScaleFactor)}` }
    ]
  };
}

async function estimateEcrCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const storageGb = Math.max(1, roundOneDecimal(input.expectedUserCount * 0.005));

  return estimateRateBasedCost(node, input, options, {
    usageType: "ecr_storage_gb_month",
    quantity: storageGb,
    fallbackMonthlyAmount: roundUsd(storageGb * FALLBACK_ECR_STORAGE_GB_MONTH_USD),
    costDrivers: ["estimated container image storage"],
    explanation: "ECR Repository는 저장된 container image 용량 기준 비용이 발생합니다.",
    usageAssumptions: [
      { label: "image storage", value: `${formatNumber(storageGb)}GB/month` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateCodeBuildCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const buildMinutes = getNumberConfig(node.config, ["buildMinutes", "monthlyBuildMinutes"], 100);

  return estimateRateBasedCost(node, input, options, {
    usageType: "codebuild_minute",
    quantity: buildMinutes,
    fallbackMonthlyAmount: roundUsd(buildMinutes * FALLBACK_CODEBUILD_MINUTE_USD),
    costDrivers: ["estimated build minutes"],
    explanation: "CodeBuild는 build compute type과 build minute가 비용에 영향을 줍니다.",
    usageAssumptions: [
      { label: "build minutes", value: `${formatInteger(buildMinutes)}/month` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateConfigRecorderCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const itemCount = Math.max(100, input.expectedUserCount);

  return estimateRateBasedCost(node, input, options, {
    usageType: "config_item",
    quantity: itemCount,
    fallbackMonthlyAmount: roundUsd(itemCount * FALLBACK_CONFIG_ITEM_USD),
    costDrivers: ["estimated configuration items"],
    explanation: "AWS Config recorder는 기록되는 configuration item 수가 비용에 영향을 줍니다.",
    usageAssumptions: [
      { label: "configuration items", value: `${formatInteger(itemCount)}/month` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateConfigRuleCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const evaluationCount = Math.max(100, input.expectedUserCount);

  return estimateRateBasedCost(node, input, options, {
    usageType: "config_rule_eval",
    quantity: evaluationCount,
    fallbackMonthlyAmount: roundUsd(evaluationCount * FALLBACK_CONFIG_RULE_EVAL_USD),
    costDrivers: ["estimated rule evaluations"],
    explanation: "AWS Config rule은 rule evaluation 수가 비용에 영향을 줍니다.",
    usageAssumptions: [
      { label: "evaluations", value: `${formatInteger(evaluationCount)}/month` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateWafCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
  const requestCount = estimateMonthlyRequests(input.expectedUserCount);
  const webAclPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "waf_web_acl_month",
      resourceType: node.type,
      region: input.region
    },
    1,
    FALLBACK_WAF_WEB_ACL_MONTHLY_USD
  );
  const requestPriced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: "waf_request",
      resourceType: node.type,
      region: input.region
    },
    requestCount,
    requestCount * FALLBACK_WAF_REQUEST_USD
  );
  const pricingSource = mergePricingSources([webAclPriced.pricingSource, requestPriced.pricingSource]);

  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: roundUsd(webAclPriced.amount + requestPriced.amount),
      currency: "USD"
    },
    supportLevel: getSupportLevel(pricingSource),
    supportReason: getSupportReason(pricingSource),
    costDrivers: ["web ACL monthly charge", "estimated inspected requests"],
    explanation: "AWS WAF는 Web ACL, rule, 검사 요청 수가 비용에 영향을 줍니다.",
    pricingSource,
    usageAssumptions: [
      { label: "requests", value: `${formatInteger(requestCount)}/month` },
      { label: "region", value: input.region }
    ]
  };
}

async function estimateS3Cost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions
): Promise<ResourceMonthlyCostEstimate> {
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

async function estimateRequestBasedCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions,
  estimate: {
    usageType: CostPricingUsageType;
    requestCount: number;
    fallbackUnitAmount: number;
    costDrivers: string[];
    explanation: string;
  }
): Promise<ResourceMonthlyCostEstimate> {
  return estimateRateBasedCost(node, input, options, {
    usageType: estimate.usageType,
    quantity: estimate.requestCount,
    fallbackMonthlyAmount: roundUsd(estimate.requestCount * estimate.fallbackUnitAmount),
    costDrivers: estimate.costDrivers,
    explanation: estimate.explanation,
    usageAssumptions: [
      { label: "expected requests", value: `${formatInteger(estimate.requestCount)}/month` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateEventBasedCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions,
  estimate: {
    usageType: CostPricingUsageType;
    eventCount: number;
    fallbackUnitAmount: number;
    costDrivers: string[];
    explanation: string;
  }
): Promise<ResourceMonthlyCostEstimate> {
  return estimateRateBasedCost(node, input, options, {
    usageType: estimate.usageType,
    quantity: estimate.eventCount,
    fallbackMonthlyAmount: roundUsd(estimate.eventCount * estimate.fallbackUnitAmount),
    costDrivers: estimate.costDrivers,
    explanation: estimate.explanation,
    usageAssumptions: [
      { label: "expected events", value: `${formatInteger(estimate.eventCount)}/month` },
      { label: "region", value: input.region }
    ]
  });
}

async function estimateRateBasedCost(
  node: ResourceNode,
  input: CostEstimateRequest,
  options: AnalyzeCostOptions,
  estimate: {
    usageType: CostPricingUsageType;
    quantity: number;
    fallbackMonthlyAmount: number;
    databaseEngine?: string | undefined;
    costDrivers: string[];
    explanation: string;
    instanceType?: string | undefined;
    storageClass?: string | undefined;
    usageAssumptions: CostUsageAssumption[];
    recommendation?: string | undefined;
  }
): Promise<ResourceMonthlyCostEstimate> {
  const priced = await estimateMonthlyAmountFromRate(
    options.pricingRateProvider,
    {
      usageType: estimate.usageType,
      resourceType: node.type,
      region: input.region,
      databaseEngine: estimate.databaseEngine,
      instanceType: estimate.instanceType,
      storageClass: estimate.storageClass
    },
    estimate.quantity,
    estimate.fallbackMonthlyAmount
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
    costDrivers: estimate.costDrivers,
    explanation: estimate.explanation,
    pricingSource: priced.pricingSource,
    usageAssumptions: estimate.usageAssumptions,
    recommendation: estimate.recommendation
  };
}

function createNoDirectCostEstimate(node: ResourceNode, explanation: string): ResourceMonthlyCostEstimate {
  return {
    resourceId: node.id,
    resourceType: node.type,
    terraformResourceType: getTerraformResourceType(node),
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: 0,
      currency: "USD"
    },
    supportLevel: "no_direct_cost",
    supportReason: "이 Terraform resource 자체에는 별도 직접 비용을 산정하지 않았습니다.",
    costDrivers: [],
    explanation,
    usageAssumptions: []
  };
}

function createZeroCostEstimate(node: ResourceNode): ResourceMonthlyCostEstimate {
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
    return "조회 단가를 기준으로 계산했습니다.";
  }

  return "일부 항목은 추정 단가로 계산했습니다.";
}

function getSupportLevel(pricingSource: CostPricingSource): CostEstimateSupportLevel {
  return pricingSource === "aws_pricing_api" ? "aws_pricing_api" : "fallback_estimate";
}

function getSupportReason(pricingSource: CostPricingSource): string {
  if (pricingSource === "aws_pricing_api") {
    return "조회 단가로 계산했습니다.";
  }

  return "추정 단가로 계산했습니다.";
}

function mergePricingSources(pricingSources: readonly CostPricingSource[]): CostPricingSource {
  return pricingSources.every((pricingSource) => pricingSource === "aws_pricing_api")
    ? "aws_pricing_api"
    : "fallback";
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

function getFallbackEc2MonthlyAmount(instanceType: string): number {
  return getFallbackInstanceMonthlyAmount({
    defaultAmount: FALLBACK_EC2_MONTHLY_USD["t3.micro"] ?? 8.5,
    explicitAmounts: FALLBACK_EC2_MONTHLY_USD,
    familyBaseAmounts: FALLBACK_EC2_FAMILY_MICRO_MONTHLY_USD,
    instanceType,
    prefixes: []
  });
}

function getFallbackRdsMonthlyAmount(instanceClass: string): number {
  return getFallbackInstanceMonthlyAmount({
    defaultAmount: FALLBACK_RDS_INSTANCE_MONTHLY_USD["db.t4g.micro"] ?? 36.5,
    explicitAmounts: FALLBACK_RDS_INSTANCE_MONTHLY_USD,
    familyBaseAmounts: FALLBACK_RDS_FAMILY_MICRO_MONTHLY_USD,
    instanceType: instanceClass,
    prefixes: ["db."]
  });
}

function getFallbackElastiCacheMonthlyAmount(nodeType: string): number {
  return getFallbackInstanceMonthlyAmount({
    defaultAmount: FALLBACK_ELASTICACHE_MONTHLY_USD["cache.t4g.micro"] ?? FALLBACK_ELASTICACHE_DEFAULT_MONTHLY_USD,
    explicitAmounts: FALLBACK_ELASTICACHE_MONTHLY_USD,
    familyBaseAmounts: FALLBACK_ELASTICACHE_FAMILY_MICRO_MONTHLY_USD,
    instanceType: nodeType,
    prefixes: ["cache."]
  });
}

function getFallbackInstanceMonthlyAmount(input: {
  defaultAmount: number;
  explicitAmounts: Record<string, number>;
  familyBaseAmounts: Record<string, number>;
  instanceType: string;
  prefixes: readonly string[];
}): number {
  const explicitAmount = input.explicitAmounts[input.instanceType];

  if (explicitAmount !== undefined) {
    return explicitAmount;
  }

  const normalizedType = input.prefixes.reduce(
    (currentType, prefix) => currentType.startsWith(prefix) ? currentType.slice(prefix.length) : currentType,
    input.instanceType
  );
  const [family, ...sizeParts] = normalizedType.split(".");
  const size = sizeParts.join(".");
  const familyBaseAmount = family === undefined ? undefined : input.familyBaseAmounts[family];
  const sizeMultiplier = INSTANCE_SIZE_MULTIPLIER[size];

  if (familyBaseAmount === undefined || sizeMultiplier === undefined) {
    return input.defaultAmount;
  }

  return roundUsd(familyBaseAmount * sizeMultiplier);
}

function estimateUserScaleFactor(expectedUserCount: number): number {
  return Math.max(0.01, roundUsd(expectedUserCount / DEFAULT_EXPECTED_USER_COUNT));
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

function estimateMonitoringDataGb(expectedUserCount: number): number {
  return Math.max(1, roundOneDecimal(expectedUserCount * 0.01));
}

function estimateMonthlyRequests(expectedUserCount: number): number {
  return expectedUserCount * 300;
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
  if (amount > 0 && amount < 1) {
    return amount.toFixed(2);
  }

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function formatInteger(amount: number): string {
  return Math.round(amount).toLocaleString("en-US");
}
