import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  GetAuthorizersCommand,
  GetDeploymentsCommand,
  GetIntegrationCommand,
  GetMethodCommand,
  GetModelsCommand,
  GetRequestValidatorsCommand,
  GetResourcesCommand,
  GetRestApisCommand,
  GetStagesCommand
} from "@aws-sdk/client-api-gateway";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  readAwsApiGatewayRestTopology,
  type AwsApiGatewayRestTopologyReadClient
} from "./aws-api-gateway-rest-topology-reader.js";

const credentials: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_REGION: "ap-northeast-2"
};

/** gg: 상세 reader들과 같은 opaque ID 규칙으로 API Gateway의 cross-service 관계를 검증합니다. */
function createOpaqueProviderResourceId(
  providerResourceType: string,
  exactProviderResourceId: string
): string {
  return `aws-ref-${createHash("sha256")
    .update(`${providerResourceType}\0${exactProviderResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

/** gg: 실제 SDK command 입력과 같은 경계를 사용하면서 테스트 응답만 결정적으로 바꿉니다. */
function createSimpleTopologyClient(): {
  readonly client: AwsApiGatewayRestTopologyReadClient;
  readonly commands: object[];
} {
  const commands: object[] = [];

  return {
    commands,
    client: {
      async send(command: object): Promise<unknown> {
        commands.push(command);

        if (command instanceof GetRestApisCommand) {
          return command.input.position === "api-page-2"
            ? { items: [{ id: "api-two", name: "Status API" }] }
            : {
                items: [{ id: "api-one", name: "Orders API" }],
                position: "api-page-2"
              };
        }

        if (command instanceof GetResourcesCommand) {
          if (command.input.restApiId === "api-two") {
            return { items: [{ id: "root-two", path: "/" }] };
          }
          return command.input.position === "resource-page-2"
            ? {
                items: [
                  {
                    id: "health-resource",
                    parentId: "root-one",
                    pathPart: "health",
                    path: "/health"
                  }
                ]
              }
            : {
                items: [
                  { id: "root-one", path: "/" },
                  {
                    id: "orders-resource",
                    parentId: "root-one",
                    pathPart: "orders",
                    path: "/orders",
                    resourceMethods: { GET: { authorizationType: "NONE" } }
                  }
                ],
                position: "resource-page-2"
              };
        }

        if (command instanceof GetMethodCommand) {
          return {
            httpMethod: command.input.httpMethod,
            authorizationType: "NONE",
            apiKeyRequired: false,
            requestModels: { "application/json": "Empty" },
            methodIntegration: { type: "HTTP_PROXY" }
          };
        }

        if (command instanceof GetIntegrationCommand) {
          return {
            type: "HTTP_PROXY",
            httpMethod: "GET",
            uri: "https://internal.example/private"
          };
        }

        if (command instanceof GetDeploymentsCommand) {
          if (command.input.restApiId === "api-two") return { items: [] };
          return command.input.position === "deployment-page-2"
            ? { items: [{ id: "deployment-two" }] }
            : { items: [{ id: "deployment-one" }], position: "deployment-page-2" };
        }

        if (command instanceof GetStagesCommand) {
          return command.input.restApiId === "api-one"
            ? { item: [{ stageName: "prod", deploymentId: "deployment-two" }] }
            : { item: [] };
        }

        if (command instanceof GetModelsCommand) {
          return {
            items: [
              { id: "default-empty", name: "Empty" },
              { id: "default-error", name: "Error" }
            ]
          };
        }

        if (
          command instanceof GetAuthorizersCommand ||
          command instanceof GetRequestValidatorsCommand
        ) {
          return { items: [] };
        }

        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    }
  };
}

type StaticTopologyFixture = {
  readonly restApi?: Readonly<Record<string, unknown>>;
  readonly resources: readonly Readonly<Record<string, unknown>>[];
  readonly method?: Readonly<Record<string, unknown>>;
  readonly integration?: Readonly<Record<string, unknown>>;
  readonly deployments?: readonly Readonly<Record<string, unknown>>[];
  readonly stages?: readonly Readonly<Record<string, unknown>>[];
};

/** gg: fail-close 경계 테스트가 필요한 AWS 응답만 바꿔 같은 단순 family 기준을 재사용합니다. */
function createStaticTopologyClient(
  fixture: StaticTopologyFixture
): AwsApiGatewayRestTopologyReadClient {
  return {
    async send(command: object): Promise<unknown> {
      if (command instanceof GetRestApisCommand) {
        return { items: [fixture.restApi ?? { id: "fixture-api", name: "Fixture API" }] };
      }
      if (command instanceof GetResourcesCommand) return { items: fixture.resources };
      if (command instanceof GetMethodCommand && fixture.method) return fixture.method;
      if (command instanceof GetIntegrationCommand && fixture.integration) {
        return fixture.integration;
      }
      if (command instanceof GetDeploymentsCommand) {
        return { items: fixture.deployments ?? [] };
      }
      if (command instanceof GetStagesCommand) return { item: fixture.stages ?? [] };
      if (
        command instanceof GetAuthorizersCommand ||
        command instanceof GetModelsCommand ||
        command instanceof GetRequestValidatorsCommand
      ) {
        return { items: [] };
      }
      assert.fail(`unexpected command: ${command.constructor.name}`);
    }
  };
}

test("API Gateway REST topology reader는 모든 page와 Method/Integration을 읽고 관계와 비공개 import ID를 보존한다", async () => {
  const { client, commands } = createSimpleTopologyClient();
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => client
  });

  assert.equal(result.catalogReadComplete, true);
  assert.equal(result.families.length, 2);
  assert.deepEqual(
    result.families.map((family) => [
      family.classification,
      family.readComplete,
      family.managementReady
    ]),
    [
      ["simple", true, true],
      ["simple", true, true]
    ]
  );

  assert.deepEqual(
    commands
      .filter((command): command is GetRestApisCommand => command instanceof GetRestApisCommand)
      .map((command) => command.input.position),
    [undefined, "api-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is GetResourcesCommand =>
          command instanceof GetResourcesCommand && command.input.restApiId === "api-one"
      )
      .map((command) => command.input.position),
    [undefined, "resource-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is GetDeploymentsCommand =>
          command instanceof GetDeploymentsCommand && command.input.restApiId === "api-one"
      )
      .map((command) => command.input.position),
    [undefined, "deployment-page-2"]
  );
  assert.equal(
    commands.filter(
      (command) => command instanceof GetStagesCommand && command.input.restApiId === "api-one"
    ).length,
    1,
    "GetStages is a complete non-paginated AWS response and must still be read for every API"
  );
  assert.equal(commands.filter((command) => command instanceof GetMethodCommand).length, 1);
  assert.equal(commands.filter((command) => command instanceof GetIntegrationCommand).length, 1);

  const root = result.publicRecords.find(
    (record) =>
      record.providerResourceType === "AWS::ApiGateway::Resource" && record.config.path === "/"
  );
  const orders = result.publicRecords.find(
    (record) =>
      record.providerResourceType === "AWS::ApiGateway::Resource" &&
      record.config.path === "/orders"
  );
  const method = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Method"
  );
  const integration = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Integration"
  );
  const deployment = result.publicRecords.find(
    (record) =>
      record.providerResourceType === "AWS::ApiGateway::Deployment" &&
      result.serverOnlyRecords.find(
        (privateRecord) =>
          privateRecord.publicRecordId === record.recordId &&
          privateRecord.terraformImportId === "api-one/deployment-two"
      )
  );
  const stage = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Stage"
  );

  assert.equal(root, undefined, "AWS가 만든 / root는 별도 Terraform 관리 후보로 만들지 않는다");
  assert.equal(orders?.parentRecordId, result.families[0]?.publicRestApiRecordId);
  assert.equal(method?.parentRecordId, orders?.recordId);
  assert.equal(integration?.parentRecordId, method?.recordId);
  assert.notEqual(
    method?.recordId,
    integration?.recordId,
    "같은 composite import ID라도 provider type이 다르면 공개 identity도 달라야 한다"
  );
  assert.equal(stage?.parentRecordId, result.families[0]?.publicRestApiRecordId);
  assert.equal(stage?.relatedRecordIds.includes(deployment?.recordId ?? "missing"), true);

  const privateMethod = result.serverOnlyRecords.find(
    (record) => record.publicRecordId === method?.recordId
  );
  const privateIntegration = result.serverOnlyRecords.find(
    (record) => record.publicRecordId === integration?.recordId
  );
  const privateRestApi = result.serverOnlyRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::RestApi"
  );
  const privateOrders = result.serverOnlyRecords.find(
    (record) => record.publicRecordId === orders?.recordId
  );
  assert.equal(privateRestApi?.serverOnlyConfig.rootResourceId, "root-one");
  assert.equal(privateOrders?.parentProviderResourceType, "AWS::ApiGateway::RestApi");
  assert.equal(privateOrders?.parentTerraformImportId, "api-one");
  assert.equal(privateOrders?.serverOnlyConfig.parentResourceId, "root-one");
  assert.equal(privateMethod?.terraformImportId, "api-one/orders-resource/GET");
  assert.equal(privateMethod?.parentTerraformImportId, "api-one/orders-resource");
  assert.equal(privateIntegration?.terraformImportId, "api-one/orders-resource/GET");
  assert.equal(
    privateIntegration?.serverOnlyConfig.integrationUri,
    "https://internal.example/private"
  );

  const publicJson = JSON.stringify({ families: result.families, records: result.publicRecords });
  assert.doesNotMatch(
    publicJson,
    /api-one|api-two|orders-resource|deployment-two|internal\.example/iu
  );
});

