import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractSetItems,
  parseInstancesFromXml,
  parseInternetGatewaysFromXml,
  parseRdsInstancesFromXml,
  parseRouteTablesFromXml,
  parseSecurityGroupsFromXml
} from "./aws-reverse-engineering-parsers.js";
import {
  listAmiImagesAsUnknown,
  listApiGatewayRestApisAsUnknown,
  listApplicationLoadBalancersAsUnknown,
  listBucketsWithDetails,
  listCloudFrontDistributionsAsUnknown,
  listCloudWatchMetricAlarmsAsUnknown,
  listCloudWatchLogGroupsAsUnknown,
  listIamInstanceProfilesAsUnknown,
  listIamPoliciesAsUnknown,
  listIamRolesAsUnknown,
  listKmsKeysAsUnknown,
  listLambdaFunctionsAsUnknown,
  listLambdaPermissionsAsUnknown,
  listTaggedUnknownResources,
  maskReverseEngineeringSensitiveText as maskGatewaySensitiveText,
  shouldReadUnknownResourceGroup,
  shouldReadResourceGroup
} from "./aws-reverse-engineering-gateway.js";

const TEST_AWS_CREDENTIALS = {
  AWS_ACCESS_KEY_ID: "access-key",
  AWS_SECRET_ACCESS_KEY: "secret-key",
  AWS_REGION: "ap-northeast-2"
};

test("shouldReadResourceGroup reads every supported group when ALL is selected", () => {
  const input = {
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes: ["ALL" as const]
  };

  assert.equal(shouldReadResourceGroup(input, "VPC"), true);
  assert.equal(shouldReadResourceGroup(input, "EC2"), true);
  assert.equal(shouldReadResourceGroup(input, "RDS"), true);
});

test("shouldReadResourceGroup keeps individual resource filters when ALL is not selected", () => {
  const input = {
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes: ["EC2" as const]
  };

  assert.equal(shouldReadResourceGroup(input, "EC2"), true);
  assert.equal(shouldReadResourceGroup(input, "RDS"), false);
});

test("shouldReadResourceGroup reads route tables when route table associations are selected", () => {
  const input = {
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes: ["ROUTE_TABLE_ASSOCIATION" as const]
  };

  assert.equal(shouldReadResourceGroup(input, "ROUTE_TABLE"), true);
  assert.equal(shouldReadResourceGroup(input, "VPC"), false);
});

