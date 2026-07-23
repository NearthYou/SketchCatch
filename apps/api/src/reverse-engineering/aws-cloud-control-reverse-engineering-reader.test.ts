import assert from "node:assert/strict";
import test from "node:test";
import {
  GetResourceCommand,
  ListResourcesCommand
} from "@aws-sdk/client-cloudcontrol";
import {
  readAwsCloudControlReverseEngineeringResources,
  type AwsCloudControlReadClient
} from "./aws-cloud-control-reverse-engineering-reader.js";

const credentials = {
  AWS_ACCESS_KEY_ID: "test-access",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  AWS_SESSION_TOKEN: "test-session",
  AWS_REGION: "ap-northeast-2"
};

test("Cloud Control은 종류별 모든 page와 상세 Resource model을 읽는다", async () => {
  const commands: object[] = [];
  const client: AwsCloudControlReadClient = {
    async send(command) {
      commands.push(command);
      if (command instanceof ListResourcesCommand) {
        return command.input.NextToken
          ? {
              ResourceDescriptions: [{ Identifier: "orders-archive" }]
            }
          : {
              ResourceDescriptions: [{ Identifier: "orders" }],
              NextToken: "next-page"
            };
      }
      if (command instanceof GetResourceCommand) {
        return {
          TypeName: "AWS::DynamoDB::Table",
          ResourceDescription: {
            Identifier: command.input.Identifier,
            Properties: JSON.stringify({
              TableName: command.input.Identifier,
              BillingMode: "PAY_PER_REQUEST",
              Tags: [{ Key: "Project", Value: "checkout" }]
            })
          }
        };
      }
      return {};
    }
  };

  const result = await readAwsCloudControlReverseEngineeringResources(
    {
      providerResourceTypes: ["AWS::DynamoDB::Table"],
      region: "ap-northeast-2"
    },
    credentials,
    () => client
  );

  assert.equal(result.records.length, 2);
  assert.deepEqual(
    result.records.map((record) => record.displayName),
    ["orders", "orders-archive"]
  );
  assert.deepEqual(result.records[0]?.config["tags"], [
    { key: "Project", value: "checkout" }
  ]);
  assert.equal(result.records[0]?.config["cloudControlReadComplete"], true);
  assert.equal(result.records[0]?.config["managementReady"], false);
  assert.equal(result.records[0]?.serverOnly?.terraformImportId, "orders");
  assert.deepEqual(result.records[0]?.serverOnly?.config?.["cloudControlProperties"], {
    TableName: "orders",
    BillingMode: "PAY_PER_REQUEST",
    Tags: [{ Key: "Project", Value: "checkout" }]
  });
  assert.equal(
    commands.filter((command) => command instanceof ListResourcesCommand).length,
    2
  );
  assert.equal(
    commands.filter((command) => command instanceof GetResourceCommand).length,
    2
  );
});

test("한 Resource 종류 조회 실패는 다른 종류의 결과를 지우지 않는다", async () => {
  const client: AwsCloudControlReadClient = {
    async send(command) {
      if (command instanceof ListResourcesCommand) {
        if (command.input.TypeName === "AWS::SQS::Queue") {
          throw Object.assign(new Error("AccessDenied"), { name: "AccessDeniedException" });
        }
        return { ResourceDescriptions: [{ Identifier: "orders" }] };
      }
      if (command instanceof GetResourceCommand) {
        return {
          TypeName: command.input.TypeName,
          ResourceDescription: {
            Identifier: command.input.Identifier,
            Properties: JSON.stringify({ TableName: "orders" })
          }
        };
      }
      return {};
    }
  };

  const result = await readAwsCloudControlReverseEngineeringResources(
    {
      providerResourceTypes: ["AWS::DynamoDB::Table", "AWS::SQS::Queue"],
      region: "ap-northeast-2"
    },
    credentials,
    () => client
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.providerResourceType, "AWS::DynamoDB::Table");
  assert.equal(result.scanErrors.length, 1);
  assert.equal(result.scanErrors[0]?.serviceKey, "cloud-control");
  assert.equal(result.scanErrors[0]?.reason, "permission_denied");
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /AccessDenied/u);
});

test("잘못된 Resource model은 존재를 보존하고 Terraform 관리 근거로 쓰지 않는다", async () => {
  const client: AwsCloudControlReadClient = {
    async send(command) {
      if (command instanceof ListResourcesCommand) {
        return {
          ResourceDescriptions: [
            {
              Identifier: "queue-url",
              Properties: "{not-json"
            }
          ]
        };
      }
      return {};
    }
  };

  const result = await readAwsCloudControlReverseEngineeringResources(
    {
      providerResourceTypes: ["AWS::SQS::Queue"],
      region: "ap-northeast-2"
    },
    credentials,
    () => client
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.providerResourceId, "queue-url");
  assert.equal(result.records[0]?.config["cloudControlReadComplete"], false);
  assert.equal(result.records[0]?.serverOnly?.terraformImportId, undefined);
});
