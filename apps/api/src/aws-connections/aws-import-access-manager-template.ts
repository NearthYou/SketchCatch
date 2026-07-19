import { createHash } from "node:crypto";
import type { CreateStackInput, UpdateStackInput } from "@aws-sdk/client-cloudformation";
import {
  assertAwsImportPublishedTemplateMatches,
  createAwsImportTemplateObjectKey,
  createAwsImportTemplateUrl,
  getAwsImportPresignedTemplateUrlPatterns,
  type AwsImportPublishedTemplate,
  type AwsImportTemplateValidationOptions
} from "./aws-connection-template-storage.js";
import {
  createAwsImportPolicyContract,
  type AwsImportPolicyContractInput
} from "./aws-import-access-policy-template.js";

export const AWS_IMPORT_MANAGER_CONTRACT_VERSION = "1";
export const AWS_IMPORT_CONNECTION_TAG_KEY = "SketchCatchConnectionId";
export const AWS_IMPORT_CONTRACT_VERSION_TAG_KEY = "SketchCatchImportContractVersion";

type IamPolicyDocument = {
  Version: "2012-10-17";
  Statement: Array<{
    Sid: string;
    Effect: "Allow";
    Action: string[];
    Resource: string | string[];
    Condition?: Record<string, Record<string, string | string[]>>;
  }>;
};

export type AwsImportManagerContract = {
  contractVersion: string;
  connectionId: string;
  accountId: string;
  region: string;
  targetRoleArn: string;
  targetRoleName: string;
  managerStackName: string;
  managerStackArn: string;
  policyStackName: string;
  policyStackArn: string;
  serviceRoleName: string;
  serviceRoleArn: string;
  serviceRoleInlinePolicyName: string;
  controlPolicyName: string;
  controlPolicyArn: string;
  cleanupVerificationPolicyName: string;
  cleanupVerificationPolicyArn: string;
  readManagedPolicyName: string;
  readManagedPolicyArn: string;
  ownershipTags: Array<{ Key: string; Value: string }>;
  policyFingerprint: string;
  policyContractVersion: string;
  policyTemplateBody: string;
  policyTemplateSha256: string;
  policyTemplateObjectKey: string;
  policyTemplateBaseUrl: string;
  policyTemplateUrlPatterns: string[];
  controlPolicyDocument: IamPolicyDocument;
  cleanupVerificationPolicyDocument: IamPolicyDocument;
  serviceRolePolicyDocument: IamPolicyDocument;
  templateBody: string;
  templateSha256: string;
  templateObjectKey: string;
  templateBaseUrl: string;
  postVerification: {
    connectionId: string;
    contractVersion: string;
    managerStackName: string;
    managerStackArn: string;
    policyStackName: string;
    policyStackArn: string;
    targetRoleArn: string;
    serviceRoleArn: string;
    controlPolicyArn: string;
    cleanupVerificationPolicyArn: string;
    readManagedPolicyArn: string;
    policyFingerprint: string;
    managerTemplateSha256: string;
    policyTemplateSha256: string;
  };
};