test("shouldReadUnknownResourceGroup reads UNKNOWN family only for ALL, UNKNOWN, or Lambda filters", () => {
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["UNKNOWN"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["LAMBDA"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["LAMBDA_PERMISSION"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["CLOUDFRONT"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["AMI"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["IAM_ROLE"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["IAM_POLICY"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["IAM_INSTANCE_PROFILE"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["KMS_KEY"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["CLOUDWATCH_LOG_GROUP"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["CLOUDWATCH_METRIC_ALARM"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["API_GATEWAY_REST_API"]
  }), true);
  assert.equal(shouldReadUnknownResourceGroup({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["EC2"]
  }), false);
});

test("listBucketsWithDetails keeps S3 bucket read-only settings in config", async () => {
  const sentCommandNames: string[] = [];
  const fakeS3Client = {
    async send(command: { constructor: { name: string }; input?: { Bucket?: string } }) {
      sentCommandNames.push(command.constructor.name);

      switch (command.constructor.name) {
        case "ListBucketsCommand":
          return { Buckets: [{ Name: "demo-bucket", CreationDate: new Date("2026-07-06T00:00:00.000Z") }] };
        case "GetBucketLocationCommand":
          return { LocationConstraint: "ap-northeast-2" };
        case "GetBucketVersioningCommand":
          return { Status: "Enabled", MFADelete: "Disabled" };
        case "GetPublicAccessBlockCommand":
          return {
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              IgnorePublicAcls: true,
              BlockPublicPolicy: true,
              RestrictPublicBuckets: true
            }
          };
        case "GetBucketEncryptionCommand":
          return {
            ServerSideEncryptionConfiguration: {
              Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" }, BucketKeyEnabled: true }]
            }
          };
        case "GetBucketWebsiteCommand":
          return { IndexDocument: { Suffix: "index.html" }, ErrorDocument: { Key: "error.html" } };
        case "GetBucketTaggingCommand":
          return { TagSet: [{ Key: "env", Value: "dev" }] };
        case "GetBucketPolicyStatusCommand":
          return { PolicyStatus: { IsPublic: false } };
        default:
          throw new Error(`Unexpected command ${command.constructor.name}`);
      }
    }
  };

  const [bucket] = await listBucketsWithDetails("ap-northeast-2", TEST_AWS_CREDENTIALS, () => fakeS3Client);

  assert.deepEqual(sentCommandNames, [
    "ListBucketsCommand",
    "GetBucketLocationCommand",
    "GetBucketVersioningCommand",
    "GetPublicAccessBlockCommand",
    "GetBucketEncryptionCommand",
    "GetBucketWebsiteCommand",
    "GetBucketTaggingCommand",
    "GetBucketPolicyStatusCommand"
  ]);
  assert.equal(bucket?.providerResourceType, "AWS::S3::Bucket");
  assert.equal(bucket?.providerResourceId, "demo-bucket");
  assert.equal(bucket?.region, "ap-northeast-2");
  assert.equal(bucket?.config["versioningStatus"], "Enabled");
  assert.equal(bucket?.config["policyStatusIsPublic"], false);
  assert.deepEqual(bucket?.config["tags"], [{ key: "env", value: "dev" }]);
  assert.deepEqual(bucket?.config["providerParameters"], {
    bucket: { name: "demo-bucket", createdAt: "2026-07-06T00:00:00.000Z" },
    location: { LocationConstraint: "ap-northeast-2" },
    versioning: { Status: "Enabled", MFADelete: "Disabled" },
    publicAccessBlock: {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      }
    },
    encryption: {
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" }, BucketKeyEnabled: true }]
      }
    },
    website: { IndexDocument: { Suffix: "index.html" }, ErrorDocument: { Key: "error.html" } },
    tagging: { TagSet: [{ Key: "env", Value: "dev" }] },
    policyStatus: { PolicyStatus: { IsPublic: false } }
  });
});

test("listBucketsWithDetails exposes provider parameters instead of raw AWS response keys", async () => {
  const fakeS3Client = {
    async send(command: { constructor: { name: string } }) {
      if (command.constructor.name === "ListBucketsCommand") {
        return {
          Buckets: [{ Name: "normalized-bucket", CreationDate: new Date("2026-07-06T00:00:00.000Z") }]
        };
      }

      return {};
    }
  };

  const [bucket] = await listBucketsWithDetails("ap-northeast-2", TEST_AWS_CREDENTIALS, () => fakeS3Client);

  assert.equal("rawProviderData" in (bucket?.config ?? {}), false);
  assert.equal(typeof bucket?.config["providerParameters"], "object");
});

test("listTaggedUnknownResources keeps unsupported tagged AWS resources as UNKNOWN candidates", async () => {
  const fakeTaggingClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "GetResourcesCommand");

      return {
        ResourceTagMappingList: [
          {
            ResourceARN: "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn",
            Tags: [{ Key: "Name", Value: "Demo Lambda" }]
          },
          {
            ResourceARN: "arn:aws:ec2:ap-northeast-2:316875069960:instance/i-known",
            Tags: [{ Key: "Name", Value: "Known EC2" }]
          }
        ]
      };
    }
  };

  const records = await listTaggedUnknownResources(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeTaggingClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::Lambda::Function");
  assert.equal(records[0]?.providerResourceId, "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn");
  assert.equal(records[0]?.displayName, "Demo Lambda");
  assert.equal(records[0]?.config["service"], "lambda");
});

test("listApplicationLoadBalancersAsUnknown keeps untagged ALB resources as UNKNOWN candidates", async () => {
  const fakeElbClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "DescribeLoadBalancersCommand");

      return {
        LoadBalancers: [
          {
            LoadBalancerArn: "arn:aws:elasticloadbalancing:ap-northeast-2:316875069960:loadbalancer/app/demo-alb/abc123",
            LoadBalancerName: "demo-alb",
            Scheme: "internet-facing",
            Type: "application",
            VpcId: "vpc-1234",
            State: { Code: "active" },
            AvailabilityZones: [{ ZoneName: "ap-northeast-2a", SubnetId: "subnet-1234" }],
            SecurityGroups: ["sg-1234"],
            DNSName: "demo-alb.ap-northeast-2.elb.amazonaws.com"
          }
        ]
      };
    }
  };

  const records = await listApplicationLoadBalancersAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeElbClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::ElasticLoadBalancingV2::LoadBalancer");
  assert.equal(records[0]?.providerResourceId, "arn:aws:elasticloadbalancing:ap-northeast-2:316875069960:loadbalancer/app/demo-alb/abc123");
  assert.equal(records[0]?.displayName, "demo-alb");
  assert.equal(records[0]?.config["scheme"], "internet-facing");
  assert.deepEqual(records[0]?.config["providerParameters"], {
    LoadBalancerArn: "arn:aws:elasticloadbalancing:ap-northeast-2:316875069960:loadbalancer/app/demo-alb/abc123",
    LoadBalancerName: "demo-alb",
    Scheme: "internet-facing",
    Type: "application",
    VpcId: "vpc-1234",
    State: { Code: "active" },
    AvailabilityZones: [{ ZoneName: "ap-northeast-2a", SubnetId: "subnet-1234" }],
    SecurityGroups: ["sg-1234"],
    DNSName: "demo-alb.ap-northeast-2.elb.amazonaws.com"
  });
  assert.deepEqual(records[0]?.relationships, [
    { type: "depends_on", targetProviderResourceId: "vpc-1234" },
    { type: "attached_to", targetProviderResourceId: "sg-1234" }
  ]);
});

