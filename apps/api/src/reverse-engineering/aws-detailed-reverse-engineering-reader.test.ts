import assert from "node:assert/strict";
import test from "node:test";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  readAwsDetailedReverseEngineeringResources,
  type AwsDetailedReverseEngineeringReaderDependencies
} from "./aws-detailed-reverse-engineering-reader.js";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";

const CREDENTIALS: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_SESSION_TOKEN: "test-session-token",
  AWS_REGION: "ap-northeast-2"
};

test("선택한 상세 reader만 실행하고 exact import 정보는 server-only record에 합친다", async () => {
  const calls: string[] = [];
  const dependencies = createDependencies(calls);

  const result = await readAwsDetailedReverseEngineeringResources(
    {
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["IAM_ROLE", "LAMBDA"]
    },
    CREDENTIALS,
    dependencies
  );

  assert.deepEqual(calls.sort(), ["iam", "lambda"]);
  assert.equal(result.scanErrors.length, 0);
  assert.deepEqual(result.records.map((record) => record.providerResourceType).sort(), [
    "AWS::IAM::Role",
    "AWS::Lambda::Function"
  ]);
  const role = result.records.find((record) => record.providerResourceType === "AWS::IAM::Role");
  assert.equal(role?.providerResourceId, "aws-ref-role");
  assert.equal(role?.serverOnly?.providerResourceId, "arn:aws:iam::111122223333:role/app-role");
  assert.equal(role?.serverOnly?.terraformImportId, "app-role");
  assert.equal(role?.serverOnly?.config?.["resourceKind"], "role");
  assert.equal(
    role?.serverOnly?.config?.["trustPolicyDocument"],
    "private-trust-policy-never-public"
  );
  assert.doesNotMatch(JSON.stringify(role?.config), /private-trust-policy-never-public/u);

  const lambda = result.records.find(
    (record) => record.providerResourceType === "AWS::Lambda::Function"
  );
  assert.equal(
    lambda?.serverOnly?.providerResourceId,
    "arn:aws:lambda:ap-northeast-2:111122223333:function:api"
  );
  assert.equal(lambda?.serverOnly?.terraformImportId, "api");
  assert.deepEqual(lambda?.serverOnly?.config?.["environmentVariables"], {
    API_TOKEN: "private-token-never-public"
  });
  assert.doesNotMatch(JSON.stringify(lambda?.config), /private-token-never-public/u);
});

test("ALL은 IAM, Lambda, KMS, API Gateway 상세 reader를 각각 한 번만 실행한다", async () => {
  const calls: string[] = [];

  const result = await readAwsDetailedReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] },
    CREDENTIALS,
    createDependencies(calls)
  );

  assert.deepEqual(calls.sort(), ["api-gateway", "iam", "kms", "lambda"]);
  assert.equal(result.records.length, 9);
  const stage = result.records.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Stage"
  );
  assert.ok(stage);
  const restApi = result.records.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::RestApi"
  );
  assert.deepEqual(restApi?.relationships, []);
  assert.deepEqual(restApi?.config["tags"], { Environment: "production" });
  assert.equal(restApi?.config["tagsReadComplete"], true);
  assert.deepEqual(restApi?.serverOnly?.config?.["tags"], { Environment: "production" });
  assert.equal(restApi?.serverOnly?.config?.["tagsReadComplete"], true);
  const publicScan = await createAwsProviderAdapter({
    async discoverResources() {
      return result;
    }
  }).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
  const publicRestApi = publicScan.discoveredResources.find(
    (resource) => resource.resourceType === "API_GATEWAY_REST_API"
  );
  assert.deepEqual(publicRestApi?.config["tags"], { Environment: "production" });
  assert.equal(publicRestApi?.config["tagsReadComplete"], true);
  assert.equal(
    publicRestApi ? classifyReverseEngineeringManagement(publicRestApi) : undefined,
    "managed"
  );
  const deployment = result.records.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Deployment"
  );
  assert.deepEqual(deployment?.relationships, [
    { type: "contains", targetProviderResourceId: "api-ref" }
  ]);
  assert.deepEqual(stage.relationships, [
    { type: "depends_on", targetProviderResourceId: "api-deployment-ref" },
    { type: "contains", targetProviderResourceId: "api-ref" }
  ]);
  assert.equal(stage.serverOnly?.terraformImportId, "api-123/prod");
  assert.deepEqual(stage.serverOnly?.config?.["variables"], { private: "never-public" });
  assert.equal(stage.config["managementReady"], true);
});

