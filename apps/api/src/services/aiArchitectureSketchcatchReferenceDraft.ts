import type { AiArchitectureDraftResult, ArchitectureJson, ResourceType } from "@sketchcatch/types";
import { SKETCHCATCH_REFERENCE_DIAGRAM_JSON } from "./aiArchitectureSketchcatchReferenceDiagram.js";
import { SKETCHCATCH_REFERENCE_TERRAFORM_MARKER } from "./terraform/sketchcatch-reference-terraform-code.js";

const REFERENCE_SELECTION_TERMS = [
  "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)",
  "중간 규모 (일 1,000명, 동시 50명)",
  "간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
  "React/Vue/Angular (SPA 프레임워크)",
  "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
  "한국만 (서울 리전)",
  "50-200만원 (고성능)",
  "선택사항 (HTTP도 괜찮음)",
  "파일 업로드 기능",
  "없음 (텍스트만)",
  "실시간 기능",
  "필요 없음",
  "반관리형 (일부 서버 관리)",
  "3초 이내 (적당함)",
  "10MB-100MB (일반적인 사이트)",
  "시간대별 차이 (낮에 많음)",
  "월 1시간 이내 (99.9% 가용성)"
] as const;

export function isSketchCatchReferenceDeploymentSelection(prompt: string): boolean {
  const normalizedPrompt = normalizePrompt(prompt);

  return REFERENCE_SELECTION_TERMS.every((term) => normalizedPrompt.includes(normalizePrompt(term)));
}

export function createSketchCatchReferenceDeploymentDraft(): AiArchitectureDraftResult {
  return {
    architectureJson: createReferenceArchitectureJson(),
    diagramJson: SKETCHCATCH_REFERENCE_DIAGRAM_JSON,
    metadata: {
      source: "template_fallback",
      confidence: "high",
      assumptions: [
        "선택지 조합이 SketchCatch 배포형 3-tier 참조 아키텍처와 일치해 고정 템플릿으로 생성했습니다.",
        "서울 리전 단일 VPC 안에 public, private app, private DB subnet을 분리합니다.",
        "프론트엔드는 S3와 CloudFront로 전달하고 API는 ALB에서 private app tier로 라우팅합니다.",
        "데이터는 private DB subnet의 RDS와 Secrets Manager로 분리해 보관합니다."
      ],
      explanations: [
        "동적 SPA 웹서비스, 복잡한 백엔드, RDS 데이터, 중간 트래픽, 반관리형 운영 선택에 맞춰 ALB + Auto Scaling Group + RDS 구조를 생성했습니다."
      ]
    },
    title: "SketchCatch Web Service Deployment Architecture"
  };
}

