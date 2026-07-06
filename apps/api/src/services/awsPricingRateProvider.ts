import {
  GetProductsCommand,
  PricingClient,
  type GetProductsCommandInput
} from "@aws-sdk/client-pricing";
import type {
  CostPricingQuery,
  CostPricingRate,
  CostPricingRateProvider,
  CostPricingUsageType
} from "./cost-analysis.js";

type AwsPriceListProduct = {
  terms?: {
    OnDemand?: Record<
      string,
      {
        priceDimensions?: Record<
          string,
          {
            pricePerUnit?: Record<string, string | undefined> | undefined;
          }
        >;
      }
    >;
  };
};

type AwsPricingFilter = {
  readonly field: string;
  readonly value: string;
};

type AwsPricingQueryDefinition = {
  readonly serviceCode: string;
  readonly includeRegion?: boolean | undefined;
  readonly filters?: readonly AwsPricingFilter[] | undefined;
};

const GENERIC_PRICING_QUERY_DEFINITIONS: Partial<
  Record<CostPricingUsageType, AwsPricingQueryDefinition>
> = {
  alb_hour: {
    serviceCode: "AWSELB",
    filters: [{ field: "productFamily", value: "Load Balancer" }]
  },
  api_gateway_request: {
    serviceCode: "AmazonApiGateway",
    filters: [{ field: "productFamily", value: "API Calls" }]
  },
  cloudfront_data_gb: {
    serviceCode: "AmazonCloudFront",
    includeRegion: false,
    filters: [{ field: "productFamily", value: "Data Transfer" }]
  },
  cloudtrail_event: {
    serviceCode: "AWSCloudTrail",
    filters: [{ field: "productFamily", value: "Data Events Recorded" }]
  },
  cloudwatch_alarm_month: {
    serviceCode: "AmazonCloudWatch",
    filters: [{ field: "productFamily", value: "Alarm" }]
  },
  cloudwatch_dashboard_month: {
    serviceCode: "AmazonCloudWatch",
    filters: [{ field: "productFamily", value: "Dashboard" }]
  },
  cloudwatch_log_ingest_gb: {
    serviceCode: "AmazonCloudWatch",
    filters: [{ field: "productFamily", value: "Data Ingestion" }]
  },
  cloudwatch_log_storage_gb_month: {
    serviceCode: "AmazonCloudWatch",
    filters: [{ field: "productFamily", value: "TimedStorage-ByteHrs" }]
  },
  codebuild_minute: {
    serviceCode: "AWSCodeBuild",
    filters: [{ field: "productFamily", value: "Build Duration" }]
  },
  codepipeline_pipeline_month: {
    serviceCode: "AWSCodePipeline",
    filters: [{ field: "productFamily", value: "Pipeline" }]
  },
  config_item: {
    serviceCode: "AWSConfig",
    filters: [{ field: "productFamily", value: "Configuration Item Recorded" }]
  },
  config_rule_eval: {
    serviceCode: "AWSConfig",
    filters: [{ field: "productFamily", value: "Config Rules Evaluations" }]
  },
  dynamodb_request: {
    serviceCode: "AmazonDynamoDB",
    filters: [{ field: "productFamily", value: "Provisioned Throughput" }]
  },
  dynamodb_storage_gb_month: {
    serviceCode: "AmazonDynamoDB",
    filters: [{ field: "productFamily", value: "Database Storage" }]
  },
  ebs_storage_gb_month: {
    serviceCode: "AmazonEC2",
    filters: [
      { field: "productFamily", value: "Storage" },
      { field: "volumeType", value: "General Purpose" }
    ]
  },
  ecr_storage_gb_month: {
    serviceCode: "AmazonECR",
    filters: [{ field: "productFamily", value: "Storage" }]
  },
  ecs_fargate_gb_hour: {
    serviceCode: "AmazonECS",
    filters: [{ field: "productFamily", value: "AWS Fargate" }]
  },
  ecs_fargate_vcpu_hour: {
    serviceCode: "AmazonECS",
    filters: [{ field: "productFamily", value: "AWS Fargate" }]
  },
  efs_storage_gb_month: {
    serviceCode: "AmazonEFS",
    filters: [{ field: "storageClass", value: "Standard" }]
  },
  eip_hour: {
    serviceCode: "AmazonVPC",
    filters: [{ field: "productFamily", value: "IP Address" }]
  },
  eks_cluster_hour: {
    serviceCode: "AmazonEKS",
    filters: [{ field: "productFamily", value: "Amazon EKS Cluster" }]
  },
  elasticache_node_hour: {
    serviceCode: "AmazonElastiCache",
    filters: [{ field: "productFamily", value: "Cache Instance" }]
  },
  eventbridge_event: {
    serviceCode: "AWSEvents",
    filters: [{ field: "productFamily", value: "Event" }]
  },
  guardduty_event_gb: {
    serviceCode: "AmazonGuardDuty",
    filters: [{ field: "productFamily", value: "Security Events" }]
  },
  kms_key_month: {
    serviceCode: "awskms",
    filters: [{ field: "productFamily", value: "KMS-Key" }]
  },
  kms_request: {
    serviceCode: "awskms",
    filters: [{ field: "productFamily", value: "API Request" }]
  },
  lambda_request: {
    serviceCode: "AWSLambda",
    filters: [{ field: "productFamily", value: "Serverless" }]
  },
  nat_gateway_hour: {
    serviceCode: "AmazonVPC",
    filters: [{ field: "productFamily", value: "NAT Gateway" }]
  },
  rds_snapshot_gb_month: {
    serviceCode: "AmazonRDS",
    filters: [
      { field: "productFamily", value: "Database Storage Snapshot" },
      { field: "deploymentOption", value: "Single-AZ" }
    ]
  },
  route53_hosted_zone_month: {
    serviceCode: "AmazonRoute53",
    includeRegion: false,
    filters: [{ field: "productFamily", value: "Hosted Zone" }]
  },
  scheduler_invocation: {
    serviceCode: "AmazonEventBridgeScheduler",
    filters: [{ field: "productFamily", value: "Scheduler Invocation" }]
  },
  secretsmanager_secret_month: {
    serviceCode: "AWSSecretsManager",
    filters: [{ field: "productFamily", value: "Secret" }]
  },
  shield_protection_month: {
    serviceCode: "AWSShield",
    filters: [{ field: "productFamily", value: "Protection" }]
  },
  sns_request: {
    serviceCode: "AmazonSNS",
    filters: [{ field: "productFamily", value: "API Request" }]
  },
  sqs_request: {
    serviceCode: "AmazonSQS",
    filters: [{ field: "productFamily", value: "API Request" }]
  },
  vpc_endpoint_hour: {
    serviceCode: "AmazonVPC",
    filters: [{ field: "productFamily", value: "VPC Endpoint" }]
  },
  vpc_peering_data_gb: {
    serviceCode: "AmazonVPC",
    filters: [{ field: "productFamily", value: "Data Transfer" }]
  },
  waf_request: {
    serviceCode: "AWSWAF",
    filters: [{ field: "productFamily", value: "Request" }]
  },
  waf_web_acl_month: {
    serviceCode: "AWSWAF",
    filters: [{ field: "productFamily", value: "WebACL" }]
  },
  xray_trace: {
    serviceCode: "AWSXRay",
    filters: [{ field: "productFamily", value: "Traces" }]
  }
};

