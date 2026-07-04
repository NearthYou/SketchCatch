import type {
  AiArchitectureDraftResult,
  ArchitectureJson,
  ArchitectureRequirementFact
} from "@sketchcatch/types";
import type { ArchitectureRequirementResolution } from "./aiArchitectureRequirementResolution.js";

// Requirement fact 조합을 지원 가능한 ResourceType만 포함한 ArchitectureJson으로 조립합니다.
export function createDraftFromRequirementFacts(
  resolution: ArchitectureRequirementResolution
): AiArchitectureDraftResult {
  const factSet = new Set(resolution.requirementFacts);
  const nodes: ArchitectureJson["nodes"] = [];
  const edges: ArchitectureJson["edges"] = [];
  const context: DraftBuildContext = { edges, factSet, nodes };

  if (factSet.has("web_frontend") || factSet.has("static_delivery")) {
    addStaticWebsiteDelivery(context);
  }

  if (factSet.has("server_runtime")) {
    addEc2ApplicationRuntime(context);
  }

  if (factSet.has("serverless_runtime")) {
    addServerlessRuntime(context);
  }

  if (factSet.has("database")) {
    addDatabase(context);
  }

  if (needsUploadBucket(factSet)) {
    addUploadBucket(context);
  }

  addCrossResourceEdges(context);

  return {
    architectureJson: { edges, nodes },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: createDraftAssumptions(resolution.requirementFacts),
      explanations: [
        `요구사항 단서: ${resolution.requirementFacts.map(getRequirementFactLabel).join(", ")}`
      ]
    },
    title: createDraftTitle(factSet)
  };
}

type DraftBuildContext = {
  readonly edges: ArchitectureJson["edges"];
  readonly factSet: ReadonlySet<ArchitectureRequirementFact>;
  readonly nodes: ArchitectureJson["nodes"];
};

function addStaticWebsiteDelivery(context: DraftBuildContext): void {
  addNode(context, {
    id: "web-assets-bucket",
    type: "S3",
    label: "Static Website Bucket",
    positionX: 120,
    positionY: 160,
    config: {
      bucketPurpose: "static_website_origin",
      publicAccessBlock: true
    }
  });
  addNode(context, {
    id: "cloudfront-distribution",
    type: "CLOUDFRONT",
    label: "CloudFront CDN",
    positionX: 420,
    positionY: 160,
    config: {
      originResourceId: "web-assets-bucket"
    }
  });
  addEdge(context, "cloudfront-to-web-assets-bucket", "cloudfront-distribution", "web-assets-bucket", "origin");
}

function addEc2ApplicationRuntime(context: DraftBuildContext): void {
  addNetworkBoundary(context);
  addNode(context, {
    id: "app-security-group",
    type: "SECURITY_GROUP",
    label: "App Security Group",
    positionX: 220,
    positionY: 560,
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
  });
  addNode(context, {
    id: "app-ami",
    type: "AMI",
    label: "Amazon Linux AMI",
    positionX: 120,
    positionY: 730,
    config: createAmazonLinuxAmiConfig()
  });
  addIamRuntimeNodes(context);
  addObservabilityNodes(context);
  addNode(context, {
    id: "app-server",
    type: "EC2",
    label: "Application Server",
    positionX: 370,
    positionY: 620,
    config: {
      ami: "data.aws_ami.app_ami.id",
      associatePublicIpAddress: true,
      iamInstanceProfile: "aws_iam_instance_profile.app_instance_profile.name",
      instanceType: "t3.micro",
      subnetId: "aws_subnet.public_subnet.id",
      vpcSecurityGroupIds: ["aws_security_group.app_security_group.id"]
    }
  });
  addEdge(context, "app-ami-to-app-server", "app-ami", "app-server", "launch image");
  addEdge(context, "app-instance-profile-to-app-server", "app-instance-profile", "app-server", "attaches role");
  addEdge(context, "app-server-to-app-log-group", "app-server", "app-log-group", "writes logs");
  addEdge(context, "app-cpu-alarm-to-app-server", "app-cpu-alarm", "app-server", "monitors CPU");
  addEdge(context, "public-subnet-to-app-server", "public-subnet", "app-server", "hosts");
  addEdge(context, "app-security-group-to-app-server", "app-security-group", "app-server", "allows traffic");
}