test("listLambdaFunctionsAsUnknown keeps untagged Lambda functions as UNKNOWN candidates", async () => {
  const fakeLambdaClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "ListFunctionsCommand");

      return {
        Functions: [
          {
            FunctionArn: "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn",
            FunctionName: "demo-fn",
            Runtime: "nodejs22.x",
            Handler: "index.handler",
            MemorySize: 256,
            Timeout: 10,
            LastModified: "2026-07-06T00:00:00.000+0000",
            State: "Active",
            PackageType: "Zip",
            Architectures: ["arm64"],
            VpcConfig: {
              VpcId: "vpc-1234",
              SubnetIds: ["subnet-1234"],
              SecurityGroupIds: ["sg-1234"]
            }
          }
        ]
      };
    }
  };

  const records = await listLambdaFunctionsAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeLambdaClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::Lambda::Function");
  assert.equal(records[0]?.providerResourceId, "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn");
  assert.equal(records[0]?.displayName, "demo-fn");
  assert.equal(records[0]?.config["runtime"], "nodejs22.x");
  assert.deepEqual(records[0]?.config["providerParameters"], {
    FunctionArn: "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn",
    FunctionName: "demo-fn",
    Runtime: "nodejs22.x",
    Handler: "index.handler",
    MemorySize: 256,
    Timeout: 10,
    LastModified: "2026-07-06T00:00:00.000+0000",
    State: "Active",
    PackageType: "Zip",
    Architectures: ["arm64"],
    VpcConfig: {
      VpcId: "vpc-1234",
      SubnetIds: ["subnet-1234"],
      SecurityGroupIds: ["sg-1234"]
    }
  });
  assert.deepEqual(records[0]?.relationships, [
    { type: "depends_on", targetProviderResourceId: "vpc-1234" },
    { type: "attached_to", targetProviderResourceId: "subnet-1234" },
    { type: "attached_to", targetProviderResourceId: "sg-1234" }
  ]);
});

