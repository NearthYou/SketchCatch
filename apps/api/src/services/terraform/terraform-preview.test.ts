import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { TerraformDiagramValidationError } from "./diagram-to-terraform.js";
import {
  getTerraformNestedBlockAttributes,
  isTerraformNestedBlockAttribute
} from "./terraform-nested-blocks.js";
import { generateTerraformFromDiagramJson } from "./terraform-preview.js";

test("generates Terraform code from resource nodes", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main_vpc",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16",
            enableDnsSupport: true,
            enableDnsHostnames: true,
            tags: {
              Name: "main-vpc"
            }
          }
        }
      }),
      makeNode({
        id: "node-2",
        type: "aws_subnet",
        kind: "resource",
        label: "public_subnet",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            vpcId: "aws_vpc.main.id",
            cidrBlock: "10.0.1.0/24",
            availabilityZone: "ap-northeast-2a",
            mapPublicIpOnLaunch: true,
            tags: {
              Name: "public-subnet",
              "kubernetes.io/cluster/main": "owned"
            }
          }
        }
      })
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-2"
      }
    ],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
    "kubernetes.io/cluster/main" = "owned"
  }
}`
  );
});

test("generates stable Terraform code repeatedly from the same DiagramJson", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {
            cidrBlock: "10.0.0.0/16",
            tags: {
              Name: "main"
            }
          }
        }
      }),
      makeNode({
        id: "node-2",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "compute",
          values: {
            ami: "ami-1234567890abcdef0",
            instanceType: "t3.micro"
          }
        }
      }),
      makeNode({
        id: "node-3",
        type: "aws_s3_bucket",
        kind: "resource",
        label: "logs",
        parameters: {
          resourceType: "aws_s3_bucket",
          resourceName: "logs",
          fileName: "storage",
          values: {
            tags: {
              Name: "logs"
            }
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 240,
      y: -80,
      zoom: 0.75
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    generateTerraformFromDiagramJson(diagramJson)
  );
});

test("inherits AZ area values into Subnet and EBS Preview without rendering Region or AZ blocks", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "region-1",
        type: "aws_region",
        kind: "resource",
        label: "Region",
        parameters: {
          resourceType: "aws_region",
          resourceName: "ap_northeast_2",
          fileName: "main",
          values: {
            awsRegion: "ap-northeast-2"
          }
        }
      }),
      makeNode({
        id: "az-1",
        type: "aws_availability_zone",
        kind: "resource",
        label: "AZ",
        metadata: {
          parentAreaNodeId: "region-1"
        },
        parameters: {
          resourceType: "aws_availability_zone",
          resourceName: "ap_northeast_2a",
          fileName: "main",
          values: {
            awsAvailabilityZone: "ap-northeast-2a"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            cidrBlock: "10.0.1.0/24"
          }
        }
      }),
      makeNode({
        id: "ebs-1",
        type: "aws_ebs_volume",
        kind: "resource",
        label: "data",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_ebs_volume",
          resourceName: "data",
          fileName: "main",
          values: {
            size: 20
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(
    terraformCode,
    /resource "aws_subnet" "public" \{[\s\S]*availability_zone = "ap-northeast-2a"/
  );
  assert.match(
    terraformCode,
    /resource "aws_ebs_volume" "data" \{[\s\S]*availability_zone = "ap-northeast-2a"/
  );
  assert.doesNotMatch(terraformCode, /provider "aws"/);
  assert.doesNotMatch(terraformCode, /resource "aws_region"/);
  assert.doesNotMatch(terraformCode, /resource "aws_availability_zone"/);
});

test("keeps explicit child availabilityZone before inherited parent AZ value", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "az-1",
        type: "aws_availability_zone",
        kind: "resource",
        label: "AZ",
        parameters: {
          resourceType: "aws_availability_zone",
          resourceName: "ap_northeast_2a",
          fileName: "main",
          values: {
            awsAvailabilityZone: "ap-northeast-2a"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            cidrBlock: "10.0.1.0/24",
            availabilityZone: "ap-northeast-2c"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /availability_zone = "ap-northeast-2c"/);
  assert.doesNotMatch(terraformCode, /availability_zone = "ap-northeast-2a"/);
});

test("renders invalid resource nodes so Terraform Preview does not disappear after parameter edits", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "design-1",
        type: "memo",
        kind: "design",
        label: "memo"
      }),
      makeNode({
        id: "missing-parameters",
        type: "aws_vpc",
        kind: "resource",
        label: "missing"
      }),
      makeNode({
        id: "invalid-resource",
        type: "aws_vpc",
        kind: "resource",
        label: "invalid",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "invalid",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16"
          },
          invalid: true
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_vpc" "invalid" {
  cidr_block = "10.0.0.0/16"
}`
  );
});