function addNetworkBoundary(context: DraftBuildContext): void {
  addNode(context, {
    id: "vpc-main",
    type: "VPC",
    label: "Main VPC",
    positionX: 70,
    positionY: 320,
    config: {
      cidrBlock: "10.0.0.0/16"
    }
  });
  addNode(context, {
    id: "public-subnet",
    type: "SUBNET",
    label: "Public Subnet",
    positionX: 150,
    positionY: 490,
    config: {
      cidrBlock: "10.0.1.0/24",
      vpcId: "aws_vpc.vpc_main.id"
    }
  });
  addNode(context, {
    id: "internet-gateway",
    type: "INTERNET_GATEWAY",
    label: "Internet Gateway",
    positionX: 650,
    positionY: 360,
    config: {
      vpcId: "aws_vpc.vpc_main.id"
    }
  });
  addNode(context, {
    id: "public-route-table",
    type: "ROUTE_TABLE",
    label: "Public Route Table",
    positionX: 650,
    positionY: 520,
    config: {
      route: [
        {
          cidrBlock: "0.0.0.0/0",
          gatewayId: "aws_internet_gateway.internet_gateway.id"
        }
      ],
      vpcId: "aws_vpc.vpc_main.id"
    }
  });
  addNode(context, {
    id: "public-route-table-association",
    type: "ROUTE_TABLE_ASSOCIATION",
    label: "Public Route Association",
    positionX: 420,
    positionY: 520,
    config: {
      routeTableId: "aws_route_table.public_route_table.id",
      subnetId: "aws_subnet.public_subnet.id"
    }
  });
  addEdge(context, "vpc-main-to-public-subnet", "vpc-main", "public-subnet", "contains");
  addEdge(context, "public-route-table-to-internet-gateway", "public-route-table", "internet-gateway", "routes");
  addEdge(
    context,
    "public-subnet-to-public-route-table-association",
    "public-subnet",
    "public-route-table-association",
    "uses"
  );
  addEdge(
    context,
    "public-route-table-association-to-public-route-table",
    "public-route-table-association",
    "public-route-table",
    "uses"
  );
}

