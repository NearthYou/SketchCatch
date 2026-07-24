import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import {
  createAwsConnection,
  deleteAwsConnection,
  getAwsConnectionDeletionPreview,
  getAwsConnectionCloudFormationTemplate,
  listAwsConnections,
  AwsConnectionConflictError,
  AwsConnectionDeleteConflictError,
  type AwsConnectionRecord,
  shouldBlockAwsConnectionDeletion,
  type AwsConnectionRepository,
  verifyAwsConnection
} from "./aws-connection-service.js";
import { createAwsImportReadPolicyDocument } from "./aws-import-access-catalog.js";

const accessContext: ProjectAccessContext = {
  kind: "user",
  userId: "user-1"
};
const apiCallerPrincipalArn = "arn:aws:iam::555980271919:role/sketchcatch-production-ecs-task";
const workerCallerPrincipalArn =
  "arn:aws:iam::555980271919:role/sketchcatch-production-ecs-worker-task";

test("listAwsConnections separates active connections from cleanup retries", async () => {
  const result = await listAwsConnections(
    { accessContext },
    createListRepository([
      createAwsConnectionRecord({ id: "pending", status: "pending" }),
      createAwsConnectionRecord({ id: "failed", status: "failed" }),
      createAwsConnectionRecord({
        id: "deleting",
        status: "verified",
        deletionStartedAt: new Date("2026-07-16T00:00:00.000Z")
      }),
      createAwsConnectionRecord({
        id: "cleanup-retry",
        accountId: "123456789012",
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-cleanup",
        status: "verified",
        deletionStartedAt: new Date("2026-07-16T00:00:00.000Z"),
        deletionErrorSummary: "AWS managed resource cleanup failed"
      }),
      createAwsConnectionRecord({
        id: "verified",
        accountId: "123456789012",
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
        status: "verified"
      })
    ])
  );

  assert.deepEqual(
    result.awsConnections.map((connection) => connection.id),
    ["verified"]
  );
  assert.deepEqual(result.cleanupRetries, [
    {
      awsConnection: {
        id: "cleanup-retry",
        userId: "user-1",
        accountId: "123456789012",
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-cleanup",
        externalId: "sc_conn_connection_example",
        region: "ap-northeast-2",
        status: "verified",
        lastVerifiedAt: null,
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z"
      }
    }
  ]);
});

test("verifyAwsConnection requires cleanup retry before connecting the same AWS account", async () => {
  const pendingConnection = createAwsConnectionRecord({
    id: "22222222-2222-4222-8222-222222222222",
    status: "pending"
  });
  const cleanupRetryConnection = createAwsConnectionRecord({
    id: "11111111-1111-4111-8111-111111111111",
    accountId: "123456789012",
    status: "verified",
    deletionStartedAt: new Date("2026-07-16T00:00:00.000Z"),
    deletionErrorSummary: "cleanup failed"
  });
  let testerCalls = 0;
  let verificationUpdates = 0;
  const repository = createListRepository([pendingConnection, cleanupRetryConnection]);
  repository.findAccessibleAwsConnection = async () => pendingConnection;
  repository.findVerifiedAwsConnectionByAccountId = async () => cleanupRetryConnection;
  repository.updateAwsConnectionVerification = async (input) => {
    verificationUpdates += 1;
    return { ...pendingConnection, ...input, updatedAt: new Date() };
  };

  await assert.rejects(
    verifyAwsConnection(
      {
        connectionId: pendingConnection.id,
        accessContext,
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
      },
      repository,
      {
        async testConnection() {
          testerCalls += 1;
          return {
            ok: true,
            accountId: "123456789012",
            callerArn:
              "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/session",
            region: "ap-northeast-2"
          };
        }
      }
    ),
    {
      message:
        "같은 AWS 계정의 이전 연결 정리가 완료되지 않았습니다. 이전 연결 정리를 재시도해 주세요."
    }
  );
  assert.equal(testerCalls, 0);
  assert.equal(verificationUpdates, 0);
});