test("listLambdaPermissionsAsUnknown keeps Lambda resource policy statements as UNKNOWN candidates", async () => {
  const fakeLambdaClient = {
    async send(command: { constructor: { name: string }; input?: { FunctionName?: string } }) {
      switch (command.constructor.name) {
        case "ListFunctionsCommand":
          return {
            Functions: [
              {
                FunctionArn: "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn",
                FunctionName: "demo-fn"
              }
            ]
          };
        case "GetPolicyCommand":
          assert.equal(command.input?.FunctionName, "demo-fn");
          return {
            Policy: JSON.stringify({
              Statement: [
                {
                  Sid: "AllowApiGatewayInvoke",
                  Effect: "Allow",
                  Principal: { Service: "apigateway.amazonaws.com" },
                  Action: "lambda:InvokeFunction",
                  Resource: "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn"
                }
              ]
            })
          };
        default:
          throw new Error(`Unexpected command ${command.constructor.name}`);
      }
    }
  };

  const records = await listLambdaPermissionsAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeLambdaClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::Lambda::Permission");
  assert.equal(records[0]?.providerResourceId, "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn:permission:AllowApiGatewayInvoke");
  assert.equal(records[0]?.displayName, "demo-fn permission AllowApiGatewayInvoke");
  assert.deepEqual(records[0]?.relationships, [
    {
      type: "depends_on",
      targetProviderResourceId: "arn:aws:lambda:ap-northeast-2:316875069960:function:demo-fn"
    }
  ]);
});

test("listCloudFrontDistributionsAsUnknown keeps CloudFront distributions as UNKNOWN candidates", async () => {
  const fakeCloudFrontClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "ListDistributionsCommand");

      return {
        DistributionList: {
          Items: [
            {
              Id: "E123456789",
              ARN: "arn:aws:cloudfront::316875069960:distribution/E123456789",
              DomainName: "demo.cloudfront.net",
              Status: "Deployed",
              Enabled: true,
              Comment: "demo distribution"
            }
          ]
        }
      };
    }
  };

  const records = await listCloudFrontDistributionsAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeCloudFrontClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::CloudFront::Distribution");
  assert.equal(records[0]?.providerResourceId, "arn:aws:cloudfront::316875069960:distribution/E123456789");
  assert.equal(records[0]?.displayName, "demo.cloudfront.net");
  assert.equal(records[0]?.config["status"], "Deployed");
  assert.deepEqual(records[0]?.config["providerParameters"], {
    Id: "E123456789",
    ARN: "arn:aws:cloudfront::316875069960:distribution/E123456789",
    DomainName: "demo.cloudfront.net",
    Status: "Deployed",
    Enabled: true,
    Comment: "demo distribution"
  });
});

test("listIamRolesAsUnknown keeps IAM roles as UNKNOWN candidates", async () => {
  const fakeIamClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "ListRolesCommand");

      return {
        Roles: [
          {
            Arn: "arn:aws:iam::316875069960:role/demo-role",
            RoleName: "demo-role",
            RoleId: "AROATEST",
            Path: "/",
            CreateDate: new Date("2026-07-06T00:00:00.000Z")
          }
        ]
      };
    }
  };

  const records = await listIamRolesAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeIamClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::IAM::Role");
  assert.equal(records[0]?.providerResourceId, "arn:aws:iam::316875069960:role/demo-role");
  assert.equal(records[0]?.displayName, "demo-role");
  assert.equal(records[0]?.config["roleId"], "AROATEST");
});

test("listKmsKeysAsUnknown keeps KMS key metadata as UNKNOWN candidates", async () => {
  const fakeKmsClient = {
    async send(command: { constructor: { name: string }; input?: { KeyId?: string } }) {
      switch (command.constructor.name) {
        case "ListKeysCommand":
          return { Keys: [{ KeyId: "key-1234", KeyArn: "arn:aws:kms:ap-northeast-2:316875069960:key/key-1234" }] };
        case "DescribeKeyCommand":
          assert.equal(command.input?.KeyId, "key-1234");
          return {
            KeyMetadata: {
              Arn: "arn:aws:kms:ap-northeast-2:316875069960:key/key-1234",
              KeyId: "key-1234",
              Description: "demo key",
              Enabled: true,
              KeyState: "Enabled",
              KeyUsage: "ENCRYPT_DECRYPT"
            }
          };
        default:
          throw new Error(`Unexpected command ${command.constructor.name}`);
      }
    }
  };

  const records = await listKmsKeysAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeKmsClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::KMS::Key");
  assert.equal(records[0]?.providerResourceId, "arn:aws:kms:ap-northeast-2:316875069960:key/key-1234");
  assert.equal(records[0]?.displayName, "demo key");
  assert.equal(records[0]?.config["keyState"], "Enabled");
});

