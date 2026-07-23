import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { getReverseEngineeringTerraformCompleteness } from "./reverse-engineering-terraform-completeness.js";

test("상세 Reader 리소스는 provider 종류별 exact terraformImportId만 사용한다", () => {
  const cases: Array<{
    resourceType: ResourceType;
    providerResourceType: string;
    terraformImportId: string;
    config: Record<string, unknown>;
  }> = [
    {
      resourceType: "IAM_ROLE",
      providerResourceType: "AWS::IAM::Role",
      terraformImportId: "orders-role",
      config: {
        roleName: "orders-role",
        trustPolicyDocument: { Version: "2012-10-17", Statement: [] }
      }
    },
    {
      resourceType: "IAM_POLICY",
      providerResourceType: "AWS::IAM::Policy",
      terraformImportId: "arn:aws:iam::111122223333:policy/orders-read",
      config: {
        policyName: "orders-read",
        policyDocument: { Version: "2012-10-17", Statement: [] }
      }
    },
    {
      resourceType: "IAM_POLICY",
      providerResourceType: "AWS::IAM::RolePolicy",
      terraformImportId: "orders-role:orders-inline",
      config: {
        policyName: "orders-inline",
        roleName: "orders-role",
        policyDocument: { Version: "2012-10-17", Statement: [] }
      }
    },
    {
      resourceType: "IAM_POLICY",
      providerResourceType: "AWS::IAM::RolePolicyAttachment",
      terraformImportId: "orders-role/arn:aws:iam::111122223333:policy/orders-read",
      config: {
        roleName: "orders-role",
        policyArn: "arn:aws:iam::111122223333:policy/orders-read"
      }
    },
    {
      resourceType: "IAM_INSTANCE_PROFILE",
      providerResourceType: "AWS::IAM::InstanceProfile",
      terraformImportId: "orders-profile",
      config: { instanceProfileName: "orders-profile", roleNames: ["orders-role"] }
    },
    {
      resourceType: "LAMBDA",
      providerResourceType: "AWS::Lambda::Function",
      terraformImportId: "orders-api",
      config: {
        functionName: "orders-api",
        functionConfiguration: {
          FunctionName: "orders-api",
          PackageType: "Image",
          Role: "arn:aws:iam::111122223333:role/orders-role"
        },
        codeSource: { imageUri: "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/orders:1" }
      }
    },
    {
      resourceType: "LAMBDA_PERMISSION",
      providerResourceType: "AWS::Lambda::Permission",
      terraformImportId: "orders-api:live/AllowInvoke",
      config: {
        functionName: "orders-api",
        statementId: "AllowInvoke",
        statement: {
          Sid: "AllowInvoke",
          Effect: "Allow",
          Action: "lambda:InvokeFunction",
          Principal: { Service: "apigateway.amazonaws.com" },
          Resource: "arn:aws:lambda:ap-northeast-2:111122223333:function:orders-api:live"
        }
      }
    },
    {
      resourceType: "KMS_KEY",
      providerResourceType: "AWS::KMS::Key",
      terraformImportId: "11111111-2222-3333-4444-555555555555",
      config: {
        keyId: "11111111-2222-3333-4444-555555555555",
        keySpec: "SYMMETRIC_DEFAULT",
        keyUsage: "ENCRYPT_DECRYPT",
        policyDocument: { Version: "2012-10-17", Statement: [] }
      }
    },
    {
      resourceType: "KMS_ALIAS",
      providerResourceType: "AWS::KMS::Alias",
      terraformImportId: "alias/orders",
      config: { aliasName: "alias/orders", targetKeyId: "11111111-2222-3333-4444-555555555555" }
    },
    ...apiGatewayCases()
  ];

  for (const fixture of cases) {
    const candidate = detailedResource(fixture.resourceType, fixture.providerResourceType, {
      ...fixture.config,
      terraformImportId: fixture.terraformImportId
    });
    const completeness = getReverseEngineeringTerraformCompleteness(candidate);

    assert.deepEqual(completeness.missingCreationFields, [], fixture.providerResourceType);
    assert.equal(completeness.importId, fixture.terraformImportId, fixture.providerResourceType);

    assert.equal(
      getReverseEngineeringTerraformCompleteness({
        ...candidate,
        config: { ...candidate.config, terraformImportId: undefined }
      }).importId,
      null,
      `${fixture.providerResourceType} must not fall back to providerResourceId`
    );
  }
});

test("상세 리소스는 marker, provider 종류, import ID 형식이 어긋나면 완전하지 않다", () => {
  const base = detailedResource("IAM_POLICY", "AWS::IAM::RolePolicy", {
    policyName: "orders-inline",
    roleName: "orders-role",
    policyDocument: { Version: "2012-10-17", Statement: [] },
    terraformImportId: "orders-role:orders-inline"
  });

  for (const config of [
    { ...base.config, managementReady: false },
    { ...base.config, reverseEngineeringDetailsComplete: false },
    { ...base.config, reverseEngineeringDetailsVersion: 2 },
    { ...base.config, terraformImportId: "orders-role/orders-inline" }
  ]) {
    const result = getReverseEngineeringTerraformCompleteness({ ...base, config });
    assert.notDeepEqual(result.missingCreationFields, []);
  }

  const mismatched = getReverseEngineeringTerraformCompleteness({
    ...base,
    providerResourceType: "AWS::IAM::Role"
  });
  assert.ok(mismatched.missingCreationFields.includes("providerResourceType"));
  assert.equal(mismatched.importId, null);
});