/** gg: Manager Stack을 connection 하나의 Role·Stack pair·immutable Policy Template에 고정합니다. */
export function createAwsImportManagerContract(
  input: AwsImportPolicyContractInput
): AwsImportManagerContract {
  const policy = createAwsImportPolicyContract(input);
  const managerStackName = `sketchcatch-import-${policy.connectionToken}-manager`;
  const managerStackArn = createStackArn(input.region, input.accountId, managerStackName);
  const serviceRoleName = `SketchCatchImportCfn-${policy.connectionToken}`;
  const serviceRoleArn = `arn:aws:iam::${input.accountId}:role/${serviceRoleName}`;
  const serviceRoleInlinePolicyName = `SketchCatchImportPolicyLifecycle-${policy.connectionToken}`;
  const controlPolicyName = `SketchCatchImportControl-${policy.connectionToken}`;
  const controlPolicyArn = `arn:aws:iam::${input.accountId}:policy/${controlPolicyName}`;
  const cleanupVerificationPolicyName = `SketchCatchImportCleanup-${policy.connectionToken}`;
  const cleanupVerificationPolicyArn =
    `arn:aws:iam::${input.accountId}:policy/${cleanupVerificationPolicyName}`;
  const ownershipTags = [
    { Key: AWS_IMPORT_CONNECTION_TAG_KEY, Value: input.connectionId },
    { Key: AWS_IMPORT_CONTRACT_VERSION_TAG_KEY, Value: policy.contractVersion }
  ];
  const controlPolicyDocument = createControlPolicyDocument({
    policyStackArn: policy.stackArn,
    policyTemplateUrlPatterns: getAwsImportPresignedTemplateUrlPatterns(policy.templateBaseUrl),
    serviceRoleArn,
    connectionId: input.connectionId,
    policyContractVersion: policy.contractVersion
  });
  const serviceRolePolicyDocument = createServiceRolePolicyDocument({
    readManagedPolicyArn: policy.managedPolicyArn,
    targetRoleArn: policy.targetRoleArn
  });
  const cleanupVerificationPolicyDocument = createCleanupVerificationPolicyDocument({
    managerStackArn,
    policyStackArn: policy.stackArn,
    serviceRoleArn,
    targetRoleArn: policy.targetRoleArn,
    ownedPolicyArns: [controlPolicyArn, cleanupVerificationPolicyArn, policy.managedPolicyArn]
  });
  const templateBody = JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "SketchCatch connection-scoped import access manager",
    Resources: {
      CleanupVerificationPolicy: {
        Type: "AWS::IAM::ManagedPolicy",
        Properties: {
          ManagedPolicyName: cleanupVerificationPolicyName,
          Description: "Read-only verification for connection-scoped import access cleanup",
          PolicyDocument: cleanupVerificationPolicyDocument,
          Roles: [policy.targetRoleName]
        }
      },
      CloudFormationServiceRole: {
        Type: "AWS::IAM::Role",
        DependsOn: "CleanupVerificationPolicy",
        Properties: {
          RoleName: serviceRoleName,
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "cloudformation.amazonaws.com" },
                Action: "sts:AssumeRole"
              }
            ]
          },
          Policies: [
            {
              PolicyName: serviceRoleInlinePolicyName,
              PolicyDocument: serviceRolePolicyDocument
            }
          ],
          Tags: ownershipTags
        }
      },
      PolicyStackControlPolicy: {
        Type: "AWS::IAM::ManagedPolicy",
        DependsOn: "CleanupVerificationPolicy",
        Properties: {
          ManagedPolicyName: controlPolicyName,
          Description: "Controls only this connection's import read Policy Stack",
          PolicyDocument: controlPolicyDocument,
          Roles: [policy.targetRoleName]
        }
      }
    },
    Outputs: {
      SketchCatchConnectionId: { Value: input.connectionId },
      TemplateContractVersion: { Value: AWS_IMPORT_MANAGER_CONTRACT_VERSION },
      TargetRoleArn: { Value: policy.targetRoleArn },
      CloudFormationServiceRoleArn: { Value: serviceRoleArn },
      PolicyStackName: { Value: policy.stackName },
      PolicyStackArnPattern: { Value: policy.stackArn },
      PolicyTemplateSha256: { Value: policy.templateSha256 },
      PolicyFingerprint: { Value: policy.policyFingerprint },
      ControlPolicyArn: { Value: controlPolicyArn },
      CleanupVerificationPolicyArn: { Value: cleanupVerificationPolicyArn }
    }
  });
  const templateSha256 = sha256(templateBody);
  const templateObjectKey = createAwsImportTemplateObjectKey({
    connectionId: input.connectionId,
    kind: "manager",
    contractVersion: AWS_IMPORT_MANAGER_CONTRACT_VERSION,
    sha256: templateSha256
  });
  const templateBaseUrl = createAwsImportTemplateUrl({
    bucketName: input.templateBucketName,
    region: input.region,
    objectKey: templateObjectKey
  });

  return {
    contractVersion: AWS_IMPORT_MANAGER_CONTRACT_VERSION,
    connectionId: input.connectionId,
    accountId: input.accountId,
    region: input.region,
    targetRoleArn: policy.targetRoleArn,
    targetRoleName: policy.targetRoleName,
    managerStackName,
    managerStackArn,
    policyStackName: policy.stackName,
    policyStackArn: policy.stackArn,
    serviceRoleName,
    serviceRoleArn,
    serviceRoleInlinePolicyName,
    controlPolicyName,
    controlPolicyArn,
    cleanupVerificationPolicyName,
    cleanupVerificationPolicyArn,
    readManagedPolicyName: policy.managedPolicyName,
    readManagedPolicyArn: policy.managedPolicyArn,
    ownershipTags,
    policyFingerprint: policy.policyFingerprint,
    policyContractVersion: policy.contractVersion,
    policyTemplateBody: policy.templateBody,
    policyTemplateSha256: policy.templateSha256,
    policyTemplateObjectKey: policy.templateObjectKey,
    policyTemplateBaseUrl: policy.templateBaseUrl,
    policyTemplateUrlPatterns: getAwsImportPresignedTemplateUrlPatterns(policy.templateBaseUrl),
    controlPolicyDocument,
    cleanupVerificationPolicyDocument,
    serviceRolePolicyDocument,
    templateBody,
    templateSha256,
    templateObjectKey,
    templateBaseUrl,
    postVerification: {
      connectionId: input.connectionId,
      contractVersion: AWS_IMPORT_MANAGER_CONTRACT_VERSION,
      managerStackName,
      managerStackArn,
      policyStackName: policy.stackName,
      policyStackArn: policy.stackArn,
      targetRoleArn: policy.targetRoleArn,
      serviceRoleArn,
      controlPolicyArn,
      cleanupVerificationPolicyArn,
      readManagedPolicyArn: policy.managedPolicyArn,
      policyFingerprint: policy.policyFingerprint,
      managerTemplateSha256: templateSha256,
      policyTemplateSha256: policy.templateSha256
    }
  };
}

