import assert from "node:assert/strict";
import { test } from "node:test";
import type { GetProductsCommand, GetProductsCommandInput } from "@aws-sdk/client-pricing";
import { createAwsPricingRateProvider } from "./awsPricingRateProvider.js";

process.env.NODE_ENV = "test";

test("createAwsPricingRateProvider queries RDS storage pricing with Database Storage filters", async () => {
  const capturedInputs: GetProductsCommandInput[] = [];
  const provider = createAwsPricingRateProvider({
    async send(command: GetProductsCommand) {
      capturedInputs.push(command.input);

      return {
        PriceList: [
          JSON.stringify({
            terms: {
              OnDemand: {
                term: {
                  priceDimensions: {
                    dimension: {
                      pricePerUnit: {
                        USD: "0.1310000000"
                      }
                    }
                  }
                }
              }
            }
          })
        ]
      };
    }
  } as never);

  const rate = await provider({
    usageType: "rds_storage_gb_month",
    resourceType: "RDS",
    region: "ap-northeast-2",
    databaseEngine: "postgres"
  });

  assert.deepEqual(rate, {
    amount: 0.131,
    unit: "gb_month"
  });
  const [input] = capturedInputs;

  assert.ok(input !== undefined);

  assert.equal(input.ServiceCode, "AmazonRDS");
  assert.deepEqual(input.Filters, [
    { Type: "TERM_MATCH", Field: "regionCode", Value: "ap-northeast-2" },
    { Type: "TERM_MATCH", Field: "databaseEngine", Value: "PostgreSQL" },
    { Type: "TERM_MATCH", Field: "productFamily", Value: "Database Storage" },
    { Type: "TERM_MATCH", Field: "deploymentOption", Value: "Single-AZ" },
    { Type: "TERM_MATCH", Field: "volumeType", Value: "General Purpose-GP3" }
  ]);
});

test("createAwsPricingRateProvider builds generic AWS Pricing API queries for expanded cost resources", async () => {
  const capturedInputs: GetProductsCommandInput[] = [];
  const provider = createAwsPricingRateProvider({
    async send(command: GetProductsCommand) {
      capturedInputs.push(command.input);

      return {
        PriceList: [
          JSON.stringify({
            terms: {
              OnDemand: {
                term: {
                  priceDimensions: {
                    dimension: {
                      pricePerUnit: {
                        USD: "0.0100000000"
                      }
                    }
                  }
                }
              }
            }
          })
        ]
      };
    }
  } as never);

  await provider({
    usageType: "nat_gateway_hour",
    resourceType: "UNKNOWN",
    region: "ap-northeast-2"
  });
  await provider({
    usageType: "lambda_request",
    resourceType: "LAMBDA",
    region: "ap-northeast-2"
  });
  await provider({
    usageType: "route53_hosted_zone_month",
    resourceType: "UNKNOWN",
    region: "ap-northeast-2"
  });

  assert.equal(capturedInputs[0]?.ServiceCode, "AmazonVPC");
  assert.deepEqual(capturedInputs[0]?.Filters, [
    { Type: "TERM_MATCH", Field: "regionCode", Value: "ap-northeast-2" },
    { Type: "TERM_MATCH", Field: "productFamily", Value: "NAT Gateway" }
  ]);
  assert.equal(capturedInputs[1]?.ServiceCode, "AWSLambda");
  assert.deepEqual(capturedInputs[1]?.Filters, [
    { Type: "TERM_MATCH", Field: "regionCode", Value: "ap-northeast-2" },
    { Type: "TERM_MATCH", Field: "productFamily", Value: "Serverless" }
  ]);
  assert.equal(capturedInputs[2]?.ServiceCode, "AmazonRoute53");
  assert.deepEqual(capturedInputs[2]?.Filters, [
    { Type: "TERM_MATCH", Field: "productFamily", Value: "Hosted Zone" }
  ]);
});
