import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord,
  type AwsProviderScanGateway
} from "./aws-provider-adapter.js";

test("AWS Provider Adapter turns discovered AWS resources into ArchitectureJson nodes and edges", async () => {
  const adapter = createAwsProviderAdapter(createFakeGateway());
  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC", "SUBNET", "EC2", "RDS", "S3", "SECURITY_GROUP"]
  });

  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.type),
    ["VPC", "SUBNET", "SECURITY_GROUP", "EC2", "RDS", "S3"]
  );
  assert(result.architectureJson.edges.some((edge) => edge.label === "contains"));
  assert(result.architectureJson.edges.some((edge) => edge.label === "attached_to"));
  assert.equal(result.discoveredResources[0]?.providerResourceId, "vpc-1234");
  assert.equal(result.reverseEngineeringDraft.scanId, result.scan.id);
  assert.deepEqual(result.reverseEngineeringDraft.architectureJson, result.architectureJson);
  assert.equal(result.importSuggestions[0]?.status, "ready");
  assert.equal(result.importSuggestions[0]?.terraformAddress, "aws_vpc.vpc_1234");
  assert.equal(result.importSuggestions[0]?.importCommand, "terraform import aws_vpc.vpc_1234 vpc-1234");
});

test("AWS Provider Adapter keeps unsupported resources in scan results but separates them from board nodes", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return [
        {
          providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
          providerResourceId: "arn:aws:elasticloadbalancing:ap-northeast-2:1234:loadbalancer/app/demo",
          displayName: "demo-alb",
          region: "ap-northeast-2",
          config: {},
          relationships: []
        }
      ];
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["UNKNOWN"]
  });

  assert.equal(result.architectureJson.nodes.length, 0);
  assert.equal(result.discoveredResources[0]?.resourceType, "UNKNOWN");
  assert.equal(result.discoveredResources[0]?.analysisExcluded, true);
  assert.equal(result.analysisExclusions[0]?.reason, "unsupported_resource_type");
  assert.equal(result.importSuggestions[0]?.status, "unsupported_resource_type");
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
});

test("AWS Provider Adapter lays out supported resources as an architecture map", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return [
        createRecord({
          providerResourceType: "AWS::EC2::VPC",
          providerResourceId: "vpc-1234",
          displayName: "Main VPC",
          config: { cidrBlock: "10.0.0.0/16" }
        }),
        createRecord({
          providerResourceType: "AWS::EC2::Subnet",
          providerResourceId: "subnet-public-a",
          displayName: "subnet-public-a",
          config: {
            availabilityZone: "ap-northeast-2a",
            cidrBlock: "10.0.1.0/24",
            mapPublicIpOnLaunch: true,
            vpcId: "vpc-1234"
          },
          relationships: [{ type: "contains", targetProviderResourceId: "vpc-1234" }]
        }),
        createRecord({
          providerResourceType: "AWS::EC2::SecurityGroup",
          providerResourceId: "sg-web",
          displayName: "web-sg",
          config: { vpcId: "vpc-1234" },
          relationships: [{ type: "depends_on", targetProviderResourceId: "vpc-1234" }]
        }),
        createRecord({
          providerResourceType: "AWS::EC2::Instance",
          providerResourceId: "i-web",
          displayName: "web",
          config: {
            securityGroupIds: ["sg-web"],
            subnetId: "subnet-public-a",
            vpcId: "vpc-1234"
          },
          relationships: [
            { type: "contains", targetProviderResourceId: "subnet-public-a" },
            { type: "attached_to", targetProviderResourceId: "sg-web" }
          ]
        }),
        createRecord({
          providerResourceType: "AWS::S3::Bucket",
          providerResourceId: "demo-bucket",
          displayName: "demo-bucket"
        })
      ];
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"]
  });
  const nodeById = new Map(result.architectureJson.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get("resource-subnet-public-a")?.label, "Public Subnet · ap-northeast-2a · 10.0.1.0/24");
  assert(nodeById.get("resource-vpc-1234")!.positionX < nodeById.get("resource-subnet-public-a")!.positionX);
  assert(nodeById.get("resource-subnet-public-a")!.positionY < nodeById.get("resource-i-web")!.positionY);
  assert(nodeById.get("resource-demo-bucket")!.positionX > nodeById.get("resource-vpc-1234")!.positionX);
});

