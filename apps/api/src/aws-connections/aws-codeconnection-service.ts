import { randomUUID } from "node:crypto";
import {
  CodeConnectionsClient,
  CreateConnectionCommand,
  DeleteConnectionCommand,
  GetConnectionCommand,
  ListConnectionsCommand,
  ListTagsForResourceCommand,
  type CodeConnectionsClientConfig
} from "@aws-sdk/client-codeconnections";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { AwsCodeConnectionResponse, AwsCodeConnectionStatus } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  awsCodeConnections,
  awsConnections,
  projectBuildEnvironments,
  projectDeploymentTargets,
  projectExecutionLeases
} from "../db/schema.js";
import type {
  AwsConnectionManagedResources,
  AwsConnectionRecord
} from "./aws-connection-service.js";
import { createAwsSdkStsGateway } from "./aws-connection-test-service.js";

export type VerifiedAwsConnectionForCodeConnection = {
  id: string;
  accountId: string;
  roleArn: string;
  externalId: string;
  region: string;
};

type VerifiedAwsConnectionRecord = AwsConnectionRecord & {
  accountId: string;
  roleArn: string;
};

export type AwsCodeConnectionRecord = typeof awsCodeConnections.$inferSelect;

export type AwsCodeConnectionRepository = {
  findVerifiedConnection(
    connectionId: string,
    userId: string
  ): Promise<VerifiedAwsConnectionRecord | undefined>;
  findByAwsConnectionId(
    connectionId: string
  ): Promise<AwsCodeConnectionRecord | undefined>;
  reserve(
    input: Omit<AwsCodeConnectionRecord, "createdAt"> & { createdAt?: Date }
  ): Promise<{ record: AwsCodeConnectionRecord; acquired: boolean }>;
  claimCreation(input: {
    id: string;
    expectedUpdatedAt: Date;
    now: Date;
  }): Promise<boolean>;
  completeCreation(input: {
    id: string;
    connectionArn: string;
    now: Date;
  }): Promise<AwsCodeConnectionRecord | undefined>;
  markCreationFailed(input: { id: string; reason: string; now: Date }): Promise<void>;
  save(
    input: Omit<AwsCodeConnectionRecord, "createdAt"> & { createdAt?: Date }
  ): Promise<AwsCodeConnectionRecord>;
  findManagedResources(connectionId: string): Promise<AwsConnectionManagedResources>;
  claimDeletion(input: {
    id: string;
    connectionId: string;
    now: Date;
  }): Promise<"claimed" | "blocked" | "busy" | "not_found">;
  completeDeletion(input: { id: string; connectionId: string }): Promise<boolean>;
  markDeletionFailed(input: { id: string; reason: string; now: Date }): Promise<void>;
};

export type AwsCodeConnectionGateway = {
  findOwnedByName(
    input: VerifiedAwsConnectionForCodeConnection & { name: string }
  ): Promise<Array<{ connectionArn: string }>>;
  create(input: VerifiedAwsConnectionForCodeConnection & { name: string }): Promise<{
    connectionArn: string;
  }>;
  get(input: VerifiedAwsConnectionForCodeConnection & { connectionArn: string }): Promise<{
    connectionArn: string;
    providerType: "GitHub";
    status: AwsCodeConnectionStatus;
    statusReason: string | null;
  }>;
  delete(
    input: VerifiedAwsConnectionForCodeConnection & { connectionArn: string }
  ): Promise<void>;
};

export type AwsCodeConnectionServiceOptions = {
  generateId?: () => string;
  now?: () => Date;
  creationReservationTtlMs?: number;
};

const defaultCreationReservationTtlMs = 2 * 60 * 1000;

export type AwsCodeConnectionErrorCode =
  | "AWS_CONNECTION_REQUIRED"
  | "CODECONNECTION_NOT_FOUND"
  | "CODECONNECTION_CREATE_FAILED"
  | "CODECONNECTION_REFRESH_FAILED"
  | "CODECONNECTION_DELETE_BLOCKED"
  | "CODECONNECTION_DELETE_CONFIRMATION_REQUIRED"
  | "CODECONNECTION_DELETE_FAILED";

export class AwsCodeConnectionError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: AwsCodeConnectionErrorCode,
    message: string,
    statusCode = 409
  ) {
    super(message);
    this.name = "AwsCodeConnectionError";
    this.statusCode = statusCode;
  }
}