test("API Gateway REST topology reader는 고급 기능을 단순 topology와 구분하고 민감한 원문은 공개하지 않는다", async () => {
  const privatePolicyToken = "policy-server-only-token";
  const privatePolicy = `{"Statement":[{"Sid":"${privatePolicyToken}","Resource":"arn:aws:execute-api:::private"}]}`;
  const privateCredentialsArn = "arn:aws:iam::123456789012:role/private-api-role";
  const privateIntegrationUri =
    "arn:aws:apigateway:ap-northeast-2:lambda:path/functions/private/invocations";
  const privateAccessLogArn = "arn:aws:logs:ap-northeast-2:123456789012:private-log";
  const privateAccessLogFormat = "stage-log-server-only-format";
  const privateCanaryValue = "canary-server-only-value";
  const privateAuthorizerUri =
    "arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/private/invocations";
  const privateAuthorizerCredentials = "arn:aws:iam::123456789012:role/private-authorizer-role";
  const privateAuthorizerProviderArn = "arn:aws:cognito-idp:ap-northeast-2:123456789012:userpool/private";
  const privateAuthorizerIdentitySource = "method.request.header.private-token";

  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetRestApisCommand) {
          return {
            items: [
              {
                id: "advanced-api",
                name: "Advanced API",
                policy: privatePolicy,
                tags: { OwnerArn: privateCredentialsArn }
              }
            ]
          };
        }
        if (command instanceof GetResourcesCommand) {
          return {
            items: [
              { id: "advanced-root", path: "/" },
              {
                id: "advanced-resource",
                parentId: "advanced-root",
                pathPart: "orders",
                path: "/orders",
                resourceMethods: { POST: {} }
              }
            ]
          };
        }
        if (command instanceof GetMethodCommand) {
          return {
            httpMethod: "POST",
            authorizationType: "CUSTOM",
            authorizerId: "authorizer-private-id",
            requestValidatorId: "validator-private-id",
            requestModels: { "application/json": "Order" },
            methodIntegration: { type: "AWS_PROXY" }
          };
        }
        if (command instanceof GetIntegrationCommand) {
          return {
            type: "AWS_PROXY",
            httpMethod: "POST",
            uri: privateIntegrationUri,
            connectionType: "VPC_LINK",
            connectionId: "vpc-link-private-id",
            credentials: privateCredentialsArn,
            cacheKeyParameters: ["method.request.path.id"]
          };
        }
        if (command instanceof GetDeploymentsCommand) {
          return { items: [{ id: "advanced-deployment" }] };
        }
        if (command instanceof GetStagesCommand) {
          return {
            item: [
              {
                stageName: "prod",
                deploymentId: "advanced-deployment",
                variables: { secretTarget: "private-stage-value" },
                accessLogSettings: {
                  destinationArn: privateAccessLogArn,
                  format: privateAccessLogFormat
                },
                canarySettings: {
                  percentTraffic: 10,
                  stageVariableOverrides: { privateCanary: privateCanaryValue }
                },
                cacheClusterEnabled: true,
                methodSettings: { "*/*": { cachingEnabled: true } }
              }
            ]
          };
        }
        if (command instanceof GetAuthorizersCommand) {
          return {
            items: [
              {
                id: "authorizer-private-id",
                name: "Orders Authorizer",
                type: "REQUEST",
                authorizerUri: privateAuthorizerUri,
                authorizerCredentials: privateAuthorizerCredentials,
                providerARNs: [privateAuthorizerProviderArn],
                identitySource: privateAuthorizerIdentitySource
              }
            ]
          };
        }
        if (command instanceof GetModelsCommand) {
          return { items: [{ id: "model-private-id", name: "Order", schema: "private-schema" }] };
        }
        if (command instanceof GetRequestValidatorsCommand) {
          return { items: [{ id: "validator-private-id", name: "private-validator" }] };
        }
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    })
  });

  assert.deepEqual(result.families[0], {
    publicRestApiRecordId: result.families[0]?.publicRestApiRecordId,
    readComplete: true,
    classification: "advanced",
    managementReady: false,
    advancedFeatures: [
      "resource_policy",
      "authorizers",
      "models",
      "validators",
      "vpc_link",
      "integration_uri",
      "stage_variables",
      "access_logs",
      "canary",
      "method_settings",
      "cache"
    ]
  });

  const publicJson = JSON.stringify({ families: result.families, records: result.publicRecords });
  for (const privateValue of [
    privatePolicyToken,
    privateCredentialsArn,
    privateIntegrationUri,
    privateAccessLogArn,
    privateAccessLogFormat,
    privateCanaryValue,
    privateAuthorizerUri,
    privateAuthorizerCredentials,
    privateAuthorizerProviderArn,
    privateAuthorizerIdentitySource,
    "advanced-api/advanced-resource/POST",
    "private-stage-value",
    "private-schema"
  ]) {
    assert.equal(publicJson.includes(privateValue), false, privateValue);
  }

  const privateIntegration = result.serverOnlyRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Integration"
  );
  const privateRestApi = result.serverOnlyRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::RestApi"
  );
  const privateStage = result.serverOnlyRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Stage"
  );
  const authorizer = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Authorizer"
  );
  const privateAuthorizer = result.serverOnlyRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Authorizer"
  );
  const method = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Method"
  );
  assert.equal(authorizer?.displayName, "Orders Authorizer");
  assert.equal(authorizer?.parentRecordId, result.families[0]?.publicRestApiRecordId);
  assert.deepEqual(authorizer?.config, {
    type: "REQUEST",
    hasAuthorizerUri: true,
    hasCredentials: true,
    providerArnCount: 1,
    hasIdentitySource: true,
    hasValidationExpression: false,
    resultTtlInSeconds: undefined
  });
  assert.equal(method?.relatedRecordIds.includes(authorizer?.recordId ?? "missing"), true);
  assert.equal(privateAuthorizer?.terraformImportId, "advanced-api/authorizer-private-id");
  assert.equal(privateAuthorizer?.serverOnlyConfig.authorizerUri, privateAuthorizerUri);
  assert.equal(
    privateAuthorizer?.serverOnlyConfig.authorizerCredentials,
    privateAuthorizerCredentials
  );
  assert.equal(privateRestApi?.serverOnlyConfig.policyBody, privatePolicy);
  assert.equal(privateIntegration?.serverOnlyConfig.integrationUri, privateIntegrationUri);
  assert.equal(privateIntegration?.serverOnlyConfig.credentialsArn, privateCredentialsArn);
  assert.deepEqual(privateStage?.serverOnlyConfig.variables, {
    secretTarget: "private-stage-value"
  });
  assert.deepEqual(privateStage?.serverOnlyConfig.accessLogSettings, {
    destinationArn: privateAccessLogArn,
    format: privateAccessLogFormat
  });
  assert.deepEqual(privateStage?.serverOnlyConfig.canarySettings, {
    percentTraffic: 10,
    stageVariableOverrides: { privateCanary: privateCanaryValue }
  });
});