test("AWS Provider Adapter keeps multi-subnet resources in their first matched subnet slot", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return [
        createRecord({
          providerResourceType: "AWS::EC2::VPC",
          providerResourceId: "vpc-1234",
          displayName: "Main VPC"
        }),
        createRecord({
          providerResourceType: "AWS::EC2::Subnet",
          providerResourceId: "subnet-a",
          displayName: "subnet-a",
          relationships: [{ type: "contains", targetProviderResourceId: "vpc-1234" }]
        }),
        createRecord({
          providerResourceType: "AWS::EC2::Subnet",
          providerResourceId: "subnet-b",
          displayName: "subnet-b",
          relationships: [{ type: "contains", targetProviderResourceId: "vpc-1234" }]
        }),
        createRecord({
          providerResourceType: "AWS::EC2::SecurityGroup",
          providerResourceId: "sg-db",
          displayName: "db-sg",
          config: { vpcId: "vpc-1234" }
        }),
        createRecord({
          providerResourceType: "AWS::RDS::DBInstance",
          providerResourceId: "app-db",
          displayName: "app-db",
          config: {
            securityGroupIds: ["sg-db"],
            subnetIds: ["subnet-a", "subnet-b"]
          }
        })
      ];
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"]
  });
  const nodeById = new Map(result.architectureJson.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get("resource-app-db")?.positionX, 360);
  assert.equal(nodeById.get("resource-app-db")?.positionY, 620);
  assert.equal(nodeById.get("resource-sg-db")?.positionX, 280);
  assert.equal(nodeById.get("resource-sg-db")?.positionY, 525);
});

test("AWS Provider Adapter reads nested config references when grouping VPC children", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return [
        createRecord({
          providerResourceType: "AWS::EC2::VPC",
          providerResourceId: "vpc-1234",
          displayName: "Main VPC"
        }),
        createRecord({
          providerResourceType: "AWS::EC2::RouteTable",
          providerResourceId: "rtb-nested",
          displayName: "Nested Route Table",
          config: {
            routeTable: {
              vpcId: "vpc-1234"
            }
          }
        })
      ];
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"]
  });
  const nodeById = new Map(result.architectureJson.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get("resource-rtb-nested")?.positionX, 250);
  assert.equal(nodeById.get("resource-rtb-nested")?.positionY, 240);
});

test("AWS Provider Adapter maps routing resources and prepares safe import suggestions", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return [
        createRecord({
          providerResourceType: "AWS::EC2::InternetGateway",
          providerResourceId: "igw-1234",
          displayName: "Main Internet Gateway",
          relationships: [{ type: "attached_to", targetProviderResourceId: "vpc-1234" }]
        }),
        createRecord({
          providerResourceType: "AWS::EC2::RouteTable",
          providerResourceId: "rtb-1234",
          displayName: "Public Route Table",
          relationships: [{ type: "contains", targetProviderResourceId: "vpc-1234" }]
        })
      ];
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["INTERNET_GATEWAY", "ROUTE_TABLE"]
  });

  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.type),
    ["INTERNET_GATEWAY", "ROUTE_TABLE"]
  );
  assert.deepEqual(
    result.importSuggestions.map((suggestion) => suggestion.terraformAddress),
    ["aws_internet_gateway.igw_1234", "aws_route_table.rtb_1234"]
  );
});

test("AWS Provider Adapter prefixes Terraform names that start with a digit", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return [
        createRecord({
          providerResourceType: "AWS::S3::Bucket",
          providerResourceId: "123-demo-bucket",
          displayName: "123-demo-bucket"
        })
      ];
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["S3"]
  });

  assert.equal(result.importSuggestions[0]?.terraformAddress, "aws_s3_bucket.res_123_demo_bucket");
  assert.equal(result.importSuggestions[0]?.terraformBlockDraft, 'resource "aws_s3_bucket" "res_123_demo_bucket" {}');
});