test("verifyAwsConnection rejects an already active AWS account with a conflict", async () => {
  const pendingConnection = createAwsConnectionRecord({
    id: "22222222-2222-4222-8222-222222222222",
    status: "pending"
  });
  const activeConnection = createAwsConnectionRecord({
    id: "11111111-1111-4111-8111-111111111111",
    accountId: "123456789012",
    status: "verified"
  });
  let testerCalls = 0;
  let verificationUpdates = 0;
  const repository = createListRepository([pendingConnection, activeConnection]);
  repository.findAccessibleAwsConnection = async () => pendingConnection;
  repository.findVerifiedAwsConnectionByAccountId = async () => activeConnection;
  repository.updateAwsConnectionVerification = async (input) => {
    verificationUpdates += 1;
    return {
      ...pendingConnection,
      ...input,
      updatedAt: new Date()
    };
  };

  await assert.rejects(
    verifyAwsConnection(
      {
        connectionId: pendingConnection.id,
        accessContext,
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
      },
      repository,
      {
        async testConnection() {
          testerCalls += 1;
          return {
            ok: true,
            accountId: "123456789012",
            callerArn:
              "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/session",
            region: "ap-northeast-2"
          };
        }
      }
    ),
    (error: unknown) =>
      error instanceof AwsConnectionConflictError && error.message === "이미 연결된 AWS 계정입니다."
  );
  assert.equal(testerCalls, 0);
  assert.equal(verificationUpdates, 0);
});

test("verifyAwsConnection converts a concurrent verified-account unique violation to a conflict", async () => {
  const pendingConnection = createAwsConnectionRecord({
    id: "22222222-2222-4222-8222-222222222222",
    status: "pending"
  });
  const repository = createListRepository([pendingConnection]);
  repository.findAccessibleAwsConnection = async () => pendingConnection;
  repository.updateAwsConnectionVerification = async () => {
    const postgresError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      constraint: "aws_connections_user_verified_account_unique"
    });
    throw new Error("Failed query: update aws_connections", { cause: postgresError });
  };

  await assert.rejects(
    verifyAwsConnection(
      {
        connectionId: pendingConnection.id,
        accessContext,
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
      },
      repository,
      {
        async testConnection() {
          return {
            ok: true,
            accountId: "123456789012",
            callerArn:
              "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/session",
            region: "ap-northeast-2"
          };
        }
      }
    ),
    (error: unknown) =>
      error instanceof AwsConnectionConflictError && error.message === "이미 연결된 AWS 계정입니다."
  );
});

test("listAwsConnections returns pending and failed attempts only when explicitly requested", async () => {
  const result = await listAwsConnections(
    { accessContext },
    createListRepository([
      createAwsConnectionRecord({ id: "pending", status: "pending" }),
      createAwsConnectionRecord({ id: "failed", status: "failed" }),
      createAwsConnectionRecord({
        id: "verified",
        accountId: "123456789012",
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
        status: "verified"
      })
    ]),
    { includeUnverified: true }
  );

  assert.deepEqual(
    result.awsConnections.map((connection) => connection.id),
    ["pending", "failed", "verified"]
  );
  assert.deepEqual(result.cleanupRetries, []);
});

test("AWS connection templates trust every configured runtime caller role", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "c0ccf1a1-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );

  assert.deepEqual(
    (result.trustPolicyTemplate.Statement as Array<Record<string, unknown>>)[0]?.Principal,
    {
      AWS: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    }
  );
  assert.equal(result.callerPrincipalArn, apiCallerPrincipalArn);
  assert.equal(result.roleSetup.trustedPrincipalArn, apiCallerPrincipalArn);

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );

  assert.match(
    template.templateBody,
    /AWS:\n\s+- "arn:aws:iam::555980271919:role\/sketchcatch-production-ecs-task"/
  );
  assert.match(
    template.templateBody,
    /- "arn:aws:iam::555980271919:role\/sketchcatch-production-ecs-worker-task"/
  );
});

test("AWS connection template keeps a manual download fallback when a Console shortcut is unavailable", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const created = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "template-fallback-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: created.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository
  );

  assert.equal(template.launchStackUrl, null);
  assert.equal(template.manualTemplateFallbackAvailable, true);
  assert.match(template.templateBody, /AWSTemplateFormatVersion/u);
});