export function createPostgresAwsCodeConnectionRepository(
  db: Database
): AwsCodeConnectionRepository {
  return {
    async findVerifiedConnection(connectionId, userId) {
      const [connection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, userId),
            eq(awsConnections.status, "verified"),
            isNull(awsConnections.deletionStartedAt),
            isNotNull(awsConnections.accountId),
            isNotNull(awsConnections.roleArn)
          )
        );

      if (!connection?.accountId || !connection.roleArn) return undefined;
      return { ...connection, accountId: connection.accountId, roleArn: connection.roleArn };
    },

    async findByAwsConnectionId(connectionId) {
      const [connection] = await db
        .select()
        .from(awsCodeConnections)
        .where(eq(awsCodeConnections.awsConnectionId, connectionId));
      return connection;
    },

    async reserve(input) {
      const createdAt = input.createdAt ?? input.updatedAt;
      const [inserted] = await db
        .insert(awsCodeConnections)
        .values({ ...input, createdAt })
        .onConflictDoNothing({ target: awsCodeConnections.awsConnectionId })
        .returning();
      if (inserted) return { record: inserted, acquired: true };

      const [existing] = await db
        .select()
        .from(awsCodeConnections)
        .where(eq(awsCodeConnections.awsConnectionId, input.awsConnectionId));
      if (!existing) {
        throw new AwsCodeConnectionError(
          "CODECONNECTION_CREATE_FAILED",
          "GitHub build connection reservation was not saved"
        );
      }
      return { record: existing, acquired: false };
    },

    async claimCreation(input) {
      const claimed = await db
        .update(awsCodeConnections)
        .set({
          status: "CREATING",
          statusReason: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(awsCodeConnections.id, input.id),
            isNull(awsCodeConnections.connectionArn),
            eq(awsCodeConnections.updatedAt, input.expectedUpdatedAt),
            or(
              eq(awsCodeConnections.status, "CREATING"),
              eq(awsCodeConnections.status, "ERROR")
            )
          )
        )
        .returning({ id: awsCodeConnections.id });
      return claimed.length === 1;
    },

    async completeCreation(input) {
      const [connection] = await db
        .update(awsCodeConnections)
        .set({
          connectionArn: input.connectionArn,
          status: "PENDING",
          statusReason: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(awsCodeConnections.id, input.id),
            eq(awsCodeConnections.status, "CREATING"),
            isNull(awsCodeConnections.connectionArn)
          )
        )
        .returning();
      return connection;
    },

    async markCreationFailed(input) {
      await db
        .update(awsCodeConnections)
        .set({
          status: "ERROR",
          statusReason: input.reason,
          updatedAt: input.now
        })
        .where(
          and(
            eq(awsCodeConnections.id, input.id),
            eq(awsCodeConnections.status, "CREATING"),
            isNull(awsCodeConnections.connectionArn)
          )
        );
    },

    async save(input) {
      const createdAt = input.createdAt ?? input.updatedAt;
      const [connection] = await db
        .insert(awsCodeConnections)
        .values({ ...input, createdAt })
        .onConflictDoUpdate({
          target: awsCodeConnections.awsConnectionId,
          set: {
            connectionArn: input.connectionArn,
            providerType: input.providerType,
            status: input.status,
            statusReason: input.statusReason,
            updatedAt: input.updatedAt
          }
        })
        .returning();

      if (!connection) {
        throw new AwsCodeConnectionError(
          "CODECONNECTION_CREATE_FAILED",
          "GitHub build connection metadata was not saved"
        );
      }
      return connection;
    },

    async findManagedResources(connectionId) {
      const [buildRows, codeConnectionRows] = await Promise.all([
        db
          .select({
            projectId: projectBuildEnvironments.projectId,
            projectName: projectBuildEnvironments.codeBuildProjectName,
            serviceRoleArn: projectBuildEnvironments.codeBuildServiceRoleArn
          })
          .from(projectBuildEnvironments)
          .where(eq(projectBuildEnvironments.awsConnectionId, connectionId)),
        db
          .select({ connectionArn: awsCodeConnections.connectionArn })
          .from(awsCodeConnections)
          .where(eq(awsCodeConnections.awsConnectionId, connectionId))
      ]);
      return {
        codeBuildProjects: buildRows,
        codeConnectionArn: codeConnectionRows[0]?.connectionArn ?? null
      };
    },

    async claimDeletion(input) {
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        const [awsConnection] = await transaction
          .select({ deletionStartedAt: awsConnections.deletionStartedAt })
          .from(awsConnections)
          .where(eq(awsConnections.id, input.connectionId))
          .for("update");
        if (!awsConnection) return "not_found" as const;
        if (awsConnection.deletionStartedAt) return "blocked" as const;
        const [record] = await transaction
          .select()
          .from(awsCodeConnections)
          .where(
            and(
              eq(awsCodeConnections.id, input.id),
              eq(awsCodeConnections.awsConnectionId, input.connectionId)
            )
          )
          .for("update");
        if (!record) return "not_found" as const;
        if (record.status === "CREATING" || record.status === "DELETING") {
          return "busy" as const;
        }
        if (await hasActiveBuildWork(tx, input.connectionId)) {
          return "blocked" as const;
        }
        const [claimed] = await transaction
          .update(awsCodeConnections)
          .set({ status: "DELETING", statusReason: null, updatedAt: input.now })
          .where(
            and(
              eq(awsCodeConnections.id, input.id),
              eq(awsCodeConnections.awsConnectionId, input.connectionId),
              eq(awsCodeConnections.updatedAt, record.updatedAt)
            )
          )
          .returning({ id: awsCodeConnections.id });
        return claimed ? "claimed" as const : "busy" as const;
      });
    },

    async completeDeletion(input) {
      return db.transaction(async (transaction) => {
        await transaction
          .delete(projectBuildEnvironments)
          .where(eq(projectBuildEnvironments.awsConnectionId, input.connectionId));
        const [deleted] = await transaction
          .delete(awsCodeConnections)
          .where(
            and(
              eq(awsCodeConnections.id, input.id),
              eq(awsCodeConnections.awsConnectionId, input.connectionId),
              eq(awsCodeConnections.status, "DELETING")
            )
          )
          .returning({ id: awsCodeConnections.id });
        return Boolean(deleted);
      });
    },

    async markDeletionFailed(input) {
      await db
        .update(awsCodeConnections)
        .set({
          status: "ERROR",
          statusReason: input.reason.slice(0, 500),
          updatedAt: input.now
        })
        .where(
          and(
            eq(awsCodeConnections.id, input.id),
            eq(awsCodeConnections.status, "DELETING")
          )
        );
    }
  };
}

