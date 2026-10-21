import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  GetApisCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetStagesCommand
} from "@aws-sdk/client-apigatewayv2";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  readAwsApiGatewayV2Topology,
  type AwsApiGatewayV2TopologyReadClient
} from "./aws-api-gateway-v2-topology-reader.js";

const credentials: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_REGION: "ap-northeast-2"
};

/** gg: 다른 상세 reader와 동일한 public hash 규칙으로 cross-service 연결을 검증합니다. */
function createOpaqueProviderResourceId(
  providerResourceType: string,
  exactProviderResourceId: string
): string {
  return `aws-ref-${createHash("sha256")
    .update(`${providerResourceType}\0${exactProviderResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

/** gg: 실제 SDK command를 확인하면서 HTTP API의 모든 child page를 재현합니다. */
function createTopologyClient(): {
  readonly client: AwsApiGatewayV2TopologyReadClient;
  readonly commands: object[];
} {
  const commands: object[] = [];
  return {
    commands,
    client: {
      async send(command: object): Promise<unknown> {
        commands.push(command);
        if (command instanceof GetApisCommand) {
          return command.input.NextToken === "api-page-2"
            ? {
                Items: [
                  {
                    ApiId: "api-v2-two",
                    Name: "Status API",
                    ProtocolType: "HTTP",
                    RouteSelectionExpression: "${request.method} ${request.path}"
                  }
                ]
              }
            : {
                Items: [
                  {
                    ApiId: "api-v2-one",
                    Name: "Orders API",
                    ProtocolType: "HTTP",
                    RouteSelectionExpression: "${request.method} ${request.path}",
                    Tags: { Environment: "production" }
                  }
                ],
                NextToken: "api-page-2"
              };
        }
        if (command instanceof GetIntegrationsCommand) {
          if (command.input.ApiId === "api-v2-two") return { Items: [] };
          return command.input.NextToken === "integration-page-2"
            ? {
                Items: [
                  {
                    IntegrationId: "integration-http",
                    IntegrationType: "HTTP_PROXY",
                    IntegrationUri: "https://private.example/orders"
                  }
                ]
              }
            : {
                Items: [
                  {
                    IntegrationId: "integration-lambda",
                    IntegrationType: "AWS_PROXY",
                    IntegrationUri:
                      "arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-2:111122223333:function:orders/invocations",
                    CredentialsArn: "arn:aws:iam::111122223333:role/api/invoke-role",
                    PayloadFormatVersion: "2.0"
                  }
                ],
                NextToken: "integration-page-2"
              };
        }
        if (command instanceof GetRoutesCommand) {
          if (command.input.ApiId === "api-v2-two") return { Items: [] };
          return command.input.NextToken === "route-page-2"
            ? {
                Items: [
                  {
                    RouteId: "route-http",
                    RouteKey: "GET /health",
                    AuthorizationType: "NONE",
                    Target: "integrations/integration-http"
                  }
                ]
              }
            : {
                Items: [
                  {
                    RouteId: "route-orders",
                    RouteKey: "GET /orders",
                    AuthorizationType: "AWS_IAM",
                    Target: "integrations/integration-lambda"
                  }
                ],
                NextToken: "route-page-2"
              };
        }
        if (command instanceof GetStagesCommand) {
          return command.input.ApiId === "api-v2-one"
            ? {
                Items: [
                  {
                    StageName: "$default",
                    AutoDeploy: true,
                    Tags: { Environment: "production" }
                  }
                ]
              }
            : { Items: [] };
        }
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    }
  };
}

test("API Gateway V2 전용 reader는 Api/Route/Integration/Stage를 모두 읽고 Cloud Control 없이 관계와 private import ID를 보존한다", async () => {
  const { client, commands } = createTopologyClient();
  const result = await readAwsApiGatewayV2Topology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => client
  });

  assert.equal(result.catalogReadComplete, true);
  assert.deepEqual(
    result.families.map((family) => [
      family.classification,
      family.readComplete,
      family.managementReady
    ]),
    [
      ["advanced", true, false],
      ["simple", true, true]
    ],
    "HTTP proxy URI is retained as an advanced topology instead of being treated as an invalid read"
  );
  assert.equal(result.failures.length, 0);
  assert.deepEqual(
    commands
      .filter((command): command is GetApisCommand => command instanceof GetApisCommand)
      .map((command) => command.input.NextToken),
    [undefined, "api-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is GetIntegrationsCommand =>
          command instanceof GetIntegrationsCommand && command.input.ApiId === "api-v2-one"
      )
      .map((command) => command.input.NextToken),
    [undefined, "integration-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is GetRoutesCommand =>
          command instanceof GetRoutesCommand && command.input.ApiId === "api-v2-one"
      )
      .map((command) => command.input.NextToken),
    [undefined, "route-page-2"]
  );

  const api = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGatewayV2::Api" && record.displayName === "Orders API"
  );
  const lambdaIntegration = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGatewayV2::Integration" && record.config.payloadFormatVersion === "2.0"
  );
  const route = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGatewayV2::Route" && record.displayName === "GET /orders"
  );
  const stage = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGatewayV2::Stage"
  );
  assert.ok(api);
  assert.ok(lambdaIntegration);
  assert.ok(route);
  assert.ok(stage);
  assert.equal(route.parentRecordId, api.recordId);
  assert.deepEqual(route.relatedRecordIds, [lambdaIntegration.recordId]);
  assert.deepEqual(lambdaIntegration.relatedRecordIds, [
    createOpaqueProviderResourceId(
      "AWS::Lambda::Function",
      "arn:aws:lambda:ap-northeast-2:111122223333:function:orders"
    ),
    createOpaqueProviderResourceId("AWS::IAM::Role", "arn:aws:iam::111122223333:role/api/invoke-role")
  ]);
  assert.equal(stage.parentRecordId, api.recordId);

  const routePrivate = result.serverOnlyRecords.find(
    (record) => record.publicRecordId === route.recordId
  );
  const integrationPrivate = result.serverOnlyRecords.find(
    (record) => record.publicRecordId === lambdaIntegration.recordId
  );
  assert.equal(routePrivate?.terraformImportId, "api-v2-one/route-orders");
  assert.equal(routePrivate?.serverOnlyConfig.target, "integrations/integration-lambda");
  assert.equal(integrationPrivate?.terraformImportId, "api-v2-one/integration-lambda");
  assert.equal(
    integrationPrivate?.serverOnlyConfig.integrationUri,
    "arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-2:111122223333:function:orders/invocations"
  );
  assert.equal(
    integrationPrivate?.serverOnlyConfig.credentialsArn,
    "arn:aws:iam::111122223333:role/api/invoke-role"
  );
  assert.doesNotMatch(JSON.stringify(result.publicRecords), /api-v2-one|111122223333|private\.example|invoke-role/u);
});

