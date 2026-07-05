import {
  GetProductsCommand,
  PricingClient,
  type GetProductsCommandInput
} from "@aws-sdk/client-pricing";
import type {
  CostPricingQuery,
  CostPricingRate,
  CostPricingRateProvider
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

  return null;
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

  if (query.usageType.includes("request")) {
    return "request";
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