export function createAwsCodeConnectionGateway(options: {
  assumeRole?: ReturnType<typeof createAwsSdkStsGateway>["assumeRole"];
  createClient?: (configuration: CodeConnectionsClientConfig) => CodeConnectionsClient;
} = {}): AwsCodeConnectionGateway {
  const createClient =
    options.createClient ?? ((configuration) => new CodeConnectionsClient(configuration));
  const assumeRole = options.assumeRole ?? createAwsSdkStsGateway().assumeRole;

  async function withClient<T>(
    connection: VerifiedAwsConnectionForCodeConnection,
    operation: (client: CodeConnectionsClient) => Promise<T>
  ): Promise<T> {
    const credentials = await assumeRole({
      roleArn: connection.roleArn,
      externalId: connection.externalId,
      region: connection.region,
      roleSessionName: `sketchcatch-codeconnection-${connection.id}`
    });
    const client = createClient({ region: connection.region, credentials });
    try {
      return await operation(client);
    } finally {
      client.destroy();
    }
  }

  return {
    async findOwnedByName(input) {
      return withClient(input, async (client) => {
        const matches: Array<{ connectionArn: string }> = [];
        let nextToken: string | undefined;
        do {
          const response = await client.send(
            new ListConnectionsCommand({
              ProviderTypeFilter: "GitHub",
              MaxResults: 50,
              ...(nextToken ? { NextToken: nextToken } : {})
            })
          );
          for (const candidate of response.Connections ?? []) {
            const candidateArn = candidate.ConnectionArn?.trim();
            if (!candidateArn || candidate.ConnectionName !== input.name) continue;
            const tagsResponse = await client.send(
              new ListTagsForResourceCommand({ ResourceArn: candidateArn })
            );
            const tags = new Map(
              (tagsResponse.Tags ?? []).flatMap((tag) =>
                tag.Key && tag.Value ? [[tag.Key, tag.Value] as const] : []
              )
            );
            if (
              tags.get("ManagedBy") === "SketchCatch" &&
              tags.get("SketchCatchAwsConnection") === input.id
            ) {
              matches.push({ connectionArn: candidateArn });
            }
          }
          nextToken = response.NextToken;
        } while (nextToken);
        return matches;
      });
    },

    async create(input) {
      return withClient(input, async (client) => {
        const response = await client.send(
          new CreateConnectionCommand({
            ConnectionName: input.name,
            ProviderType: "GitHub",
            Tags: [
              { Key: "ManagedBy", Value: "SketchCatch" },
              { Key: "SketchCatchAwsConnection", Value: input.id }
            ]
          })
        );
        const connectionArn = response.ConnectionArn?.trim();
        if (!connectionArn) {
          throw new AwsCodeConnectionError(
            "CODECONNECTION_CREATE_FAILED",
            "AWS did not return a GitHub build connection ARN"
          );
        }
        return { connectionArn };
      });
    },

    async get(input) {
      return withClient(input, async (client) => {
        const response = await client.send(
          new GetConnectionCommand({ ConnectionArn: input.connectionArn })
        );
        const connection = response.Connection;
        if (!connection?.ConnectionArn) {
          throw new AwsCodeConnectionError(
            "CODECONNECTION_NOT_FOUND",
            "GitHub build connection was not found in AWS",
            404
          );
        }
        if (connection.ProviderType !== "GitHub") {
          throw new AwsCodeConnectionError(
            "CODECONNECTION_REFRESH_FAILED",
            "AWS connection provider is not GitHub"
          );
        }
        return {
          connectionArn: connection.ConnectionArn,
          providerType: "GitHub",
          status: normalizeAwsCodeConnectionStatus(connection.ConnectionStatus),
          statusReason: null
        };
      });
    },

    async delete(input) {
      await withClient(input, async (client) => {
        await client.send(
          new DeleteConnectionCommand({ ConnectionArn: input.connectionArn })
        );
      });
    }
  };
}

