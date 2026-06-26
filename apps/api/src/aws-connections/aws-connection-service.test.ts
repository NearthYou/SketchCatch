import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAwsConnection,
  type AwsConnectionRecord,
  type AwsConnectionRepository
} from "./aws-connection-service.js";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const awsConnectionId = "33333333-3333-4333-8333-333333333333";
const callerPrincipalArn = "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole";
const externalId = "sc_conn_33333333-3333-4333-8333-333333333333_random";
const fixedNow = new Date("2026-06-26T00:00:00.000Z");

class FakeAwsConnectionRepository implements AwsConnectionRepository {
  readonly calls: Array<{ name: string; [key: string]: unknown }> = [];
  project: ProjectRecord | undefined = createProjectRecord();
  awsConnection: AwsConnectionRecord | undefined;

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "findAccessibleProject",
      projectId: candidateProjectId,
      accessContext
    });

    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      this.project.userId !== accessContext.userId
    ) {
      return undefined;
    }

    return this.project;
  }

  async createAwsConnection(input: {
    id: string;
    projectId: string;
    userId: string;
    externalId: string;
    region: string;
    status: "pending";
  }) {
    this.calls.push({
      name: "createAwsConnection",
      input
    });

    this.awsConnection = {
      id: input.id,
      projectId: input.projectId,
      userId: input.userId,
      accountId: null,
      roleArn: null,
      externalId: input.externalId,
      region: input.region,
      status: input.status,
      lastVerifiedAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow
    };

    return this.awsConnection;
  }
}

test("createAwsConnection creates a pending connection with server-generated externalId and setup values", async () => {
  const repository = new FakeAwsConnectionRepository();

  const result = await createAwsConnection(
    {
      projectId,
      accessContext: {
        kind: "user",
        userId
      },
      region: "ap-northeast-2",
      callerPrincipalArn
    },
    repository,
    {
      generateId: () => awsConnectionId,
      generateExternalId: () => externalId
    }
  );

  assert.equal(result.awsConnection.id, awsConnectionId);
  assert.equal(result.awsConnection.projectId, projectId);
  assert.equal(result.awsConnection.userId, userId);
  assert.equal(result.awsConnection.externalId, externalId);
  assert.equal(result.awsConnection.status, "pending");
  assert.equal(result.awsConnection.accountId, null);
  assert.equal(result.awsConnection.roleArn, null);
  assert.equal(result.callerPrincipalArn, callerPrincipalArn);
  assert.equal(result.recommendedRoleName, "SketchCatchTerraformExecutionRole");
  assert.deepEqual(result.roleSetup, {
    roleName: "SketchCatchTerraformExecutionRole",
    trustedPrincipalArn: callerPrincipalArn,
    externalId,
    trustPolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            AWS: callerPrincipalArn
          },
          Action: "sts:AssumeRole",
          Condition: {
            StringEquals: {
              "sts:ExternalId": externalId
            }
          }
        }
      ]
    },
    permissionSetup: {
      verificationActions: ["sts:GetCallerIdentity"],
      initialPolicyDocument: null,
      terraformPolicyDocument: null
    }
  });
  assert.deepEqual(result.callerRoleSetup, {
    policyName: "SketchCatchAssumeTerraformExecutionRole",
    assumableRoleArnPattern: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Resource: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole"
        }
      ]
    }
  });
  assert.deepEqual(result.trustPolicyTemplate, {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: callerPrincipalArn
        },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": externalId
          }
        }
      }
    ]
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "createAwsConnection",
      input: {
        id: awsConnectionId,
        projectId,
        userId,
        externalId,
        region: "ap-northeast-2",
        status: "pending"
      }
    }
  ]);
});

function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: projectId,
    userId,
    name: "AWS setup project",
    description: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}