test("API Gateway REST topology reader는 child 권한 실패가 나면 해당 API family 전체를 incomplete로 처리한다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetRestApisCommand) {
          return {
            items: [
              { id: "denied-api", name: "Denied API" },
              { id: "healthy-api", name: "Healthy API" }
            ]
          };
        }
        if (command instanceof GetResourcesCommand && command.input.restApiId === "denied-api") {
          throw Object.assign(
            new Error("AccessDenied private request arn:aws:iam::123456789012:role/private"),
            { name: "AccessDeniedException" }
          );
        }
        if (command instanceof GetResourcesCommand) {
          return { items: [{ id: "healthy-root", path: "/" }] };
        }
        if (
          command instanceof GetDeploymentsCommand ||
          command instanceof GetAuthorizersCommand ||
          command instanceof GetModelsCommand ||
          command instanceof GetRequestValidatorsCommand
        ) {
          return { items: [] };
        }
        if (command instanceof GetStagesCommand) return { item: [] };
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    })
  });

  assert.equal(result.catalogReadComplete, true);
  assert.deepEqual(
    result.families.map((family) => [family.readComplete, family.classification]),
    [
      [false, "incomplete"],
      [true, "simple"]
    ]
  );
  assert.equal(result.families[0]?.managementReady, false);
  assert.equal(result.families[1]?.managementReady, true);
  assert.deepEqual(
    result.failures.map((failure) => failure.outcome),
    ["permission_denied"]
  );
  assert.doesNotMatch(
    JSON.stringify({
      families: result.families,
      failures: result.failures,
      records: result.publicRecords
    }),
    /AccessDenied|request|arn:aws|123456789012|private/iu
  );
});

