import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  AwsConnection,
  AwsRolePermissionSetup,
  CreateAwsConnectionResponse,
  SketchCatchCallerRoleSetup
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { awsConnections, projects } from "../db/schema.js";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";

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
  createAwsConnection(input: CreateAwsConnectionRecordInput): Promise<AwsConnectionRecord>;
};

export type CreateAwsConnectionOptions = {
  generateId?: () => string;
  generateExternalId?: () => string;
};

export class AwsConnectionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionNotFoundError";
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

    async createAwsConnection(input) {
      const [awsConnection] = await db.insert(awsConnections).values(input).returning();

      if (!awsConnection) {
        throw new Error("AWS connection creation failed");
      }

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