test("API Gateway catalog 또는 family 조회가 불완전하면 tag 완료 evidence를 닫는다", async () => {
  const baseDependencies = createDependencies([]);
  const completeResult = await baseDependencies.readApiGateway("ap-northeast-2", CREDENTIALS);

  for (const incompleteResult of [
    { ...completeResult, catalogReadComplete: false },
    {
      ...completeResult,
      families: completeResult.families.map((family) => ({
        ...family,
        readComplete: false,
        managementReady: false
      }))
    }
  ]) {
    const dependencies = createDependencies([]);
    dependencies.readApiGateway = async () => incompleteResult;

    const result = await readAwsDetailedReverseEngineeringResources(
      {
        provider: "aws",
        region: "ap-northeast-2",
        resourceTypes: ["API_GATEWAY_REST_API"]
      },
      CREDENTIALS,
      dependencies
    );
    const restApi = result.records.find(
      (record) => record.providerResourceType === "AWS::ApiGateway::RestApi"
    );

    assert.equal(restApi?.config["tagsReadComplete"], false);
    assert.equal("tags" in (restApi?.config ?? {}), false);
    assert.deepEqual(restApi?.serverOnly?.config?.["tags"], { Environment: "production" });
    assert.equal(restApi?.serverOnly?.config?.["tagsReadComplete"], false);
    const publicScan = await createAwsProviderAdapter({
      async discoverResources() {
        return result;
      }
    }).scan({
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["API_GATEWAY_REST_API"]
    });
    assert.equal(
      publicScan.discoveredResources[0]
        ? classifyReverseEngineeringManagement(publicScan.discoveredResources[0])
        : undefined,
      "needs_mapping"
    );
  }
});

test("API Gateway Stage만 선택하면 Stage의 parent와 deployment 의존성만 남긴다", async () => {
  const calls: string[] = [];

  const result = await readAwsDetailedReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["API_GATEWAY_STAGE"] },
    CREDENTIALS,
    createDependencies(calls)
  );

  assert.deepEqual(calls, ["api-gateway"]);
  assert.deepEqual(result.records.map((record) => record.providerResourceId).sort(), [
    "api-deployment-ref",
    "api-ref",
    "api-stage-ref"
  ]);
  const stage = result.records.find(
    (record) => record.providerResourceType === "AWS::ApiGateway::Stage"
  );
  assert.deepEqual(stage?.relationships, [
    { type: "depends_on", targetProviderResourceId: "api-deployment-ref" },
    { type: "contains", targetProviderResourceId: "api-ref" }
  ]);
});

test("상세 reader 실패는 AWS 원문 없이 서비스별 부분 실패로 바꾼다", async () => {
  const dependencies = createDependencies([]);
  dependencies.readIam = async () => ({
    records: [],
    serverOnlyDetails: [],
    failures: [
      {
        providerResourceType: "AWS::IAM::Role",
        providerResourceId: "arn:aws:iam::111122223333:role/private-role",
        detail: "AccessDenied for account 111122223333 private-role",
        outcome: "permission_denied"
      }
    ]
  });
  dependencies.readLambda = async () => ({
    records: [],
    serverOnlyDetails: [],
    failures: [
      {
        providerResourceType: "AWS::Lambda::Function",
        detail: "internal endpoint detail",
        outcome: "transient"
      }
    ]
  });

  const result = await readAwsDetailedReverseEngineeringResources(
    {
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["IAM_ROLE", "LAMBDA"]
    },
    CREDENTIALS,
    dependencies
  );

  assert.equal(result.scanErrors.length, 2);
  assert.deepEqual(
    result.scanErrors.map((error) => ({
      serviceKey: error.serviceKey,
      reason: error.reason,
      message: error.message
    })),
    [
      {
        serviceKey: "iam",
        reason: "permission_denied",
        message: "이 서비스를 읽을 권한이 부족합니다."
      },
      {
        serviceKey: "lambda",
        reason: "provider_error",
        message: "이 서비스를 읽지 못했습니다."
      }
    ]
  );
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /111122223333|private-role|endpoint/iu);
});

