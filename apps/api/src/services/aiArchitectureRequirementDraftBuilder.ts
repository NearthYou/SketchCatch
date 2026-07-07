import type {
  AiArchitectureDraftResult,
  ArchitectureJson,
  ArchitectureDraftOperatingProfile,
  ArchitectureRequirementFact,
  ArchitectureServicePurpose
} from "@sketchcatch/types";
import type { ArchitectureRequirementResolution } from "./aiArchitectureRequirementResolution.js";
import type { ArchitectureResourceQuantities } from "./aiArchitectureResourceQuantities.js";
import { DEFAULT_ARCHITECTURE_RESOURCE_QUANTITIES } from "./aiArchitectureResourceQuantities.js";

// Requirement fact 조합을 지원 가능한 ResourceType만 포함한 ArchitectureJson으로 조립합니다.
export function planPracticeArchitecture(
  resolution: ArchitectureRequirementResolution,
  resourceQuantities: ArchitectureResourceQuantities = DEFAULT_ARCHITECTURE_RESOURCE_QUANTITIES
): AiArchitectureDraftResult {
  const factSet = new Set(resolution.requirementFacts);
  const nodes: ArchitectureJson["nodes"] = [];
  const edges: ArchitectureJson["edges"] = [];
  const context: DraftBuildContext = {
    edges,
    factSet,
    nodes,
    operatingProfile: resolution.operatingProfile,
    resourceQuantities,
    servicePurpose: resolution.servicePurpose
  };

  if (factSet.has("web_frontend") || factSet.has("static_delivery")) {
    addStaticWebsiteDelivery(context);
  }

  if (factSet.has("server_runtime")) {
    if (isMinimalEc2ApiServer(context)) {
      addMinimalEc2ApiServer(context);
    } else if (isMinimalEc2StorageServer(context)) {
      addMinimalEc2ApiServer(context);
    } else {
      addEc2ApplicationRuntime(context);
    }
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

  addPurposeSpecificResources(context);
  addCrossResourceEdges(context);

  return {
    architectureJson: { edges, nodes },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: createDraftAssumptions(resolution.requirementFacts, resourceQuantities),
      explanations: [
        `요구사항 단서: ${resolution.requirementFacts.map(getRequirementFactLabel).join(", ")}`
      ]
    },
    title: createDraftTitle(context)
  };
}

export function createDraftFromRequirementFacts(
  resolution: ArchitectureRequirementResolution,
  resourceQuantities: ArchitectureResourceQuantities = DEFAULT_ARCHITECTURE_RESOURCE_QUANTITIES
): AiArchitectureDraftResult {
  return planPracticeArchitecture(resolution, resourceQuantities);
}

type DraftBuildContext = {
  readonly edges: ArchitectureJson["edges"];
  readonly factSet: ReadonlySet<ArchitectureRequirementFact>;
  readonly nodes: ArchitectureJson["nodes"];
  readonly operatingProfile: ArchitectureDraftOperatingProfile;
  readonly resourceQuantities: ArchitectureResourceQuantities;
  readonly servicePurpose: ArchitectureServicePurpose;
};

type DraftPurposeProfile = {
  readonly title: string;
  readonly appServerLabel: string;
  readonly appServerPurpose: string;
  readonly databaseLabel: string;
  readonly dataPurpose: string;
  readonly dataKeyDescription: string;
  readonly logGroupName: string;
  readonly appCpuAlarmName: string;
  readonly dbCpuAlarmName: string;
  readonly uploadBucketLabel: string;
  readonly uploadBucketPurpose: string;
  readonly staticBucketLabel: string;
};

