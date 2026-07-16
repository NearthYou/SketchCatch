type JsonPolicyStatement = {
  Sid?: string;
  Effect: "Allow";
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
};

type JsonPolicy = {
  Version: "2012-10-17";
  Statement: JsonPolicyStatement[];
};

export type AwsReleaseRuntimeCoordinates = {
  partition?: string;
  accountId: string;
  region: string;
  ecrRepositoryArn: string;
  ecsClusterArn: string;
  ecsServiceArn: string;
  targetGroupArn: string;
  frontendBucketName: string;
  cloudFrontDistributionId: string;
  taskRoleArn: string | null;
  executionRoleArn: string | null;
};

export function createReadOnlyReleaseSessionPolicy(
  input: AwsReleaseRuntimeCoordinates
): string {
  const partition = input.partition ?? "aws";
  const statements: JsonPolicyStatement[] = [
    {
      Sid: "R",
      Effect: "Allow",
      Action: [
        "ecr:DescribeRepositories",
        "ecr:BatchGetImage",
        "ecs:DescribeClusters",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:ListTasks",
        "ecs:DescribeTasks",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeTargetHealth",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:GetPublicAccessBlock",
        "s3:GetBucketVersioning",
        "cloudfront:GetDistribution",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:GetInvalidation"
      ],
      Resource: "*"
    },
    {
      Sid: "I",
      Effect: "Allow",
      Action: "iam:GetRole",
      Resource: nonEmpty([input.taskRoleArn, input.executionRoleArn])
    },
    {
      Sid: "S",
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:GetObjectVersion"],
      Resource: `arn:${partition}:s3:::${input.frontendBucketName}/*`
    }
  ];
  return stringifyPolicy({
    Version: "2012-10-17",
    Statement: statements.filter(hasResources)
  });
}

export function createEcsDeployReleaseSessionPolicy(
  input: AwsReleaseRuntimeCoordinates
): string {
  const statements: JsonPolicyStatement[] = [
    {
      Effect: "Allow",
      Action: [
        "ecs:RegisterTaskDefinition",
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeServices",
        "ecs:ListTasks",
        "ecs:DescribeTasks",
        "elasticloadbalancing:DescribeTargetHealth"
      ],
      Resource: "*"
    },
    {
      Effect: "Allow",
      Action: [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage"
      ],
      Resource: input.ecrRepositoryArn
    },
    {
      Effect: "Allow",
      Action: "ecr:GetAuthorizationToken",
      Resource: "*"
    },
    {
      Effect: "Allow",
      Action: "ecs:UpdateService",
      Resource: input.ecsServiceArn
    },
    {
      Effect: "Allow",
      Action: "ecs:TagResource",
      Resource: "*",
      Condition: {
        StringEquals: { "ecs:CreateAction": "RegisterTaskDefinition" }
      }
    },
    {
      Effect: "Allow",
      Action: "iam:PassRole",
      Resource: nonEmpty([input.taskRoleArn, input.executionRoleArn]),
      Condition: {
        StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" }
      }
    }
  ];
  return stringifyPolicy({
    Version: "2012-10-17",
    Statement: statements.filter(hasResources)
  });
}

export function createFrontendDeployReleaseSessionPolicy(
  input: AwsReleaseRuntimeCoordinates
): string {
  const partition = input.partition ?? "aws";
  return stringifyPolicy({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "s3:PutObject",
        Resource: `arn:${partition}:s3:::${input.frontendBucketName}/*`
      },
      {
        Effect: "Allow",
        Action: ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
        Resource: `arn:${partition}:cloudfront::${input.accountId}:distribution/${input.cloudFrontDistributionId}`
      }
    ]
  });
}

function stringifyPolicy(policy: JsonPolicy): string {
  const value = JSON.stringify(policy);
  if (value.length > 2_048) {
    throw new Error(`AWS release session policy exceeds the STS limit (${value.length}/2048)`);
  }
  return value;
}

function nonEmpty(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function hasResources(statement: JsonPolicyStatement): boolean {
  return !Array.isArray(statement.Resource) || statement.Resource.length > 0;
}