test("AWS connection policy authorizes only SketchCatch-managed CodeBuild names", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "d346dcf5-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );
  const policy = result.roleSetup.permissionSetup.terraformPolicyDocument as {
    Statement: Array<{ Action: string | readonly string[]; Resource: string | readonly string[] }>;
  };
  const codeBuildStatement = policy.Statement.find((statement) =>
    toStringArray(statement.Action).includes("codebuild:BatchGetProjects")
  );
  assert.ok(codeBuildStatement);

  const requestedProjectArn =
    "arn:aws:codebuild:ap-northeast-2:131404649047:project/sketchcatch-12345678-build";
  const requestedBuildArn =
    "arn:aws:codebuild:ap-northeast-2:131404649047:build/sketchcatch-12345678-build:build-id";
  assert.equal(
    toStringArray(codeBuildStatement.Resource).some((pattern) =>
      matchesIamResourcePattern(pattern, requestedProjectArn)
    ),
    true,
    `${requestedProjectArn} must be covered by the generated connection policy`
  );
  assert.equal(
    toStringArray(codeBuildStatement.Resource).some((pattern) =>
      matchesIamResourcePattern(pattern, requestedBuildArn)
    ),
    true,
    `${requestedBuildArn} must be covered by the generated connection policy`
  );
  assert.equal(
    toStringArray(codeBuildStatement.Resource).some((pattern) =>
      matchesIamResourcePattern(
        pattern,
        "arn:aws:codebuild:ap-northeast-2:131404649047:project/unmanaged-build"
      )
    ),
    false
  );

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );
  assert.match(
    template.templateBody,
    /codebuild:\$\{AWS::Region\}:\$\{AWS::AccountId\}:project\/sketchcatch-\*"/,
    "the deployable CloudFormation policy must cover only SketchCatch-managed projects"
  );
  assert.match(
    template.templateBody,
    /codebuild:\$\{AWS::Region\}:\$\{AWS::AccountId\}:build\/sketchcatch-\*:\*"/,
    "the deployable CloudFormation policy must cover only SketchCatch-managed builds"
  );
  assert.match(template.templateBody, /codeconnections:CreateConnection/);
  assert.match(template.templateBody, /codeconnections:PassConnection/);
  assert.match(template.templateBody, /codeconnections:UseConnection/);
  assert.match(template.templateBody, /codestar-connections:PassConnection/);
  assert.match(template.templateBody, /codestar-connections:UseConnection/);
  assert.match(template.templateBody, /codeconnections:ListTagsForResource/);
  assert.match(template.templateBody, /SketchCatchCodeBuildBoundary/);
  assert.match(template.templateBody, /PermissionsBoundary/);
  assert.match(template.templateBody, /iam:PutRolePolicy/);
  assert.match(template.templateBody, /iam:GetRolePolicy/);
  assert.match(template.templateBody, /ecr:GetAuthorizationToken/);
  assert.match(template.templateBody, /ecr:BatchCheckLayerAvailability/);
  assert.match(template.templateBody, /ecr:GetDownloadUrlForLayer/);
  assert.match(template.templateBody, /ecr:BatchGetImage/);
  assert.match(template.templateBody, /ecr:InitiateLayerUpload/);
  assert.match(template.templateBody, /ecr:UploadLayerPart/);
  assert.match(template.templateBody, /ecr:CompleteLayerUpload/);
  assert.match(template.templateBody, /ecr:PutImage/);
  assert.match(template.templateBody, /repository\/sketchcatch-\*-build-cache/);
});

test("새 AWS 연결 Template에 현재 구조 분석 읽기 권한을 모두 포함한다", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "47447447-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );
  const requiredReadActions = [
    ...new Set([
      ...createAwsImportReadPolicyDocument().Statement[0].Action,
      "cloudformation:DescribeStacks",
      "cloudformation:GetTemplate"
    ])
  ].sort();
  const policy = result.roleSetup.permissionSetup.terraformPolicyDocument as {
    Statement: Array<{ Action: string | readonly string[] }>;
  };
  const readStatementActions = policy.Statement
    .map((statement) => toStringArray(statement.Action))
    .find((actions) => actions.includes("tag:GetResources"));
  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );

  assert.deepEqual(readStatementActions, requiredReadActions);

  for (const action of requiredReadActions) {
    assert.match(template.templateBody, new RegExp(action.replace(":", "\\:")));
  }
});

