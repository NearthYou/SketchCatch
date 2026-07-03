import type { AiArchitectureDraftResult, ArchitectureJson, ArchitectureScenario } from "@sketchcatch/types";

// 최종 선택된 용도에 맞는 고정 Architecture Draft 템플릿을 고릅니다.
export function createDraftByScenario(scenario: ArchitectureScenario): AiArchitectureDraftResult {
  switch (scenario) {
    case "static_site":
      return createStaticWebsiteDraft();
    case "api_server":
      return createApiServerDraft();
    case "backend_with_db":
      return createDatabaseBackendDraft();
    case "server_storage":
      return createServerStorageDraft();
    case "serverless_function":
      return createServerlessFunctionDraft();
  }
}

// 정적 웹사이트 연습에 필요한 S3와 CloudFront 기본 초안을 만듭니다.
function createStaticWebsiteDraft(): AiArchitectureDraftResult {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "s3-site",
        type: "S3",
        label: "Static Website Bucket",
        positionX: 160,
        positionY: 220,
        config: {
          bucketPurpose: "static_website_origin"
        }
      },
      {
        id: "cloudfront-site",
        type: "CLOUDFRONT",
        label: "CloudFront CDN",
        positionX: 420,
        positionY: 220,
        config: {
          originResourceId: "s3-site"
        }
      }
    ],
    edges: [
      {
        id: "cloudfront-to-s3",
        sourceId: "cloudfront-site",
        targetId: "s3-site",
        label: "origin"
      }
    ]
  };

  return {
    title: "정적 웹사이트 Practice Architecture",
    architectureJson,
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["정적 파일은 S3에 저장하고 CloudFront가 CDN 역할을 한다고 가정합니다."],
      explanations: ["외부 LLM 없이도 고정 템플릿으로 Architecture Board가 열 수 있는 초안을 반환합니다."]
    }
  };
}

// API 서버 연습에 필요한 VPC, Subnet, Security Group, EC2 기본 초안을 만듭니다.
function createApiServerDraft(): AiArchitectureDraftResult {
  return {
    title: "API 서버 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("subnet-public", "Public Subnet", 140, 150),
        createSecurityGroupNode("sg-api", "API Security Group", 170, 390),
        {
          id: "ec2-api",
          type: "EC2",
          label: "API Server",
          positionX: 330,
          positionY: 200,
          config: {
            instanceType: "t3.micro",
            subnetId: "subnet-public",
            securityGroupIds: ["sg-api"]
          }
        }
      ],
      edges: [
        createEdge("vpc-to-subnet-public", "vpc-main", "subnet-public", "contains"),
        createEdge("subnet-public-to-ec2-api", "subnet-public", "ec2-api", "hosts"),
        createEdge("sg-api-to-ec2-api", "sg-api", "ec2-api", "allows traffic")
      ]
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["단일 EC2가 API 요청을 처리하는 연습용 구조로 가정합니다."],
      explanations: ["VPC, Subnet, Security Group, EC2를 포함해 IaC Preview 생성기가 해석하기 쉬운 초안을 반환합니다."]
    }
  };
}

// DB 포함 백엔드 연습에 필요한 App/DB 분리 구조의 기본 초안을 만듭니다.
function createDatabaseBackendDraft(): AiArchitectureDraftResult {
  return {
    title: "DB 포함 백엔드 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("subnet-app", "App Subnet", 140, 150),
        createSubnetNode("subnet-db", "DB Subnet", 140, 430),
        createSecurityGroupNode("sg-app", "App Security Group", 500, 150),
        createSecurityGroupNode("sg-db", "DB Security Group", 500, 430),
        {
          id: "ec2-backend",
          type: "EC2",
          label: "Backend Server",
          positionX: 330,
          positionY: 200,
          config: {
            instanceType: "t3.micro",
            subnetId: "subnet-app",
            securityGroupIds: ["sg-app"]
          }
        },
        {
          id: "rds-primary",
          type: "RDS",
          label: "Backend Database",
          positionX: 330,
          positionY: 480,
          config: {
            engine: "postgres",
            instanceClass: "db.t4g.micro",
            subnetId: "subnet-db",
            securityGroupIds: ["sg-db"]
          }
        }
      ],
      edges: [
        createEdge("vpc-to-subnet-app", "vpc-main", "subnet-app", "contains"),
        createEdge("vpc-to-subnet-db", "vpc-main", "subnet-db", "contains"),
        createEdge("subnet-app-to-ec2-backend", "subnet-app", "ec2-backend", "hosts"),
        createEdge("subnet-db-to-rds-primary", "subnet-db", "rds-primary", "hosts"),
        createEdge("backend-to-database", "ec2-backend", "rds-primary", "reads/writes")
      ]
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["백엔드 서버가 RDS PostgreSQL에 연결하는 연습용 구조로 가정합니다."],
      explanations: ["App Resource와 DB Resource를 분리해 비용과 보안 Check Finding을 붙이기 쉬운 초안을 반환합니다."]
    }
  };
}