test("listCloudWatchLogGroupsAsUnknown keeps log groups as UNKNOWN candidates", async () => {
  const fakeLogsClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "DescribeLogGroupsCommand");

      return {
        logGroups: [
          {
            logGroupName: "/aws/lambda/demo-fn",
            arn: "arn:aws:logs:ap-northeast-2:316875069960:log-group:/aws/lambda/demo-fn",
            retentionInDays: 7,
            storedBytes: 1024
          }
        ]
      };
    }
  };

  const records = await listCloudWatchLogGroupsAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeLogsClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::Logs::LogGroup");
  assert.equal(records[0]?.providerResourceId, "arn:aws:logs:ap-northeast-2:316875069960:log-group:/aws/lambda/demo-fn");
  assert.equal(records[0]?.displayName, "/aws/lambda/demo-fn");
  assert.equal(records[0]?.config["retentionInDays"], 7);
});

test("listApiGatewayRestApisAsUnknown keeps REST APIs as UNKNOWN candidates", async () => {
  const fakeApiGatewayClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "GetRestApisCommand");

      return {
        items: [
          {
            id: "api123",
            name: "demo-api",
            description: "demo REST API",
            createdDate: new Date("2026-07-06T00:00:00.000Z"),
            endpointConfiguration: { types: ["REGIONAL"] }
          }
        ]
      };
    }
  };

  const records = await listApiGatewayRestApisAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeApiGatewayClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::ApiGateway::RestApi");
  assert.equal(records[0]?.providerResourceId, "api123");
  assert.equal(records[0]?.displayName, "demo-api");
  assert.equal(records[0]?.config["description"], "demo REST API");
});

test("listAmiImagesAsUnknown keeps owned AMIs as UNKNOWN candidates", async () => {
  const fakeEc2Client = {
    async send(command: { constructor: { name: string }; input?: { Owners?: string[] } }) {
      assert.equal(command.constructor.name, "DescribeImagesCommand");
      assert.deepEqual(command.input?.Owners, ["self"]);

      return {
        Images: [
          {
            ImageId: "ami-1234",
            Name: "demo-ami",
            Architecture: "x86_64",
            CreationDate: "2026-07-06T00:00:00.000Z",
            State: "available",
            RootDeviceType: "ebs"
          }
        ]
      };
    }
  };

  const records = await listAmiImagesAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeEc2Client
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::EC2::Image");
  assert.equal(records[0]?.providerResourceId, "ami-1234");
  assert.equal(records[0]?.displayName, "demo-ami");
  assert.equal(records[0]?.config["state"], "available");
});

test("listIamPoliciesAsUnknown keeps IAM policies as UNKNOWN candidates", async () => {
  const fakeIamClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "ListPoliciesCommand");

      return {
        Policies: [
          {
            Arn: "arn:aws:iam::316875069960:policy/demo-policy",
            PolicyName: "demo-policy",
            PolicyId: "ANPATEST",
            Path: "/",
            AttachmentCount: 1
          }
        ]
      };
    }
  };

  const records = await listIamPoliciesAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeIamClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::IAM::Policy");
  assert.equal(records[0]?.providerResourceId, "arn:aws:iam::316875069960:policy/demo-policy");
  assert.equal(records[0]?.displayName, "demo-policy");
  assert.equal(records[0]?.config["attachmentCount"], 1);
});

test("listIamInstanceProfilesAsUnknown keeps IAM instance profiles as UNKNOWN candidates", async () => {
  const fakeIamClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "ListInstanceProfilesCommand");

      return {
        InstanceProfiles: [
          {
            Arn: "arn:aws:iam::316875069960:instance-profile/demo-profile",
            InstanceProfileName: "demo-profile",
            InstanceProfileId: "AIPATEST",
            Path: "/",
            Roles: [{ RoleName: "demo-role", Arn: "arn:aws:iam::316875069960:role/demo-role" }]
          }
        ]
      };
    }
  };

  const records = await listIamInstanceProfilesAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeIamClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::IAM::InstanceProfile");
  assert.equal(records[0]?.providerResourceId, "arn:aws:iam::316875069960:instance-profile/demo-profile");
  assert.equal(records[0]?.displayName, "demo-profile");
  assert.deepEqual(records[0]?.relationships, [
    { type: "depends_on", targetProviderResourceId: "arn:aws:iam::316875069960:role/demo-role" }
  ]);
});

