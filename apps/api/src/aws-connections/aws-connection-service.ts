import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  AwsConnection,
  AwsRolePermissionSetup,
  CreateAwsConnectionResponse,
  SketchCatchCallerRoleSetup,
  VerifyAwsConnectionResponse
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { awsConnections, projects } from "../db/schema.js";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";
import {
  AwsConnectionTestError,
  createAwsConnectionTester,
  getAwsAccountIdFromRoleArn,
  supportedAwsConnectionRegion,
  type AwsConnectionTester
} from "./aws-connection-test-service.js";

const recommendedRoleName = "SketchCatchTerraformExecutionRole";
const callerAssumeRolePolicyName = "SketchCatchAssumeTerraformExecutionRole";

export type AwsConnectionRecord = typeof awsConnections.$inferSelect;

export type CreateAwsConnectionInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  region: string;
  callerPrincipalArn: string;
};

export type CreateAwsConnectionRecordInput = {
  id: string;
  projectId: string;
  userId: string;
  externalId: string;
  region: string;
  status: "pending";
};

export type AwsConnectionRepository = {
  findAccessibleProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<ProjectRecord | undefined>;
  findAccessibleAwsConnection(
    projectId: string,
    connectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  createAwsConnection(input: CreateAwsConnectionRecordInput): Promise<AwsConnectionRecord>;
  updateAwsConnectionVerification(input: UpdateAwsConnectionVerificationInput): Promise<
    AwsConnectionRecord | undefined
  >;
};

export type CreateAwsConnectionOptions = {
  generateId?: () => string;
  generateExternalId?: () => string;
};

export type VerifyAwsConnectionInput = {
  projectId: string;
  connectionId: string;
  accessContext: ProjectAccessContext;
  roleArn: string;
};

export type VerifyAwsConnectionOptions = {
  now?: () => Date;
};

export type UpdateAwsConnectionVerificationInput = {
  connectionId: string;
  accountId: string | null;
  roleArn: string;
  status: "verified" | "failed";
  lastVerifiedAt: Date | null;
};

export class AwsConnectionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionNotFoundError";
  }
}

export class AwsConnectionVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionVerificationError";
  }
}

export function createPostgresAwsConnectionRepository(db: Database): AwsConnectionRepository {
  return {
    async findAccessibleProject(projectId, accessContext) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, accessContext.userId)));

      return project;
    },

    async findAccessibleAwsConnection(projectId, connectionId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.projectId, projectId),
            eq(awsConnections.userId, accessContext.userId)
          )
        );

      return awsConnection;
    },

    async createAwsConnection(input) {
      const [awsConnection] = await db.insert(awsConnections).values(input).returning();

      if (!awsConnection) {
        throw new Error("AWS connection creation failed");
      }

      return awsConnection;
    },

    async updateAwsConnectionVerification(input) {
      const updatedAt = input.lastVerifiedAt ?? new Date();
      const [awsConnection] = await db
        .update(awsConnections)
        .set({
          accountId: input.accountId,
          roleArn: input.roleArn,
          status: input.status,
          lastVerifiedAt: input.lastVerifiedAt,
          updatedAt
        })
        .where(eq(awsConnections.id, input.connectionId))
        .returning();

      return awsConnection;
    }
  };
}

export async function createAwsConnection(
  input: CreateAwsConnectionInput,
  repository: AwsConnectionRepository,
  options: CreateAwsConnectionOptions = {}
): Promise<CreateAwsConnectionResponse> {
  const project = await repository.findAccessibleProject(input.projectId, input.accessContext);

  if (!project) {
    throw new AwsConnectionNotFoundError("Project not found");
  }

  const generateId = options.generateId ?? randomUUID;
  const id = generateId();
  const externalId = options.generateExternalId?.() ?? createAwsExternalId(id);
  const awsConnection = await repository.createAwsConnection({
    id,
    projectId: input.projectId,
    userId: input.accessContext.userId,
    externalId,
    region: input.region,
    status: "pending"
  });
  const trustPolicyTemplate = createTrustPolicyTemplate({
    callerPrincipalArn: input.callerPrincipalArn,
    externalId
  });
  const permissionSetup = createInitialPermissionSetup();
  const callerRoleSetup = createCallerRoleSetup(recommendedRoleName);

  return {
    awsConnection: toAwsConnection(awsConnection),
    callerPrincipalArn: input.callerPrincipalArn,
    recommendedRoleName,
    roleSetup: {
      roleName: recommendedRoleName,
      trustedPrincipalArn: input.callerPrincipalArn,
      externalId,
      trustPolicy: trustPolicyTemplate,
      permissionSetup
    },
    callerRoleSetup,
    trustPolicyTemplate
  };
}