function createReferenceArchitectureJson(): ArchitectureJson {
  // 삭제용 fixture 경계: 아래 노드/좌표는 특정 선택지 조합 전용 스크린샷 재현 템플릿입니다.
  // 일반 AI 초안, 일반 Terraform Preview, 다른 선택지 경로에서는 이 함수가 호출되지 않습니다.
  const nodes: ArchitectureJson["nodes"] = [
    group("region-seoul", "Asia pacific (Seoul)", 230, 14, 2010, 1490, undefined, "sketchcatch_region"),

    group("cicd-artifacts-group", "CI/CD Artifacts", 522, 52, 142, 150, "region-seoul"),
    resource("artifact-bucket", "S3", "Artifact S3 Bucket", 552, 96, {
      bucketPurpose: "deployment_artifacts",
      publicAccessBlock: true,
      terraformResourceName: "artifact_s3_bucket"
    }, { diagramLabel: "Artifact S3 Bucket", height: 76, parentAreaNodeId: "cicd-artifacts-group", width: 76 }),

    group("pipeline-group", "Pipeline", 705, 52, 545, 150, "region-seoul"),
    displayOnlyNode("github", "Github", "sketchcatch_service", 742, 96, "pipeline-group", ICONS.github),
    displayOnlyNode("github-connection", "github_connection", "sketchcatch_service", 835, 96, "pipeline-group", ICONS.codepipeline),
    displayOnlyNode("codepipeline-display", "codepipeline", "sketchcatch_service", 925, 96, "pipeline-group", ICONS.codepipeline),
    group("codepipeline-iam-group", "CodePipeline IAM", 1005, 67, 220, 117, "pipeline-group"),
    resource("codepipeline-role", "IAM_ROLE", "codepipeline_role", 1040, 108, {
      assumeRoleService: "codepipeline.amazonaws.com",
      terraformResourceName: "codepipeline_role"
    }, { diagramLabel: "codepipeline_role", parentAreaNodeId: "codepipeline-iam-group" }),
    resource("codepipeline-policy", "IAM_POLICY", "codepipeline_policy", 1134, 105, {
      actions: ["codepipeline:*", "codebuild:StartBuild", "codedeploy:CreateDeployment"],
      terraformResourceName: "codepipeline_policy"
    }, { diagramLabel: "codepipeline_policy", parentAreaNodeId: "codepipeline-iam-group" }),

    group("build-group", "Build", 1275, 52, 420, 150, "region-seoul"),
    displayOnlyNode("codebuild-project", "codebuild_project", "sketchcatch_service", 1310, 96, "build-group", ICONS.codebuild),
    resource("codebuild-logs", "CLOUDWATCH_LOG_GROUP", "codebuild_logs", 1397, 98, {
      terraformResourceName: "codebuild_logs"
    }, { diagramLabel: "codebuild_logs", parentAreaNodeId: "build-group" }),
    group("codebuild-iam-group", "CodeBuild IAM", 1478, 67, 195, 117, "build-group"),
    resource("codebuild-role", "IAM_ROLE", "codebuild_role", 1504, 108, {
      assumeRoleService: "codebuild.amazonaws.com",
      terraformResourceName: "codebuild_role"
    }, { diagramLabel: "codebuild_role", parentAreaNodeId: "codebuild-iam-group" }),
    resource("codebuild-policy", "IAM_POLICY", "codebuild_policy", 1584, 105, {
      actions: ["logs:*", "s3:*", "ec2:*"],
      terraformResourceName: "codebuild_policy"
    }, { diagramLabel: "codebuild_policy", parentAreaNodeId: "codebuild-iam-group" }),

    group("deploy-group", "Deploy", 1705, 52, 505, 150, "region-seoul"),
    displayOnlyNode("codedeploy-deployment-group", "codedeploy_deployment_gr...", "sketchcatch_service", 1760, 96, "deploy-group", ICONS.codedeploy),
    displayOnlyNode("codedeploy-app", "codedeploy_app", "sketchcatch_service", 1860, 96, "deploy-group", ICONS.codedeploy),
    group("codedeploy-iam-group", "CodeDeploy IAM", 1965, 67, 218, 117, "deploy-group"),
    resource("codedeploy-role", "IAM_ROLE", "codedeploy_role", 1995, 108, {
      assumeRoleService: "codedeploy.amazonaws.com",
      terraformResourceName: "codedeploy_role"
    }, { diagramLabel: "codedeploy_role", parentAreaNodeId: "codedeploy-iam-group" }),
    resource("codedeploy-policy", "IAM_POLICY", "codedeploy_role_policy", 2095, 105, {
      actions: ["codedeploy:*", "autoscaling:*", "ec2:*"],
      terraformResourceName: "codedeploy_role_policy"
    }, { diagramLabel: "codedeploy_role_policy", parentAreaNodeId: "codedeploy-iam-group" }),

    group("secret-manager-group", "Secret Manager", 1306, 230, 310, 154, "region-seoul"),
    displayOnlyNode("db-password", "db_password", "sketchcatch_service", 1330, 295, "secret-manager-group", ICONS.terraform),
    resource("db-credentials-version", "SECRETS_MANAGER_SECRET", "db_credentials_version", 1432, 295, {
      secretPurpose: "rds_password_version",
      terraformResourceName: "db_credentials_version"
    }, { diagramLabel: "db_credentials_version", parentAreaNodeId: "secret-manager-group" }),
    resource("db-credentials", "SECRETS_MANAGER_SECRET", "db_credentials", 1535, 295, {
      secretPurpose: "rds_connection",
      terraformResourceName: "db_credentials"
    }, { diagramLabel: "db_credentials", parentAreaNodeId: "secret-manager-group" }),

    group("ec2-instance-access-group", "EC2 Instance Access", 1655, 230, 540, 154, "region-seoul"),
    resource("ec2-instance-profile", "IAM_INSTANCE_PROFILE", "ec2_instance_profile", 1710, 295, {
      role: "aws_iam_role.ec2_role.name",
      terraformResourceName: "ec2_instance_profile"
    }, { diagramLabel: "ec2_instance_profile", parentAreaNodeId: "ec2-instance-access-group" }),
    group("ec2-iam-group", "EC2 Instance IAM", 1810, 250, 370, 125, "ec2-instance-access-group"),
    resource("ec2-role", "IAM_ROLE", "ec2_role", 1848, 295, {
      assumeRoleService: "ec2.amazonaws.com",
      terraformResourceName: "ec2_role"
    }, { diagramLabel: "ec2_role", parentAreaNodeId: "ec2-iam-group" }),
    resource("ec2-policy", "IAM_POLICY", "ec2_policy", 1930, 292, {
      actions: ["s3:GetObject", "logs:PutLogEvents", "secretsmanager:GetSecretValue"],
      terraformResourceName: "ec2_policy"
    }, { diagramLabel: "ec2_policy", parentAreaNodeId: "ec2-iam-group" }),
    resource("ec2-codedeploy-policy", "IAM_POLICY", "ec2_codedeploy", 2015, 292, {
      actions: ["codedeploy:*"],
      terraformResourceName: "ec2_codedeploy"
    }, { diagramLabel: "ec2_codedeploy", parentAreaNodeId: "ec2-iam-group" }),
    resource("ec2-ssm-policy", "IAM_POLICY", "ec2_ssm", 2100, 292, {
      actions: ["ssm:*", "ssmmessages:*"],
      terraformResourceName: "ec2_ssm"
    }, { diagramLabel: "ec2_ssm", parentAreaNodeId: "ec2-iam-group" }),

    displayOnlyNode("user", "user", "sketchcatch_user_client", 30, 930, undefined, ICONS.user, 72, 72),
    displayOnlyNode("static-frontend-public-access-block", "static_frontend_public_a...", "sketchcatch_service", 270, 615, "region-seoul", ICONS.s3Standard),
    resource("static-frontend-bucket", "S3", "Static Frontend S3 Bucke...", 424, 615, {
      bucketPurpose: "static_frontend_origin",
      publicAccessBlock: true,
      terraformResourceName: "static_frontend_bucket"
    }, { diagramLabel: "Static Frontend S3 Bucke...", parentAreaNodeId: "region-seoul" }),
    displayOnlyNode("static-frontend-bucket-policy", "static_frontend_bucket_p...", "sketchcatch_service", 320, 810, "region-seoul", ICONS.s3Bucket),
    resource("cloudfront-distribution", "CLOUDFRONT", "cloudfront_distribution", 320, 945, {
      origins: ["aws_s3_bucket.static_frontend_bucket.bucket_regional_domain_name", "aws_lb.lb.dns_name"],
      terraformResourceName: "cloudfront_distribution"
    }, { diagramLabel: "cloudfront_distribution", parentAreaNodeId: "region-seoul" }),
    displayOnlyNode("s3-oac", "s3_oac", "sketchcatch_service", 322, 1050, "region-seoul", ICONS.cloudfront),

    resource("vpc-main", "VPC", "vpc", 648, 430, {
      cidrBlock: "10.0.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      sketchcatchReferenceTerraform: SKETCHCATCH_REFERENCE_TERRAFORM_MARKER
    }, { diagramAreaLabel: "vpc", height: 1055, parentAreaNodeId: "region-seoul", terraformResourceName: "vpc", width: 1580 }),

    resource("alb-security-group", "SECURITY_GROUP", "alb_sg", 786, 530, {
      egress: [{ cidr: "0.0.0.0/0", protocol: "-1" }],
      ingress: [{ cidr: "0.0.0.0/0", port: 80, protocol: "tcp" }],
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "alb_sg", height: 200, parentAreaNodeId: "vpc-main", terraformResourceName: "alb_sg", width: 160 }),
    displayOnlyNode("sg-rule", "sg_rule", "sketchcatch_service", 806, 590, "alb-security-group", ICONS.securityGroup),
    displayOnlyNode("alb-egress", "alb_egress", "sketchcatch_service", 867, 590, "alb-security-group", ICONS.securityGroup),
    resource("api-alb", "LOAD_BALANCER", "lb", 878, 680, {
      loadBalancerType: "application",
      securityGroups: ["aws_security_group.alb_sg.id"],
      subnets: ["aws_subnet.public_a.id", "aws_subnet.public_c.id"],
      terraformResourceName: "lb"
    }, { diagramLabel: "lb", parentAreaNodeId: "vpc-main" }),
    resource("http-listener", "LOAD_BALANCER_LISTENER", "http_listener", 1148, 690, {
      defaultAction: { targetGroupArn: "aws_lb_target_group.lb_target_group.arn", type: "forward" },
      loadBalancerArn: "aws_lb.lb.arn",
      port: 80,
      protocol: "HTTP",
      terraformResourceName: "http_listener"
    }, { diagramLabel: "http_listener", parentAreaNodeId: "vpc-main" }),

    displayOnlyNode("private-app-a-route-table-label", "private_app_a_route_tabl...", "sketchcatch_service", 1200, 470, "vpc-main", ICONS.routeTable, 92, 60),
    resource("private-app-a-route-table", "ROUTE_TABLE", "private_app_a", 1300, 470, {
      route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: "aws_nat_gateway.nat_gateway_a.id" }],
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "private_app_a"
    }, { diagramLabel: "private_app_a", parentAreaNodeId: "vpc-main" }),
    resource("private-app-a-default-route", "ROUTE_TABLE", "private_app_a_default_ro...", 1218, 610, {
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "private_app_a_default_route"
    }, { diagramLabel: "private_app_a_default_ro...", parentAreaNodeId: "vpc-main" }),

    resource("public-subnet-a", "SUBNET", "public A", 1078, 778, {
      availabilityZone: "ap-northeast-2a",
      cidrBlock: "10.0.0.0/24",
      mapPublicIpOnLaunch: true,
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "public A", height: 218, parentAreaNodeId: "vpc-main", terraformResourceName: "public_a", width: 178 }),
    resource("nat-gateway-a", "NAT_GATEWAY", "nat_gateway_a", 1178, 815, {
      allocationId: "aws_eip.nat_eip_a.id",
      subnetId: "aws_subnet.public_a.id",
      terraformResourceName: "nat_gateway_a"
    }, { diagramLabel: "nat_gateway_a", parentAreaNodeId: "public-subnet-a" }),
    resource("nat-eip-a", "ELASTIC_IP", "nat_eip_a", 1178, 895, {
      domain: "vpc",
      terraformResourceName: "nat_eip_a"
    }, { diagramLabel: "nat_eip_a", parentAreaNodeId: "public-subnet-a" }),

    resource("private-app-subnet-a", "SUBNET", "Private App Subnet A", 1280, 778, {
      availabilityZone: "ap-northeast-2a",
      cidrBlock: "10.0.10.0/24",
      mapPublicIpOnLaunch: false,
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "Private App Subnet A", height: 218, parentAreaNodeId: "vpc-main", terraformResourceName: "private_app_a", width: 445 }),

    resource("public-subnet-c", "SUBNET", "public B", 1078, 1050, {
      availabilityZone: "ap-northeast-2c",
      cidrBlock: "10.0.1.0/24",
      mapPublicIpOnLaunch: true,
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "public B", height: 230, parentAreaNodeId: "vpc-main", terraformResourceName: "public_c", width: 178 }),
    resource("nat-eip-c", "ELASTIC_IP", "nat_eip_c", 1178, 1108, {
      domain: "vpc",
      terraformResourceName: "nat_eip_c"
    }, { diagramLabel: "nat_eip_c", parentAreaNodeId: "public-subnet-c" }),
    resource("nat-gateway-c", "NAT_GATEWAY", "nat_gateway_c", 1178, 1188, {
      allocationId: "aws_eip.nat_eip_c.id",
      subnetId: "aws_subnet.public_c.id",
      terraformResourceName: "nat_gateway_c"
    }, { diagramLabel: "nat_gateway_c", parentAreaNodeId: "public-subnet-c" }),

    resource("private-app-subnet-c", "SUBNET", "Private App Subnet B", 1280, 1050, {
      availabilityZone: "ap-northeast-2c",
      cidrBlock: "10.0.11.0/24",
      mapPublicIpOnLaunch: false,
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "Private App Subnet B", height: 230, parentAreaNodeId: "vpc-main", terraformResourceName: "private_app_c", width: 445 }),

    resource("public-route-table", "ROUTE_TABLE", "public_route_table", 825, 850, {
      route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "aws_internet_gateway.internet_gw.id" }],
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "public_route_table"
    }, { diagramLabel: "public_route_table", parentAreaNodeId: "vpc-main" }),
    resource("public-default-route", "ROUTE_TABLE", "public_default_route", 690, 980, {
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "public_default_route"
    }, { diagramLabel: "public_default_route", parentAreaNodeId: "vpc-main" }),
    resource("internet-gateway", "INTERNET_GATEWAY", "internet_gw", 648, 1290, {
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "internet_gw"
    }, { diagramLabel: "internet_gw", parentAreaNodeId: "vpc-main" }),

    resource("private-app-c-route-table", "ROUTE_TABLE", "private_app_c", 1300, 1370, {
      route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: "aws_nat_gateway.nat_gateway_c.id" }],
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "private_app_c"
    }, { diagramLabel: "private_app_c", parentAreaNodeId: "vpc-main" }),
    resource("private-app-c-default-route", "ROUTE_TABLE", "private_app_c_default_ro...", 1218, 1290, {
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "private_app_c_default_route"
    }, { diagramLabel: "private_app_c_default_ro...", parentAreaNodeId: "vpc-main" }),

    resource("launch-template", "LAUNCH_TEMPLATE", "launch_template", 1518, 560, {
      imageId: "data.aws_ssm_parameter.al2023_ami.value",
      instanceType: "t3.micro",
      vpcSecurityGroupIds: ["aws_security_group.app_sg.id"],
      terraformResourceName: "launch_template"
    }, { diagramLabel: "launch_template", parentAreaNodeId: "vpc-main" }),
    resource("api-target-group", "LOAD_BALANCER_TARGET_GROUP", "lb_target_group", 1485, 680, {
      port: 8080,
      protocol: "HTTP",
      targetType: "instance",
      terraformResourceName: "lb_target_group",
      vpcId: "aws_vpc.vpc.id"
    }, { diagramLabel: "lb_target_group", parentAreaNodeId: "vpc-main" }),

    resource("api-autoscaling-group", "AUTO_SCALING_GROUP", "autoscaling_group", 1442, 632, {
      desiredCapacity: 2,
      launchTemplateId: "aws_launch_template.launch_template.id",
      maxSize: 4,
      minSize: 2,
      targetGroupArns: ["aws_lb_target_group.api_target_group.arn"],
      vpcZoneIdentifier: ["aws_subnet.private_app_subnet_a.id", "aws_subnet.private_app_subnet_c.id"]
    }, { diagramAreaLabel: "autoscaling_group", height: 615, parentAreaNodeId: "vpc-main", terraformResourceName: "autoscaling_group", width: 282 }),
    resource("app-security-group", "SECURITY_GROUP", "app_sg", 1464, 778, {
      egress: [{ cidr: "0.0.0.0/0", protocol: "-1" }],
      ingress: [{ port: 8080, protocol: "tcp", securityGroups: ["aws_security_group.alb_sg.id"] }],
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "app_sg", height: 465, parentAreaNodeId: "api-autoscaling-group", terraformResourceName: "app_sg", width: 222 }),
    displayOnlyNode("sg-rule6", "sg_rule6", "sketchcatch_service", 1600, 818, "app-security-group", ICONS.securityGroup),
    resource("app-instance-a", "EC2", "instance2", 1530, 850, {
      ami: "data.aws_ssm_parameter.al2023_ami.value",
      instanceType: "t3.micro",
      subnetId: "aws_subnet.private_app_a.id",
      terraformResourceName: "instance2"
    }, { diagramLabel: "instance2", parentAreaNodeId: "app-security-group" }),
    resource("app-ami", "AMI", "al2023 ami", 1542, 1005, {
      name: "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
      terraformResourceName: "al2023_ami"
    }, { diagramLabel: "al2023 ami", parentAreaNodeId: "app-security-group" }),
    resource("app-instance-c", "EC2", "instance3", 1530, 1120, {
      ami: "data.aws_ssm_parameter.al2023_ami.value",
      instanceType: "t3.micro",
      subnetId: "aws_subnet.private_app_c.id",
      terraformResourceName: "instance3"
    }, { diagramLabel: "instance3", parentAreaNodeId: "app-security-group" }),
    displayOnlyNode("app-egress", "app_egress", "sketchcatch_service", 1600, 1165, "app-security-group", ICONS.securityGroup),

    group("db-subnet-group-frame", "db_snet_group", 1760, 690, 290, 555, "vpc-main"),
    resource("db-subnet-group", "DB_SUBNET_GROUP", "db_snet_group", 1780, 708, {
      subnetIds: ["aws_subnet.private_db_a.id", "aws_subnet.private_db_c.id"],
      terraformResourceName: "db_snet_group"
    }, { diagramLabel: "db_snet_group", parentAreaNodeId: "db-subnet-group-frame" }),
    resource("private-db-subnet-a", "SUBNET", "Private DB Subnet A", 1807, 780, {
      availabilityZone: "ap-northeast-2a",
      cidrBlock: "10.0.20.0/24",
      mapPublicIpOnLaunch: false,
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "Private DB Subnet A", height: 205, parentAreaNodeId: "db-subnet-group-frame", terraformResourceName: "private_db_a", width: 235 }),
    resource("db-security-group", "SECURITY_GROUP", "rds_sg", 1848, 820, {
      ingress: [{ port: 3306, protocol: "tcp", securityGroups: ["aws_security_group.app_sg.id"] }],
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "rds_sg", height: 145, parentAreaNodeId: "private-db-subnet-a", terraformResourceName: "rds_sg", width: 190 }),
    displayOnlyNode("sg-rule3", "sg_rule3", "sketchcatch_service", 1855, 890, "db-security-group", ICONS.securityGroup),
    resource("app-database", "RDS", "RDS primary", 1920, 890, {
      allocatedStorage: 20,
      dbName: "sketchcatch",
      engine: "mysql",
      engineVersion: "8.0",
      instanceClass: "db.t4g.micro",
      publiclyAccessible: false,
      subnetGroupName: "aws_db_subnet_group.db_snet_group.name",
      terraformResourceName: "db",
      vpcSecurityGroupIds: ["aws_security_group.rds_sg.id"]
    }, { diagramLabel: "RDS primary", parentAreaNodeId: "db-security-group" }),
    resource("private-db-subnet-c", "SUBNET", "Private DB Subnet B", 1807, 1050, {
      availabilityZone: "ap-northeast-2c",
      cidrBlock: "10.0.21.0/24",
      mapPublicIpOnLaunch: false,
      vpcId: "aws_vpc.vpc.id"
    }, { diagramAreaLabel: "Private DB Subnet B", height: 175, parentAreaNodeId: "db-subnet-group-frame", terraformResourceName: "private_db_c", width: 235 }),
    resource("standby-database", "RDS", "RDS standby", 1920, 1135, {
      engine: "mysql",
      instanceClass: "db.t4g.micro",
      replicateSourceDb: "aws_db_instance.db.identifier",
      terraformResourceName: "db_standby"
    }, { diagramLabel: "RDS standby", parentAreaNodeId: "private-db-subnet-c" }),
    resource("db-route-table", "ROUTE_TABLE", "private_db_route_table", 2130, 1000, {
      vpcId: "aws_vpc.vpc.id",
      terraformResourceName: "private_db_route_table"
    }, { diagramLabel: "private_db_route_table", parentAreaNodeId: "vpc-main" }),
    displayOnlyNode("private-db-a-label", "private_db_a", "sketchcatch_service", 2130, 835, "vpc-main", ICONS.routeTable, 92, 60),
    displayOnlyNode("private-db-c-label", "private_db_c", "sketchcatch_service", 2130, 1155, "vpc-main", ICONS.routeTable, 92, 60)
  ];

  const edges: ArchitectureJson["edges"] = [
    edge("region-to-vpc", "region-seoul", "vpc-main", "contains"),
    edge("vpc-to-public-a", "vpc-main", "public-subnet-a", "contains"),
    edge("vpc-to-public-c", "vpc-main", "public-subnet-c", "contains"),
    edge("vpc-to-private-app-a", "vpc-main", "private-app-subnet-a", "contains"),
    edge("vpc-to-private-app-c", "vpc-main", "private-app-subnet-c", "contains"),
    edge("vpc-to-private-db-a", "vpc-main", "private-db-subnet-a", "contains"),
    edge("vpc-to-private-db-c", "vpc-main", "private-db-subnet-c", "contains"),
    edge("asg-to-app-sg", "api-autoscaling-group", "app-security-group", "contains"),
    edge("app-sg-to-instance-a", "app-security-group", "app-instance-a", "contains"),
    edge("app-sg-to-instance-c", "app-security-group", "app-instance-c", "contains"),
    edge("app-sg-to-ami", "app-security-group", "app-ami", "contains"),
    edge("db-frame-to-db-a", "db-subnet-group-frame", "private-db-subnet-a", "contains"),
    edge("db-frame-to-db-c", "db-subnet-group-frame", "private-db-subnet-c", "contains"),
    edge("db-a-to-rds-sg", "private-db-subnet-a", "db-security-group", "contains"),
    edge("rds-sg-to-primary", "db-security-group", "app-database", "contains"),
    edge("db-c-to-standby", "private-db-subnet-c", "standby-database", "contains"),
    edge("public-route-to-igw", "public-default-route", "internet-gateway", "routes internet", handles("handle-bottom", "handle-top")),
    edge("public-a-to-public-route-table", "public-subnet-a", "public-route-table", "uses", handles("handle-left", "handle-right")),
    edge("public-c-to-public-route-table", "public-subnet-c", "public-route-table", "uses", handles("handle-left", "handle-bottom")),
    edge("private-app-a-route-to-nat", "private-app-a-default-route", "nat-gateway-a", "egress", handles("handle-bottom", "handle-top")),
    edge("private-app-c-route-to-nat", "private-app-c-default-route", "nat-gateway-c", "egress", handles("handle-top", "handle-bottom")),
    edge("cloudfront-to-static-bucket", "cloudfront-distribution", "static-frontend-bucket", "static origin", handles("handle-top", "handle-bottom")),
    edge("cloudfront-to-alb", "cloudfront-distribution", "api-alb", "api origin", handles("handle-right", "handle-left")),
    edge("user-to-cloudfront", "user", "cloudfront-distribution", "requests", handles("handle-right", "handle-left")),
    edge("static-public-block-to-bucket", "static-frontend-public-access-block", "static-frontend-bucket", "protects", handles("handle-right", "handle-left")),
    edge("static-policy-to-cloudfront", "static-frontend-bucket-policy", "cloudfront-distribution", "allows OAC", handles("handle-bottom", "handle-top")),
    edge("alb-sg-to-alb", "alb-security-group", "api-alb", "allows HTTP", handles("handle-bottom", "handle-top")),
    edge("api-alb-to-http-listener", "api-alb", "http-listener", "listens", handles("handle-right", "handle-left")),
    edge("http-listener-to-target-group", "http-listener", "api-target-group", "forwards", handles("handle-right", "handle-left")),
    edge("target-group-to-asg", "api-target-group", "api-autoscaling-group", "targets", handles("handle-right", "handle-left")),
    edge("launch-template-to-asg", "launch-template", "api-autoscaling-group", "launches", handles("handle-bottom", "handle-top")),
    edge("db-sg-to-database", "db-security-group", "app-database", "allows MySQL", handles("handle-right", "handle-left")),
    edge("instance-a-to-primary-db", "app-instance-a", "app-database", "mysql", handles("handle-right", "handle-left")),
    edge("instance-c-to-standby-db", "app-instance-c", "standby-database", "mysql", handles("handle-right", "handle-left")),
    edge("private-db-a-route-to-subnet", "private-db-a-label", "private-db-subnet-a", "uses", handles("handle-left", "handle-right")),
    edge("private-db-c-route-to-subnet", "private-db-c-label", "private-db-subnet-c", "uses", handles("handle-left", "handle-right"))
  ];

  return { edges, nodes };
}