test("listCloudWatchMetricAlarmsAsUnknown keeps metric alarms as UNKNOWN candidates", async () => {
  const fakeCloudWatchClient = {
    async send(command: { constructor: { name: string } }) {
      assert.equal(command.constructor.name, "DescribeAlarmsCommand");

      return {
        MetricAlarms: [
          {
            AlarmArn: "arn:aws:cloudwatch:ap-northeast-2:316875069960:alarm:demo-alarm",
            AlarmName: "demo-alarm",
            StateValue: "OK",
            MetricName: "CPUUtilization",
            Namespace: "AWS/EC2",
            EvaluationPeriods: 1
          }
        ]
      };
    }
  };

  const records = await listCloudWatchMetricAlarmsAsUnknown(
    "ap-northeast-2",
    TEST_AWS_CREDENTIALS,
    () => fakeCloudWatchClient
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceType, "AWS::CloudWatch::Alarm");
  assert.equal(records[0]?.providerResourceId, "arn:aws:cloudwatch:ap-northeast-2:316875069960:alarm:demo-alarm");
  assert.equal(records[0]?.displayName, "demo-alarm");
  assert.equal(records[0]?.config["stateValue"], "OK");
});

test("extractSetItems returns only direct AWS set items when child item tags are nested", () => {
  const xml = `
    <DescribeSecurityGroupsResponse>
      <securityGroupInfo>
        <item>
          <groupId>sg-1111</groupId>
          <ipPermissions>
            <item>
              <ipProtocol>tcp</ipProtocol>
              <ipRanges>
                <item>
                  <cidrIp>0.0.0.0/0</cidrIp>
                </item>
              </ipRanges>
            </item>
          </ipPermissions>
        </item>
        <item>
          <groupId>sg-2222</groupId>
        </item>
      </securityGroupInfo>
    </DescribeSecurityGroupsResponse>
  `;

  const items = extractSetItems(xml, "securityGroupInfo");

  assert.equal(items.length, 2);
  assert.match(items[0] ?? "", /<groupId>sg-1111<\/groupId>/);
  assert.match(items[0] ?? "", /<\/ipPermissions>/);
  assert.match(items[1] ?? "", /<groupId>sg-2222<\/groupId>/);
});

test("parseInternetGatewaysFromXml maps gateway attachments to discovered resources", () => {
  const xml = `
    <DescribeInternetGatewaysResponse>
      <internetGatewaySet>
        <item>
          <internetGatewayId>igw-1234</internetGatewayId>
          <attachmentSet>
            <item>
              <vpcId>vpc-1234</vpcId>
              <state>available</state>
            </item>
          </attachmentSet>
          <tagSet>
            <item>
              <key>Name</key>
              <value>Main Internet Gateway</value>
            </item>
          </tagSet>
        </item>
      </internetGatewaySet>
    </DescribeInternetGatewaysResponse>
  `;

  const [gateway] = parseInternetGatewaysFromXml(xml, "ap-northeast-2");

  assert.equal(gateway?.providerResourceType, "AWS::EC2::InternetGateway");
  assert.equal(gateway?.providerResourceId, "igw-1234");
  assert.equal(gateway?.displayName, "Main Internet Gateway");
  assert.match(JSON.stringify(gateway?.config["providerParameters"]), /"internetGatewayId":"igw-1234"/);
  assert.deepEqual(gateway?.config["attachments"], [{ vpcId: "vpc-1234", state: "available" }]);
  assert.deepEqual(gateway?.relationships, [
    { type: "attached_to", targetProviderResourceId: "vpc-1234" }
  ]);
});

