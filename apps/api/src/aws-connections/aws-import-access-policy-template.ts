import { createHash } from "node:crypto";
import {
  createAwsImportTemplateObjectKey,
  createAwsImportTemplateUrl
} from "./aws-connection-template-storage.js";
import {
  createAwsImportReadPolicyDocument,
  getAwsImportPolicyFingerprint
} from "./aws-import-access-catalog.js";

export const AWS_IMPORT_POLICY_CONTRACT_VERSION = "4";

export type AwsImportIssuedPolicyActionRegistry = Readonly<
  Record<string, readonly string[]>
>;

/** gg: 이미 발급한 Policy contract별 exact action set만 수동으로 보존합니다. */
export const AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION = {
  "1": [
    "apigateway:GET",
    "cloudfront:ListDistributions",
    "cloudwatch:DescribeAlarms",
    "ec2:DescribeImages",
    "ec2:DescribeInstances",
    "ec2:DescribeInternetGateways",
    "ec2:DescribeRouteTables",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeSubnets",
    "ec2:DescribeVpcs",
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:DescribeTaskDefinition",
    "ecs:ListClusters",
    "ecs:ListServices",
    "elasticloadbalancing:DescribeLoadBalancers",
    "iam:ListInstanceProfiles",
    "iam:ListPolicies",
    "iam:ListRoles",
    "kms:DescribeKey",
    "kms:ListKeys",
    "lambda:GetPolicy",
    "lambda:ListFunctions",
    "logs:DescribeLogGroups",
    "rds:DescribeDBInstances",
    "resource-explorer-2:GetDefaultView",
    "resource-explorer-2:GetView",
    "resource-explorer-2:Search",
    "s3:GetBucketLocation",
    "s3:GetBucketPolicyStatus",
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketTagging",
    "s3:GetBucketVersioning",
    "s3:GetBucketWebsite",
    "s3:GetEncryptionConfiguration",
    "s3:ListAllMyBuckets",
    "tag:GetResources"
  ],
  "2": [
    "apigateway:GET",
    "cloudfront:ListDistributions",
    "cloudwatch:DescribeAlarms",
    "ec2:DescribeImages",
    "ec2:DescribeInstances",
    "ec2:DescribeInternetGateways",
    "ec2:DescribeRouteTables",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeSubnets",
    "ec2:DescribeVpcs",
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:DescribeTaskDefinition",
    "ecs:ListClusters",
    "ecs:ListServices",
    "elasticloadbalancing:DescribeLoadBalancers",
    "events:ListRules",
    "events:ListTargetsByRule",
    "iam:ListInstanceProfiles",
    "iam:ListPolicies",
    "iam:ListRoles",
    "kms:DescribeKey",
    "kms:ListKeys",
    "lambda:GetPolicy",
    "lambda:ListFunctions",
    "logs:DescribeLogGroups",
    "rds:DescribeDBInstances",
    "resource-explorer-2:GetDefaultView",
    "resource-explorer-2:GetView",
    "resource-explorer-2:Search",
    "s3:GetBucketLocation",
    "s3:GetBucketPolicyStatus",
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketTagging",
    "s3:GetBucketVersioning",
    "s3:GetBucketWebsite",
    "s3:GetEncryptionConfiguration",
    "s3:ListAllMyBuckets",
    "tag:GetResources"
  ],
  "3": [
    "apigateway:GET",
    "application-autoscaling:DescribeScalableTargets",
    "application-autoscaling:DescribeScalingPolicies",
    "cloudfront:GetOriginAccessControl",
    "cloudfront:ListDistributions",
    "cloudfront:ListOriginAccessControls",
    "cloudwatch:DescribeAlarms",
    "ec2:DescribeAddresses",
    "ec2:DescribeImages",
    "ec2:DescribeInstances",
    "ec2:DescribeInternetGateways",
    "ec2:DescribeNatGateways",
    "ec2:DescribeRouteTables",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeSubnets",
    "ec2:DescribeVpcs",
    "ecr:DescribeRepositories",
    "ecr:ListTagsForResource",
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:DescribeTaskDefinition",
    "ecs:ListClusters",
    "ecs:ListServices",
    "elasticloadbalancing:DescribeListeners",
    "elasticloadbalancing:DescribeLoadBalancers",
    "elasticloadbalancing:DescribeTargetGroups",
    "events:ListRules",
    "events:ListTagsForResource",
    "events:ListTargetsByRule",
    "iam:ListInstanceProfiles",
    "iam:ListPolicies",
    "iam:ListRoles",
    "kms:DescribeKey",
    "kms:ListKeys",
    "lambda:GetPolicy",
    "lambda:ListFunctions",
    "logs:DescribeLogGroups",
    "rds:DescribeDBInstances",
    "resource-explorer-2:GetDefaultView",
    "resource-explorer-2:GetView",
    "resource-explorer-2:Search",
    "s3:GetBucketLocation",
    "s3:GetBucketPolicyStatus",
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketTagging",
    "s3:GetBucketVersioning",
    "s3:GetBucketWebsite",
    "s3:GetEncryptionConfiguration",
    "s3:ListAllMyBuckets",
    "secretsmanager:DescribeSecret",
    "secretsmanager:ListSecrets",
    "tag:GetResources"
  ],
  "4": [
    "apigateway:GET",
    "application-autoscaling:DescribeScalableTargets",
    "application-autoscaling:DescribeScalingPolicies",
    "cloudfront:GetOriginAccessControl",
    "cloudfront:ListDistributions",
    "cloudfront:ListOriginAccessControls",
    "cloudwatch:DescribeAlarms",
    "ec2:DescribeAddresses",
    "ec2:DescribeImages",
    "ec2:DescribeInstances",
    "ec2:DescribeInternetGateways",
    "ec2:DescribeNatGateways",
    "ec2:DescribeRouteTables",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeSubnets",
    "ec2:DescribeVpcs",
    "ecr:DescribeRepositories",
    "ecr:ListTagsForResource",
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:DescribeTaskDefinition",
    "ecs:ListClusters",
    "ecs:ListServices",
    "elasticloadbalancing:DescribeListeners",
    "elasticloadbalancing:DescribeLoadBalancers",
    "elasticloadbalancing:DescribeTargetGroups",
    "events:ListEventBuses",
    "events:ListRules",
    "events:ListTagsForResource",
    "events:ListTargetsByRule",
    "iam:ListInstanceProfiles",
    "iam:ListPolicies",
    "iam:ListRoles",
    "kms:DescribeKey",
    "kms:ListKeys",
    "lambda:GetPolicy",
    "lambda:ListFunctions",
    "logs:DescribeLogGroups",
    "rds:DescribeDBInstances",
    "resource-explorer-2:GetDefaultView",
    "resource-explorer-2:GetView",
    "resource-explorer-2:Search",
    "s3:GetBucketLocation",
    "s3:GetBucketPolicyStatus",
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketTagging",
    "s3:GetBucketVersioning",
    "s3:GetBucketWebsite",
    "s3:GetEncryptionConfiguration",
    "s3:ListAllMyBuckets",
    "secretsmanager:DescribeSecret",
    "secretsmanager:ListSecrets",
    "tag:GetResources"
  ]
} as const satisfies AwsImportIssuedPolicyActionRegistry;

