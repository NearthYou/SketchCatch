import { createHash } from "node:crypto";

export type AwsImportReader<ServiceKey extends string = string> = {
  serviceKey: ServiceKey;
  displayName: string;
  tier: "core" | "expanded";
  actions: readonly string[];
};

export type AwsImportReadPolicyDocument = {
  Version: "2012-10-17";
  Statement: [
    {
      Sid: "ReadImportedArchitecture";
      Effect: "Allow";
      Action: readonly string[];
      Resource: "*";
    }
  ];
};

export const AWS_IMPORT_READERS = [
  {
    serviceKey: "ec2",
    displayName: "EC2 네트워크와 컴퓨팅",
    tier: "core",
    actions: [
      "ec2:DescribeVpcs",
      "ec2:DescribeSubnets",
      "ec2:DescribeInternetGateways",
      "ec2:DescribeRouteTables",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeInstances",
      "ec2:DescribeAddresses",
      "ec2:DescribeNatGateways"
    ]
  },
  {
    serviceKey: "s3",
    displayName: "S3",
    tier: "core",
    actions: [
      "s3:ListAllMyBuckets",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetEncryptionConfiguration",
      "s3:GetBucketWebsite",
      "s3:GetBucketTagging",
      "s3:GetBucketPolicyStatus"
    ]
  },
  {
    serviceKey: "rds",
    displayName: "RDS",
    tier: "core",
    actions: ["rds:DescribeDBInstances"]
  },
  {
    serviceKey: "elbv2",
    displayName: "Load Balancer",
    tier: "core",
    actions: [
      "elasticloadbalancing:DescribeLoadBalancers",
      "elasticloadbalancing:DescribeLoadBalancerAttributes",
      "elasticloadbalancing:DescribeTargetGroups",
      "elasticloadbalancing:DescribeTargetGroupAttributes",
      "elasticloadbalancing:DescribeListeners",
      "elasticloadbalancing:DescribeListenerAttributes",
      "elasticloadbalancing:DescribeListenerCertificates",
      "elasticloadbalancing:DescribeTags"
    ]
  },
  {
    serviceKey: "ecs",
    displayName: "ECS",
    tier: "core",
    actions: [
      "ecs:ListClusters",
      "ecs:DescribeClusters",
      "ecs:ListServices",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition"
    ]
  },
  {
    serviceKey: "cloudfront",
    displayName: "CloudFront",
    tier: "core",
    actions: [
      "cloudfront:ListDistributions",
      "cloudfront:ListTagsForResource",
      "cloudfront:ListOriginAccessControls",
      "cloudfront:GetOriginAccessControl"
    ]
  },
  {
    serviceKey: "ecr",
    displayName: "ECR",
    tier: "expanded",
    actions: ["ecr:DescribeRepositories", "ecr:ListTagsForResource"]
  },
  {
    serviceKey: "secretsmanager",
    displayName: "Secrets Manager",
    tier: "expanded",
    actions: ["secretsmanager:ListSecrets", "secretsmanager:DescribeSecret"]
  },
  {
    serviceKey: "application-autoscaling",
    displayName: "Application Auto Scaling",
    tier: "expanded",
    actions: [
      "application-autoscaling:DescribeScalableTargets",
      "application-autoscaling:DescribeScalingPolicies",
      "application-autoscaling:ListTagsForResource"
    ]
  },
  {
    serviceKey: "resource-explorer",
    displayName: "Resource Explorer",
    tier: "expanded",
    actions: [
      "resource-explorer-2:GetDefaultView",
      "resource-explorer-2:GetView",
      "resource-explorer-2:Search"
    ]
  },
  {
    serviceKey: "tagging",
    displayName: "Resource Groups Tagging API",
    tier: "expanded",
    actions: ["tag:GetResources"]
  },
  {
    serviceKey: "iam",
    displayName: "IAM",
    tier: "expanded",
    actions: [
      "iam:ListRoles",
      "iam:GetRole",
      "iam:ListRoleTags",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:GetRolePolicy",
      "iam:ListPolicies",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyTags",
      "iam:ListInstanceProfiles",
      "iam:GetInstanceProfile",
      "iam:ListInstanceProfileTags"
    ]
  },
  {
    serviceKey: "kms",
    displayName: "KMS",
    tier: "expanded",
    actions: [
      "kms:ListKeys",
      "kms:DescribeKey",
      "kms:GetKeyPolicy",
      "kms:GetKeyRotationStatus",
      "kms:ListGrants",
      "kms:ListResourceTags",
      "kms:ListAliases"
    ]
  },
  {
    serviceKey: "logs",
    displayName: "CloudWatch Logs",
    tier: "expanded",
    actions: ["logs:DescribeLogGroups", "logs:ListTagsForResource"]
  },
  {
    serviceKey: "cloudwatch",
    displayName: "CloudWatch",
    tier: "expanded",
    actions: ["cloudwatch:DescribeAlarms", "cloudwatch:ListTagsForResource"]
  },
  {
    serviceKey: "apigateway",
    displayName: "API Gateway",
    tier: "expanded",
    actions: ["apigateway:GET"]
  },
  {
    serviceKey: "lambda",
    displayName: "Lambda",
    tier: "expanded",
    actions: [
      "lambda:ListFunctions",
      "lambda:GetFunction",
      "lambda:GetFunctionConcurrency",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:GetPolicy",
      "lambda:ListTags",
      "lambda:ListAliases",
      "lambda:ListVersionsByFunction"
    ]
  },
  {
    serviceKey: "eventbridge",
    displayName: "EventBridge",
    tier: "expanded",
    actions: [
      "events:ListEventBuses",
      "events:ListRules",
      "events:ListTargetsByRule",
      "events:ListTagsForResource"
    ]
  },
  {
    serviceKey: "ami",
    displayName: "AMI",
    tier: "expanded",
    actions: ["ec2:DescribeImages"]
  }
] as const satisfies readonly AwsImportReader[];

export type AwsImportServiceKey = (typeof AWS_IMPORT_READERS)[number]["serviceKey"];

/** gg: 실제 reader와 probe가 공유할 목록에서 읽기 Policy를 한 번만 만듭니다. */
export function createAwsImportReadPolicyDocument(): AwsImportReadPolicyDocument {
  const actions = [...new Set(AWS_IMPORT_READERS.flatMap((reader) => reader.actions))].sort();

  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ReadImportedArchitecture",
        Effect: "Allow",
        Action: actions,
        Resource: "*"
      }
    ]
  };
}

/** gg: 승인과 사후 검증이 같은 읽기 Policy 내용을 가리키도록 식별값을 고정합니다. */
export function getAwsImportPolicyFingerprint(): string {
  return createHash("sha256")
    .update(JSON.stringify(createAwsImportReadPolicyDocument()))
    .digest("hex");
}