function getPurposeProfile(servicePurpose: ArchitectureServicePurpose): DraftPurposeProfile {
  switch (servicePurpose) {
    case "auth_web_service":
      return {
        title: "Auth Web Service Practice Architecture",
        appServerLabel: "Auth Application Server",
        appServerPurpose: "auth_application",
        databaseLabel: "User Account Database",
        dataPurpose: "auth_user_accounts",
        dataKeyDescription: "Authentication and user profile data encryption key",
        logGroupName: "/sketchcatch/practice/auth",
        appCpuAlarmName: "auth-application-high-cpu",
        dbCpuAlarmName: "auth-database-high-cpu",
        uploadBucketLabel: "User Upload Bucket",
        uploadBucketPurpose: "user_private_uploads",
        staticBucketLabel: "Auth Web Assets Bucket"
      };
    case "reservation_service":
      return {
        title: "Reservation Service Practice Architecture",
        appServerLabel: "Reservation Application Server",
        appServerPurpose: "reservation_workflow",
        databaseLabel: "Reservation Request Database",
        dataPurpose: "reservation_requests",
        dataKeyDescription: "Reservation request and customer contact data encryption key",
        logGroupName: "/sketchcatch/practice/reservation",
        appCpuAlarmName: "reservation-application-high-cpu",
        dbCpuAlarmName: "reservation-database-high-cpu",
        uploadBucketLabel: "Reservation Attachment Bucket",
        uploadBucketPurpose: "reservation_attachments",
        staticBucketLabel: "Reservation Web Assets Bucket"
      };
    case "content_board":
      return {
        title: "Content Board Practice Architecture",
        appServerLabel: "Content Board Server",
        appServerPurpose: "content_board",
        databaseLabel: "Post Content Database",
        dataPurpose: "content_posts",
        dataKeyDescription: "Post, comment, and board metadata encryption key",
        logGroupName: "/sketchcatch/practice/content-board",
        appCpuAlarmName: "content-board-high-cpu",
        dbCpuAlarmName: "content-database-high-cpu",
        uploadBucketLabel: "Content Media Bucket",
        uploadBucketPurpose: "content_media",
        staticBucketLabel: "Content Board Assets Bucket"
      };
    case "file_upload_service":
      return {
        title: "File Upload Service Practice Architecture",
        appServerLabel: "Upload Application Server",
        appServerPurpose: "file_upload",
        databaseLabel: "Upload Metadata Database",
        dataPurpose: "upload_metadata",
        dataKeyDescription: "Upload metadata encryption key",
        logGroupName: "/sketchcatch/practice/upload",
        appCpuAlarmName: "upload-application-high-cpu",
        dbCpuAlarmName: "upload-database-high-cpu",
        uploadBucketLabel: "Upload Storage Bucket",
        uploadBucketPurpose: "user_uploads",
        staticBucketLabel: "Upload Web Assets Bucket"
      };
    case "landing_page":
      return {
        title: "Landing Page Practice Architecture",
        appServerLabel: "Landing Page Server",
        appServerPurpose: "landing_page",
        databaseLabel: "Landing Page Database",
        dataPurpose: "landing_page_data",
        dataKeyDescription: "Landing page data encryption key",
        logGroupName: "/sketchcatch/practice/landing",
        appCpuAlarmName: "landing-page-high-cpu",
        dbCpuAlarmName: "landing-database-high-cpu",
        uploadBucketLabel: "Landing Upload Bucket",
        uploadBucketPurpose: "landing_uploads",
        staticBucketLabel: "Landing Page Assets Bucket"
      };
    case "api_backend":
      return {
        title: "API Backend Practice Architecture",
        appServerLabel: "API Application Server",
        appServerPurpose: "api_backend",
        databaseLabel: "API Database",
        dataPurpose: "api_data",
        dataKeyDescription: "API data encryption key",
        logGroupName: "/sketchcatch/practice/api",
        appCpuAlarmName: "api-application-high-cpu",
        dbCpuAlarmName: "api-database-high-cpu",
        uploadBucketLabel: "API Object Bucket",
        uploadBucketPurpose: "api_objects",
        staticBucketLabel: "API Web Assets Bucket"
      };
    case "data_storage":
      return {
        title: "Data Storage Practice Architecture",
        appServerLabel: "Data Access Server",
        appServerPurpose: "data_access",
        databaseLabel: "Data Storage Database",
        dataPurpose: "data_storage",
        dataKeyDescription: "Data storage encryption key",
        logGroupName: "/sketchcatch/practice/data-storage",
        appCpuAlarmName: "data-access-high-cpu",
        dbCpuAlarmName: "data-storage-high-cpu",
        uploadBucketLabel: "Data Object Bucket",
        uploadBucketPurpose: "data_objects",
        staticBucketLabel: "Data Portal Assets Bucket"
      };
    case "unknown":
      return {
        title: "Practice Architecture",
        appServerLabel: "Application Server",
        appServerPurpose: "application",
        databaseLabel: "Application Database",
        dataPurpose: "application_data",
        dataKeyDescription: "Practice data storage encryption key",
        logGroupName: "/sketchcatch/practice/application",
        appCpuAlarmName: "application-high-cpu",
        dbCpuAlarmName: "database-high-cpu",
        uploadBucketLabel: "Upload Storage Bucket",
        uploadBucketPurpose: "user_uploads",
        staticBucketLabel: "Static Website Bucket"
      };
  }
}