function addIamRuntimeNodes(context: DraftBuildContext): void {
  const actions = [
    "logs:CreateLogStream",
    "logs:PutLogEvents",
    "cloudwatch:PutMetricData",
    ...(context.factSet.has("object_storage") ? ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"] : []),
    ...(context.factSet.has("encryption") ? ["kms:Decrypt", "kms:GenerateDataKey"] : [])
  ];

  addNode(context, {
    id: "app-runtime-role",
    type: "IAM_ROLE",
    label: "Application Runtime Role",
    positionX: 900,
    positionY: 360,
    config: {
      assumeRolePolicy: createAssumeRolePolicy("ec2.amazonaws.com")
    }
  });
  addNode(context, {
    id: "app-runtime-policy",
    type: "IAM_POLICY",
    label: "Application Runtime Policy",
    positionX: 1110,
    positionY: 360,
    config: {
      policy: createPolicyDocument(actions)
    }
  });
  addNode(context, {
    id: "app-instance-profile",
    type: "IAM_INSTANCE_PROFILE",
    label: "Application Instance Profile",
    positionX: 900,
    positionY: 520,
    config: {
      role: "aws_iam_role.app_runtime_role.name"
    }
  });
  addEdge(context, "app-runtime-policy-to-app-runtime-role", "app-runtime-policy", "app-runtime-role", "grants permissions");
  addEdge(context, "app-runtime-role-to-app-instance-profile", "app-runtime-role", "app-instance-profile", "uses");
}

function addObservabilityNodes(context: DraftBuildContext): void {
  addNode(context, {
    id: "app-log-group",
    type: "CLOUDWATCH_LOG_GROUP",
    label: "Application Logs",
    positionX: 1110,
    positionY: 520,
    config: {
      name: "/sketchcatch/practice/application",
      retentionInDays: 14
    }
  });
  addNode(context, {
    id: "app-cpu-alarm",
    type: "CLOUDWATCH_METRIC_ALARM",
    label: "Application CPU Alarm",
    positionX: 1110,
    positionY: 680,
    config: createMetricAlarmConfig({
      alarmName: "application-high-cpu",
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      dimensions: {
        InstanceId: "aws_instance.app_server.id"
      },
      threshold: 80
    })
  });
}

function addDatabase(context: DraftBuildContext): void {
  addNetworkBoundary(context);
  addNode(context, {
    id: "private-db-subnet",
    type: "SUBNET",
    label: "Private DB Subnet",
    positionX: 150,
    positionY: 820,
    config: {
      cidrBlock: "10.0.2.0/24",
      vpcId: "aws_vpc.vpc_main.id"
    }
  });
  addNode(context, {
    id: "db-security-group",
    type: "SECURITY_GROUP",
    label: "Database Security Group",
    positionX: 220,
    positionY: 960,
    config: {
      vpcId: "aws_vpc.vpc_main.id",
      ingress: [
        {
          protocol: "tcp",
          port: 5432,
          securityGroups: ["aws_security_group.app_security_group.id"]
        }
      ]
    }
  });
  addNode(context, {
    id: "data-encryption-key",
    type: "KMS_KEY",
    label: "Data Encryption Key",
    positionX: 900,
    positionY: 840,
    config: {
      description: "Practice data storage encryption key",
      enableKeyRotation: true
    }
  });
  addNode(context, {
    id: "db-cpu-alarm",
    type: "CLOUDWATCH_METRIC_ALARM",
    label: "Database CPU Alarm",
    positionX: 1110,
    positionY: 840,
    config: createMetricAlarmConfig({
      alarmName: "database-high-cpu",
      namespace: "AWS/RDS",
      metricName: "CPUUtilization",
      dimensions: {
        DBInstanceIdentifier: "aws_db_instance.app_database.id"
      },
      threshold: 80
    })
  });
  addNode(context, {
    id: "app-database",
    type: "RDS",
    label: "Application Database",
    positionX: 370,
    positionY: 920,
    config: {
      backupRetentionPeriod: 7,
      engine: "postgres",
      instanceClass: "db.t4g.micro",
      kmsKeyId: "aws_kms_key.data_encryption_key.arn",
      publiclyAccessible: false,
      skipFinalSnapshot: true,
      storageEncrypted: true,
      subnetId: "aws_subnet.private_db_subnet.id",
      vpcSecurityGroupIds: ["aws_security_group.db_security_group.id"]
    }
  });
  addEdge(context, "vpc-main-to-private-db-subnet", "vpc-main", "private-db-subnet", "contains");
  addEdge(context, "private-db-subnet-to-app-database", "private-db-subnet", "app-database", "hosts");
  addEdge(context, "db-security-group-to-app-database", "db-security-group", "app-database", "allows traffic");
  addEdge(context, "app-security-group-to-db-security-group", "app-security-group", "db-security-group", "allows PostgreSQL");
  addEdge(context, "data-encryption-key-to-app-database", "data-encryption-key", "app-database", "encrypts storage");
  addEdge(context, "db-cpu-alarm-to-app-database", "db-cpu-alarm", "app-database", "monitors CPU");
}

function addUploadBucket(context: DraftBuildContext): void {
  addNode(context, {
    id: "upload-bucket",
    type: "S3",
    label: "Upload Storage Bucket",
    positionX: 900,
    positionY: 160,
    config: {
      bucketPurpose: "user_uploads",
      publicAccessBlock: true
    }
  });
}

function addServerlessRuntime(context: DraftBuildContext): void {
  addNode(context, {
    id: "api-gateway",
    type: "API_GATEWAY_REST_API",
    label: "Practice REST API",
    positionX: 120,
    positionY: 220,
    config: {
      description: "Entry point for the practice Lambda function",
      name: "practice-api"
    }
  });
  addNode(context, {
    id: "lambda-execution-role",
    type: "IAM_ROLE",
    label: "Lambda Execution Role",
    positionX: 330,
    positionY: 80,
    config: {
      assumeRolePolicy: createAssumeRolePolicy("lambda.amazonaws.com")
    }
  });
  addNode(context, {
    id: "lambda-execution-policy",
    type: "IAM_POLICY",
    label: "Lambda Execution Policy",
    positionX: 550,
    positionY: 80,
    config: {
      policy: createPolicyDocument([
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        ...(context.factSet.has("object_storage") ? ["s3:GetObject", "s3:PutObject"] : [])
      ])
    }
  });
  addNode(context, {
    id: "lambda-log-key",
    type: "KMS_KEY",
    label: "Lambda Log Key",
    positionX: 780,
    positionY: 80,
    config: {
      description: "Practice Lambda log encryption key",
      enableKeyRotation: true
    }
  });
  addNode(context, {
    id: "lambda-log-group",
    type: "CLOUDWATCH_LOG_GROUP",
    label: "Lambda Logs",
    positionX: 780,
    positionY: 240,
    config: {
      kmsKeyId: "aws_kms_key.lambda_log_key.arn",
      name: "/aws/lambda/practice-function",
      retentionInDays: 14
    }
  });
  addNode(context, {
    id: "lambda-error-alarm",
    type: "CLOUDWATCH_METRIC_ALARM",
    label: "Lambda Error Alarm",
    positionX: 780,
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
  });
  addNode(context, {
    id: "lambda-invoke-permission",
    type: "LAMBDA_PERMISSION",
    label: "API Invoke Permission",
    positionX: 330,
    positionY: 400,
    config: {
      action: "lambda:InvokeFunction",
      functionName: "aws_lambda_function.lambda_function.function_name",
      principal: "apigateway.amazonaws.com",
      sourceArn: "aws_api_gateway_rest_api.api_gateway.execution_arn",
      statementId: "AllowExecutionFromApiGateway"
    }
  });
  addNode(context, {
    id: "lambda-function",
    type: "LAMBDA",
    label: "Lambda Function",
    positionX: 280,
    positionY: 240,
    config: {
      functionName: "practice-function",
      handler: "index.handler",
      role: "aws_iam_role.lambda_execution_role.arn",
      runtime: "nodejs20.x"
    }
  });
  addEdge(context, "api-gateway-to-lambda-function", "api-gateway", "lambda-function", "invokes");
  addEdge(context, "lambda-invoke-permission-to-lambda-function", "lambda-invoke-permission", "lambda-function", "allows API invoke");
  addEdge(context, "lambda-execution-policy-to-lambda-execution-role", "lambda-execution-policy", "lambda-execution-role", "grants log access");
  addEdge(context, "lambda-execution-role-to-lambda-function", "lambda-execution-role", "lambda-function", "execution role");
  addEdge(context, "lambda-log-key-to-lambda-log-group", "lambda-log-key", "lambda-log-group", "encrypts logs");
  addEdge(context, "lambda-function-to-lambda-log-group", "lambda-function", "lambda-log-group", "writes logs");
  addEdge(context, "lambda-error-alarm-to-lambda-function", "lambda-error-alarm", "lambda-function", "monitors errors");
}

function addCrossResourceEdges(context: DraftBuildContext): void {
  if (hasNode(context, "cloudfront-distribution") && hasNode(context, "app-server")) {
    addEdge(context, "cloudfront-to-app-server", "cloudfront-distribution", "app-server", "forwards app requests");
  }

  if (hasNode(context, "app-server") && hasNode(context, "upload-bucket")) {
    addEdge(context, "app-server-to-upload-bucket", "app-server", "upload-bucket", "stores files");
  }

  if (hasNode(context, "app-server") && hasNode(context, "app-database")) {
    addEdge(context, "app-server-to-app-database", "app-server", "app-database", "reads/writes");
  }

  if (hasNode(context, "lambda-function") && hasNode(context, "upload-bucket")) {
    addEdge(context, "lambda-function-to-upload-bucket", "lambda-function", "upload-bucket", "stores files");
  }
}

function needsUploadBucket(factSet: ReadonlySet<ArchitectureRequirementFact>): boolean {
  return factSet.has("object_storage") && (factSet.has("server_runtime") || factSet.has("serverless_runtime"));
}

function createDraftTitle(factSet: ReadonlySet<ArchitectureRequirementFact>): string {
  if (factSet.has("serverless_runtime")) {
    return "Lambda 함수 Practice Architecture";
  }

  if (factSet.has("web_frontend") && factSet.has("server_runtime")) {
    return "웹서비스 Practice Architecture";
  }

  if (factSet.has("database")) {
    return "DB 포함 백엔드 Practice Architecture";
  }

  if (factSet.has("server_runtime") && factSet.has("object_storage")) {
    return "서버+스토리지 Practice Architecture";
  }

  if (factSet.has("server_runtime")) {
    return "API 서버 Practice Architecture";
  }

  if (factSet.has("web_frontend") || factSet.has("static_delivery")) {
    return "정적 웹사이트 Practice Architecture";
  }

  return "Practice Architecture";
}

function createDraftAssumptions(requirementFacts: readonly ArchitectureRequirementFact[]): string[] {
  const factSet = new Set(requirementFacts);
  const assumptions = ["동일한 자연어 단서 조합은 동일한 ArchitectureJson으로 생성합니다."];

  if (factSet.has("web_frontend")) {
    assumptions.push("공개 웹 화면은 정적 파일 배포와 CDN 전달이 필요하다고 가정합니다.");
  }

  if (factSet.has("server_runtime")) {
    assumptions.push("서버 실행 공간은 단일 EC2 기반 Practice Resource로 시작한다고 가정합니다.");
  }

  if (factSet.has("database")) {
    assumptions.push("로그인, 회원, 사용자 데이터는 관계형 데이터베이스와 암호화가 필요하다고 가정합니다.");
  }

  if (factSet.has("file_upload")) {
    assumptions.push("사용자 파일은 애플리케이션 실행 공간과 분리된 객체 저장소에 보관한다고 가정합니다.");
  }

  return assumptions;
}

function getRequirementFactLabel(fact: ArchitectureRequirementFact): string {
  switch (fact) {
    case "auth_or_user_data":
      return "로그인/사용자 데이터";
    case "database":
      return "데이터 보관";
    case "encryption":
      return "암호화";
    case "file_upload":
      return "파일 업로드";
    case "iam_permissions":
      return "실행 권한";
    case "network_boundary":
      return "네트워크 경계";
    case "object_storage":
      return "객체 저장소";
    case "observability":
      return "로그/알림";
    case "server_runtime":
      return "서버 실행 공간";
    case "serverless_runtime":
      return "서버리스 실행";
    case "static_delivery":
      return "정적 배포";
    case "web_frontend":
      return "웹 화면";
  }
}

function addNode(context: DraftBuildContext, node: ArchitectureJson["nodes"][number]): void {
  if (!hasNode(context, node.id)) {
    context.nodes.push(node);
  }
}

function addEdge(
  context: DraftBuildContext,
  id: string,
  sourceId: string,
  targetId: string,
  label: string
): void {
  if (context.edges.some((edge) => edge.id === id) || !hasNode(context, sourceId) || !hasNode(context, targetId)) {
    return;
  }

  context.edges.push({ id, sourceId, targetId, label });
}

function hasNode(context: DraftBuildContext, nodeId: string): boolean {
  return context.nodes.some((node) => node.id === nodeId);
}

function createAmazonLinuxAmiConfig(): ArchitectureJson["nodes"][number]["config"] {
  return {
    mostRecent: true,
    nameRegex: "^al2023-ami-2023.*-x86_64$",
    owners: ["amazon"]
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
    comparisonOperator: "GreaterThanThreshold",
    dimensions: input.dimensions,
    evaluationPeriods: 1,
    metricName: input.metricName,
    namespace: input.namespace,
    period: 300,
    statistic: input.statistic ?? "Average",
    threshold: input.threshold
  };
}