test("defaults missing terraformBlockType to resource", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_s3_bucket",
        kind: "resource",
        label: "logs",
        parameters: {
          resourceType: "aws_s3_bucket",
          resourceName: "logs",
          fileName: "main",
          values: {
            bucket: "sketchcatch-logs"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_s3_bucket" "logs" {
  bucket = "sketchcatch-logs"
}`
  );
});

test("omits unset ASG desired capacity from Terraform while rendering an explicit zero", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "asg-missing",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "missing",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "missing",
          fileName: "compute",
          values: {
            minSize: 1,
            maxSize: 3
          }
        }
      }),
      makeNode({
        id: "asg-null",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "null",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "null",
          fileName: "compute",
          values: {
            minSize: 1,
            desiredCapacity: null,
            maxSize: 3
          }
        }
      }),
      makeNode({
        id: "asg-empty",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "empty",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "empty",
          fileName: "compute",
          values: {
            minSize: 1,
            desiredCapacity: "",
            maxSize: 3
          }
        }
      }),
      makeNode({
        id: "asg-zero",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "zero",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "zero",
          fileName: "compute",
          values: {
            minSize: 0,
            desiredCapacity: 0,
            maxSize: 3
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(
    terraformCode,
    /resource "aws_autoscaling_group" "missing" \{\n {2}min_size = 1\n {2}max_size = 3\n\}/
  );
  assert.match(
    terraformCode,
    /resource "aws_autoscaling_group" "null" \{\n {2}min_size = 1\n {2}max_size = 3\n\}/
  );
  assert.match(
    terraformCode,
    /resource "aws_autoscaling_group" "empty" \{\n {2}min_size = 1\n {2}max_size = 3\n\}/
  );
  assert.match(
    terraformCode,
    /resource "aws_autoscaling_group" "zero" \{\n {2}min_size = 0\n {2}desired_capacity = 0\n {2}max_size = 3\n\}/
  );
});

test("rejects unsafe Terraform block labels before rendering HCL", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          resourceType: "aws_instance",
          resourceName: `web" {\n}\nresource "aws_s3_bucket" "owned`,
          fileName: "main",
          values: {
            ami: "ami-1234567890abcdef0"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  let error: (TerraformDiagramValidationError & { errorCode?: unknown; statusCode?: unknown }) | null = null;

  try {
    generateTerraformFromDiagramJson(diagramJson);
  } catch (caughtError) {
    if (caughtError instanceof TerraformDiagramValidationError) {
      error = caughtError;
    }
  }

  assert.ok(error);
  assert.match(error.message, /Invalid Terraform resource name/);
  assert.equal(error.errorCode, undefined);
  assert.equal(error.statusCode, undefined);
});

test("rejects unsafe Terraform attribute keys before rendering HCL", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "main",
          values: {
            [`ami"\nresource "aws_s3_bucket" "owned"`]: "ami-1234567890abcdef0"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.throws(
    () => generateTerraformFromDiagramJson(diagramJson),
    /Invalid Terraform attribute name/
  );
});

test("renders data blocks", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "data-1",
        type: "aws_ami",
        kind: "resource",
        label: "ubuntu",
        parameters: {
          terraformBlockType: "data",
          resourceType: "aws_ami",
          resourceName: "ubuntu",
          fileName: "main",
          values: {
            mostRecent: true,
            owners: ["099720109477"],
            filter: [
              {
                name: "name",
                values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
              }
            ]
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
`data "aws_ami" "ubuntu" {
  most_recent = true
  owners = [
    "099720109477",
  ]
  filter {
    name = "name"
    values = [
      "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*",
    ]
  }
}`
  );
});