test("AWS connection policy supports apply and destroy for every deployable AWS service family", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "a11f00d0-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );
  const requiredServiceActions = [
    "acm:*",
    "amplify:*",
    "autoscaling:*",
    "cloudtrail:*",
    "cloudwatch:*",
    "cognito-idp:*",
    "config:*",
    "dynamodb:*",
    "elasticache:*",
    "elasticfilesystem:*",
    "events:*",
    "guardduty:*",
    "kms:*",
    "lambda:*",
    "apigateway:*",
    "rds:*",
    "route53:*",
    "scheduler:*",
    "secretsmanager:*",
    "shield:*",
    "sns:*",
    "sqs:*",
    "states:*",
    "waf:*",
    "wafv2:*",
    "xray:*"
  ];
  const policy = result.roleSetup.permissionSetup.terraformPolicyDocument as {
    Statement: Array<{ Action: string | readonly string[] }>;
  };
  const policyActions = policy.Statement.flatMap((statement) => toStringArray(statement.Action));

  for (const action of requiredServiceActions) {
    assert.equal(policyActions.includes(action), true, `${action} must be in the Terraform policy`);
  }

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );

  for (const action of requiredServiceActions) {
    assert.match(template.templateBody, new RegExp(action.replace("*", "\\*")));
  }
});
test("AWS connection Terraform permissions scope PassRole to runtime services", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "c0ccf1a1-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );
  const policy = result.roleSetup.permissionSetup.terraformPolicyDocument as {
    Statement: Array<Record<string, unknown>>;
  };
  const passRoleStatement = policy.Statement.find(
    (statement) => statement["Action"] === "iam:PassRole" && statement["Effect"] === "Allow"
  );

  assert.deepEqual(passRoleStatement, {
    Effect: "Allow",
    Action: "iam:PassRole",
    Resource: "arn:aws:iam::*:role/*",
    Condition: {
      StringEquals: {
        "iam:PassedToService": [
          "autoscaling.amazonaws.com",
          "codebuild.amazonaws.com",
          "codedeploy.amazonaws.com",
          "codepipeline.amazonaws.com",
          "ec2.amazonaws.com",
          "ecs-tasks.amazonaws.com",
          "eks.amazonaws.com",
          "lambda.amazonaws.com"
        ]
      }
    }
  });
  assert.equal(
    policy.Statement.some(
      (statement) =>
        statement["Resource"] === "*" &&
        Array.isArray(statement["Action"]) &&
        statement["Action"].includes("iam:PassRole")
    ),
    false
  );

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );
  assert.match(
    template.templateBody,
    /Action: iam:PassRole\n\s+Resource: !Sub "arn:\$\{AWS::Partition\}:iam::\$\{AWS::AccountId\}:role\/\*"\n\s+Condition:\n\s+StringEquals:\n\s+iam:PassedToService:/
  );
});

test("AWS connection policy supports ECS Service Auto Scaling apply and destroy", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "a11ca1e0-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );
  const requiredActions = [
    "application-autoscaling:RegisterScalableTarget",
    "application-autoscaling:DeregisterScalableTarget",
    "application-autoscaling:DescribeScalableTargets",
    "application-autoscaling:PutScalingPolicy",
    "application-autoscaling:DeleteScalingPolicy",
    "application-autoscaling:DescribeScalingPolicies",
    "application-autoscaling:ListTagsForResource",
    "application-autoscaling:TagResource",
    "application-autoscaling:UntagResource"
  ];
  const policy = result.roleSetup.permissionSetup.terraformPolicyDocument as {
    Statement: Array<{ Action: string | readonly string[] }>;
  };
  const policyActions = policy.Statement.flatMap((statement) => toStringArray(statement.Action));

  for (const action of requiredActions) {
    assert.equal(policyActions.includes(action), true, `${action} must be in the Terraform policy`);
  }

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );

  for (const action of requiredActions) {
    assert.match(template.templateBody, new RegExp(action.replace(":", "\\:")));
  }
});

test("AWS connection deletion ignores failed history without cloud state", () => {
  assert.equal(
    shouldBlockAwsConnectionDeletion({
      status: "FAILED",
      stateObjectKey: null,
      hasResources: false
    }),
    false
  );
  assert.equal(
    shouldBlockAwsConnectionDeletion({
      status: "CANCELLED",
      stateObjectKey: null,
      hasResources: false
    }),
    false
  );
});