test("API Gateway REST topology reader는 API page가 끊기면 발견한 모든 family를 incomplete로 낮춘다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetRestApisCommand) {
          if (command.input.position === "next") {
            throw new Error("InternalServerError private page token");
          }
          return { items: [{ id: "partial-api", name: "Partial API" }], position: "next" };
        }
        if (command instanceof GetResourcesCommand) {
          return { items: [{ id: "partial-root", path: "/" }] };
        }
        if (
          command instanceof GetDeploymentsCommand ||
          command instanceof GetAuthorizersCommand ||
          command instanceof GetModelsCommand ||
          command instanceof GetRequestValidatorsCommand
        ) {
          return { items: [] };
        }
        if (command instanceof GetStagesCommand) return { item: [] };
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    })
  });

  assert.equal(result.catalogReadComplete, false);
  assert.equal(result.families[0]?.readComplete, false);
  assert.equal(result.families[0]?.classification, "incomplete");
  assert.equal(result.families[0]?.managementReady, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.outcome),
    ["transient"]
  );
});

test("API Gateway REST topology reader는 누락되거나 중복된 RestApi ID를 catalog 불완전으로 처리한다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetRestApisCommand) {
          return {
            items: [
              { name: "Missing ID" },
              { id: "duplicate-api", name: "First" },
              { id: "duplicate-api", name: "Second" }
            ]
          };
        }
        if (command instanceof GetResourcesCommand) {
          return { items: [{ id: "duplicate-root", path: "/" }] };
        }
        if (
          command instanceof GetDeploymentsCommand ||
          command instanceof GetAuthorizersCommand ||
          command instanceof GetModelsCommand ||
          command instanceof GetRequestValidatorsCommand
        ) {
          return { items: [] };
        }
        if (command instanceof GetStagesCommand) return { item: [] };
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    })
  });

  assert.equal(result.catalogReadComplete, false);
  assert.equal(result.families.length, 1);
  assert.equal(result.families[0]?.classification, "incomplete");
  assert.equal(result.families[0]?.managementReady, false);
  assert.equal(
    result.failures.some(
      (failure) => failure.scope === "catalog" && failure.outcome === "invalid_response"
    ),
    true
  );
});