// EC2 서버와 S3 버킷을 함께 쓰는 MVP 배포 연습용 초안을 만듭니다.
function createServerStorageDraft(): AiArchitectureDraftResult {
  return {
    title: "서버+스토리지 Practice Architecture",
    architectureJson: {
      nodes: [
        {
          id: "vpc",
          type: "VPC",
          label: "VPC",
          positionX: 100,
          positionY: 300,
          config: {
            cidrBlock: "172.16.0.0/16"
          }
        },
        {
          id: "subnet",
          type: "SUBNET",
          label: "Subnet",
          positionX: 245,
          positionY: 650,
          config: {
            vpcId: "aws_vpc.vpc.id",
            cidrBlock: "172.16.1.0/24"
          }
        },
        {
          id: "internet-gateway",
          type: "INTERNET_GATEWAY",
          label: "Internet Gateway",
          positionX: 590,
          positionY: 365,
          config: {
            vpcId: "aws_vpc.vpc.id"
          }
        },
        {
          id: "route-table",
          type: "ROUTE_TABLE",
          label: "Route Table",
          positionX: 940,
          positionY: 610,
          config: {
            vpcId: "aws_vpc.vpc.id",
            route: [
              {
                cidrBlock: "0.0.0.0/0",
                gatewayId: "aws_internet_gateway.internet_gateway.id"
              }
            ]
          }
        },
        {
          id: "route-table-association",
          type: "ROUTE_TABLE_ASSOCIATION",
          label: "Route Table Association",
          positionX: 700,
          positionY: 620,
          config: {
            subnetId: "aws_subnet.subnet.id",
            routeTableId: "aws_route_table.route_table.id"
          }
        },
        {
          id: "ami",
          type: "AMI",
          label: "Amazon Linux AMI",
          positionX: 120,
          positionY: 130,
          config: {
            owners: ["amazon"],
            mostRecent: true,
            nameRegex: "^al2023-ami-2023.*-x86_64$"
          }
        },
        {
          id: "security-group",
          type: "SECURITY_GROUP",
          label: "Security Group",
          positionX: 200,
          positionY: 520,
          config: {
            vpcId: "aws_vpc.vpc.id"
          }
        },
        {
          id: "ec2-instance",
          type: "EC2",
          label: "EC2 Instance",
          positionX: 330,
          positionY: 765,
          config: {
            ami: "data.aws_ami.ami.id",
            instanceType: "t3.micro",
            subnetId: "aws_subnet.subnet.id",
            securityGroupIds: ["aws_security_group.security_group.id"],
            associatePublicIpAddress: true
          }
        },
        {
          id: "s3-bucket",
          type: "S3",
          label: "S3 Bucket",
          positionX: 950,
          positionY: 130,
          config: {}
        }
      ],
      edges: [
        createEdge("ami-to-ec2-instance", "ami", "ec2-instance", "launch image"),
        createEdge("ec2-instance-to-s3-bucket", "ec2-instance", "s3-bucket", "stores images"),
        createEdge("internet-gateway-to-route-table-association", "internet-gateway", "route-table-association", "routes"),
        createEdge("subnet-to-route-table-association", "subnet", "route-table-association", "uses"),
        createEdge("route-table-association-to-route-table", "route-table-association", "route-table", "uses"),
        createEdge("subnet-to-ec2-instance", "subnet", "ec2-instance", "hosts"),
        createEdge("security-group-to-ec2-instance", "security-group", "ec2-instance", "allows traffic")
      ]
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["EC2 서버가 public subnet에서 실행되고 S3 Bucket을 함께 사용하는 연습용 구조로 가정합니다."],
      explanations: ["VPC, Subnet, Internet Gateway, Route Table, Security Group, EC2, S3를 포함한 MVP 범위 초안입니다."]
    }
  };
}

// Lambda 함수 요구사항에는 지원 ResourceType인 LAMBDA만 사용한 작은 서버리스 초안을 반환합니다.
function createServerlessFunctionDraft(): AiArchitectureDraftResult {
  return {
    title: "Lambda 함수 Practice Architecture",
    architectureJson: {
      nodes: [
        {
          id: "lambda-function",
          type: "LAMBDA",
          label: "Lambda Function",
          positionX: 260,
          positionY: 220,
          config: {
            functionName: "practice-function",
            handler: "index.handler",
            runtime: "nodejs20.x"
          }
        }
      ],
      edges: []
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["단일 Lambda 함수가 이벤트를 처리하는 연습용 서버리스 구조로 가정합니다."],
      explanations: ["지원 ResourceType인 LAMBDA만 사용해 Architecture Board에 바로 표시할 수 있는 초안을 반환합니다."]
    }
  };
}

// 여러 템플릿에서 공통으로 쓰는 기본 VPC 노드를 만듭니다.
function createVpcNode(): ArchitectureJson["nodes"][number] {
  return {
    id: "vpc-main",
    type: "VPC",
    label: "Main VPC",
    positionX: 80,
    positionY: 80,
    config: {
      cidrBlock: "10.0.0.0/16"
    }
  };
}

// 템플릿 안에서 위치와 이름만 바꿔 재사용할 Subnet 노드를 만듭니다.
function createSubnetNode(
  id: string,
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "SUBNET",
    label,
    positionX,
    positionY,
    config: {
      cidrBlock: "10.0.1.0/24",
      vpcId: "vpc-main"
    }
  };
}

// EC2나 RDS에 연결할 기본 Security Group 노드를 만듭니다.
function createSecurityGroupNode(
  id: string,
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "SECURITY_GROUP",
    label,
    positionX,
    positionY,
    config: {
      vpcId: "vpc-main"
    }
  };
}

// 보드가 Resource 사이 관계를 그릴 수 있게 edge 객체를 만듭니다.
function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  label: string
): ArchitectureJson["edges"][number] {
  return {
    id,
    sourceId,
    targetId,
    label
  };
}