export type AwsImportPolicyContractInput = {
  connectionId: string;
  accountId: string;
  region: string;
  targetRoleArn: string;
  templateBucketName: string;
  templateStorageRegion?: string;
};

export type AwsImportPolicyContract = {
  contractVersion: string;
  connectionId: string;
  connectionToken: string;
  accountId: string;
  region: string;
  templateStorageRegion: string;
  targetRoleArn: string;
  targetRoleName: string;
  stackName: string;
  stackArn: string;
  managedPolicyName: string;
  managedPolicyArn: string;
  policyFingerprint: string;
  templateBody: string;
  templateSha256: string;
  templateObjectKey: string;
  templateBaseUrl: string;
  postVerification: {
    connectionId: string;
    contractVersion: string;
    stackName: string;
    stackArn: string;
    managedPolicyArn: string;
    targetRoleArn: string;
    policyFingerprint: string;
    templateSha256: string;
  };
};

/** gg: Policy Stack은 기존 Role에 연결할 읽기 Managed Policy 하나만 결정적으로 만듭니다. */
export function createAwsImportPolicyContract(
  input: AwsImportPolicyContractInput
): AwsImportPolicyContract {
  const templateStorageRegion = input.templateStorageRegion ?? input.region;
  const targetRoleName = getValidatedTargetRoleName(input);
  const connectionToken = createConnectionToken(input.connectionId);
  const stackName = `sketchcatch-import-${connectionToken}-policy`;
  const stackArn = createStackArn(input.region, input.accountId, stackName);
  const managedPolicyName = `SketchCatchImportRead-${connectionToken}`;
  const managedPolicyArn = `arn:aws:iam::${input.accountId}:policy/${managedPolicyName}`;
  const policyDocument = createAwsImportReadPolicyDocument();
  const policyFingerprint = getAwsImportPolicyFingerprint();
  const templateBody = JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "SketchCatch connection-scoped import read access",
    Resources: {
      ImportReadManagedPolicy: {
        Type: "AWS::IAM::ManagedPolicy",
        Properties: {
          ManagedPolicyName: managedPolicyName,
          Description: "Read-only access used to import an existing AWS architecture",
          PolicyDocument: policyDocument,
          Roles: [targetRoleName]
        }
      }
    },
    Outputs: {
      SketchCatchConnectionId: { Value: input.connectionId },
      TemplateContractVersion: { Value: AWS_IMPORT_POLICY_CONTRACT_VERSION },
      TargetRoleArn: { Value: input.targetRoleArn },
      ReadManagedPolicyArn: { Value: managedPolicyArn },
      PolicyFingerprint: { Value: policyFingerprint }
    }
  });
  const templateSha256 = sha256(templateBody);
  const templateObjectKey = createAwsImportTemplateObjectKey({
    connectionId: input.connectionId,
    kind: "policy",
    contractVersion: AWS_IMPORT_POLICY_CONTRACT_VERSION,
    sha256: templateSha256
  });
  const templateBaseUrl = createAwsImportTemplateUrl({
    bucketName: input.templateBucketName,
    region: templateStorageRegion,
    objectKey: templateObjectKey
  });

  return {
    contractVersion: AWS_IMPORT_POLICY_CONTRACT_VERSION,
    connectionId: input.connectionId,
    connectionToken,
    accountId: input.accountId,
    region: input.region,
    templateStorageRegion,
    targetRoleArn: input.targetRoleArn,
    targetRoleName,
    stackName,
    stackArn,
    managedPolicyName,
    managedPolicyArn,
    policyFingerprint,
    templateBody,
    templateSha256,
    templateObjectKey,
    templateBaseUrl,
    postVerification: {
      connectionId: input.connectionId,
      contractVersion: AWS_IMPORT_POLICY_CONTRACT_VERSION,
      stackName,
      stackArn,
      managedPolicyArn,
      targetRoleArn: input.targetRoleArn,
      policyFingerprint,
      templateSha256
    }
  };
}