test("AWS connection deletion blocks active, successful, partial, or unresolved cloud state", () => {
  for (const status of ["RUNNING", "SUCCESS", "PARTIALLY_FAILED", "PARTIALLY_CANCELED"] as const) {
    assert.equal(
      shouldBlockAwsConnectionDeletion({ status, stateObjectKey: null, hasResources: false }),
      true
    );
  }
  assert.equal(
    shouldBlockAwsConnectionDeletion({
      status: "FAILED",
      stateObjectKey: "deployments/deployment/terraform.tfstate",
      hasResources: false
    }),
    true
  );
  assert.equal(
    shouldBlockAwsConnectionDeletion({
      status: "CANCELLED",
      stateObjectKey: null,
      hasResources: true
    }),
    true
  );
  assert.equal(
    shouldBlockAwsConnectionDeletion({
      status: "DESTROYED",
      stateObjectKey: "historical/destroyed.tfstate",
      hasResources: true
    }),
    false
  );
});

test("AWS connection deletion cleans managed resources before deleting metadata", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const created = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "55555555-5555-4555-8555-555555555555",
      generateExternalId: () => "external-id"
    }
  );
  const calls: string[] = [];
  repository.findManagedResources = async () => ({
    codeBuildProjects: [
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        projectName: "sketchcatch-55555555-build",
        serviceRoleArn: "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-55555555"
      }
    ],
    codeConnectionArn:
      "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/connection-id"
  });
  repository.countReverseEngineeringScans = async () => 2;

  const preview = await getAwsConnectionDeletionPreview(
    { connectionId: created.awsConnection.id, accessContext },
    repository
  );
  assert.deepEqual(preview.managedResources, {
    codeBuildProjects: [
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        projectName: "sketchcatch-55555555-build",
        serviceRoleName: "SketchCatchCodeBuild-55555555",
        logGroupName: "/aws/codebuild/sketchcatch-55555555-build"
      }
    ]
  });
  assert.deepEqual(preview.preservedResources, [
    "CloudFormation Stack",
    "Terraform Execution Role"
  ]);
  assert.deepEqual(preview.preservedRecords, { reverseEngineeringScans: 2 });
  assert.equal(preview.canDelete, true);

  await deleteAwsConnection(
    {
      connectionId: created.awsConnection.id,
      accessContext,
      confirmedManagedCleanup: true,
      confirmationToken: preview.confirmationToken
    },
    repository,
    {
      cleanupManagedResources: async ({ resources }) => {
        calls.push(resources.codeBuildProjects[0]?.projectName ?? "missing");
        assert.equal(resources.codeConnectionArn, null);
        const claimed = await repository.findAccessibleAwsConnection(
          created.awsConnection.id,
          accessContext
        );
        assert.ok(claimed?.deletionStartedAt);
      }
    }
  );

  assert.deepEqual(calls, ["sketchcatch-55555555-build"]);
  assert.equal(
    await repository.findAccessibleAwsConnection(created.awsConnection.id, accessContext),
    undefined
  );
});

test("AWS connection deletion preserves a retryable cleanup failure claim", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const created = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "66666666-6666-4666-8666-666666666666",
      generateExternalId: () => "external-id"
    }
  );
  repository.findManagedResources = async () => ({
    codeBuildProjects: [],
    codeConnectionArn: null
  });
  const firstPreview = await getAwsConnectionDeletionPreview(
    { connectionId: created.awsConnection.id, accessContext },
    repository
  );

  await assert.rejects(
    deleteAwsConnection(
      {
        connectionId: created.awsConnection.id,
        accessContext,
        confirmedManagedCleanup: true,
        confirmationToken: firstPreview.confirmationToken
      },
      repository,
      {
        cleanupManagedResources: async () => {
          throw new Error("AccessDenied");
        }
      }
    ),
    /AccessDenied/
  );

  const restored = await repository.findAccessibleAwsConnection(
    created.awsConnection.id,
    accessContext
  );
  assert.ok(restored?.deletionStartedAt);
  assert.equal(restored?.deletionErrorSummary, "AccessDenied");

  const retryPreview = await getAwsConnectionDeletionPreview(
    { connectionId: created.awsConnection.id, accessContext },
    repository
  );
  assert.equal(retryPreview.cleanupRetry, true);

  await deleteAwsConnection(
    {
      connectionId: created.awsConnection.id,
      accessContext,
      confirmedManagedCleanup: true,
      confirmationToken: retryPreview.confirmationToken
    },
    repository,
    { cleanupManagedResources: async () => undefined }
  );
  assert.equal(
    await repository.findAccessibleAwsConnection(created.awsConnection.id, accessContext),
    undefined
  );
});