test("AWS Provider Adapter keeps partial read errors without dropping successful resources", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return {
        records: [
          createRecord({
            providerResourceType: "AWS::EC2::VPC",
            providerResourceId: "vpc-1234",
            displayName: "Main VPC"
          })
        ],
        scanErrors: [
          {
            id: "scan-error-rds",
            resourceType: "RDS",
            stage: "provider_api",
            reason: "permission_denied",
            message: "RDS 읽기 권한이 없습니다.",
            retryable: false
          }
        ]
      };
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC", "RDS"]
  });

  assert.equal(result.discoveredResources.length, 1);
  assert.equal(result.scanErrors[0]?.resourceType, "RDS");
  assert.equal(result.scanErrors[0]?.reason, "permission_denied");
});

test("AWS Provider Adapter creates visible risk findings without blocking import suggestions", async () => {
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return [
        createRecord({
          providerResourceType: "AWS::EC2::SecurityGroup",
          providerResourceId: "sg-open",
          displayName: "Open SSH Security Group",
          config: {
            ingress: [{ port: 22, cidr: "0.0.0.0/0" }]
          }
        }),
        createRecord({
          providerResourceType: "AWS::RDS::DBInstance",
          providerResourceId: "db-public",
          displayName: "Public DB",
          config: {
            publiclyAccessible: true
          }
        })
      ];
    }
  });

  const result = await adapter.scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["SECURITY_GROUP", "RDS"]
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.severity),
    ["high", "high", "medium"]
  );
  assert.equal(result.importSuggestions.every((suggestion) => suggestion.handoffReady), true);
});

function createFakeGateway(): AwsProviderScanGateway {
  return {
    async discoverResources() {
      return [
        createRecord({
          providerResourceType: "AWS::EC2::VPC",
          providerResourceId: "vpc-1234",
          displayName: "Main VPC"
        }),
        createRecord({
          providerResourceType: "AWS::EC2::Subnet",
          providerResourceId: "subnet-1234",
          displayName: "Public Subnet",
          relationships: [{ type: "contains", targetProviderResourceId: "vpc-1234" }]
        }),
        createRecord({
          providerResourceType: "AWS::EC2::SecurityGroup",
          providerResourceId: "sg-1234",
          displayName: "Web Security Group",
          relationships: [{ type: "depends_on", targetProviderResourceId: "vpc-1234" }]
        }),
        createRecord({
          providerResourceType: "AWS::EC2::Instance",
          providerResourceId: "i-1234",
          displayName: "Web EC2",
          relationships: [
            { type: "contains", targetProviderResourceId: "subnet-1234" },
            { type: "attached_to", targetProviderResourceId: "sg-1234" }
          ]
        }),
        createRecord({
          providerResourceType: "AWS::RDS::DBInstance",
          providerResourceId: "db-1234",
          displayName: "App DB",
          relationships: [
            { type: "contains", targetProviderResourceId: "subnet-1234" },
            { type: "attached_to", targetProviderResourceId: "sg-1234" }
          ]
        }),
        createRecord({
          providerResourceType: "AWS::S3::Bucket",
          providerResourceId: "sketchcatch-demo-bucket",
          displayName: "sketchcatch-demo-bucket"
        })
      ];
    }
  };
}

function createRecord(input: {
  providerResourceType: string;
  providerResourceId: string;
  displayName: string;
  config?: AwsDiscoveredResourceRecord["config"];
  relationships?: AwsDiscoveredResourceRecord["relationships"];
}): AwsDiscoveredResourceRecord {
  return {
    providerResourceType: input.providerResourceType,
    providerResourceId: input.providerResourceId,
    displayName: input.displayName,
    region: "ap-northeast-2",
    config: input.config ?? {},
    relationships: input.relationships ?? []
  };
}