function node(
  id: ArchitectureJson["nodes"][number]["id"],
  type: ResourceType,
  label: string,
  positionX: number,
  positionY: number,
  config: ArchitectureJson["nodes"][number]["config"]
): ArchitectureJson["nodes"][number] {
  return {
    config,
    id,
    label,
    positionX,
    positionY,
    type
  };
}

type ResourceDisplayOptions = {
  readonly diagramAreaLabel?: string;
  readonly diagramLabel?: string;
  readonly height?: number;
  readonly parentAreaNodeId?: string;
  readonly terraformResourceName?: string;
  readonly width?: number;
};

function resource(
  id: ArchitectureJson["nodes"][number]["id"],
  type: ResourceType,
  label: string,
  positionX: number,
  positionY: number,
  config: ArchitectureJson["nodes"][number]["config"],
  options: ResourceDisplayOptions = {}
): ArchitectureJson["nodes"][number] {
  const defaultWidth = options.diagramAreaLabel ? undefined : 76;
  const defaultHeight = options.diagramAreaLabel ? undefined : 72;

  return node(id, type, label, positionX, positionY, {
    ...config,
    ...(options.diagramAreaLabel ? { diagramAreaLabel: options.diagramAreaLabel } : {}),
    ...(options.diagramLabel ? { diagramLabel: options.diagramLabel } : {}),
    ...(options.height ?? defaultHeight ? { diagramHeight: options.height ?? defaultHeight } : {}),
    ...(options.parentAreaNodeId ? { parentAreaNodeId: options.parentAreaNodeId } : {}),
    ...(options.terraformResourceName ? { terraformResourceName: options.terraformResourceName } : {}),
    ...(options.width ?? defaultWidth ? { diagramWidth: options.width ?? defaultWidth } : {})
  });
}