export function createConfiguredAwsPricingRateProvider(env: NodeJS.ProcessEnv = process.env): CostPricingRateProvider {
  if (env.AWS_PRICING_API_ENABLED !== "true" || env.NODE_ENV === "test") {
    return async () => null;
  }

  return createAwsPricingRateProvider(new PricingClient({ region: "us-east-1" }));
}

export function createAwsPricingRateProvider(client: PricingClient): CostPricingRateProvider {
  return async (query) => {
    const input = createGetProductsInput(query);

    if (input === null) {
      return null;
    }

    const response = await client.send(new GetProductsCommand(input));
    const [rawPriceList] = response.PriceList ?? [];

    if (rawPriceList === undefined) {
      return null;
    }

    const product = JSON.parse(String(rawPriceList)) as AwsPriceListProduct;
    const amount = readFirstUsdPrice(product);

    if (amount === null) {
      return null;
    }

    return {
      amount,
      unit: inferRateUnit(query)
    };
  };
}

function createGetProductsInput(query: CostPricingQuery): GetProductsCommandInput | null {
  if (query.usageType === "ec2_instance_hour" && query.instanceType !== undefined) {
    return {
      ServiceCode: "AmazonEC2",
      MaxResults: 1,
      Filters: [
        { Type: "TERM_MATCH", Field: "regionCode", Value: query.region },
        { Type: "TERM_MATCH", Field: "instanceType", Value: query.instanceType },
        { Type: "TERM_MATCH", Field: "operatingSystem", Value: "Linux" },
        { Type: "TERM_MATCH", Field: "tenancy", Value: "Shared" },
        { Type: "TERM_MATCH", Field: "preInstalledSw", Value: "NA" }
      ]
    };
  }

  if (query.usageType === "rds_instance_hour" && query.instanceType !== undefined) {
    return {
      ServiceCode: "AmazonRDS",
      MaxResults: 1,
      Filters: [
        { Type: "TERM_MATCH", Field: "regionCode", Value: query.region },
        { Type: "TERM_MATCH", Field: "instanceType", Value: query.instanceType },
        { Type: "TERM_MATCH", Field: "databaseEngine", Value: normalizeDatabaseEngine(query.databaseEngine) },
        { Type: "TERM_MATCH", Field: "deploymentOption", Value: "Single-AZ" }
      ]
    };
  }

  if (query.usageType === "rds_storage_gb_month") {
    return {
      ServiceCode: "AmazonRDS",
      MaxResults: 1,
      Filters: [
        { Type: "TERM_MATCH", Field: "regionCode", Value: query.region },
        { Type: "TERM_MATCH", Field: "databaseEngine", Value: normalizeDatabaseEngine(query.databaseEngine) },
        { Type: "TERM_MATCH", Field: "productFamily", Value: "Database Storage" },
        { Type: "TERM_MATCH", Field: "deploymentOption", Value: "Single-AZ" },
        { Type: "TERM_MATCH", Field: "volumeType", Value: "General Purpose-GP3" }
      ]
    };
  }

  if (query.usageType === "s3_storage_gb_month") {
    return {
      ServiceCode: "AmazonS3",
      MaxResults: 1,
      Filters: [
        { Type: "TERM_MATCH", Field: "regionCode", Value: query.region },
        { Type: "TERM_MATCH", Field: "storageClass", Value: "General Purpose" }
      ]
    };
  }

  return createGenericGetProductsInput(query);
}

