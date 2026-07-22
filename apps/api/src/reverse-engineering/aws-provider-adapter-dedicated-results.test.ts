import assert from "node:assert/strict";
import test from "node:test";
import { GetResourcesCommand } from "@aws-sdk/client-resource-groups-tagging-api";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";
import {
  listTaggedUnknownResources,
  uniqueDiscoveredRecordsByProviderId
} from "./aws-reverse-engineering-gateway.js";

const credentials = {
  AWS_ACCESS_KEY_ID: "AKIA_TEST",
  AWS_REGION: "ap-northeast-2",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_SESSION_TOKEN: "token"
};

test("ALL 스캔은 Lambda IAM KMS의 generic inventory보다 전용 조회 결과를 우선한다", () => {
  const detailedRecords = createDetailedRecords();
  const genericRecords = detailedRecords.map((resource) =>
    record(
      resource.providerResourceType,
      resource.providerResourceId,
      `${resource.displayName} · generic`,
      { resourceKind: "inventory" }
    )
  );

  const records = uniqueDiscoveredRecordsByProviderId([
    ...genericRecords,
    ...detailedRecords,
    ...genericRecords
  ]);

  assert.equal(records.length, detailedRecords.length);
  assert.deepEqual(records, detailedRecords);
});

test("ALL 스캔의 Lambda IAM KMS 상세 설정과 관계를 보드 후보까지 보존한다", async () => {
  const relationshipTargets = [
    record("AWS::EC2::VPC", "vpc-orders", "orders-vpc"),
    record("AWS::EC2::Subnet", "subnet-orders", "orders-subnet"),
    record("AWS::EC2::SecurityGroup", "sg-orders", "orders-sg")
  ];
  const detailedRecords = createDetailedRecords();
  const genericRecords = detailedRecords.map((resource) =>
    record(
      resource.providerResourceType,
      resource.providerResourceId,
      `${resource.displayName} · generic`,
      { resourceKind: "inventory" }
    )
  );
  const result = await createAwsProviderAdapter({
    async discoverResources() {
      return uniqueDiscoveredRecordsByProviderId([
        ...relationshipTargets,
        ...genericRecords,
        ...detailedRecords
      ]);
    }
  }).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });

  assert.equal(result.discoveredResources.length, relationshipTargets.length + detailedRecords.length);
  const resourcesByType = new Map(
    result.discoveredResources.map((resource) => [resource.resourceType, resource])
  );
  assert.deepEqual(resourcesByType.get("LAMBDA")?.config, {
    functionName: "orders-api",
    runtime: "nodejs22.x",
    securityGroupIds: ["sg-orders"],
    subnetIds: ["subnet-orders"],
    vpcId: "vpc-orders"
  });
  assert.deepEqual(resourcesByType.get("IAM_ROLE")?.config, {
    path: "/service/",
    roleName: "orders-api"
  });
  assert.deepEqual(resourcesByType.get("IAM_POLICY")?.config, {
    path: "/service/",
    policyName: "orders-read"
  });
  assert.deepEqual(resourcesByType.get("IAM_INSTANCE_PROFILE")?.config, {
    instanceProfileName: "orders-api",
    roleNames: ["orders-api"]
  });
  assert.deepEqual(resourcesByType.get("KMS_KEY")?.config, {
    keyId: "11111111-2222-3333-4444-555555555555",
    keyManager: "CUSTOMER",
    keyState: "Enabled"
  });
  assert.equal(resourcesByType.get("LAMBDA")?.relationships?.length, 3);
  assert.equal(resourcesByType.get("IAM_INSTANCE_PROFILE")?.relationships?.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
});

