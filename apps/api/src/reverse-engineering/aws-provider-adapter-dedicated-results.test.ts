import assert from "node:assert/strict";
import test from "node:test";
import { GetResourcesCommand } from "@aws-sdk/client-resource-groups-tagging-api";
import {
  GetDefaultViewCommand,
  GetViewCommand,
  SearchCommand
} from "@aws-sdk/client-resource-explorer-2";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";
import {
  listResourceExplorerResourcesAsUnknown,
  listTaggedUnknownResources,
  uniqueDiscoveredRecordsByProviderId
} from "./aws-reverse-engineering-gateway.js";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";

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

test("IAM 소유권 태그는 public과 private 후보의 관리 경계까지 안전하게 전달한다", async () => {
  const iamResources = [
    {
      providerResourceType: "AWS::IAM::Role",
      detail: { roleName: "customer-role" },
      resourceName: "role/customer-role"
    },
    {
      providerResourceType: "AWS::IAM::Policy",
      detail: { policyName: "customer-policy" },
      resourceName: "policy/customer-policy"
    },
    {
      providerResourceType: "AWS::IAM::InstanceProfile",
      detail: { instanceProfileName: "customer-profile", roleNames: ["customer-role"] },
      resourceName: "instance-profile/customer-profile"
    }
  ] as const;
  const records = iamResources.flatMap((resource) => [
    record(
      resource.providerResourceType,
      `arn:aws:iam::123456789012:${resource.resourceName}-cfn`,
      `${resource.resourceName}-cfn`,
      {
        ...resource.detail,
        tags: [
          {
            key: "aws:cloudformation:stack-id",
            value:
              "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/customer/stack-id"
          },
          { key: "Environment", value: "production" }
        ]
      }
    ),
    record(
      resource.providerResourceType,
      `arn:aws:iam::123456789012:${resource.resourceName}-sketchcatch`,
      `${resource.resourceName}-sketchcatch`,
      {
        ...resource.detail,
        tags: [
          { Key: "ManagedBy", Value: "SketchCatch" },
          { Key: "Environment", Value: "production" }
        ]
      }
    )
  ]);

  for (const resultVisibility of ["public", "private"] as const) {
    const result = await createAwsProviderAdapter(
      { async discoverResources() { return records; } },
      { resultVisibility }
    ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });

    assert.deepEqual(
      result.discoveredResources.map((resource) =>
        classifyReverseEngineeringManagement(resource)
      ),
      iamResources.flatMap(() => ["reference", "sketchcatch_managed"])
    );
    assert.equal(JSON.stringify(result.discoveredResources).includes("Environment"), false);
    assert.doesNotMatch(JSON.stringify(result.discoveredResources), /arn:aws:cloudformation/iu);
    for (const [index, resource] of result.discoveredResources.entries()) {
      assert.deepEqual(
        resource.config["tags"],
        index % 2 === 0
          ? [{ key: "aws:cloudformation:stack-id", value: "present" }]
          : [{ key: "ManagedBy", value: "SketchCatch" }]
      );
    }
  }
});

test("Tagging API의 AMI ARN은 전용 AMI와 합치고 상세 설정과 소유권 태그를 보존한다", async () => {
  const imageId = "ami-0123456789abcdef0";
  const imageArn = `arn:aws:ec2:ap-northeast-2:123456789012:image/${imageId}`;
  const genericRecords = await listTaggedUnknownResources(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        assert.ok(command instanceof GetResourcesCommand);
        return {
          ResourceTagMappingList: [
            {
              ResourceARN: imageArn,
              Tags: [
                { Key: "Name", Value: "customer-base" },
                { Key: "aws:cloudformation:stack-name", Value: "customer-images" }
              ]
            }
          ]
        };
      }
    })
  );
  assert.ok(genericRecords[0]);
  genericRecords[0].relationships = [
    { type: "depends_on", targetProviderResourceId: "snapshot/snap-customer" }
  ];
  const detailed = record(
    "AWS::EC2::Image",
    imageId,
    "customer-base",
    {
      architecture: "arm64",
      imageId,
      rootDeviceName: "/dev/xvda",
      state: "available"
    },
    [{ type: "attached_to", targetProviderResourceId: "instance/i-customer" }]
  );

  const records = uniqueDiscoveredRecordsByProviderId([...genericRecords, detailed]);

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceId, imageId);
  assert.deepEqual(records[0]?.config, {
    architecture: "arm64",
    imageId,
    rootDeviceName: "/dev/xvda",
    state: "available",
    tags: [
      { key: "Name", value: "customer-base" },
      { key: "aws:cloudformation:stack-name", value: "customer-images" }
    ]
  });
  assert.deepEqual(records[0]?.relationships, [
    { type: "depends_on", targetProviderResourceId: "snapshot/snap-customer" },
    { type: "attached_to", targetProviderResourceId: "instance/i-customer" }
  ]);
});

test("Resource Explorer의 AMI ARN은 전용 AMI와 합치고 상세 설정과 관계를 보존한다", async () => {
  const imageId = "ami-0fedcba9876543210";
  const imageArn = `arn:aws:ec2:ap-northeast-2:123456789012:image/${imageId}`;
  const viewArn =
    "arn:aws:resource-explorer-2:ap-northeast-2:123456789012:view/default/example";
  const genericRecords = await listResourceExplorerResourcesAsUnknown(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof GetDefaultViewCommand) return { ViewArn: viewArn };
        if (command instanceof GetViewCommand) return { View: { ViewArn: viewArn } };
        if (command instanceof SearchCommand) {
          return {
            Resources: [
              {
                Arn: imageArn,
                OwningAccountId: "123456789012",
                Region: "ap-northeast-2",
                ResourceType: "AWS::EC2::Image",
                Service: "ec2"
              }
            ]
          };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    })
  );
  assert.ok(genericRecords[0]);
  genericRecords[0].relationships = [
    { type: "depends_on", targetProviderResourceId: "snapshot/snap-explorer" }
  ];
  const detailed = record("AWS::EC2::Image", imageId, "explorer-base", {
    architecture: "x86_64",
    imageId,
    imageType: "machine",
    state: "available"
  });

  const records = uniqueDiscoveredRecordsByProviderId([...genericRecords, detailed]);

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceId, imageId);
  assert.deepEqual(records[0]?.config, {
    architecture: "x86_64",
    imageId,
    imageType: "machine",
    state: "available"
  });
  assert.deepEqual(records[0]?.relationships, [
    { type: "depends_on", targetProviderResourceId: "snapshot/snap-explorer" }
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