export function createAwsExternalId(connectionId: string): string {
  return `sc_conn_${connectionId}_${randomBytes(24).toString("base64url")}`;
}

export function toAwsConnection(row: AwsConnectionRecord): AwsConnection {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    accountId: row.accountId,
    roleArn: row.roleArn,
    externalId: row.externalId,
    region: row.region,
    status: row.status,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function verifyAwsConnection(
  input: VerifyAwsConnectionInput,
  repository: AwsConnectionRepository,
  tester: AwsConnectionTester = createAwsConnectionTester(),
  options: VerifyAwsConnectionOptions = {}
): Promise<VerifyAwsConnectionResponse> {
  const awsConnection = await repository.findAccessibleAwsConnection(
    input.projectId,
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  const now = options.now ?? (() => new Date());
  const markFailed = async (accountId: string | null) => {
    await repository.updateAwsConnectionVerification({
      connectionId: awsConnection.id,
      accountId,
      roleArn: input.roleArn,
      status: "failed",
      lastVerifiedAt: null
    });
  };

  if (awsConnection.region !== supportedAwsConnectionRegion) {
    await markFailed(null);
    throw new AwsConnectionVerificationError("AWS connection region must be ap-northeast-2");
  }

  if (awsConnection.externalId.trim().length === 0) {
    await markFailed(null);
    throw new AwsConnectionVerificationError("AWS connection external ID is missing");
  }

  let result: Awaited<ReturnType<AwsConnectionTester["testConnection"]>>;

  try {
    result = await tester.testConnection({
      roleArn: input.roleArn,
      externalId: awsConnection.externalId,
      region: awsConnection.region
    });
  } catch (error) {
    await markFailed(null);

    if (error instanceof AwsConnectionTestError) {
      throw error;
    }

    throw new AwsConnectionTestError("AWS Role connection test failed");
  }

  const expectedAccountId = getAwsAccountIdFromRoleArn(input.roleArn);

  if (result.accountId !== expectedAccountId) {
    await markFailed(result.accountId);
    throw new AwsConnectionVerificationError("AWS Role account mismatch");
  }

  const verifiedAt = now();
  const updatedConnection = await repository.updateAwsConnectionVerification({
    connectionId: awsConnection.id,
    accountId: result.accountId,
    roleArn: input.roleArn,
    status: "verified",
    lastVerifiedAt: verifiedAt
  });

  if (!updatedConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  return {
    ok: true,
    accountId: result.accountId,
    callerArn: result.callerArn,
    region: result.region,
    awsConnection: toAwsConnection(updatedConnection)
  };
}

function createTrustPolicyTemplate(input: {
  callerPrincipalArn: string;
  externalId: string;
}): Record<string, unknown> {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: input.callerPrincipalArn
        },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": input.externalId
          }
        }
      }
    ]
  };
}

function createInitialPermissionSetup(): AwsRolePermissionSetup {
  return {
    verificationActions: ["sts:GetCallerIdentity"],
    initialPolicyDocument: null,
    terraformPolicyDocument: null
  };
}

function createCallerRoleSetup(roleName: string): SketchCatchCallerRoleSetup {
  const assumableRoleArnPattern = `arn:aws:iam::*:role/${roleName}`;

  return {
    policyName: callerAssumeRolePolicyName,
    assumableRoleArnPattern,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Resource: assumableRoleArnPattern
        }
      ]
    }
  };
}
