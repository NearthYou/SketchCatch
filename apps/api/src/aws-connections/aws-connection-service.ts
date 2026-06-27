import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse,
  AwsRolePermissionSetup,
  CreateAwsConnectionResponse,
  SketchCatchCallerRoleSetup,
  TestAwsConnectionResponse,
  VerifyAwsConnectionResponse
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { awsConnections, deployments } from "../db/schema.js";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import {
  AwsConnectionTestError,
  createAwsConnectionTester,
  getAwsAccountIdFromRoleArn,
  supportedAwsConnectionRegion,
  type AwsConnectionTester
} from "./aws-connection-test-service.js";

export const recommendedAwsConnectionRoleName = "SketchCatchTerraformExecutionRole";
const callerAssumeRolePolicyName = "SketchCatchAssumeTerraformExecutionRole";
const cloudFormationTemplateTokenVersion = 1;
const cloudFormationTemplateTokenSeparator = "~";
const defaultCloudFormationTemplateTokenTtlMs = 60 * 60 * 1000;

export type AwsConnectionRecord = typeof awsConnections.$inferSelect;

export type CreateAwsConnectionInput = {
  accessContext: ProjectAccessContext;
  region: string;
  callerPrincipalArn: string;
};

export type CreateAwsConnectionRecordInput = {
  id: string;
  userId: string;
  externalId: string;
  region: string;
  status: "pending";
};

export type AwsConnectionRepository = {
  findAccessibleAwsConnection(
    connectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  listAccessibleAwsConnections(accessContext: ProjectAccessContext): Promise<AwsConnectionRecord[]>;
  findVerifiedAwsConnectionByAccountId(
    accountId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  findAwsConnectionById(connectionId: string): Promise<AwsConnectionRecord | undefined>;
  hasDeploymentUsingAwsConnection(connectionId: string): Promise<boolean>;
  createAwsConnection(input: CreateAwsConnectionRecordInput): Promise<AwsConnectionRecord>;
  deleteAccessibleAwsConnection(
    connectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  updateAwsConnectionVerification(
    input: UpdateAwsConnectionVerificationInput
  ): Promise<AwsConnectionRecord | undefined>;
};

export type CreateAwsConnectionOptions = {
  generateId?: () => string;
  generateExternalId?: () => string;
};

export type VerifyAwsConnectionInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
  roleArn: string;
};

export type TestStoredAwsConnectionInput = VerifyAwsConnectionInput;

export type DeleteAwsConnectionInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
};

export type VerifyAwsConnectionOptions = {
  now?: () => Date;
};

export type GetAwsConnectionCloudFormationTemplateInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
  callerPrincipalArn: string;
  publicBaseUrl: string | undefined;
  tokenSecret: string;
};

export type GetAwsConnectionCloudFormationTemplateOptions = {
  now?: () => Date;
  tokenTtlMs?: number;
};

export type UpdateAwsConnectionVerificationInput = {
  connectionId: string;
  userId: string;
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

export class AwsConnectionDeleteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionDeleteConflictError";
  }
}

export class AwsConnectionCloudFormationTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionCloudFormationTemplateError";
  }
}

export function createPostgresAwsConnectionRepository(db: Database): AwsConnectionRepository {
  return {
    async findAccessibleAwsConnection(connectionId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, accessContext.userId)
          )
        );

      return awsConnection;
    },

    async listAccessibleAwsConnections(accessContext) {
      return db
        .select()
        .from(awsConnections)
        .where(eq(awsConnections.userId, accessContext.userId))
        .orderBy(desc(awsConnections.updatedAt), desc(awsConnections.createdAt));
    },

    async findVerifiedAwsConnectionByAccountId(accountId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.userId, accessContext.userId),
            eq(awsConnections.accountId, accountId),
            eq(awsConnections.status, "verified")
          )
        );

      return awsConnection;
    },

    async findAwsConnectionById(connectionId) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(eq(awsConnections.id, connectionId));

      return awsConnection;
    },

    async hasDeploymentUsingAwsConnection(connectionId) {
      const [deployment] = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(eq(deployments.awsConnectionId, connectionId))
        .limit(1);

      return Boolean(deployment);
    },

    async createAwsConnection(input) {
      const [awsConnection] = await db.insert(awsConnections).values(input).returning();

      if (!awsConnection) {
        throw new Error("AWS connection creation failed");
      }

      return awsConnection;
    },

    async deleteAccessibleAwsConnection(connectionId, accessContext) {
      const [awsConnection] = await db
        .delete(awsConnections)
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, accessContext.userId)
          )
        )
        .returning();

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
        .where(
          and(
            eq(awsConnections.id, input.connectionId),
            eq(awsConnections.userId, input.userId)
          )
        )
        .returning();

      return awsConnection;
    }
  };
}

