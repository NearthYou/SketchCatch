import type { AiArchitectureDraftResult, ArchitectureJson, ArchitectureScenario } from "@sketchcatch/types";

export function createDraftByScenario(scenario: ArchitectureScenario): AiArchitectureDraftResult {
  switch (scenario) {
    case "static_site":
      return createStaticWebsiteDraft();
    case "api_server":
      return createApiServerDraft();
    case "backend_with_db":
      return createDatabaseBackendDraft();
  }
}

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

function createApiServerDraft(): AiArchitectureDraftResult {
  return {
    title: "API 서버 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("subnet-public", "Public Subnet", 280, 140),
        createSecurityGroupNode("sg-api", "API Security Group", 280, 300),
        {
          id: "ec2-api",
          type: "EC2",
          label: "API Server",
          positionX: 500,
          positionY: 220,
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

function createDatabaseBackendDraft(): AiArchitectureDraftResult {
  return {
    title: "DB 포함 백엔드 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("subnet-app", "App Subnet", 280, 140),
        createSubnetNode("subnet-db", "DB Subnet", 280, 340),
        createSecurityGroupNode("sg-app", "App Security Group", 500, 140),
        createSecurityGroupNode("sg-db", "DB Security Group", 500, 340),
        {
          id: "ec2-backend",
          type: "EC2",
          label: "Backend Server",
          positionX: 720,
          positionY: 140,
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
          positionX: 720,
          positionY: 340,
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

function createVpcNode(): ArchitectureJson["nodes"][number] {
  return {
    id: "vpc-main",
    type: "VPC",
    label: "Main VPC",
    positionX: 80,
    positionY: 220,
    config: {
      cidrBlock: "10.0.0.0/16"
    }
  };
}

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