/** gg: 허용된 기존 연결 Role과 account가 일치하는지 Template 생성 전에 확인합니다. */
function getValidatedTargetRoleName(input: AwsImportPolicyContractInput): string {
  if (!/^\d{12}$/u.test(input.accountId)) {
    throw new Error("AWS import access account ID must be 12 digits");
  }

  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u.test(input.region)) {
    throw new Error("AWS import access region is invalid");
  }

  const match = /^arn:aws:iam::(\d{12}):role\/(SketchCatchTerraformExecutionRole(?:-[a-z0-9]{8})?)$/u.exec(
    input.targetRoleArn
  );

  if (!match || match[1] !== input.accountId) {
    throw new Error("AWS import access target Role is invalid");
  }

  const targetRoleName = match[2]!;
  const expectedSuffix = input.connectionId.toLowerCase().replace(/[^a-z0-9]/gu, "").slice(0, 8);

  if (
    targetRoleName !== "SketchCatchTerraformExecutionRole" &&
    targetRoleName !== `SketchCatchTerraformExecutionRole-${expectedSuffix}`
  ) {
    throw new Error("AWS import access target Role does not belong to the connection");
  }

  return targetRoleName;
}

/** gg: AWS 이름에 안전한 고정 길이 token으로 연결별 Resource 이름을 분리합니다. */
function createConnectionToken(connectionId: string): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(connectionId)) {
    throw new Error("AWS import access connection ID is invalid");
  }

  return sha256(connectionId).slice(0, 16);
}

/** gg: CloudFormation 권한의 Resource가 정확한 connection Stack만 가리키게 합니다. */
function createStackArn(region: string, accountId: string, stackName: string): string {
  return `arn:aws:cloudformation:${region}:${accountId}:stack/${stackName}/*`;
}

/** gg: Template과 Policy 식별값에 같은 SHA-256 표현을 사용합니다. */
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