function createGenericGetProductsInput(query: CostPricingQuery): GetProductsCommandInput | null {
  const definition = GENERIC_PRICING_QUERY_DEFINITIONS[query.usageType];

  if (definition === undefined) {
    return null;
  }

  return {
    ServiceCode: definition.serviceCode,
    MaxResults: 1,
    Filters: [
      ...(definition.includeRegion === false
        ? []
        : [{ Type: "TERM_MATCH" as const, Field: "regionCode", Value: query.region }]),
      ...(definition.filters ?? []).map((filter) => ({
        Type: "TERM_MATCH" as const,
        Field: filter.field,
        Value: filter.value
      }))
    ]
  };
}

function readFirstUsdPrice(product: AwsPriceListProduct): number | null {
  for (const term of Object.values(product.terms?.OnDemand ?? {})) {
    for (const dimension of Object.values(term.priceDimensions ?? {})) {
      const rawAmount = dimension.pricePerUnit?.["USD"];
      const amount = rawAmount === undefined ? Number.NaN : Number.parseFloat(rawAmount);

      if (Number.isFinite(amount) && amount >= 0) {
        return amount;
      }
    }
  }

  return null;
}

function inferRateUnit(query: CostPricingQuery): CostPricingRate["unit"] {
  if (query.usageType.includes("gb_month")) {
    return "gb_month";
  }

  if (query.usageType.includes("month")) {
    return "month";
  }

  if (query.usageType.includes("minute")) {
    return "minute";
  }

  if (query.usageType.includes("request")) {
    return "request";
  }

  if (query.usageType.includes("event")) {
    return "event";
  }

  if (query.usageType.includes("data_gb")) {
    return "gb";
  }

  return "hour";
}

function normalizeDatabaseEngine(databaseEngine: string | undefined): string {
  if (databaseEngine === undefined) {
    return "PostgreSQL";
  }

  if (databaseEngine.toLowerCase() === "postgres") {
    return "PostgreSQL";
  }

  return databaseEngine;
}