function isMinimalEc2ApiServer(context: DraftBuildContext): boolean {
  return (
    context.factSet.has("server_runtime") &&
    !context.factSet.has("web_frontend") &&
    !context.factSet.has("static_delivery") &&
    !context.factSet.has("database") &&
    !context.factSet.has("object_storage") &&
    !context.factSet.has("serverless_runtime") &&
    context.operatingProfile.trafficLevel === "small" &&
    context.operatingProfile.securityPriority === "basic"
  );
}

function isMinimalEc2StorageServer(context: DraftBuildContext): boolean {
  return (
    context.factSet.has("server_runtime") &&
    context.factSet.has("object_storage") &&
    !context.factSet.has("web_frontend") &&
    !context.factSet.has("static_delivery") &&
    !context.factSet.has("database") &&
    !context.factSet.has("file_upload") &&
    !context.factSet.has("auth_or_user_data") &&
    !context.factSet.has("iam_permissions") &&
    !context.factSet.has("observability") &&
    !context.factSet.has("serverless_runtime") &&
    context.operatingProfile.trafficLevel === "small" &&
    context.operatingProfile.securityPriority === "basic"
  );
}

function addMinimalEc2ApiServer(context: DraftBuildContext): void {
  addMinimalNetworkBoundary(context);
  const appServerIds = createNumberedIds("app-server", context.resourceQuantities.ec2Instances);

  addNode(context, {
    id: "app-security-group",
    type: "SECURITY_GROUP",
    label: "App Security Group",
    positionX: 220,
    positionY: 520,
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
    positionY: 700,
    config: createAmazonLinuxAmiConfig()
  });

  appServerIds.forEach((appServerId, index) => {
    const position = getRepeatedNodePosition(index, {
      columns: 3,
      startX: appServerIds.length === 1 ? 370 : 300,
      startY: 700,
      xGap: 150,
      yGap: 130
    });

    addNode(context, {
      id: appServerId,
      type: "EC2",
      label: appServerIds.length === 1 ? "Application Server" : `Application Server ${index + 1}`,
      positionX: position.x,
      positionY: position.y,
      config: {
        ami: "data.aws_ami.app_ami.id",
        associatePublicIpAddress: true,
        instanceType: "t3.micro",
        subnetId: "aws_subnet.public_subnet_a.id",
        vpcSecurityGroupIds: ["aws_security_group.app_security_group.id"]
      }
    });
    addEdge(context, `app-ami-to-${appServerId}`, "app-ami", appServerId, "launch image");
    addEdge(context, `public-subnet-a-to-${appServerId}`, "public-subnet-a", appServerId, "hosts public API");
    addEdge(context, `app-security-group-to-${appServerId}`, "app-security-group", appServerId, "allows HTTP");
  });
}