test("parseRouteTablesFromXml maps VPC and gateway routes to discovered resources", () => {
  const xml = `
    <DescribeRouteTablesResponse>
      <routeTableSet>
        <item>
          <routeTableId>rtb-1234</routeTableId>
          <vpcId>vpc-1234</vpcId>
          <routeSet>
            <item>
              <destinationCidrBlock>0.0.0.0/0</destinationCidrBlock>
              <gatewayId>igw-1234</gatewayId>
              <state>active</state>
            </item>
          </routeSet>
          <associationSet>
            <item>
              <routeTableAssociationId>rtbassoc-1234</routeTableAssociationId>
              <subnetId>subnet-1234</subnetId>
              <main>false</main>
            </item>
          </associationSet>
          <tagSet>
            <item>
              <key>Name</key>
              <value>Public Route Table</value>
            </item>
          </tagSet>
        </item>
      </routeTableSet>
    </DescribeRouteTablesResponse>
  `;

  const [routeTable] = parseRouteTablesFromXml(xml, "ap-northeast-2");

  assert.equal(routeTable?.providerResourceType, "AWS::EC2::RouteTable");
  assert.equal(routeTable?.providerResourceId, "rtb-1234");
  assert.equal(routeTable?.displayName, "Public Route Table");
  assert.match(JSON.stringify(routeTable?.config["providerParameters"]), /"routeTableId":"rtb-1234"/);
  assert.deepEqual(routeTable?.config["routes"], [
    { destinationCidrBlock: "0.0.0.0/0", gatewayId: "igw-1234", state: "active" }
  ]);
  assert.deepEqual(routeTable?.config["associations"], [
    { routeTableAssociationId: "rtbassoc-1234", subnetId: "subnet-1234", main: false }
  ]);
  assert.deepEqual(routeTable?.relationships, [
    { type: "contains", targetProviderResourceId: "vpc-1234" },
    { type: "depends_on", targetProviderResourceId: "igw-1234" }
  ]);
});

test("parseSecurityGroupsFromXml keeps open ingress rules for risk findings", () => {
  const xml = `
    <DescribeSecurityGroupsResponse>
      <securityGroupInfo>
        <item>
          <groupId>sg-open</groupId>
          <groupName>open-ssh</groupName>
          <vpcId>vpc-1234</vpcId>
          <ownerId>316875069960</ownerId>
          <groupDescription>SSH access</groupDescription>
          <ipPermissions>
            <item>
              <ipProtocol>tcp</ipProtocol>
              <fromPort>22</fromPort>
              <toPort>22</toPort>
              <ipRanges>
                <item>
                  <cidrIp>0.0.0.0/0</cidrIp>
                </item>
              </ipRanges>
            </item>
          </ipPermissions>
        </item>
      </securityGroupInfo>
    </DescribeSecurityGroupsResponse>
  `;

  const [securityGroup] = parseSecurityGroupsFromXml(xml, "ap-northeast-2");

  assert.equal(securityGroup?.config["groupName"], "open-ssh");
  assert.equal(securityGroup?.config["ownerId"], "316875069960");
  assert.match(JSON.stringify(securityGroup?.config["providerParameters"]), /"groupId":"sg-open"/);
  assert.deepEqual(securityGroup?.config["ingress"], [
    { ipProtocol: "tcp", fromPort: 22, toPort: 22, port: 22, cidr: "0.0.0.0/0" }
  ]);
});