test("암호화 또는 웹사이트 설정이 있는 S3 Bucket은 설정을 잃지 않도록 자동 생성을 닫는다", () => {
  for (const config of [
    { hasEncryptionConfiguration: true, hasWebsiteConfiguration: false },
    { hasEncryptionConfiguration: false, hasWebsiteConfiguration: true },
    { hasEncryptionConfiguration: true, hasWebsiteConfiguration: true }
  ]) {
    const bucket: DiscoveredResource = {
      id: "resource-configured-bucket",
      provider: "aws",
      providerResourceType: "AWS::S3::Bucket",
      providerResourceId: "configured-bucket",
      region: "ap-northeast-2",
      displayName: "configured-bucket",
      resourceType: "S3",
      config
    };
    const result = getReverseEngineeringTerraformCompleteness(bucket);

    assert.equal(result.importId, "configured-bucket");
    assert.notDeepEqual(result.missingCreationFields, []);
    assert(
      result.missingCreationFields.some((field) =>
        ["bucketEncryptionConfiguration", "bucketWebsiteConfiguration"].includes(field)
      )
    );
  }
});

test("S3 Bucket tag를 전부 안전하게 읽은 경우에만 자동 생성을 연다", () => {
  const bucket = (config: Record<string, unknown>): DiscoveredResource => ({
    id: "resource-tagged-bucket",
    provider: "aws",
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "tagged-bucket",
    region: "ap-northeast-2",
    displayName: "tagged-bucket",
    resourceType: "S3",
    config: {
      hasEncryptionConfiguration: false,
      hasWebsiteConfiguration: false,
      ...config
    }
  });

  const complete = getReverseEngineeringTerraformCompleteness(
    bucket({
      tags: [{ key: "Environment", value: "production" }],
      tagsReadComplete: true
    })
  );
  assert.deepEqual(complete.missingCreationFields, []);

  for (const config of [
    { tags: [{ key: "Environment", value: "production" }] },
    { tagsReadComplete: true },
    { tags: [{ key: "Environment" }], tagsReadComplete: true }
  ]) {
    const incomplete = getReverseEngineeringTerraformCompleteness(bucket(config));
    assert.ok(incomplete.missingCreationFields.includes("tags"));
  }
});

function apiGatewayCases(): Array<{
  resourceType: ResourceType;
  providerResourceType: string;
  terraformImportId: string;
  config: Record<string, unknown>;
}> {
  return [
    {
      resourceType: "API_GATEWAY_RESOURCE",
      providerResourceType: "AWS::ApiGateway::Resource",
      terraformImportId: "api123/resource123",
      config: {
        restApiId: "api123",
        resourceId: "resource123",
        parentResourceId: "root123",
        pathPart: "orders"
      }
    },
    {
      resourceType: "API_GATEWAY_METHOD",
      providerResourceType: "AWS::ApiGateway::Method",
      terraformImportId: "api123/resource123/GET",
      config: {
        restApiId: "api123",
        resourceId: "resource123",
        httpMethod: "GET",
        authorizationType: "NONE",
        methodResponses: {}
      }
    },
    {
      resourceType: "API_GATEWAY_INTEGRATION",
      providerResourceType: "AWS::ApiGateway::Integration",
      terraformImportId: "api123/resource123/GET",
      config: {
        restApiId: "api123",
        resourceId: "resource123",
        httpMethod: "GET",
        integrationType: "MOCK",
        integrationResponses: {}
      }
    },
    {
      resourceType: "API_GATEWAY_DEPLOYMENT",
      providerResourceType: "AWS::ApiGateway::Deployment",
      terraformImportId: "api123/deployment123",
      config: { restApiId: "api123", deploymentId: "deployment123" }
    },
    {
      resourceType: "API_GATEWAY_STAGE",
      providerResourceType: "AWS::ApiGateway::Stage",
      terraformImportId: "api123/prod",
      config: { restApiId: "api123", deploymentId: "deployment123", stageName: "prod" }
    }
  ];
}

function detailedResource(
  resourceType: ResourceType,
  providerResourceType: string,
  config: Record<string, unknown>
): DiscoveredResource {
  return {
    id: `resource-${resourceType.toLowerCase()}`,
    provider: "aws",
    providerResourceType,
    providerResourceId: `arn:aws:test:::${resourceType.toLowerCase()}`,
    region: "ap-northeast-2",
    displayName: resourceType,
    resourceType,
    config: {
      managementReady: true,
      reverseEngineeringDetailsComplete: true,
      reverseEngineeringDetailsVersion: 1,
      reverseEngineeringIncompleteDetails: [],
      ...config
    }
  };
}
