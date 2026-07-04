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
        {
          id: "internet-gateway-api",
          type: "INTERNET_GATEWAY",
          label: "Internet Gateway",
          positionX: 600,
          positionY: 150,
          config: {
            vpcId: "aws_vpc.vpc_main.id"
          }
        },
        {
          id: "route-table-api",
          type: "ROUTE_TABLE",
          label: "Public Route Table",
          positionX: 600,
          positionY: 310,
          config: {
            vpcId: "aws_vpc.vpc_main.id",
            route: [
              {
                cidrBlock: "0.0.0.0/0",
                gatewayId: "aws_internet_gateway.internet_gateway_api.id"
              }
            ]
          }
        },
        {
          id: "route-table-association-api",
          type: "ROUTE_TABLE_ASSOCIATION",
          label: "Public Route Association",
          positionX: 390,
          positionY: 310,
          config: {
            subnetId: "aws_subnet.subnet_public.id",
            routeTableId: "aws_route_table.route_table_api.id"
          }
        },
        createAmiNode("ami-api", "Amazon Linux AMI", 140, 520),
        {
          id: "sg-api",
          type: "SECURITY_GROUP",
          label: "API Security Group",
          positionX: 170,
          positionY: 390,
          config: {
            vpcId: "aws_vpc.vpc_main.id",
            ingress: [
              {
                protocol: "tcp",
                port: 80,
                cidr: "0.0.0.0/0"
              }
            ],
            egress: [
              {
                protocol: "-1",
                cidr: "0.0.0.0/0"
              }
            ]
          }
        },
        {
          id: "api-runtime-role",
          type: "IAM_ROLE",
          label: "API Runtime Role",
          positionX: 860,
          positionY: 150,
          config: {
            assumeRolePolicy: createAssumeRolePolicy("ec2.amazonaws.com")
          }
        },
        {
          id: "api-runtime-policy",
          type: "IAM_POLICY",
          label: "API Runtime Policy",
          positionX: 1060,
          positionY: 150,
          config: {
            policy: createPolicyDocument([
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "cloudwatch:PutMetricData"
            ])
          }
        },
        {
          id: "api-instance-profile",
          type: "IAM_INSTANCE_PROFILE",
          label: "API Instance Profile",
          positionX: 860,
          positionY: 310,
          config: {
            role: "aws_iam_role.api_runtime_role.name"
          }
        },
        {
          id: "api-log-group",
          type: "CLOUDWATCH_LOG_GROUP",
          label: "API Logs",
          positionX: 860,
          positionY: 470,
          config: {
            name: "/sketchcatch/practice/api-server",
            retentionInDays: 14
          }
        },
        {
          id: "api-cpu-alarm",
          type: "CLOUDWATCH_METRIC_ALARM",
          label: "API CPU Alarm",
          positionX: 1060,
          positionY: 470,
          config: createMetricAlarmConfig({
            alarmName: "api-server-high-cpu",
            namespace: "AWS/EC2",
            metricName: "CPUUtilization",
            dimensions: {
              InstanceId: "aws_instance.ec2_api.id"
            },
            threshold: 80
          })
        },
        {
          id: "ec2-api",
          type: "EC2",
          label: "API Server",
          positionX: 330,
          positionY: 200,
          config: {
            ami: "data.aws_ami.ami_api.id",
            instanceType: "t3.micro",
            subnetId: "aws_subnet.subnet_public.id",
            vpcSecurityGroupIds: ["aws_security_group.sg_api.id"],
            iamInstanceProfile: "aws_iam_instance_profile.api_instance_profile.name",
            associatePublicIpAddress: true
          }
        }
      ],
      edges: [
        createEdge("vpc-to-subnet-public", "vpc-main", "subnet-public", "contains"),
        createEdge("route-table-api-to-internet-gateway-api", "route-table-api", "internet-gateway-api", "routes"),
        createEdge(
          "subnet-public-to-route-table-association-api",
          "subnet-public",
          "route-table-association-api",
          "uses"
        ),
        createEdge(
          "route-table-association-api-to-route-table-api",
          "route-table-association-api",
          "route-table-api",
          "uses"
        ),
        createEdge("ami-api-to-ec2-api", "ami-api", "ec2-api", "launch image"),
        createEdge(
          "api-runtime-policy-to-api-runtime-role",
          "api-runtime-policy",
          "api-runtime-role",
          "grants permissions"
        ),
        createEdge("api-runtime-role-to-api-instance-profile", "api-runtime-role", "api-instance-profile", "uses"),
        createEdge("api-instance-profile-to-ec2-api", "api-instance-profile", "ec2-api", "attaches role"),
        createEdge("ec2-api-to-api-log-group", "ec2-api", "api-log-group", "writes logs"),
        createEdge("api-cpu-alarm-to-ec2-api", "api-cpu-alarm", "ec2-api", "monitors CPU"),
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
        createSubnetNode("subnet-db", "DB Subnet", 140, 430, "10.0.2.0/24"),
        createAmiNode("ami-backend", "Amazon Linux AMI", 140, 680),
        {
          id: "sg-app",
          type: "SECURITY_GROUP",
          label: "App Security Group",
          positionX: 500,
          positionY: 150,
          config: {
            vpcId: "aws_vpc.vpc_main.id",
            ingress: [
              {
                protocol: "tcp",
                port: 8080,
                cidr: "10.0.0.0/16"
              }
            ],
            egress: [
              {
                protocol: "-1",
                cidr: "0.0.0.0/0"
              }
            ]
          }
        },
        {
          id: "sg-db",
          type: "SECURITY_GROUP",
          label: "DB Security Group",
          positionX: 500,
          positionY: 430,
          config: {
            vpcId: "aws_vpc.vpc_main.id",
            ingress: [
              {
                protocol: "tcp",
                port: 5432,
                securityGroups: ["aws_security_group.sg_app.id"]
              }
            ]
          }
        },
        {
          id: "backend-runtime-role",
          type: "IAM_ROLE",
          label: "Backend Runtime Role",
          positionX: 820,
          positionY: 120,
          config: {
            assumeRolePolicy: createAssumeRolePolicy("ec2.amazonaws.com")
          }
        },
        {
          id: "backend-runtime-policy",
          type: "IAM_POLICY",
          label: "Backend Runtime Policy",
          positionX: 1030,
          positionY: 120,
          config: {
            policy: createPolicyDocument([
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "cloudwatch:PutMetricData"
            ])
          }
        },
        {
          id: "backend-instance-profile",
          type: "IAM_INSTANCE_PROFILE",
          label: "Backend Instance Profile",
          positionX: 820,
          positionY: 280,
          config: {
            role: "aws_iam_role.backend_runtime_role.name"
          }
        },
        {
          id: "db-encryption-key",
          type: "KMS_KEY",
          label: "DB Encryption Key",
          positionX: 820,
          positionY: 440,
          config: {
            description: "Practice RDS storage encryption key",
            enableKeyRotation: true
          }
        },
        {
          id: "backend-log-group",
          type: "CLOUDWATCH_LOG_GROUP",
          label: "Backend Logs",
          positionX: 1030,
          positionY: 280,
          config: {
            name: "/sketchcatch/practice/backend",
            retentionInDays: 14
          }
        },
        {
          id: "db-cpu-alarm",
          type: "CLOUDWATCH_METRIC_ALARM",
          label: "DB CPU Alarm",
          positionX: 1030,
          positionY: 440,
          config: createMetricAlarmConfig({
            alarmName: "backend-db-high-cpu",
            namespace: "AWS/RDS",
            metricName: "CPUUtilization",
            dimensions: {
              DBInstanceIdentifier: "aws_db_instance.rds_primary.id"
            },
            threshold: 80
          })
        },
        {
          id: "ec2-backend",
          type: "EC2",
          label: "Backend Server",
          positionX: 330,
          positionY: 200,
          config: {
            ami: "data.aws_ami.ami_backend.id",
            instanceType: "t3.micro",
            subnetId: "aws_subnet.subnet_app.id",
            vpcSecurityGroupIds: ["aws_security_group.sg_app.id"],
            iamInstanceProfile: "aws_iam_instance_profile.backend_instance_profile.name"
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
            subnetId: "aws_subnet.subnet_db.id",
            vpcSecurityGroupIds: ["aws_security_group.sg_db.id"],
            publiclyAccessible: false,
            storageEncrypted: true,
            kmsKeyId: "aws_kms_key.db_encryption_key.arn",
            backupRetentionPeriod: 7
          }
        }
      ],
      edges: [
        createEdge("vpc-to-subnet-app", "vpc-main", "subnet-app", "contains"),
        createEdge("vpc-to-subnet-db", "vpc-main", "subnet-db", "contains"),
        createEdge("ami-backend-to-ec2-backend", "ami-backend", "ec2-backend", "launch image"),
        createEdge(
          "backend-runtime-policy-to-backend-runtime-role",
          "backend-runtime-policy",
          "backend-runtime-role",
          "grants permissions"
        ),
        createEdge(
          "backend-runtime-role-to-backend-instance-profile",
          "backend-runtime-role",
          "backend-instance-profile",
          "uses"
        ),
        createEdge(
          "backend-instance-profile-to-ec2-backend",
          "backend-instance-profile",
          "ec2-backend",
          "attaches role"
        ),
        createEdge("db-encryption-key-to-rds-primary", "db-encryption-key", "rds-primary", "encrypts storage"),
        createEdge("ec2-backend-to-backend-log-group", "ec2-backend", "backend-log-group", "writes logs"),
        createEdge("db-cpu-alarm-to-rds-primary", "db-cpu-alarm", "rds-primary", "monitors CPU"),
        createEdge("subnet-app-to-ec2-backend", "subnet-app", "ec2-backend", "hosts"),
        createEdge("subnet-db-to-rds-primary", "subnet-db", "rds-primary", "hosts"),
        createEdge("sg-app-to-ec2-backend", "sg-app", "ec2-backend", "allows traffic"),
        createEdge("sg-db-to-rds-primary", "sg-db", "rds-primary", "allows traffic"),
        createEdge("sg-app-to-sg-db", "sg-app", "sg-db", "allows PostgreSQL"),
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
        createEdge("route-table-to-internet-gateway", "route-table", "internet-gateway", "routes"),
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
          id: "api-gateway",
          type: "API_GATEWAY_REST_API",
          label: "Practice REST API",
          positionX: 120,
          positionY: 200,
          config: {
            name: "practice-api",
            description: "Entry point for the practice Lambda function"
          }
        },
        {
          id: "lambda-execution-role",
          type: "IAM_ROLE",
          label: "Lambda Execution Role",
          positionX: 320,
          positionY: 80,
          config: {
            assumeRolePolicy: createAssumeRolePolicy("lambda.amazonaws.com")
          }
        },
        {
          id: "lambda-execution-policy",
          type: "IAM_POLICY",
          label: "Lambda Execution Policy",
          positionX: 540,
          positionY: 80,
          config: {
            policy: createPolicyDocument([
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ])
          }
        },
        {
          id: "lambda-log-key",
          type: "KMS_KEY",
          label: "Lambda Log Key",
          positionX: 760,
          positionY: 80,
          config: {
            description: "Practice Lambda log encryption key",
            enableKeyRotation: true
          }
        },
        {
          id: "lambda-log-group",
          type: "CLOUDWATCH_LOG_GROUP",
          label: "Lambda Logs",
          positionX: 760,
          positionY: 240,
          config: {
            name: "/aws/lambda/practice-function",
            retentionInDays: 14,
            kmsKeyId: "aws_kms_key.lambda_log_key.arn"
          }
        },
        {
          id: "lambda-error-alarm",
          type: "CLOUDWATCH_METRIC_ALARM",
          label: "Lambda Error Alarm",
          positionX: 760,
          positionY: 400,
          config: createMetricAlarmConfig({
            alarmName: "practice-lambda-errors",
            namespace: "AWS/Lambda",
            metricName: "Errors",
            dimensions: {
              FunctionName: "aws_lambda_function.lambda_function.function_name"
            },
            statistic: "Sum",
            threshold: 0
          })
        },
        {
          id: "lambda-invoke-permission",
          type: "LAMBDA_PERMISSION",
          label: "API Invoke Permission",
          positionX: 320,
          positionY: 400,
          config: {
            statementId: "AllowExecutionFromApiGateway",
            action: "lambda:InvokeFunction",
            functionName: "aws_lambda_function.lambda_function.function_name",
            principal: "apigateway.amazonaws.com",
            sourceArn: "aws_api_gateway_rest_api.api_gateway.execution_arn"
          }
        },
        {
          id: "lambda-function",
          type: "LAMBDA",
          label: "Lambda Function",
          positionX: 260,
          positionY: 220,
          config: {
            functionName: "practice-function",
            role: "aws_iam_role.lambda_execution_role.arn",
            handler: "index.handler",
            runtime: "nodejs20.x"
          }
        }
      ],
      edges: [
        createEdge("api-gateway-to-lambda-function", "api-gateway", "lambda-function", "invokes"),
        createEdge(
          "lambda-invoke-permission-to-lambda-function",
          "lambda-invoke-permission",
          "lambda-function",
          "allows API invoke"
        ),
        createEdge(
          "lambda-execution-policy-to-lambda-execution-role",
          "lambda-execution-policy",
          "lambda-execution-role",
          "grants log access"
        ),
        createEdge(
          "lambda-execution-role-to-lambda-function",
          "lambda-execution-role",
          "lambda-function",
          "execution role"
        ),
        createEdge("lambda-log-key-to-lambda-log-group", "lambda-log-key", "lambda-log-group", "encrypts logs"),
        createEdge("lambda-function-to-lambda-log-group", "lambda-function", "lambda-log-group", "writes logs"),
        createEdge("lambda-error-alarm-to-lambda-function", "lambda-error-alarm", "lambda-function", "monitors errors")
      ]
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
function createAmiNode(
  id: string,
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "AMI",
    label,
    positionX,
    positionY,
    config: {
      owners: ["amazon"],
      mostRecent: true,
      nameRegex: "^al2023-ami-2023.*-x86_64$"
    }
  };
}

function createAssumeRolePolicy(servicePrincipal: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: servicePrincipal
        },
        Action: "sts:AssumeRole"
      }
    ]
  });
}

function createPolicyDocument(actions: readonly string[]): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: actions,
        Resource: "*"
      }
    ]
  });
}

function createMetricAlarmConfig(input: {
  readonly alarmName: string;
  readonly namespace: string;
  readonly metricName: string;
  readonly dimensions: Record<string, string>;
  readonly statistic?: string;
  readonly threshold: number;
}): ArchitectureJson["nodes"][number]["config"] {
  return {
    alarmName: input.alarmName,
    namespace: input.namespace,
    metricName: input.metricName,
    comparisonOperator: "GreaterThanThreshold",
    threshold: input.threshold,
    evaluationPeriods: 1,
    period: 300,
    statistic: input.statistic ?? "Average",
    dimensions: input.dimensions
  };
}

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
  positionY: number,
  cidrBlock = "10.0.1.0/24"
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "SUBNET",
    label,
    positionX,
    positionY,
    config: {
      cidrBlock,
      vpcId: "aws_vpc.vpc_main.id"
    }
  };
}

// EC2나 RDS에 연결할 기본 Security Group 노드를 만듭니다.
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