test("API Gateway REST topology reader는 같은 child identity가 반복되면 family를 불완전으로 처리하고 중복 record를 버린다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetRestApisCommand) {
          return { items: [{ id: "child-duplicate-api", name: "Duplicate Child" }] };
        }
        if (command instanceof GetResourcesCommand) {
          return {
            items: [
              { id: "duplicate-root", path: "/" },
              {
                id: "same-child",
                parentId: "duplicate-root",
                pathPart: "orders",
                path: "/orders"
              },
              {
                id: "same-child",
                parentId: "duplicate-root",
                pathPart: "orders-copy",
                path: "/orders-copy"
              }
            ]
          };
        }
        if (
          command instanceof GetDeploymentsCommand ||
          command instanceof GetAuthorizersCommand ||
          command instanceof GetModelsCommand ||
          command instanceof GetRequestValidatorsCommand
        ) {
          return { items: [] };
        }
        if (command instanceof GetStagesCommand) return { item: [] };
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    })
  });

  assert.equal(result.families[0]?.classification, "incomplete");
  assert.equal(result.families[0]?.managementReady, false);
  assert.equal(
    result.publicRecords.filter(
      (record) => record.providerResourceType === "AWS::ApiGateway::Resource"
    ).length,
    1
  );
  assert.equal(
    result.failures.some(
      (failure) => failure.scope === "resources" && failure.outcome === "invalid_response"
    ),
    true
  );
});