test("AWS connection deletion requires explicit preview confirmation before claiming or cleaning", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const created = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "77777777-7777-4777-8777-777777777777",
      generateExternalId: () => "external-id"
    }
  );
  let claimCalls = 0;
  let cleanupCalls = 0;
  const claimDeletion = repository.claimAccessibleAwsConnectionDeletion.bind(repository);
  repository.claimAccessibleAwsConnectionDeletion = async (...args) => {
    claimCalls += 1;
    return claimDeletion(...args);
  };
  repository.findManagedResources = async () => ({
    codeBuildProjects: [],
    codeConnectionArn: null
  });

  await assert.rejects(
    deleteAwsConnection(
      {
        connectionId: created.awsConnection.id,
        accessContext,
        confirmedManagedCleanup: false,
        confirmationToken: ""
      },
      repository,
      {
        cleanupManagedResources: async () => {
          cleanupCalls += 1;
        }
      }
    ),
    /삭제될 SketchCatch 관리 리소스를 확인/
  );

  assert.equal(claimCalls, 0);
  assert.equal(cleanupCalls, 0);
});

test("AWS connection deletion preview keeps local disconnect available after structure analysis", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const created = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "88888888-8888-4888-8888-888888888888",
      generateExternalId: () => "external-id"
    }
  );
  repository.findManagedResources = async () => ({
    codeBuildProjects: [],
    codeConnectionArn: null
  });
  const legacyCleanupReader = repository as AwsConnectionRepository & {
    findAwsImportAccessCleanupStatus(): Promise<never>;
  };
  legacyCleanupReader.findAwsImportAccessCleanupStatus = async () => {
    throw new Error("structure analysis must not block local disconnect");
  };
  const preview = await getAwsConnectionDeletionPreview(
    { connectionId: created.awsConnection.id, accessContext },
    repository
  );
  assert.equal(preview.canDelete, true);
  assert.equal(preview.blockerMessage, null);
});

test("AWS connection deletion keeps an active deployment guard", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const created = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "99999999-9999-4999-8999-999999999999",
      generateExternalId: () => "external-id"
    }
  );
  repository.findManagedResources = async () => ({ codeBuildProjects: [], codeConnectionArn: null });
  const preview = await getAwsConnectionDeletionPreview(
    { connectionId: created.awsConnection.id, accessContext },
    repository
  );
  repository.claimAccessibleAwsConnectionDeletion = async () => ({
    connection: {
      ...(await repository.findAccessibleAwsConnection(created.awsConnection.id, accessContext))!,
      deletionStartedAt: new Date("2026-07-20T00:00:00.000Z"),
      deletionErrorSummary: "previous cleanup failure"
    },
    claimed: false,
    blocked: true,
    blockReason: "deployment"
  } as never);

  await assert.rejects(
    deleteAwsConnection(
      {
        connectionId: created.awsConnection.id,
        accessContext,
        confirmedManagedCleanup: true,
        confirmationToken: preview.confirmationToken
      },
      repository
    ),
    /AWS 리소스 또는 Terraform state/
  );
});

test("AWS connection deletion surfaces a final connection-state conflict", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const created = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      generateExternalId: () => "external-id"
    }
  );
  repository.findManagedResources = async () => ({ codeBuildProjects: [], codeConnectionArn: null });
  const preview = await getAwsConnectionDeletionPreview(
    { connectionId: created.awsConnection.id, accessContext },
    repository
  );
  repository.deleteClaimedAwsConnection = async () => {
    throw new AwsConnectionDeleteConflictError(
      "AWS 연결 상태가 변경되었습니다."
    );
  };

  await assert.rejects(
    deleteAwsConnection(
      {
        connectionId: created.awsConnection.id,
        accessContext,
        confirmedManagedCleanup: true,
        confirmationToken: preview.confirmationToken
      },
      repository
    ),
    /AWS 연결 상태가 변경/
  );
  assert.ok(await repository.findAccessibleAwsConnection(created.awsConnection.id, accessContext));
});