test("renders arrays, numbers, booleans, null, and references", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "sg-rule-1",
        type: "aws_security_group_rule",
        kind: "resource",
        label: "ssh",
        parameters: {
          resourceType: "aws_security_group_rule",
          resourceName: "ssh",
          fileName: "main",
          values: {
            vpcId: "var.vpc_id",
            subnetId: "module.vpc.subnet_id",
            amiId: "data.aws_ami.ubuntu.id",
            securityGroupId: "aws_security_group.web.id",
            endpoint: "api.example.com",
            type: "ingress",
            fromPort: 22,
            toPort: 22,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
            description: null,
            self: false
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_security_group_rule" "ssh" {
  vpc_id = var.vpc_id
  subnet_id = module.vpc.subnet_id
  ami_id = data.aws_ami.ubuntu.id
  security_group_id = aws_security_group.web.id
  endpoint = "api.example.com"
  type = "ingress"
  from_port = 22
  to_port = 22
  protocol = "tcp"
  cidr_blocks = [
    "0.0.0.0/0",
  ]
  description = null
  self = false
}`
  );
});

test("renders placement references with Terraform snake_case attribute names", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {
            cidrBlock: "172.16.0.0/16"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id",
            cidrBlock: "172.16.1.0/24"
          }
        }
      }),
      makeNode({
        id: "instance-1",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "compute",
          values: {
            ami: "ami-1234567890abcdef0",
            instanceType: "t3.micro",
            subnetId: "aws_subnet.public.id"
          }
        }
      }),
      makeNode({
        id: "igw-1",
        type: "aws_internet_gateway",
        kind: "resource",
        label: "main_igw",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_internet_gateway",
          resourceName: "main",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      }),
      makeNode({
        id: "route-table-1",
        type: "aws_route_table",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_route_table",
          resourceName: "public",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      }),
      makeNode({
        id: "security-group-1",
        type: "aws_security_group",
        kind: "resource",
        label: "web",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_security_group",
          resourceName: "web",
          fileName: "security",
          values: {
            name: "web",
            vpcId: "aws_vpc.main.id"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /resource "aws_subnet" "public" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.match(terraformCode, /resource "aws_instance" "web" \{[\s\S]*subnet_id = aws_subnet\.public\.id/);
  assert.match(terraformCode, /resource "aws_internet_gateway" "main" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.match(terraformCode, /resource "aws_route_table" "public" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.match(terraformCode, /resource "aws_security_group" "web" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.doesNotMatch(terraformCode, /vpcId|subnetId/);
});

test("omits AI semantic metadata that is not accepted by the Terraform provider", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "bucket-1",
        type: "aws_s3_bucket",
        kind: "resource",
        label: "assets",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "assets",
          fileName: "storage",
          values: {
            bucketPurpose: "static_website_origin",
            forceDestroy: true,
            publicAccessBlock: true,
            servicePurpose: "content_board",
            tags: {
              Name: "assets"
            }
          }
        }
      }),
      makeNode({
        id: "cdn-1",
        type: "aws_cloudfront_distribution",
        kind: "resource",
        label: "cdn",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_cloudfront_distribution",
          resourceName: "public_entry",
          fileName: "edge",
          values: {
            enabled: true,
            originResourceId: "bucket-1",
            priceClass: "PriceClass_100"
          }
        }
      }),
      makeNode({
        id: "instance-1",
        type: "aws_instance",
        kind: "resource",
        label: "app",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: "app",
          fileName: "compute",
          values: {
            ami: "ami-1234567890abcdef0",
            applicationPurpose: "content_board",
            instanceType: "t3.micro",
            servicePurpose: "content_board",
            terraformResourceName: "app_server",
            terraformResourceType: "aws_instance"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /force_destroy = true/);
  assert.match(terraformCode, /enabled = true/);
  assert.match(terraformCode, /price_class = "PriceClass_100"/);
  assert.match(terraformCode, /instance_type = "t3.micro"/);
  assert.doesNotMatch(terraformCode, /resource "aws_s3_bucket_public_access_block"/);
  assert.doesNotMatch(
    terraformCode,
    /bucket_purpose|public_access_block\s*=|service_purpose|origin_resource_id|application_purpose|terraform_resource_name|terraform_resource_type/
  );
});

test("renders AWS nested block lists as Terraform blocks with snake_case attributes", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "route-table-1",
        type: "aws_route_table",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_route_table",
          resourceName: "public",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id",
            route: [
              {
                cidrBlock: "0.0.0.0/0",
                gatewayId: "aws_internet_gateway.igw.id"
              }
            ]
          }
        }
      }),
      makeNode({
        id: "security-group-1",
        type: "aws_security_group",
        kind: "resource",
        label: "web",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_security_group",
          resourceName: "web",
          fileName: "security",
          values: {
            name: "web",
            vpcId: "aws_vpc.main.id",
            egress: [
              {
                toPort: 0,
                fromPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"]
              }
            ],
            ingress: [
              {
                toPort: 80,
                fromPort: 80,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"]
              }
            ]
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(
    terraformCode,
    /resource "aws_route_table" "public" \{[\s\S]*route \{[\s\S]*cidr_block = "0\.0\.0\.0\/0"[\s\S]*gateway_id = aws_internet_gateway\.igw\.id[\s\S]*\}/
  );
  assert.match(
    terraformCode,
    /resource "aws_security_group" "web" \{[\s\S]*egress \{[\s\S]*to_port = 0[\s\S]*from_port = 0[\s\S]*protocol = "-1"[\s\S]*cidr_blocks = \[[\s\S]*"0\.0\.0\.0\/0",[\s\S]*\][\s\S]*\}/
  );
  assert.match(
    terraformCode,
    /resource "aws_security_group" "web" \{[\s\S]*ingress \{[\s\S]*to_port = 80[\s\S]*from_port = 80[\s\S]*protocol = "tcp"[\s\S]*cidr_blocks = \[[\s\S]*"0\.0\.0\.0\/0",[\s\S]*\][\s\S]*\}/
  );
  assert.doesNotMatch(terraformCode, /route = \[/);
  assert.doesNotMatch(terraformCode, /ingress = \[/);
  assert.doesNotMatch(terraformCode, /egress = \[/);
  assert.doesNotMatch(terraformCode, /cidrBlock|gatewayId|cidrBlocks|fromPort|toPort/);
});

test("renders Kubernetes workload nested blocks and provider references", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "namespace-1",
        type: "kubernetes_namespace",
        kind: "resource",
        label: "sketchcatch",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "kubernetes_namespace",
          resourceName: "sketchcatch",
          fileName: "workload",
          values: { metadata: { name: "sketchcatch" } }
        }
      }),
      makeNode({
        id: "deployment-1",
        type: "kubernetes_deployment",
        kind: "resource",
        label: "web",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "kubernetes_deployment",
          resourceName: "web",
          fileName: "workload",
          values: {
            metadata: { name: "web", namespace: "kubernetes_namespace.sketchcatch.id" },
            spec: {
              replicas: 1,
              selector: { matchLabels: { app: "web" } },
              template: {
                metadata: { labels: { app: "web" } },
                spec: {
                  container: [{ name: "web", image: "nginx:stable", port: [{ containerPort: 80 }] }]
                }
              }
            }
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /resource "kubernetes_namespace" "sketchcatch"/);
  assert.match(terraformCode, /resource "kubernetes_deployment" "web"/);
  assert.match(terraformCode, /namespace = kubernetes_namespace\.sketchcatch\.id/);
  assert.match(terraformCode, /selector \{/);
  assert.match(terraformCode, /template \{/);
  assert.match(terraformCode, /container \{/);
  assert.match(terraformCode, /container_port = 80/);
});

test("tracks curated nested block parameters as canonical camelCase keys", () => {
  const expectedNestedBlockAttributes: Record<string, string[]> = {
    aws_ami: ["filter"],
    aws_api_gateway_rest_api: ["endpointConfiguration"],
    aws_autoscaling_group: ["launchTemplate", "tag"],
    aws_db_parameter_group: ["parameter"],
    aws_dynamodb_table: ["attribute"],
    aws_cloudfront_cache_policy: ["parametersInCacheKeyAndForwardedToOrigin"],
    aws_cloudfront_distribution: [
      "defaultCacheBehavior",
      "origin",
      "restrictions",
      "viewerCertificate"
    ],
    aws_cloudfront_origin_request_policy: [
      "cookiesConfig",
      "headersConfig",
      "queryStringsConfig"
    ],
    aws_config_config_rule: ["source"],
    aws_instance: ["rootBlockDevice"],
    aws_eks_cluster: ["vpcConfig"],
    aws_eks_node_group: ["scalingConfig"],
    aws_lambda_function: ["environment"],
    aws_route_table: ["route"],
    aws_s3_bucket_server_side_encryption_configuration: ["rule"],
    aws_s3_bucket_lifecycle_configuration: ["rule"],
    aws_s3_bucket_versioning: ["versioningConfiguration"],
    aws_scheduler_schedule: ["flexibleTimeWindow", "target"],
    aws_security_group: ["egress", "ingress"],
    aws_wafv2_web_acl: ["defaultAction", "visibilityConfig"]
  };

  for (const [resourceType, expectedAttributes] of Object.entries(expectedNestedBlockAttributes)) {
    assert.deepEqual(
      [...(getTerraformNestedBlockAttributes(resourceType) ?? [])].sort(),
      [...expectedAttributes].sort()
    );
  }

  assert.equal(isTerraformNestedBlockAttribute("aws_instance", "rootBlockDevice"), true);
  assert.equal(isTerraformNestedBlockAttribute("aws_instance", "root_block_device"), true);
  assert.equal(isTerraformNestedBlockAttribute("aws_api_gateway_rest_api", "endpoint_configuration"), true);
});

test("renders object-valued nested block parameters as Terraform nested blocks", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "lambda-1",
        type: "aws_lambda_function",
        kind: "resource",
        label: "handler",
        parameters: {
          resourceType: "aws_lambda_function",
          resourceName: "handler",
          fileName: "application",
          values: {
            functionName: "handler",
            role: "aws_iam_role.lambda.arn",
            handler: "index.handler",
            runtime: "nodejs20.x",
            environment: {
              variables: {
                LOG_LEVEL: "info"
              }
            }
          }
        }
      }),
      makeNode({
        id: "rest-api-1",
        type: "aws_api_gateway_rest_api",
        kind: "resource",
        label: "api",
        parameters: {
          resourceType: "aws_api_gateway_rest_api",
          resourceName: "api",
          fileName: "application",
          values: {
            name: "api",
            endpointConfiguration: {
              types: ["REGIONAL"]
            }
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /\benvironment \{/);
  assert.match(terraformCode, /\bendpoint_configuration \{/);
  assert.match(terraformCode, /variables = \{[\s\S]*LOG_LEVEL = "info"[\s\S]*\}/);
  assert.match(terraformCode, /types = \[[\s\S]*"REGIONAL",[\s\S]*\]/);
  assert.doesNotMatch(terraformCode, /environment =/);
  assert.doesNotMatch(terraformCode, /endpoint_configuration =/);
});

test("normalizes compact security group ingress rules before rendering Terraform blocks", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "security-group-1",
        type: "aws_security_group",
        kind: "resource",
        label: "web",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_security_group",
          resourceName: "web",
          fileName: "security",
          values: {
            name: "web",
            vpcId: "aws_vpc.main.id",
            ingress: [
              {
                cidr: "0.0.0.0/0",
                port: 80
              }
            ]
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(
    terraformCode,
    /ingress \{[\s\S]*from_port = 80[\s\S]*to_port = 80[\s\S]*protocol = "tcp"[\s\S]*cidr_blocks = \[[\s\S]*"0\.0\.0\.0\/0",[\s\S]*\]/
  );
  assert.doesNotMatch(terraformCode, /\bcidr =|\bport =/);
});

test("renders route table association references with Terraform snake_case attribute names", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "route-table-association-1",
        type: "aws_route_table_association",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_route_table_association",
          resourceName: "public",
          fileName: "network",
          values: {
            subnetId: "aws_subnet.public.id",
            routeTableId: "aws_route_table.public.id"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /resource "aws_route_table_association" "public" \{/);
  assert.match(terraformCode, /subnet_id = aws_subnet\.public\.id/);
  assert.match(terraformCode, /route_table_id = aws_route_table\.public\.id/);
  assert.doesNotMatch(terraformCode, /subnetId|routeTableId/);
});

function makeNode(
  node: Omit<DiagramNode, "position" | "size" | "locked" | "zIndex"> &
    Partial<Pick<DiagramNode, "position" | "size" | "locked" | "zIndex">>
): DiagramNode {
  return {
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 160,
      height: 96
    },
    locked: false,
    zIndex: 0,
    ...node
  };
}