test("API Gateway REST topology reader는 catalog가 truncated인데 다음 position이 없으면 fail-close한다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetRestApisCommand) {
          return {
            items: [{ id: "truncated-api", name: "Truncated API" }],
            isTruncated: true
          };
        }
        if (command instanceof GetResourcesCommand) {
          return { items: [{ id: "truncated-root", path: "/" }] };
        }
        if (
          command instanceof GetDeploymentsCommand ||
          command instanceof GetAuthorizersCommand ||
          command instanceof GetModelsCommand ||
          command instanceof GetRequestValidatorsCommand
        ) {
          return { items: [] };
        }
        if (command instanceof GetStagesCommand) return { item: [] };
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    })
  });

  assert.equal(result.catalogReadComplete, false);
  assert.equal(result.families[0]?.classification, "incomplete");
  assert.equal(result.families[0]?.managementReady, false);
  assert.equal(result.failures[0]?.outcome, "invalid_response");
});

test("API Gateway REST topology reader는 family pagination position이 반복되면 fail-close한다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetRestApisCommand) {
          return { items: [{ id: "repeat-api", name: "Repeat API" }] };
        }
        if (command instanceof GetResourcesCommand) {
          return command.input.position === "same-position"
            ? { items: [], position: "same-position", isTruncated: true }
            : {
                items: [{ id: "repeat-root", path: "/" }],
                position: "same-position",
                isTruncated: true
              };
        }
        if (
          command instanceof GetDeploymentsCommand ||
          command instanceof GetAuthorizersCommand ||
          command instanceof GetModelsCommand ||
          command instanceof GetRequestValidatorsCommand
        ) {
          return { items: [] };
        }
        if (command instanceof GetStagesCommand) return { item: [] };
        assert.fail(`unexpected command: ${command.constructor.name}`);
      }
    })
  });

  assert.equal(result.catalogReadComplete, true);
  assert.equal(result.families[0]?.classification, "incomplete");
  assert.equal(result.families[0]?.managementReady, false);
  assert.equal(
    result.failures.some(
      (failure) => failure.scope === "resources" && failure.outcome === "invalid_response"
    ),
    true
  );
});

test("API Gateway REST topology reader는 Stage deployment ID가 없으면 family를 관리 불가로 처리한다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () =>
      createStaticTopologyClient({
        resources: [{ id: "root", path: "/" }],
        deployments: [{ id: "deployment-one" }],
        stages: [{ stageName: "prod" }]
      })
  });

  assert.equal(result.families[0]?.classification, "incomplete");
  assert.equal(result.families[0]?.managementReady, false);
  assert.equal(
    result.failures.some(
      (failure) => failure.scope === "stages" && failure.outcome === "invalid_response"
    ),
    true
  );
});

test("API Gateway REST topology reader는 root ID 충돌과 순환 Resource 관계를 관리 불가로 처리한다", async () => {
  const cases = [
    {
      name: "root와 child ID 충돌",
      resources: [
        { id: "same-id", path: "/" },
        { id: "same-id", parentId: "same-id", path: "/orders", pathPart: "orders" }
      ]
    },
    {
      name: "자기 자신을 부모로 둔 child",
      resources: [
        { id: "root", path: "/" },
        { id: "self-child", parentId: "self-child", path: "/orders", pathPart: "orders" }
      ]
    },
    {
      name: "root와 연결되지 않은 child cycle",
      resources: [
        { id: "root", path: "/" },
        { id: "child-a", parentId: "child-b", path: "/a", pathPart: "a" },
        { id: "child-b", parentId: "child-a", path: "/b", pathPart: "b" }
      ]
    }
  ] as const;

  for (const testCase of cases) {
    const result = await readAwsApiGatewayRestTopology({
      region: "ap-northeast-2",
      credentials,
      createClient: () => createStaticTopologyClient({ resources: testCase.resources })
    });

    assert.equal(result.families[0]?.classification, "incomplete", testCase.name);
    assert.equal(result.families[0]?.managementReady, false, testCase.name);
    assert.equal(
      result.failures.some(
        (failure) => failure.scope === "resources" && failure.outcome === "invalid_response"
      ),
      true,
      testCase.name
    );
  }
});