test("Tagging API의 실제 IAM ARN도 전용 reader와 합치며 CloudFormation 소유 태그를 보존한다", async () => {
  const roleArn = "arn:aws:iam::123456789012:role/customer-api";
  const genericRecords = await listTaggedUnknownResources(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        assert.ok(command instanceof GetResourcesCommand);
        return {
          ResourceTagMappingList: [
            {
              ResourceARN: roleArn,
              Tags: [
                { Key: "Name", Value: "customer-api" },
                { Key: "aws:cloudformation:stack-name", Value: "customer-production" }
              ]
            }
          ]
        };
      }
    })
  );
  const detailed = record(
    "AWS::IAM::Role",
    roleArn,
    "customer-api",
    { roleName: "customer-api", path: "/service/" },
    [{ type: "attached_to", targetProviderResourceId: "instance-profile/customer-api" }]
  );

  const records = uniqueDiscoveredRecordsByProviderId([...genericRecords, detailed]);

  assert.equal(genericRecords[0]?.providerResourceType, "AWS::IAM::Role");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.config["roleName"], "customer-api");
  assert.deepEqual(records[0]?.config["tags"], [
    { key: "Name", value: "customer-api" },
    { key: "aws:cloudformation:stack-name", value: "customer-production" }
  ]);
  assert.deepEqual(records[0]?.relationships, detailed.relationships);
});

test("Tagging API의 API Gateway ARN은 전용 reader ID와 하나로 합친다", async () => {
  const genericRecords = await listTaggedUnknownResources(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        assert.ok(command instanceof GetResourcesCommand);
        return {
          ResourceTagMappingList: [
            {
              ResourceARN: "arn:aws:apigateway:ap-northeast-2::/restapis/api123",
              Tags: [{ Key: "Environment", Value: "production" }]
            }
          ]
        };
      }
    })
  );
  const detailed = record(
    "AWS::ApiGateway::RestApi",
    "api123",
    "customer-api",
    { id: "api123", name: "customer-api" }
  );

  const records = uniqueDiscoveredRecordsByProviderId([...genericRecords, detailed]);

  assert.equal(genericRecords[0]?.providerResourceType, "AWS::ApiGateway::RestApi");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceId, "api123");
  assert.equal(records[0]?.config["name"], "customer-api");
  assert.deepEqual(records[0]?.config["tags"], [
    { key: "Environment", value: "production" }
  ]);
});

function createDetailedRecords(): AwsDiscoveredResourceRecord[] {
  const lambdaArn =
    "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-api";
  const roleArn = "arn:aws:iam::123456789012:role/orders-api";
  const policyArn = "arn:aws:iam::123456789012:policy/orders-read";
  const profileArn = "arn:aws:iam::123456789012:instance-profile/orders-api";
  const kmsArn =
    "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555";

  return [
    record("AWS::Lambda::Function", lambdaArn, "orders-api", {
      functionName: "orders-api",
      runtime: "nodejs22.x",
      vpcId: "vpc-orders",
      subnetIds: ["subnet-orders"],
      securityGroupIds: ["sg-orders"]
    }, [
      { type: "depends_on", targetProviderResourceId: "vpc-orders" },
      { type: "attached_to", targetProviderResourceId: "subnet-orders" },
      { type: "attached_to", targetProviderResourceId: "sg-orders" }
    ]),
    record("AWS::IAM::Role", roleArn, "orders-api", {
      roleName: "orders-api",
      path: "/service/"
    }),
    record("AWS::IAM::Policy", policyArn, "orders-read", {
      policyName: "orders-read",
      path: "/service/"
    }),
    record("AWS::IAM::InstanceProfile", profileArn, "orders-api", {
      instanceProfileName: "orders-api",
      roleNames: ["orders-api"]
    }, [{ type: "attached_to", targetProviderResourceId: roleArn }]),
    record("AWS::KMS::Key", kmsArn, "orders-key", {
      arn: kmsArn,
      keyId: "11111111-2222-3333-4444-555555555555",
      keyManager: "CUSTOMER",
      keyState: "Enabled"
    })
  ];
}

function record(
  providerResourceType: string,
  providerResourceId: string,
  displayName: string,
  config: Record<string, unknown> = {},
  relationships: AwsDiscoveredResourceRecord["relationships"] = []
): AwsDiscoveredResourceRecord {
  return {
    providerResourceType,
    providerResourceId,
    displayName,
    region: "ap-northeast-2",
    config,
    relationships
  };
}