function addMinimalNetworkBoundary(context: DraftBuildContext): void {
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
    id: "public-subnet-a",
    type: "SUBNET",
    label: "Public Subnet A",
    positionX: 150,
    positionY: 520,
    config: {
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: true,
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
    label: "Public Route Association A",
    positionX: 520,
    positionY: 520,
    config: {
      routeTableId: "aws_route_table.public_route_table.id",
      subnetId: "aws_subnet.public_subnet_a.id"
    }
  });
  addEdge(context, "vpc-main-to-public-subnet-a", "vpc-main", "public-subnet-a", "contains");
  addEdge(context, "public-route-table-to-internet-gateway", "public-route-table", "internet-gateway", "routes");
  addEdge(
    context,
    "public-subnet-a-to-public-route-table-association",
    "public-subnet-a",
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

function addStaticWebsiteDelivery(context: DraftBuildContext): void {
  const purposeProfile = getPurposeProfile(context.servicePurpose);

  addCloudFrontPublicEntry(context, "web-assets-bucket");
  addNode(context, {
    id: "web-assets-bucket",
    type: "S3",
    label: purposeProfile.staticBucketLabel,
    positionX: 900,
    positionY: 160,
    config: {
      bucketPurpose: "static_website_origin",
      publicAccessBlock: true,
      servicePurpose: context.servicePurpose
    }
  });
  addNode(context, {
    id: "cloudfront-distribution",
    type: "CLOUDFRONT",
    label: "CloudFront CDN",
    positionX: 620,
    positionY: 160,
    config: {
      originResourceId: "web-assets-bucket"
    }
  });
  addEdge(context, "cloudfront-to-web-assets-bucket", "cloudfront-distribution", "web-assets-bucket", "origin");
}

function addEc2ApplicationRuntime(context: DraftBuildContext): void {
  const purposeProfile = getPurposeProfile(context.servicePurpose);
  const appServerIds = createNumberedIds("app-server", context.resourceQuantities.ec2Instances);

  addNetworkBoundary(context, { appSubnetCount: Math.min(appServerIds.length, 2) });
  addCloudFrontPublicEntry(context, "app-server");

  addNode(context, {
    id: "app-security-group",
    type: "SECURITY_GROUP",
    label: "App Security Group",
    positionX: 220,
    positionY: 460,
    config: {
      vpcId: "aws_vpc.vpc_main.id",
      ingress: [
        {
          protocol: "tcp",
          port: 80,
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
  });
  addNode(context, {
    id: "app-ami",
    type: "AMI",
    label: "Amazon Linux AMI",
    positionX: 430,
    positionY: 460,
    config: createAmazonLinuxAmiConfig()
  });
  addIamRuntimeNodes(context);
  addObservabilityNodes(context);
  appServerIds.forEach((appServerId, index) => {
    const position = getRepeatedNodePosition(index, {
      columns: 3,
      startX: appServerIds.length === 1 ? 430 : 430,
      startY: 620,
      xGap: 180,
      yGap: 130
    });
    const subnetId =
      index % 2 === 0
        ? "aws_subnet.private_app_subnet_a.id"
        : "aws_subnet.private_app_subnet_b.id";
    const subnetNodeId = index % 2 === 0 ? "private-app-subnet-a" : "private-app-subnet-b";

    addNode(context, {
      id: appServerId,
      type: "EC2",
      label: appServerIds.length === 1 ? purposeProfile.appServerLabel : `${purposeProfile.appServerLabel} ${index + 1}`,
      positionX: position.x,
      positionY: position.y,
      config: {
        ami: "data.aws_ami.app_ami.id",
        associatePublicIpAddress: false,
        applicationPurpose: purposeProfile.appServerPurpose,
        iamInstanceProfile: "aws_iam_instance_profile.app_instance_profile.name",
        instanceType: "t3.micro",
        servicePurpose: context.servicePurpose,
        subnetId,
        vpcSecurityGroupIds: ["aws_security_group.app_security_group.id"]
      }
    });
    addEdge(context, `app-ami-to-${appServerId}`, "app-ami", appServerId, "launch image");
    addEdge(context, `app-instance-profile-to-${appServerId}`, "app-instance-profile", appServerId, "attaches role");
    addEdge(context, `${appServerId}-to-app-log-group`, appServerId, "app-log-group", "writes logs");
    addEdge(context, `app-cpu-alarm-to-${appServerId}`, "app-cpu-alarm", appServerId, "monitors CPU");
    addEdge(context, `${subnetNodeId}-to-${appServerId}`, subnetNodeId, appServerId, "hosts private app");
    addEdge(context, `app-security-group-to-${appServerId}`, "app-security-group", appServerId, "allows traffic");
    addEdge(context, `cloudfront-to-${appServerId}`, "cloudfront-distribution", appServerId, "public entry");
  });
}

function addCloudFrontPublicEntry(context: DraftBuildContext, originResourceId: string): void {
  addNode(context, {
    id: "cloudfront-distribution",
    type: "CLOUDFRONT",
    label: "CloudFront Public Entry",
    positionX: 620,
    positionY: 160,
    config: {
      originResourceId
    }
  });
}

function addNetworkBoundary(
  context: DraftBuildContext,
  input: { readonly appSubnetCount: number } = { appSubnetCount: 2 }
): void {
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

  if (input.appSubnetCount >= 1) {
    addNode(context, {
      id: "private-app-subnet-a",
      type: "SUBNET",
      label: "Private App Subnet A",
      positionX: 150,
      positionY: 620,
      config: {
        cidrBlock: "10.0.11.0/24",
        availabilityZone: "ap-northeast-2a",
        mapPublicIpOnLaunch: false,
        vpcId: "aws_vpc.vpc_main.id"
      }
    });
    addEdge(context, "vpc-main-to-private-app-subnet-a", "vpc-main", "private-app-subnet-a", "contains");
  }

  if (input.appSubnetCount >= 2) {
    addNode(context, {
      id: "private-app-subnet-b",
      type: "SUBNET",
      label: "Private App Subnet B",
      positionX: 150,
      positionY: 760,
      config: {
        cidrBlock: "10.0.12.0/24",
        availabilityZone: "ap-northeast-2b",
        mapPublicIpOnLaunch: false,
        vpcId: "aws_vpc.vpc_main.id"
      }
    });
    addEdge(context, "vpc-main-to-private-app-subnet-b", "vpc-main", "private-app-subnet-b", "contains");
  }
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
  addEdge(context, "app-instance-profile-to-app-runtime-role", "app-instance-profile", "app-runtime-role", "uses role");
  addEdge(context, "app-runtime-role-to-app-runtime-policy", "app-runtime-role", "app-runtime-policy", "attaches policy");
}

function addObservabilityNodes(context: DraftBuildContext): void {
  const purposeProfile = getPurposeProfile(context.servicePurpose);

  addNode(context, {
    id: "app-log-group",
    type: "CLOUDWATCH_LOG_GROUP",
    label: "Application Logs",
    positionX: 1110,
    positionY: 520,
    config: {
      name: purposeProfile.logGroupName,
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
      alarmName: purposeProfile.appCpuAlarmName,
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      dimensions: {
        InstanceId: "aws_instance.app_server.id"
      },
      threshold: 80
    })
  });
  addEdge(context, "app-runtime-policy-to-app-log-group", "app-runtime-policy", "app-log-group", "allows log writes");
}

function addDatabase(context: DraftBuildContext): void {
  const purposeProfile = getPurposeProfile(context.servicePurpose);
  const hasServerRuntime = context.factSet.has("server_runtime");
  const hasObservability = context.factSet.has("observability");

  addNetworkBoundary(context, {
    appSubnetCount: hasServerRuntime ? Math.min(context.resourceQuantities.ec2Instances, 2) : 0
  });

  addNode(context, {
    id: "private-db-subnet-a",
    type: "SUBNET",
    label: "Private DB Subnet A",
    positionX: 150,
    positionY: 940,
    config: {
      availabilityZone: "ap-northeast-2a",
      cidrBlock: "10.0.21.0/24",
      mapPublicIpOnLaunch: false,
      vpcId: "aws_vpc.vpc_main.id"
    }
  });
  addNode(context, {
    id: "private-db-subnet-b",
    type: "SUBNET",
    label: "Private DB Subnet B",
    positionX: 370,
    positionY: 940,
    config: {
      availabilityZone: "ap-northeast-2b",
      cidrBlock: "10.0.22.0/24",
      mapPublicIpOnLaunch: false,
      vpcId: "aws_vpc.vpc_main.id"
    }
  });
  addNode(context, {
    id: "db-security-group",
    type: "SECURITY_GROUP",
    label: "Database Security Group",
    positionX: 620,
    positionY: 940,
    config: {
      vpcId: "aws_vpc.vpc_main.id",
      ingress: hasServerRuntime
        ? [
            {
              protocol: "tcp",
              port: 5432,
              securityGroups: ["aws_security_group.app_security_group.id"]
            }
          ]
        : []
    }
  });
  addNode(context, {
    id: "data-encryption-key",
    type: "KMS_KEY",
    label: "Data Encryption Key",
    positionX: 850,
    positionY: 760,
    config: {
      description: purposeProfile.dataKeyDescription,
      enableKeyRotation: true
    }
  });
  if (hasObservability) {
    addNode(context, {
      id: "db-cpu-alarm",
      type: "CLOUDWATCH_METRIC_ALARM",
      label: "Database CPU Alarm",
      positionX: 1110,
      positionY: 940,
      config: createMetricAlarmConfig({
        alarmName: purposeProfile.dbCpuAlarmName,
        namespace: "AWS/RDS",
        metricName: "CPUUtilization",
        dimensions: {
          DBInstanceIdentifier: "aws_db_instance.app_database.id"
        },
        threshold: 80
      })
    });
  }
  addNode(context, {
    id: "app-database",
    type: "RDS",
    label: purposeProfile.databaseLabel,
    positionX: 850,
    positionY: 940,
    config: {
      backupRetentionPeriod: 7,
      backupWindow: "18:00-19:00",
      dataPurpose: purposeProfile.dataPurpose,
      engine: "postgres",
      instanceClass: "db.t4g.micro",
      kmsKeyId: "aws_kms_key.data_encryption_key.arn",
      multiAz: true,
      publiclyAccessible: false,
      servicePurpose: context.servicePurpose,
      skipFinalSnapshot: true,
      storageEncrypted: true,
      subnetIds: ["aws_subnet.private_db_subnet_a.id", "aws_subnet.private_db_subnet_b.id"],
      vpcSecurityGroupIds: ["aws_security_group.db_security_group.id"]
    }
  });
  addEdge(context, "vpc-main-to-private-db-subnet-a", "vpc-main", "private-db-subnet-a", "contains");
  addEdge(context, "vpc-main-to-private-db-subnet-b", "vpc-main", "private-db-subnet-b", "contains");
  addEdge(context, "private-db-subnet-a-to-app-database", "private-db-subnet-a", "app-database", "primary subnet");
  addEdge(context, "private-db-subnet-b-to-app-database", "private-db-subnet-b", "app-database", "standby subnet");
  addEdge(context, "db-security-group-to-app-database", "db-security-group", "app-database", "allows traffic");
  if (hasServerRuntime) {
    addEdge(context, "app-security-group-to-db-security-group", "app-security-group", "db-security-group", "allows PostgreSQL");
  }
  addEdge(context, "data-encryption-key-to-app-database", "data-encryption-key", "app-database", "encrypts storage");
  addEdge(context, "app-runtime-policy-to-data-encryption-key", "app-runtime-policy", "data-encryption-key", "allows key use");
  addEdge(context, "db-cpu-alarm-to-app-database", "db-cpu-alarm", "app-database", "monitors CPU");
}

function addUploadBucket(context: DraftBuildContext): void {
  const purposeProfile = getPurposeProfile(context.servicePurpose);
  const uploadBucketIds = createNumberedIds("upload-bucket", context.resourceQuantities.s3Buckets);

  uploadBucketIds.forEach((uploadBucketId, index) => {
    const position = getRepeatedNodePosition(index, {
      columns: 5,
      startX: 900,
      startY: 160,
      xGap: 180,
      yGap: 130
    });

    addNode(context, {
      id: uploadBucketId,
      type: "S3",
      label: uploadBucketIds.length === 1 ? purposeProfile.uploadBucketLabel : `${purposeProfile.uploadBucketLabel} ${index + 1}`,
      positionX: position.x,
      positionY: position.y,
      config: {
        bucketPurpose: purposeProfile.uploadBucketPurpose,
        publicAccessBlock: true,
        servicePurpose: context.servicePurpose
      }
    });
  });
}

function addPurposeSpecificResources(context: DraftBuildContext): void {
  if (!context.factSet.has("server_runtime")) {
    return;
  }

  switch (context.servicePurpose) {
    case "auth_web_service":
      addPurposeLogGroup(context, {
        id: "auth-audit-log-group",
        label: "Auth Audit Logs",
        name: "/sketchcatch/practice/auth/audit",
        positionX: 900,
        positionY: 680,
        retentionInDays: 30
      });
      return;
    case "reservation_service":
      addPurposeBucket(context, {
        id: "reservation-attachments-bucket",
        label: "Reservation Attachment Bucket",
        bucketPurpose: "reservation_attachments",
        edgeLabel: "stores request attachments",
        positionX: 1110,
        positionY: 160
      });
      return;
    case "content_board":
      addPurposeBucket(context, {
        id: "content-media-bucket",
        label: "Content Media Bucket",
        bucketPurpose: "content_media",
        edgeLabel: "stores post media",
        positionX: 1110,
        positionY: 160
      });
      return;
    case "api_backend":
    case "data_storage":
    case "file_upload_service":
    case "landing_page":
    case "unknown":
      return;
  }
}

function addPurposeLogGroup(
  context: DraftBuildContext,
  input: {
    readonly id: string;
    readonly label: string;
    readonly name: string;
    readonly positionX: number;
    readonly positionY: number;
    readonly retentionInDays: number;
  }
): void {
  addNode(context, {
    id: input.id,
    type: "CLOUDWATCH_LOG_GROUP",
    label: input.label,
    positionX: input.positionX,
    positionY: input.positionY,
    config: {
      name: input.name,
      retentionInDays: input.retentionInDays,
      servicePurpose: context.servicePurpose
    }
  });

  for (const appServerId of getNodeIdsByTypePrefix(context, "EC2", "app-server")) {
    addEdge(context, `${appServerId}-to-${input.id}`, appServerId, input.id, "writes audit events");
  }

  addEdge(context, `app-runtime-policy-to-${input.id}`, "app-runtime-policy", input.id, "allows log writes");
}

function addPurposeBucket(
  context: DraftBuildContext,
  input: {
    readonly id: string;
    readonly label: string;
    readonly bucketPurpose: string;
    readonly edgeLabel: string;
    readonly positionX: number;
    readonly positionY: number;
  }
): void {
  addNode(context, {
    id: input.id,
    type: "S3",
    label: input.label,
    positionX: input.positionX,
    positionY: input.positionY,
    config: {
      bucketPurpose: input.bucketPurpose,
      publicAccessBlock: true,
      servicePurpose: context.servicePurpose
    }
  });

  for (const appServerId of getNodeIdsByTypePrefix(context, "EC2", "app-server")) {
    addEdge(context, `${appServerId}-to-${input.id}`, appServerId, input.id, input.edgeLabel);
  }

  addEdge(context, `app-runtime-policy-to-${input.id}`, "app-runtime-policy", input.id, "allows S3 actions");
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
  const appServerIds = getNodeIdsByTypePrefix(context, "EC2", "app-server");
  const uploadBucketIds = getNodeIdsByTypePrefix(context, "S3", "upload-bucket");

  for (const appServerId of appServerIds) {
    if (hasNode(context, "cloudfront-distribution")) {
      addEdge(context, `cloudfront-to-${appServerId}`, "cloudfront-distribution", appServerId, "public entry");
    }
  }

  for (const appServerId of appServerIds) {
    for (const uploadBucketId of uploadBucketIds) {
      addEdge(context, `${appServerId}-to-${uploadBucketId}`, appServerId, uploadBucketId, "stores files");
      if (hasNode(context, "app-runtime-policy")) {
        addEdge(context, `app-runtime-policy-to-${uploadBucketId}`, "app-runtime-policy", uploadBucketId, "allows S3 actions");
      }
    }
  }

  for (const appServerId of appServerIds) {
    if (hasNode(context, "app-database")) {
      addEdge(context, `${appServerId}-to-app-database`, appServerId, "app-database", "reads/writes");
    }
  }

  if (hasNode(context, "lambda-function")) {
    for (const uploadBucketId of uploadBucketIds) {
      addEdge(context, `lambda-function-to-${uploadBucketId}`, "lambda-function", uploadBucketId, "stores files");
    }
  }
}

function needsUploadBucket(factSet: ReadonlySet<ArchitectureRequirementFact>): boolean {
  return (
    factSet.has("object_storage") &&
    (!factSet.has("static_delivery") || factSet.has("file_upload"))
  );
}

function createDraftTitle(context: DraftBuildContext): string {
  const factSet = context.factSet;

  if (
    context.servicePurpose === "auth_web_service" ||
    context.servicePurpose === "reservation_service" ||
    context.servicePurpose === "content_board" ||
    context.servicePurpose === "file_upload_service"
  ) {
    return getPurposeProfile(context.servicePurpose).title;
  }

  if (factSet.has("serverless_runtime")) {
    return "Lambda 함수 Practice Architecture";
  }

  if (factSet.has("database")) {
    return "DB 포함 백엔드 Practice Architecture";
  }

  if (factSet.has("web_frontend") && factSet.has("server_runtime")) {
    return "웹서비스 Practice Architecture";
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

function createDraftAssumptions(
  requirementFacts: readonly ArchitectureRequirementFact[],
  resourceQuantities: ArchitectureResourceQuantities
): string[] {
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

  if (resourceQuantities.ec2Instances > 1) {
    assumptions.push(`요청한 수량에 맞춰 EC2 실행 공간 ${resourceQuantities.ec2Instances}개를 초안에 포함했습니다.`);
  }

  if (resourceQuantities.s3Buckets > 1 && factSet.has("object_storage")) {
    assumptions.push(`요청한 수량에 맞춰 S3 저장 공간 ${resourceQuantities.s3Buckets}개를 초안에 포함했습니다.`);
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

function createNumberedIds(baseId: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => (index === 0 ? baseId : `${baseId}-${index + 1}`));
}

function getRepeatedNodePosition(
  index: number,
  layout: {
    readonly columns: number;
    readonly startX: number;
    readonly startY: number;
    readonly xGap: number;
    readonly yGap: number;
  }
): { readonly x: number; readonly y: number } {
  return {
    x: layout.startX + (index % layout.columns) * layout.xGap,
    y: layout.startY + Math.floor(index / layout.columns) * layout.yGap
  };
}

function getNodeIdsByTypePrefix(context: DraftBuildContext, type: string, idPrefix: string): string[] {
  return context.nodes
    .filter((node) => node.type === type && (node.id === idPrefix || node.id.startsWith(`${idPrefix}-`)))
    .map((node) => node.id);
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