export async function createAwsCodeConnection(
  input: { connectionId: string; userId: string },
  repository: AwsCodeConnectionRepository,
  gateway: AwsCodeConnectionGateway = createAwsCodeConnectionGateway(),
  options: AwsCodeConnectionServiceOptions = {}
): Promise<AwsCodeConnectionResponse> {
  const connection = await requireVerifiedConnection(input, repository);
  const now = options.now?.() ?? new Date();
  const connectionName = createAwsCodeConnectionName(connection.id);
  let reservation = await repository.findByAwsConnectionId(connection.id);
  let ownsReservation = false;

  if (!reservation) {
    const reserved = await repository.reserve({
      id: options.generateId?.() ?? randomUUID(),
      awsConnectionId: connection.id,
      connectionArn: null,
      providerType: "GitHub",
      status: "CREATING",
      statusReason: null,
      createdAt: now,
      updatedAt: now
    });
    reservation = reserved.record;
    ownsReservation = reserved.acquired;
  }

  if (reservation.connectionArn) return toResponse(reservation, connection.region);

  if (!ownsReservation) {
    const reservationExpired =
      now.getTime() - reservation.updatedAt.getTime() >=
      (options.creationReservationTtlMs ?? defaultCreationReservationTtlMs);
    if (reservation.status !== "ERROR" && !reservationExpired) {
      return toResponse(reservation, connection.region);
    }
    ownsReservation = await repository.claimCreation({
      id: reservation.id,
      expectedUpdatedAt: reservation.updatedAt,
      now
    });
    if (!ownsReservation) {
      const current = await repository.findByAwsConnectionId(connection.id);
      if (!current) {
        throw new AwsCodeConnectionError(
          "CODECONNECTION_CREATE_FAILED",
          "GitHub build connection reservation changed unexpectedly"
        );
      }
      return toResponse(current, connection.region);
    }
  }

  let ownedConnections: Array<{ connectionArn: string }>;
  try {
    await requireVerifiedConnection(input, repository);
    ownedConnections = await gateway.findOwnedByName({
      ...connection,
      name: connectionName
    });
  } catch (error) {
    await repository.markCreationFailed({
      id: reservation.id,
      reason: toSafeCreationFailureReason(error),
      now
    });
    throw error;
  }

  let selectedArn = [...new Set(ownedConnections.map((item) => item.connectionArn))].sort()[0];
  if (!selectedArn) {
    try {
      const currentConnection = await requireVerifiedConnection(input, repository);
      selectedArn = (
        await gateway.create({
          ...currentConnection,
          name: connectionName
        })
      ).connectionArn;
    } catch (error) {
      await repository.markCreationFailed({
        id: reservation.id,
        reason: toSafeCreationFailureReason(error),
        now
      });
      throw error;
    }
  }

  await requireVerifiedConnection(input, repository);
  const saved = await repository.completeCreation({
    id: reservation.id,
    connectionArn: selectedArn,
    now
  });
  if (!saved) {
    const current = await repository.findByAwsConnectionId(connection.id);
    if (!current) {
      throw new AwsCodeConnectionError(
        "CODECONNECTION_CREATE_FAILED",
        "GitHub build connection reservation disappeared"
      );
    }
    if (current.connectionArn && current.connectionArn !== selectedArn) {
      await gateway.delete({ ...connection, connectionArn: selectedArn }).catch(() => undefined);
    }
    return toResponse(current, connection.region);
  }

  await Promise.allSettled(
    ownedConnections
      .map((item) => item.connectionArn)
      .filter((candidateArn) => candidateArn !== selectedArn)
      .map((candidateArn) => gateway.delete({ ...connection, connectionArn: candidateArn }))
  );
  return toResponse(saved, connection.region);
}