function group(
  id: string,
  label: string,
  positionX: number,
  positionY: number,
  width: number,
  height: number,
  parentAreaNodeId?: string,
  diagramType = "sketchcatch_group"
): ArchitectureJson["nodes"][number] {
  return node(id, "UNKNOWN", label, positionX, positionY, {
    diagramHeight: height,
    diagramKind: "design",
    diagramType,
    diagramWidth: width,
    ...(parentAreaNodeId ? { parentAreaNodeId } : {})
  });
}

function displayOnlyNode(
  id: string,
  label: string,
  diagramType: string,
  positionX: number,
  positionY: number,
  parentAreaNodeId: string | undefined,
  diagramIconUrl: string | undefined,
  width = 76,
  height = 72
): ArchitectureJson["nodes"][number] {
  return node(id, "UNKNOWN", label, positionX, positionY, {
    diagramHeight: height,
    diagramKind: "design",
    ...(diagramIconUrl ? { diagramIconUrl } : {}),
    diagramType,
    diagramWidth: width,
    ...(parentAreaNodeId ? { parentAreaNodeId } : {})
  });
}

function edge(
  id: ArchitectureJson["edges"][number]["id"],
  sourceId: string,
  targetId: string,
  label: string,
  options: EdgeDisplayOptions = {}
): ArchitectureJson["edges"][number] {
  return {
    ...(options.color ? { diagramColor: options.color } : {}),
    ...(options.lineStyle ? { diagramLineStyle: options.lineStyle } : {}),
    ...(options.sourceHandleId ? { diagramSourceHandleId: options.sourceHandleId } : {}),
    ...(options.targetHandleId ? { diagramTargetHandleId: options.targetHandleId } : {}),
    ...(options.type ? { diagramType: options.type } : {}),
    ...(options.width ? { diagramWidth: options.width } : {}),
    id,
    label,
    sourceId,
    targetId
  } as ArchitectureJson["edges"][number];
}