function createInMemoryAwsConnectionRepository(): AwsConnectionRepository {
  const records = new Map<string, AwsConnectionRecord>();

  return {
    async findAccessibleAwsConnection(connectionId) {
      return records.get(connectionId);
    },
    async listAccessibleAwsConnections() {
      return [...records.values()];
    },
    async findVerifiedAwsConnectionByAccountId() {
      return undefined;
    },
    async findAwsConnectionById(connectionId) {
      return records.get(connectionId);
    },
    async hasDeploymentUsingAwsConnection() {
      return false;
    },
    async countReverseEngineeringScans() {
      return 0;
    },
    async claimAccessibleAwsConnectionDeletion(connectionId) {
      const record = records.get(connectionId);
      if (!record) return undefined;
      if (record.deletionStartedAt) {
        if (record.deletionErrorSummary) {
          const reclaimed = { ...record, deletionErrorSummary: null };
          records.set(connectionId, reclaimed);
          return { connection: reclaimed, claimed: true, blocked: false };
        }
        return { connection: record, claimed: false, blocked: false };
      }
      const claimed = { ...record, deletionStartedAt: new Date() };
      records.set(connectionId, claimed);
      return { connection: claimed, claimed: true, blocked: false };
    },
    async releaseAwsConnectionDeletionClaim(connectionId) {
      const record = records.get(connectionId);
      if (!record) return;
      records.set(connectionId, { ...record, deletionStartedAt: null });
    },
    async markAwsConnectionDeletionCleanupFailed(connectionId, _accessContext, errorSummary) {
      const record = records.get(connectionId);
      if (!record) return;
      records.set(connectionId, { ...record, deletionErrorSummary: errorSummary });
    },
    async deleteClaimedAwsConnection(connectionId) {
      const record = records.get(connectionId);
      if (!record?.deletionStartedAt) return undefined;
      records.delete(connectionId);
      return record;
    },
    async createAwsConnection(input) {
      const now = new Date("2026-07-15T00:00:00.000Z");
      const record: AwsConnectionRecord = {
        id: input.id,
        userId: input.userId,
        accountId: null,
        roleArn: null,
        externalId: input.externalId,
        region: input.region,
        status: input.status,
        lastVerifiedAt: null,
        deletionStartedAt: null,
        deletionErrorSummary: null,
        createdAt: now,
        updatedAt: now
      };
      records.set(record.id, record);
      return record;
    },
    async deleteAccessibleAwsConnection(connectionId) {
      const record = records.get(connectionId);
      records.delete(connectionId);
      return record;
    },
    async updateAwsConnectionVerification() {
      return undefined;
    }
  };
}

// 목록 API의 표시 정책만 분리해 검증합니다.
function createListRepository(rows: AwsConnectionRecord[]): AwsConnectionRepository {
  return {
    async createAwsConnection() {
      throw new Error("Not used in this test");
    },
    async deleteAccessibleAwsConnection() {
      return undefined;
    },
    async findAccessibleAwsConnection() {
      return undefined;
    },
    async findAwsConnectionById() {
      return undefined;
    },
    async findVerifiedAwsConnectionByAccountId() {
      return undefined;
    },
    async hasDeploymentUsingAwsConnection() {
      return false;
    },
    async countReverseEngineeringScans() {
      return 0;
    },
    async claimAccessibleAwsConnectionDeletion() {
      return undefined;
    },
    async releaseAwsConnectionDeletionClaim() {},
    async deleteClaimedAwsConnection() {
      return undefined;
    },
    async listAccessibleAwsConnections() {
      return rows;
    },
    async updateAwsConnectionVerification() {
      return undefined;
    }
  };
}

// 확인 완료 상태만 목록에 노출되는지를 위한 고정 연결 레코드를 만듭니다.
function createAwsConnectionRecord(overrides: Partial<AwsConnectionRecord>): AwsConnectionRecord {
  const now = new Date("2026-07-15T00:00:00.000Z");

  return {
    id: "connection",
    userId: accessContext.userId,
    accountId: null,
    roleArn: null,
    externalId: "sc_conn_connection_example",
    region: "ap-northeast-2",
    status: "pending",
    lastVerifiedAt: null,
    deletionStartedAt: null,
    deletionErrorSummary: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function toStringArray(value: string | readonly string[]): readonly string[] {
  return typeof value === "string" ? [value] : value;
}

function matchesIamResourcePattern(pattern: string, resourceArn: string): boolean {
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escapedPattern}$`).test(resourceArn);
}