export async function getAwsCodeConnection(
  input: { connectionId: string; userId: string },
  repository: AwsCodeConnectionRepository
): Promise<AwsCodeConnectionResponse> {
  const connection = await requireVerifiedConnection(input, repository);
  const record = await repository.findByAwsConnectionId(connection.id);
  return record ? toResponse(record, connection.region) : { codeConnection: null };
}

export async function refreshAwsCodeConnection(
  input: { connectionId: string; userId: string },
  repository: AwsCodeConnectionRepository,
  gateway: AwsCodeConnectionGateway = createAwsCodeConnectionGateway(),
  options: AwsCodeConnectionServiceOptions = {}
): Promise<AwsCodeConnectionResponse> {
  const connection = await requireVerifiedConnection(input, repository);
  const existing = await repository.findByAwsConnectionId(connection.id);
  if (!existing) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_NOT_FOUND",
      "GitHub build connection has not been created",
      404
    );
  }

  if (!existing.connectionArn) {
    return toResponse(existing, connection.region);
  }

  const observed = await gateway.get({
    ...connection,
    connectionArn: existing.connectionArn
  });
  const saved = await repository.save({
    ...existing,
    connectionArn: observed.connectionArn,
    providerType: observed.providerType,
    status: observed.status,
    statusReason: observed.statusReason,
    updatedAt: options.now?.() ?? new Date()
  });
  return toResponse(saved, connection.region);
}

async function requireVerifiedConnection(
  input: { connectionId: string; userId: string },
  repository: AwsCodeConnectionRepository
): Promise<VerifiedAwsConnectionForCodeConnection> {
  const connection = await repository.findVerifiedConnection(input.connectionId, input.userId);
  if (!connection) {
    throw new AwsCodeConnectionError(
      "AWS_CONNECTION_REQUIRED",
      "A verified AWS connection is required before connecting GitHub builds"
    );
  }
  return connection;
}

function createAwsCodeConnectionName(connectionId: string): string {
  return `sketchcatch-${connectionId.replaceAll("-", "").slice(0, 8)}-github`;
}

function toResponse(
  record: AwsCodeConnectionRecord,
  region: string
): AwsCodeConnectionResponse {
  return {
    codeConnection: {
      id: record.id,
      awsConnectionId: record.awsConnectionId,
      connectionArn: record.connectionArn,
      providerType: record.providerType,
      status: record.status,
      statusReason: record.statusReason,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    },
    setupUrl:
      record.status === "AVAILABLE" ||
      record.status === "CREATING" ||
      record.status === "DELETING" ||
      !record.connectionArn
        ? null
        : `https://${region}.console.aws.amazon.com/codesuite/settings/connections?region=${region}`
  };
}

function normalizeAwsCodeConnectionStatus(value: string | undefined): AwsCodeConnectionStatus {
  if (value === "AVAILABLE" || value === "ERROR") return value;
  return "PENDING";
}

function toSafeCreationFailureReason(error: unknown): string {
  return (error instanceof Error ? error.message : "AWS CodeConnection creation failed").slice(
    0,
    500
  );
}

async function hasActiveBuildWork(db: Database, connectionId: string): Promise<boolean> {
  const [leaseRows, preparingRows] = await Promise.all([
    db
      .select({ projectId: projectExecutionLeases.projectId })
      .from(projectExecutionLeases)
      .innerJoin(
        projectDeploymentTargets,
        eq(projectDeploymentTargets.projectId, projectExecutionLeases.projectId)
      )
      .where(
        and(
          eq(projectDeploymentTargets.connectionId, connectionId),
          inArray(projectExecutionLeases.status, ["active", "releasing"])
        )
      )
      .limit(1),
    db
      .select({ id: projectBuildEnvironments.id })
      .from(projectBuildEnvironments)
      .where(
        and(
          eq(projectBuildEnvironments.awsConnectionId, connectionId),
          eq(projectBuildEnvironments.status, "preparing")
        )
      )
      .limit(1)
  ]);
  return leaseRows.length > 0 || preparingRows.length > 0;
}