/** gg: Policy Stack 최초 생성은 고정 URL·Role·tag와 IAM capability만 전달합니다. */
export function createAwsImportPolicyStackCreateInput(
  contract: AwsImportManagerContract,
  publishedPolicyTemplate: AwsImportPublishedTemplate,
  validationOptions: AwsImportTemplateValidationOptions = {},
  clientRequestToken?: string
): CreateStackInput {
  assertPublishedPolicyTemplate(contract, publishedPolicyTemplate, validationOptions);
  assertClientRequestToken(clientRequestToken);

  return {
    StackName: contract.policyStackName,
    TemplateURL: publishedPolicyTemplate.templateUrl,
    RoleARN: contract.serviceRoleArn,
    Capabilities: ["CAPABILITY_NAMED_IAM"],
    Tags: contract.ownershipTags.map((tag) => ({ ...tag })),
    ...(clientRequestToken ? { ClientRequestToken: clientRequestToken } : {})
  };
}

/** gg: Policy Stack 갱신도 TemplateBody나 ResourceTypes 우회 없이 같은 제한값만 사용합니다. */
export function createAwsImportPolicyStackUpdateInput(
  contract: AwsImportManagerContract,
  publishedPolicyTemplate: AwsImportPublishedTemplate,
  validationOptions: AwsImportTemplateValidationOptions = {},
  clientRequestToken?: string,
  expectedStackId?: string
): UpdateStackInput {
  assertPublishedPolicyTemplate(contract, publishedPolicyTemplate, validationOptions);
  assertClientRequestToken(clientRequestToken);
  assertExpectedPolicyStackId(contract, expectedStackId);

  return {
    StackName: expectedStackId ?? contract.policyStackName,
    TemplateURL: publishedPolicyTemplate.templateUrl,
    RoleARN: contract.serviceRoleArn,
    Capabilities: ["CAPABILITY_NAMED_IAM"],
    Tags: contract.ownershipTags.map((tag) => ({ ...tag })),
    ...(clientRequestToken ? { ClientRequestToken: clientRequestToken } : {})
  };
}

/** gg: 갱신은 preview에서 승인한 exact Stack ARN만 대상으로 삼습니다. */
function assertExpectedPolicyStackId(
  contract: AwsImportManagerContract,
  expectedStackId: string | undefined
): void {
  if (expectedStackId === undefined) return;
  const prefix = contract.policyStackArn.slice(0, -1);
  if (!expectedStackId.startsWith(prefix) || expectedStackId.length <= prefix.length) {
    throw new Error("AWS import Policy Stack identity is invalid");
  }
}

/** gg: AWS 중복 방지 token도 서버가 만든 operation UUID만 허용합니다. */
function assertClientRequestToken(clientRequestToken: string | undefined): void {
  if (
    clientRequestToken !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      clientRequestToken
    )
  ) {
    throw new Error("AWS import operation ID is invalid");
  }
}

