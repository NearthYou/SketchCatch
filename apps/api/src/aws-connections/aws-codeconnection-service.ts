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
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import type {
  AwsCodeConnectionResponse,
  AwsCodeConnectionStatus
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { awsCodeConnections, awsConnections } from "../db/schema.js";
import { createAwsSdkStsGateway } from "./aws-connection-test-service.js";

export type VerifiedAwsConnectionForCodeConnection = {
  id: string;
  roleArn: string;
  externalId: string;
  region: string;
};

export type AwsCodeConnectionRecord = typeof awsCodeConnections.$inferSelect;

export type AwsCodeConnectionRepository = {
  findVerifiedConnection(
    connectionId: string,
    userId: string
  ): Promise<VerifiedAwsConnectionForCodeConnection | undefined>;
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
  | "CODECONNECTION_REFRESH_FAILED";

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
        .select({
          id: awsConnections.id,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region
        })
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, userId),
            eq(awsConnections.status, "verified"),
            isNull(awsConnections.deletionStartedAt),
            isNotNull(awsConnections.roleArn)
          )
        );

      if (!connection?.roleArn) return undefined;
      return { ...connection, roleArn: connection.roleArn };
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
