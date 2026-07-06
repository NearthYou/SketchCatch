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
  listApplicationLoadBalancersAsUnknown,
  listBucketsWithDetails,
  listLambdaFunctionsAsUnknown,
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
  assert.deepEqual(records[0]?.relationships, [
    { type: "depends_on", targetProviderResourceId: "vpc-1234" },
    { type: "attached_to", targetProviderResourceId: "subnet-1234" },
    { type: "attached_to", targetProviderResourceId: "sg-1234" }
  ]);
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