test("parseInstancesFromXml keeps instances from every reservation block", () => {
  const xml = `
    <DescribeInstancesResponse>
      <reservationSet>
        <item>
          <instancesSet>
            <item>
              <instanceId>i-first</instanceId>
              <instanceType>t3.micro</instanceType>
              <imageId>ami-first</imageId>
              <privateIpAddress>10.0.1.10</privateIpAddress>
              <ipAddress>3.34.10.20</ipAddress>
              <keyName>demo-key</keyName>
              <architecture>x86_64</architecture>
              <rootDeviceType>ebs</rootDeviceType>
              <state>
                <name>running</name>
              </state>
              <subnetId>subnet-first</subnetId>
              <groupSet>
                <item>
                  <groupId>sg-first</groupId>
                </item>
              </groupSet>
              <tagSet>
                <item>
                  <key>Name</key>
                  <value>First Backend</value>
                </item>
              </tagSet>
            </item>
          </instancesSet>
        </item>
        <item>
          <instancesSet>
            <item>
              <instanceId>i-second</instanceId>
              <instanceType>t3.small</instanceType>
              <imageId>ami-second</imageId>
              <subnetId>subnet-second</subnetId>
              <groupSet>
                <item>
                  <groupId>sg-second</groupId>
                </item>
              </groupSet>
            </item>
          </instancesSet>
        </item>
      </reservationSet>
    </DescribeInstancesResponse>
  `;

  const instances = parseInstancesFromXml(xml, "ap-northeast-2");

  assert.deepEqual(
    instances.map((instance) => instance.providerResourceId),
    ["i-first", "i-second"]
  );
  assert.equal(instances[0]?.displayName, "First Backend");
  assert.equal(instances[0]?.config["privateIpAddress"], "10.0.1.10");
  assert.equal(instances[0]?.config["publicIpAddress"], "3.34.10.20");
  assert.equal(instances[0]?.config["state"], "running");
  assert.equal(instances[0]?.config["keyName"], "demo-key");
  assert.match(JSON.stringify(instances[0]?.config["providerParameters"]), /"instanceId":"i-first"/);
  assert.deepEqual(instances[1]?.relationships, [
    { type: "contains", targetProviderResourceId: "subnet-second" },
    { type: "attached_to", targetProviderResourceId: "sg-second" }
  ]);
});

test("parseRdsInstancesFromXml reads DBInstance entries from AWS RDS responses", () => {
  const xml = `
    <DescribeDBInstancesResponse>
      <DescribeDBInstancesResult>
        <DBInstances>
          <DBInstance>
            <DBInstanceIdentifier>app-db</DBInstanceIdentifier>
            <Engine>postgres</Engine>
            <DBInstanceClass>db.t4g.micro</DBInstanceClass>
            <PubliclyAccessible>true</PubliclyAccessible>
            <AllocatedStorage>20</AllocatedStorage>
            <StorageType>gp3</StorageType>
            <MultiAZ>false</MultiAZ>
            <AvailabilityZone>ap-northeast-2a</AvailabilityZone>
            <Endpoint>
              <Address>app-db.demo.ap-northeast-2.rds.amazonaws.com</Address>
              <Port>5432</Port>
            </Endpoint>
            <VpcSecurityGroups>
              <VpcSecurityGroupMembership>
                <VpcSecurityGroupId>sg-db</VpcSecurityGroupId>
              </VpcSecurityGroupMembership>
            </VpcSecurityGroups>
          </DBInstance>
        </DBInstances>
      </DescribeDBInstancesResult>
    </DescribeDBInstancesResponse>
  `;

  const [database] = parseRdsInstancesFromXml(xml, "ap-northeast-2");

  assert.equal(database?.providerResourceType, "AWS::RDS::DBInstance");
  assert.equal(database?.providerResourceId, "app-db");
  assert.equal(database?.config["engine"], "postgres");
  assert.equal(database?.config["publiclyAccessible"], true);
  assert.equal(database?.config["allocatedStorage"], 20);
  assert.equal(database?.config["storageType"], "gp3");
  assert.equal(database?.config["multiAz"], false);
  assert.equal(database?.config["endpointAddress"], "app-db.demo.ap-northeast-2.rds.amazonaws.com");
  assert.equal(database?.config["endpointPort"], 5432);
  assert.match(JSON.stringify(database?.config["providerParameters"]), /"DBInstanceIdentifier":"app-db"/);
  assert.deepEqual(database?.relationships, [
    { type: "attached_to", targetProviderResourceId: "sg-db" }
  ]);
});

test("maskReverseEngineeringSensitiveText hides account ids inside AWS error text", () => {
  const message =
    "User: arn:aws:sts::316875069960:assumed-role/SketchCatchTerraformExecutionRole/session is not authorized for account 316875069960";

  const maskedMessage = maskGatewaySensitiveText(message);

  assert.equal(
    maskedMessage,
    "User: arn:aws:sts::3168********:assumed-role/SketchCatchTerraformExecutionRole/session is not authorized for account 3168********"
  );
});