test("같은 서비스의 여러 실패는 사용자가 먼저 조치할 수 있는 원인을 남긴다", async () => {
  const dependencies = createDependencies([]);
  dependencies.readIam = async () => ({
    records: [],
    serverOnlyDetails: [],
    failures: [
      { providerResourceType: "AWS::IAM::Role", detail: "access", outcome: "permission_denied" },
      { providerResourceType: "AWS::IAM::Role", detail: "rate", outcome: "throttled" },
      { providerResourceType: "AWS::IAM::Role", detail: "later", outcome: "transient" }
    ]
  });
  dependencies.readLambda = async () => ({
    records: [],
    serverOnlyDetails: [],
    failures: [
      {
        providerResourceType: "AWS::Lambda::Function",
        detail: "session",
        outcome: "expired_credential"
      },
      { providerResourceType: "AWS::Lambda::Function", detail: "config", outcome: "not_configured" }
    ]
  });
  dependencies.readKms = async () => ({
    records: [],
    serverOnlyDetails: [],
    failures: [
      { operation: "ListKeys", outcome: "invalid_region" },
      { operation: "ListKeys", outcome: "throttled" }
    ]
  });
  dependencies.readApiGateway = async () => ({
    catalogReadComplete: false,
    families: [],
    publicRecords: [],
    serverOnlyRecords: [],
    failures: [
      { scope: "catalog", outcome: "not_configured" },
      { scope: "catalog", outcome: "invalid_response" }
    ]
  });

  const result = await readAwsDetailedReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] },
    CREDENTIALS,
    dependencies
  );

  assert.deepEqual(
    result.scanErrors.map((error) => [error.serviceKey, error.reason]),
    [
      ["iam", "permission_denied"],
      ["lambda", "expired_credential"],
      ["kms", "invalid_region"],
      ["api-gateway", "not_configured"]
    ]
  );
});