test("API Gateway V2 child 권한 실패는 읽은 항목을 유지하고 family별 safe partial failure로 표시한다", async () => {
  const { client } = createTopologyClient();
  const failingClient: AwsApiGatewayV2TopologyReadClient = {
    async send(command: object): Promise<unknown> {
      if (command instanceof GetRoutesCommand && command.input.ApiId === "api-v2-one") {
        throw { name: "AccessDeniedException", message: "private route permission detail" };
      }
      return client.send(command);
    }
  };
  const result = await readAwsApiGatewayV2Topology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => failingClient
  });

  const firstFamily = result.families[0];
  assert.equal(firstFamily?.readComplete, false);
  assert.equal(firstFamily?.classification, "incomplete");
  assert.equal(firstFamily?.managementReady, false);
  assert.ok(
    result.publicRecords.some(
      (record) =>
        record.providerResourceType === "AWS::ApiGatewayV2::Integration" &&
        record.config.payloadFormatVersion === "2.0"
    ),
    "successful child collection remains available"
  );
  assert.deepEqual(result.failures, [
    {
      scope: "routes",
      outcome: "permission_denied",
      familyRecordId: firstFamily?.publicApiRecordId
    }
  ]);
  assert.doesNotMatch(JSON.stringify(result.failures), /private route/u);
});

test("API Gateway V2 Route가 없는 Integration을 가리키면 raw target은 private에 보존하고 topology 완료 상태만 닫는다", async () => {
  const client: AwsApiGatewayV2TopologyReadClient = {
    async send(command: object): Promise<unknown> {
      if (command instanceof GetApisCommand) {
        return {
          Items: [
            {
              ApiId: "api-v2-incomplete",
              Name: "Incomplete API",
              ProtocolType: "HTTP",
              RouteSelectionExpression: "${request.method} ${request.path}"
            }
          ]
        };
      }
      if (command instanceof GetIntegrationsCommand || command instanceof GetStagesCommand) {
        return { Items: [] };
      }
      if (command instanceof GetRoutesCommand) {
        return {
          Items: [
            {
              RouteId: "route-missing-target",
              RouteKey: "GET /missing",
              Target: "integrations/missing-integration"
            }
          ]
        };
      }
      assert.fail(`unexpected command: ${command.constructor.name}`);
    }
  };
  const result = await readAwsApiGatewayV2Topology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => client
  });
  const route = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGatewayV2::Route"
  );
  const routePrivate = result.serverOnlyRecords.find(
    (record) => record.publicRecordId === route?.recordId
  );

  assert.equal(result.families[0]?.classification, "incomplete");
  assert.deepEqual(route?.relatedRecordIds, []);
  assert.equal(routePrivate?.serverOnlyConfig.target, "integrations/missing-integration");
  assert.deepEqual(result.failures.map((failure) => [failure.scope, failure.outcome]), [
    ["routes", "invalid_response"]
  ]);
});