/** gg: 기존 Role이 자기 Policy Stack만 생성·갱신하고 정확한 service Role만 전달하게 합니다. */
function createControlPolicyDocument(input: {
  policyStackArn: string;
  policyTemplateUrlPatterns: string[];
  serviceRoleArn: string;
  connectionId: string;
  policyContractVersion: string;
}): IamPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ManageExactPolicyStack",
        Effect: "Allow",
        Action: ["cloudformation:CreateStack", "cloudformation:UpdateStack"],
        Resource: input.policyStackArn,
        Condition: {
          StringEquals: {
            "cloudformation:RoleArn": input.serviceRoleArn,
            [`aws:RequestTag/${AWS_IMPORT_CONNECTION_TAG_KEY}`]: input.connectionId,
            [`aws:RequestTag/${AWS_IMPORT_CONTRACT_VERSION_TAG_KEY}`]:
              input.policyContractVersion
          },
          "ForAllValues:StringEquals": {
            "aws:TagKeys": [AWS_IMPORT_CONNECTION_TAG_KEY, AWS_IMPORT_CONTRACT_VERSION_TAG_KEY]
          },
          StringLike: {
            "cloudformation:TemplateUrl": input.policyTemplateUrlPatterns
          }
        }
      },
      {
        Sid: "ReadExactPolicyStack",
        Effect: "Allow",
        Action: [
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackEvents",
          "cloudformation:GetTemplate",
          "cloudformation:ListStackResources"
        ],
        Resource: input.policyStackArn
      },
      {
        Sid: "PassExactServiceRole",
        Effect: "Allow",
        Action: ["iam:PassRole"],
        Resource: input.serviceRoleArn,
        Condition: {
          StringEquals: {
            "iam:PassedToService": "cloudformation.amazonaws.com"
          }
        }
      }
    ]
  };
}

/** gg: Create/Update builder는 storage가 발급하고 이 contract와 일치한 Policy Template만 받습니다. */
function assertPublishedPolicyTemplate(
  contract: AwsImportManagerContract,
  publishedPolicyTemplate: AwsImportPublishedTemplate,
  validationOptions: AwsImportTemplateValidationOptions
): void {
  assertAwsImportPublishedTemplateMatches(
    publishedPolicyTemplate,
    {
      connectionId: contract.connectionId,
      kind: "policy",
      contractVersion: contract.policyContractVersion,
      sha256: contract.policyTemplateSha256,
      objectKey: contract.policyTemplateObjectKey,
      baseUrl: contract.policyTemplateBaseUrl,
      region: contract.region
    },
    validationOptions
  );
}

/** gg: ManagedPolicy handler union만 허용하며 CreatePolicyVersion이 default 갱신까지 수행합니다. */
function createServiceRolePolicyDocument(input: {
  readManagedPolicyArn: string;
  targetRoleArn: string;
}): IamPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ManageExactReadManagedPolicy",
        Effect: "Allow",
        Action: [
          "iam:CreatePolicy",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListEntitiesForPolicy",
          "iam:ListPolicyVersions"
        ],
        Resource: input.readManagedPolicyArn
      },
      {
        Sid: "ManageExactTargetRoleAttachment",
        Effect: "Allow",
        Action: ["iam:AttachRolePolicy", "iam:DetachRolePolicy"],
        Resource: input.targetRoleArn,
        Condition: {
          ArnEquals: {
            "iam:PolicyARN": input.readManagedPolicyArn
          }
        }
      },
      {
        Sid: "ReadExactTargetRoleAttachments",
        Effect: "Allow",
        Action: ["iam:ListAttachedRolePolicies"],
        Resource: input.targetRoleArn
      }
    ]
  };
}

/** gg: 정리 확인 Policy는 두 Stack과 이 Manager가 소유한 IAM artifact만 읽습니다. */
function createCleanupVerificationPolicyDocument(input: {
  managerStackArn: string;
  policyStackArn: string;
  serviceRoleArn: string;
  targetRoleArn: string;
  ownedPolicyArns: string[];
}): IamPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ReadOwnedStacks",
        Effect: "Allow",
        Action: [
          "cloudformation:DescribeStacks",
          "cloudformation:GetTemplate",
          "cloudformation:ListStackResources"
        ],
        Resource: [input.managerStackArn, input.policyStackArn]
      },
      {
        Sid: "ReadOwnedPolicies",
        Effect: "Allow",
        Action: ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions"],
        Resource: input.ownedPolicyArns
      },
      {
        Sid: "ReadOwnedRoleAndAttachments",
        Effect: "Allow",
        Action: ["iam:GetRole", "iam:ListAttachedRolePolicies"],
        Resource: [input.serviceRoleArn, input.targetRoleArn]
      },
      {
        Sid: "ReadExactServiceRoleInlinePolicy",
        Effect: "Allow",
        Action: ["iam:ListRolePolicies", "iam:GetRolePolicy"],
        Resource: input.serviceRoleArn
      }
    ]
  };
}

/** gg: Manager와 Policy Stack ARN은 이름 뒤 실제 Stack ID만 wildcard로 허용합니다. */
function createStackArn(region: string, accountId: string, stackName: string): string {
  return `arn:aws:cloudformation:${region}:${accountId}:stack/${stackName}/*`;
}

/** gg: Manager Template의 immutable 주소와 검증 metadata에 같은 hash를 사용합니다. */
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