test("API Gateway REST topology reader는 Terraform 필수값이 빠진 child 응답을 관리 불가로 처리한다", async () => {
  const cases: readonly {
    readonly name: string;
    readonly scope: "resources" | "methods" | "integrations";
    readonly fixture: StaticTopologyFixture;
  }[] = [
    {
      name: "Resource pathPart 누락",
      scope: "resources",
      fixture: {
        resources: [
          { id: "root", path: "/" },
          { id: "orders", parentId: "root", path: "/orders" }
        ]
      }
    },
    {
      name: "Method authorizationType 누락",
      scope: "methods",
      fixture: {
        resources: [
          { id: "root", path: "/" },
          {
            id: "orders",
            parentId: "root",
            path: "/orders",
            pathPart: "orders",
            resourceMethods: { GET: {} }
          }
        ],
        method: { httpMethod: "GET" }
      }
    },
    {
      name: "Integration type 누락",
      scope: "integrations",
      fixture: {
        resources: [
          { id: "root", path: "/" },
          {
            id: "orders",
            parentId: "root",
            path: "/orders",
            pathPart: "orders",
            resourceMethods: { GET: {} }
          }
        ],
        method: {
          httpMethod: "GET",
          authorizationType: "NONE",
          methodIntegration: { type: "HTTP_PROXY" }
        },
        integration: { httpMethod: "GET" }
      }
    }
  ];

  for (const testCase of cases) {
    const result = await readAwsApiGatewayRestTopology({
      region: "ap-northeast-2",
      credentials,
      createClient: () => createStaticTopologyClient(testCase.fixture)
    });

    assert.equal(result.families[0]?.classification, "incomplete", testCase.name);
    assert.equal(result.families[0]?.managementReady, false, testCase.name);
    assert.equal(
      result.failures.some(
        (failure) => failure.scope === testCase.scope && failure.outcome === "invalid_response"
      ),
      true,
      testCase.name
    );
  }
});

test("API Gateway REST topology reader는 cache가 아닌 Method Settings도 advanced로 분류한다", async () => {
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () =>
      createStaticTopologyClient({
        resources: [{ id: "root", path: "/" }],
        deployments: [{ id: "deployment-one" }],
        stages: [
          {
            stageName: "prod",
            deploymentId: "deployment-one",
            methodSettings: {
              "*/*": { loggingLevel: "INFO", metricsEnabled: true, throttlingBurstLimit: 10 }
            }
          }
        ]
      })
  });

  assert.equal(result.families[0]?.classification, "advanced");
  assert.equal(result.families[0]?.managementReady, false);
  assert.equal(result.families[0]?.advancedFeatures.includes("method_settings"), true);
});

test("API Gateway REST topology reader는 Method와 Integration 응답 매핑을 조용히 버리지 않고 advanced로 닫는다", async () => {
  const cases: readonly {
    readonly name: string;
    readonly method: Readonly<Record<string, unknown>>;
    readonly integration: Readonly<Record<string, unknown>>;
  }[] = [
    {
      name: "Method response",
      method: {
        httpMethod: "GET",
        authorizationType: "NONE",
        methodResponses: { "200": { statusCode: "200" } },
        methodIntegration: { type: "MOCK" }
      },
      integration: { type: "MOCK", httpMethod: "GET" }
    },
    {
      name: "Integration response",
      method: {
        httpMethod: "GET",
        authorizationType: "NONE",
        methodIntegration: { type: "MOCK" }
      },
      integration: {
        type: "MOCK",
        httpMethod: "GET",
        integrationResponses: { default: { statusCode: "200" } }
      }
    }
  ];

  for (const testCase of cases) {
    const result = await readAwsApiGatewayRestTopology({
      region: "ap-northeast-2",
      credentials,
      createClient: () =>
        createStaticTopologyClient({
          resources: [
            { id: "root", path: "/" },
            {
              id: "orders",
              parentId: "root",
              path: "/orders",
              pathPart: "orders",
              resourceMethods: { GET: {} }
            }
          ],
          method: testCase.method,
          integration: testCase.integration
        })
    });

    assert.equal(result.families[0]?.classification, "advanced", testCase.name);
    assert.equal(result.families[0]?.managementReady, false, testCase.name);
    assert.equal(
      result.families[0]?.advancedFeatures.includes("response_mappings"),
      true,
      testCase.name
    );
  }
});