/** gg: 실제 reader 대신 최소 결과를 주입해 선택·비공개 병합 계약만 빠르게 검증합니다. */
function createDependencies(calls: string[]): AwsDetailedReverseEngineeringReaderDependencies {
  return {
    async readIam() {
      calls.push("iam");
      return {
        records: [
          record("AWS::IAM::Role", "aws-ref-role", "app-role"),
          record("AWS::IAM::Policy", "aws-ref-policy", "unused-policy"),
          record("AWS::IAM::InstanceProfile", "aws-ref-profile", "unused-profile")
        ],
        serverOnlyDetails: [
          {
            providerResourceId: "aws-ref-role",
            resourceKind: "role",
            terraformImportId: "app-role",
            resourceArn: "arn:aws:iam::111122223333:role/app-role",
            trustPolicyDocument: "private-trust-policy-never-public"
          },
          {
            providerResourceId: "aws-ref-policy",
            resourceKind: "managed_policy",
            terraformImportId: "arn:aws:iam::111122223333:policy/unused-policy",
            resourceArn: "arn:aws:iam::111122223333:policy/unused-policy"
          },
          {
            providerResourceId: "aws-ref-profile",
            resourceKind: "instance_profile",
            terraformImportId: "unused-profile",
            resourceArn: "arn:aws:iam::111122223333:instance-profile/unused-profile"
          }
        ],
        failures: []
      };
    },
    async readLambda() {
      calls.push("lambda");
      return {
        records: [record("AWS::Lambda::Function", "aws-ref-lambda", "api")],
        serverOnlyDetails: [
          {
            providerResourceId: "aws-ref-lambda",
            resourceKind: "function",
            terraformImportId: "api",
            functionArn: "arn:aws:lambda:ap-northeast-2:111122223333:function:api",
            functionConfiguration: {},
            codeSource: {},
            tags: {},
            environmentVariables: { API_TOKEN: "private-token-never-public" }
          }
        ],
        failures: []
      };
    },
    async readKms() {
      calls.push("kms");
      return {
        records: [record("AWS::KMS::Key", "aws-ref-kms", "app-key")],
        serverOnlyDetails: [
          {
            providerResourceId: "aws-ref-kms",
            resourceKind: "key",
            terraformImportId: "key-123",
            keyId: "key-123",
            policyDocument: "private-kms-policy"
          }
        ],
        failures: []
      };
    },
    async readApiGateway() {
      calls.push("api-gateway");
      return {
        catalogReadComplete: true,
        families: [
          {
            publicRestApiRecordId: "api-ref",
            readComplete: true,
            classification: "simple",
            managementReady: true,
            advancedFeatures: []
          }
        ],
        publicRecords: [
          {
            recordId: "api-ref",
            familyRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::RestApi",
            displayName: "api",
            region: "ap-northeast-2",
            config: { hasResourcePolicy: false, name: "api" },
            relatedRecordIds: []
          },
          {
            recordId: "api-deployment-ref",
            familyRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::Deployment",
            displayName: "deployment",
            region: "ap-northeast-2",
            config: {},
            parentRecordId: "api-ref",
            relatedRecordIds: []
          },
          {
            recordId: "api-stage-ref",
            familyRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::Stage",
            displayName: "prod",
            region: "ap-northeast-2",
            config: {},
            parentRecordId: "api-ref",
            relatedRecordIds: ["api-deployment-ref"]
          },
          {
            recordId: "api-unrelated-ref",
            familyRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::Resource",
            displayName: "/unused",
            region: "ap-northeast-2",
            config: {},
            parentRecordId: "api-ref",
            relatedRecordIds: []
          }
        ],
        serverOnlyRecords: [
          {
            publicRecordId: "api-ref",
            familyPublicRestApiRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::RestApi",
            terraformImportId: "api-123",
            relatedTerraformImportIdentities: [],
            serverOnlyConfig: {
              rootResourceId: "root-private",
              tags: { Environment: "production" }
            }
          },
          {
            publicRecordId: "api-deployment-ref",
            familyPublicRestApiRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::Deployment",
            terraformImportId: "api-123/deploy-1",
            relatedTerraformImportIdentities: [],
            serverOnlyConfig: { deploymentId: "deploy-1" }
          },
          {
            publicRecordId: "api-stage-ref",
            familyPublicRestApiRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::Stage",
            terraformImportId: "api-123/prod",
            parentProviderResourceType: "AWS::ApiGateway::RestApi",
            parentTerraformImportId: "api-123",
            relatedTerraformImportIdentities: [
              {
                providerResourceType: "AWS::ApiGateway::Deployment",
                terraformImportId: "api-123/deploy-1"
              }
            ],
            serverOnlyConfig: { variables: { private: "never-public" } }
          },
          {
            publicRecordId: "api-unrelated-ref",
            familyPublicRestApiRecordId: "api-ref",
            providerResourceType: "AWS::ApiGateway::Resource",
            terraformImportId: "api-123/resource-unused",
            parentProviderResourceType: "AWS::ApiGateway::RestApi",
            parentTerraformImportId: "api-123",
            relatedTerraformImportIdentities: [],
            serverOnlyConfig: { pathPart: "unused" }
          }
        ],
        failures: []
      };
    }
  };
}

/** gg: reader 통합 테스트에서 서비스별 공개 record의 공통 모양을 고정합니다. */
function record(
  providerResourceType: string,
  providerResourceId: string,
  displayName: string
): AwsDiscoveredResourceRecord {
  return {
    providerResourceType,
    providerResourceId,
    displayName,
    region: "ap-northeast-2",
    config: { managementReady: true },
    relationships: []
  };
}