function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ");
}

type EdgeDisplayOptions = {
  readonly color?: string;
  readonly lineStyle?: "solid" | "dashed" | "dotted";
  readonly sourceHandleId?: string;
  readonly targetHandleId?: string;
  readonly type?: string;
  readonly width?: "thin" | "medium" | "thick";
};

function handles(sourceHandleId: string, targetHandleId: string): EdgeDisplayOptions {
  return {
    color: "#7f8b9a",
    lineStyle: "solid",
    sourceHandleId,
    targetHandleId,
    type: "smoothstep",
    width: "medium"
  };
}

const RESOURCE_ICON_PATH = "/Resource-Icons_07312025";
const SERVICE_ICON_PATH = "/Architecture-Service-Icons_07312025";

const ICONS = {
  cloudfront: `${SERVICE_ICON_PATH}/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg`,
  codebuild: `${SERVICE_ICON_PATH}/Arch_Developer-Tools/64/Arch_AWS-CodeBuild_64.svg`,
  codedeploy: `${SERVICE_ICON_PATH}/Arch_Developer-Tools/64/Arch_AWS-CodeDeploy_64.svg`,
  codepipeline: `${SERVICE_ICON_PATH}/Arch_Developer-Tools/64/Arch_AWS-CodePipeline_64.svg`,
  github: `${RESOURCE_ICON_PATH}/Res_General-Icons/Res_48_Light/Res_Git-Repository_48_Light.svg`,
  routeTable: `${RESOURCE_ICON_PATH}/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg`,
  s3Bucket: `${RESOURCE_ICON_PATH}/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg`,
  s3Standard: `${RESOURCE_ICON_PATH}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg`,
  securityGroup: `${RESOURCE_ICON_PATH}/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg`,
  terraform: `${RESOURCE_ICON_PATH}/Res_General-Icons/Res_48_Light/Res_Application_48_Light.svg`,
  user: `${RESOURCE_ICON_PATH}/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg`
} as const;