test("API Gateway REST topology reader는 정확한 Lambda URI와 IAM Role credentials를 opaque 관계로 보존한다", async () => {
  const lambdaFunctionArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";
  const integrationUri = `arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/${lambdaFunctionArn}/invocations`;
  const roleArn = "arn:aws:iam::123456789012:role/service/api-invoke-role";
  const result = await readAwsApiGatewayRestTopology({
    region: "ap-northeast-2",
    credentials,
    createClient: () =>
      createStaticTopologyClient({
        resources: [
          { id: "root", path: "/" },
          {
            id: "orders",
            parentId: "root",
            path: "/orders",
            pathPart: "orders",
            resourceMethods: { POST: {} }
          }
        ],
        method: {
          httpMethod: "POST",
          authorizationType: "NONE",
          methodIntegration: { type: "AWS_PROXY" }
        },
        integration: {
          type: "AWS_PROXY",
          httpMethod: "POST",
          uri: integrationUri,
          credentials: roleArn
        }
      })
  });

  assert.equal(result.families[0]?.classification, "simple");
  assert.equal(result.families[0]?.managementReady, true);
  const integration = result.publicRecords.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Integration"
  );
  assert.deepEqual(integration?.relatedRecordIds, [
    createOpaqueProviderResourceId("AWS::Lambda::Function", lambdaFunctionArn),
    createOpaqueProviderResourceId("AWS::IAM::Role", roleArn)
  ]);
  const serverOnlyIntegration = result.serverOnlyRecords.find(
    (record) => record.publicRecordId === integration?.recordId
  );
  assert.deepEqual(serverOnlyIntegration?.relatedTerraformImportIdentities, [
    {
      providerResourceType: "AWS::Lambda::Function",
      terraformImportId: "orders-handler"
    },
    {
      providerResourceType: "AWS::IAM::Role",
      terraformImportId: "api-invoke-role"
    }
  ]);
  assert.doesNotMatch(
    JSON.stringify({ family: result.families[0], record: integration }),
    /arn:aws|123456789012|orders-handler|api-invoke-role/u
  );
});

test("API Gateway REST topology reader는 해석할 수 없는 URI와 credentials를 advanced로 닫는다", async () => {
  const cases = [
    {
      name: "qualified Lambda URI",
      integration: {
        type: "AWS_PROXY",
        httpMethod: "POST",
        uri: "arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler:live/invocations"
      },
      feature: "integration_uri"
    },
    {
      name: "non-role credentials",
      integration: {
        type: "HTTP_PROXY",
        httpMethod: "POST",
        uri: "https://example.com/orders",
        credentials: "arn:aws:iam::*:user/*"
      },
      feature: "integration_credentials"
    },
    {
      name: "VPC link",
      integration: {
        type: "HTTP_PROXY",
        httpMethod: "POST",
        uri: "https://example.com/orders",
        connectionType: "VPC_LINK",
        connectionId: "private-vpc-link"
      },
      feature: "vpc_link"
    }
  ] as const;

  for (const testCase of cases) {
    const result = await readAwsApiGatewayRestTopology({
      region: "ap-northeast-2",
      credentials,
      createClient: () =>
        createStaticTopologyClient({
          resources: [
            { id: "root", path: "/" },
            {
              id: "orders",
              parentId: "root",
              path: "/orders",
              pathPart: "orders",
              resourceMethods: { POST: {} }
            }
          ],
          method: {
            httpMethod: "POST",
            authorizationType: "NONE",
            methodIntegration: { type: testCase.integration.type }
          },
          integration: testCase.integration
        })
    });

    assert.equal(result.families[0]?.classification, "advanced", testCase.name);
    assert.equal(result.families[0]?.managementReady, false, testCase.name);
    assert.equal(
      result.families[0]?.advancedFeatures.includes(testCase.feature),
      true,
      testCase.name
    );
  }
});