export async function listAwsConnections(
  input: {
    accessContext: ProjectAccessContext;
  },
  repository: AwsConnectionRepository
): Promise<AwsConnection[]> {
  const awsConnectionRows = await repository.listAccessibleAwsConnections(input.accessContext);

  return awsConnectionRows.map(toAwsConnection);
}

export async function createAwsConnection(
  input: CreateAwsConnectionInput,
  repository: AwsConnectionRepository,
  options: CreateAwsConnectionOptions = {}
): Promise<CreateAwsConnectionResponse> {
  const generateId = options.generateId ?? randomUUID;
  const id = generateId();
  const externalId = options.generateExternalId?.() ?? createAwsExternalId(id);
  const awsConnection = await repository.createAwsConnection({
    id,
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
  const callerRoleSetup = createCallerRoleSetup(recommendedAwsConnectionRoleName);

  return {
    awsConnection: toAwsConnection(awsConnection),
    callerPrincipalArn: input.callerPrincipalArn,
    recommendedRoleName: recommendedAwsConnectionRoleName,
    roleSetup: {
      roleName: recommendedAwsConnectionRoleName,
      trustedPrincipalArn: input.callerPrincipalArn,
      externalId,
      trustPolicy: trustPolicyTemplate,
      permissionSetup
    },
    callerRoleSetup,
    trustPolicyTemplate
  };
}

export async function deleteAwsConnection(
  input: DeleteAwsConnectionInput,
  repository: AwsConnectionRepository
): Promise<void> {
  const awsConnection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  const isUsedByDeployment = await repository.hasDeploymentUsingAwsConnection(awsConnection.id);

  if (isUsedByDeployment) {
    throw new AwsConnectionDeleteConflictError("AWS connection is used by a deployment");
  }

  const deletedConnection = await repository.deleteAccessibleAwsConnection(
    awsConnection.id,
    input.accessContext
  );

  if (!deletedConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }
}

export function createAwsExternalId(connectionId: string): string {
  return `sc_conn_${connectionId}_${randomBytes(24).toString("base64url")}`;
}

export function toAwsConnection(row: AwsConnectionRecord): AwsConnection {
  return {
    id: row.id,
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
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  assertRecommendedAwsConnectionRoleArn(input.roleArn);

  const now = options.now ?? (() => new Date());
  const markFailed = async (accountId: string | null) => {
    await repository.updateAwsConnectionVerification({
      connectionId: awsConnection.id,
      userId: awsConnection.userId,
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

  const existingVerifiedAccountConnection =
    await repository.findVerifiedAwsConnectionByAccountId(
      result.accountId,
      input.accessContext
    );

  if (
    existingVerifiedAccountConnection &&
    existingVerifiedAccountConnection.id !== awsConnection.id
  ) {
    await markFailed(result.accountId);
    throw new AwsConnectionVerificationError("AWS account is already connected");
  }

  const verifiedAt = now();
  const updatedConnection = await repository.updateAwsConnectionVerification({
    connectionId: awsConnection.id,
    userId: awsConnection.userId,
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

export async function testStoredAwsConnection(
  input: TestStoredAwsConnectionInput,
  repository: AwsConnectionRepository,
  tester: AwsConnectionTester = createAwsConnectionTester()
): Promise<TestAwsConnectionResponse> {
  const awsConnection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  assertRecommendedAwsConnectionRoleArn(input.roleArn);

  if (awsConnection.region !== supportedAwsConnectionRegion) {
    throw new AwsConnectionVerificationError("AWS connection region must be ap-northeast-2");
  }

  if (awsConnection.externalId.trim().length === 0) {
    throw new AwsConnectionVerificationError("AWS connection external ID is missing");
  }

  let result: TestAwsConnectionResponse;

  try {
    result = await tester.testConnection({
      roleArn: input.roleArn,
      externalId: awsConnection.externalId,
      region: awsConnection.region
    });
  } catch (error) {
    if (error instanceof AwsConnectionTestError) {
      throw error;
    }

    throw new AwsConnectionTestError("AWS Role connection test failed");
  }
  const expectedAccountId = getAwsAccountIdFromRoleArn(input.roleArn);

  if (result.accountId !== expectedAccountId) {
    throw new AwsConnectionVerificationError("AWS Role account mismatch");
  }

  return result;
}

export async function getAwsConnectionCloudFormationTemplate(
  input: GetAwsConnectionCloudFormationTemplateInput,
  repository: AwsConnectionRepository,
  options: GetAwsConnectionCloudFormationTemplateOptions = {}
): Promise<AwsConnectionCloudFormationTemplateResponse> {
  const awsConnection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  assertAwsConnectionCanRenderCloudFormationTemplate(awsConnection);

  const roleName = recommendedAwsConnectionRoleName;
  const stackName = createAwsConnectionStackName(awsConnection.id);
  const templateBody = createAwsConnectionCloudFormationTemplateBody({
    roleName,
    callerPrincipalArn: input.callerPrincipalArn,
    externalId: awsConnection.externalId
  });
  const publicBaseUrl = input.publicBaseUrl?.trim();

  if (!publicBaseUrl) {
    return {
      roleName,
      stackName,
      region: awsConnection.region,
      capabilities: ["CAPABILITY_NAMED_IAM"],
      templateBody,
      templateUrl: null,
      templateUrlExpiresAt: null,
      launchStackUrl: null
    };
  }

  const now = options.now ?? (() => new Date());
  const tokenTtlMs = options.tokenTtlMs ?? defaultCloudFormationTemplateTokenTtlMs;
  const templateUrlExpiresAt = new Date(now().getTime() + tokenTtlMs);
  const token = createAwsConnectionCloudFormationTemplateToken(
    {
      version: cloudFormationTemplateTokenVersion,
      connectionId: awsConnection.id,
      roleName,
      callerPrincipalArn: input.callerPrincipalArn,
      externalId: awsConnection.externalId,
      expiresAt: templateUrlExpiresAt.toISOString()
    },
    input.tokenSecret
  );
  const templateUrl = createAwsConnectionCloudFormationTemplateUrl(publicBaseUrl, token);

  return {
    roleName,
    stackName,
    region: awsConnection.region,
    capabilities: ["CAPABILITY_NAMED_IAM"],
    templateBody,
    templateUrl,
    templateUrlExpiresAt: templateUrlExpiresAt.toISOString(),
    launchStackUrl: createAwsConnectionLaunchStackUrl({
      region: awsConnection.region,
      stackName,
      templateUrl
    })
  };
}

export async function renderAwsConnectionCloudFormationTemplateFromToken(
  token: string,
  tokenSecret: string,
  repository: AwsConnectionRepository,
  now: Date = new Date()
): Promise<string> {
  const payload = parseAwsConnectionCloudFormationTemplateToken(token, tokenSecret);

  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new AwsConnectionCloudFormationTemplateError(
      "CloudFormation template URL is invalid or expired"
    );
  }

  const awsConnection = await repository.findAwsConnectionById(payload.connectionId);

  if (
    !awsConnection ||
    awsConnection.externalId !== payload.externalId ||
    awsConnection.region !== supportedAwsConnectionRegion
  ) {
    throw new AwsConnectionCloudFormationTemplateError(
      "CloudFormation template URL is invalid or expired"
    );
  }

  return createAwsConnectionCloudFormationTemplateBody({
    roleName: payload.roleName,
    callerPrincipalArn: payload.callerPrincipalArn,
    externalId: payload.externalId
  });
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

function assertAwsConnectionCanRenderCloudFormationTemplate(
  awsConnection: AwsConnectionRecord
): void {
  if (awsConnection.region !== supportedAwsConnectionRegion) {
    throw new AwsConnectionCloudFormationTemplateError(
      "AWS connection region must be ap-northeast-2"
    );
  }

  if (awsConnection.externalId.trim().length === 0) {
    throw new AwsConnectionCloudFormationTemplateError("AWS connection external ID is missing");
  }
}

export function isRecommendedAwsConnectionRoleArn(roleArn: string): boolean {
  const expectedRoleSuffix = `:role/${recommendedAwsConnectionRoleName}`;

  return (
    /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(roleArn) && roleArn.endsWith(expectedRoleSuffix)
  );
}

function assertRecommendedAwsConnectionRoleArn(roleArn: string): void {
  if (!isRecommendedAwsConnectionRoleArn(roleArn)) {
    throw new AwsConnectionVerificationError(
      `AWS Role ARN must use ${recommendedAwsConnectionRoleName}`
    );
  }
}

function createAwsConnectionStackName(connectionId: string): string {
  return `sketchcatch-aws-connection-${connectionId.slice(0, 8)}`;
}

function createAwsConnectionCloudFormationTemplateBody(input: {
  roleName: string;
  callerPrincipalArn: string;
  externalId: string;
}): string {
  const roleName = yamlDoubleQuote(input.roleName);
  const callerPrincipalArn = yamlDoubleQuote(input.callerPrincipalArn);
  const externalId = yamlDoubleQuote(input.externalId);

  return [
    'AWSTemplateFormatVersion: "2010-09-09"',
    "Description: SketchCatch AWS Role connection. Creates only the IAM Role required for STS AssumeRole verification.",
    "Resources:",
    "  SketchCatchTerraformExecutionRole:",
    "    Type: AWS::IAM::Role",
    "    Properties:",
    `      RoleName: ${roleName}`,
    "      AssumeRolePolicyDocument:",
    '        Version: "2012-10-17"',
    "        Statement:",
    "          - Effect: Allow",
    "            Principal:",
    `              AWS: ${callerPrincipalArn}`,
    "            Action: sts:AssumeRole",
    "            Condition:",
    "              StringEquals:",
    `                sts:ExternalId: ${externalId}`,
    "      Tags:",
    "        - Key: ManagedBy",
    '          Value: "SketchCatch"',
    "        - Key: SketchCatchConnection",
    `          Value: ${externalId}`,
    "Outputs:",
    "  RoleArn:",
    "    Description: Copy this ARN back to SketchCatch to verify the AWS connection.",
    "    Value: !GetAtt SketchCatchTerraformExecutionRole.Arn",
    ""
  ].join("\n");
}

function createAwsConnectionCloudFormationTemplateUrl(
  publicBaseUrl: string,
  token: string
): string {
  let baseUrl: URL;

  try {
    baseUrl = new URL(publicBaseUrl);
  } catch {
    throw new AwsConnectionCloudFormationTemplateError(
      "SKETCHCATCH_PUBLIC_BASE_URL must be a valid https URL"
    );
  }

  if (baseUrl.protocol !== "https:") {
    throw new AwsConnectionCloudFormationTemplateError(
      "SKETCHCATCH_PUBLIC_BASE_URL must use https"
    );
  }

  const templateUrl = new URL("/api/aws/connections/cloudformation-template", baseUrl);
  templateUrl.searchParams.set("token", token);

  return templateUrl.toString();
}

function createAwsConnectionLaunchStackUrl(input: {
  region: string;
  stackName: string;
  templateUrl: string;
}): string {
  const baseUrl = new URL("https://console.aws.amazon.com/cloudformation/home");
  baseUrl.searchParams.set("region", input.region);

  return `${baseUrl.toString()}#/stacks/quickcreate?templateURL=${encodeURIComponent(
    input.templateUrl
  )}&stackName=${encodeURIComponent(input.stackName)}`;
}

type AwsConnectionCloudFormationTemplateTokenPayload = {
  version: typeof cloudFormationTemplateTokenVersion;
  connectionId: string;
  roleName: string;
  callerPrincipalArn: string;
  externalId: string;
  expiresAt: string;
};

function createAwsConnectionCloudFormationTemplateToken(
  payload: AwsConnectionCloudFormationTemplateTokenPayload,
  tokenSecret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signCloudFormationTemplateTokenPayload(encodedPayload, tokenSecret);

  return `${encodedPayload}${cloudFormationTemplateTokenSeparator}${signature}`;
}

function parseAwsConnectionCloudFormationTemplateToken(
  token: string,
  tokenSecret: string
): AwsConnectionCloudFormationTemplateTokenPayload {
  const [encodedPayload, signature, extra] = token.split(cloudFormationTemplateTokenSeparator);

  if (!encodedPayload || !signature || extra !== undefined) {
    throw new AwsConnectionCloudFormationTemplateError(
      "CloudFormation template URL is invalid or expired"
    );
  }

  const expectedSignature = signCloudFormationTemplateTokenPayload(encodedPayload, tokenSecret);

  if (!timingSafeEqualString(signature, expectedSignature)) {
    throw new AwsConnectionCloudFormationTemplateError(
      "CloudFormation template URL is invalid or expired"
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new AwsConnectionCloudFormationTemplateError(
      "CloudFormation template URL is invalid or expired"
    );
  }

  if (!isAwsConnectionCloudFormationTemplateTokenPayload(payload)) {
    throw new AwsConnectionCloudFormationTemplateError(
      "CloudFormation template URL is invalid or expired"
    );
  }

  return payload;
}

function signCloudFormationTemplateTokenPayload(
  encodedPayload: string,
  tokenSecret: string
): string {
  return createHmac("sha256", tokenSecret).update(encodedPayload).digest("base64url");
}

function timingSafeEqualString(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isAwsConnectionCloudFormationTemplateTokenPayload(
  value: unknown
): value is AwsConnectionCloudFormationTemplateTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<AwsConnectionCloudFormationTemplateTokenPayload>;

  return (
    payload.version === cloudFormationTemplateTokenVersion &&
    typeof payload.connectionId === "string" &&
    payload.connectionId.trim().length > 0 &&
    typeof payload.roleName === "string" &&
    payload.roleName.trim().length > 0 &&
    typeof payload.callerPrincipalArn === "string" &&
    payload.callerPrincipalArn.trim().length > 0 &&
    typeof payload.externalId === "string" &&
    payload.externalId.trim().length > 0 &&
    typeof payload.expiresAt === "string" &&
    Number.isFinite(Date.parse(payload.expiresAt))
  );
}

function yamlDoubleQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
