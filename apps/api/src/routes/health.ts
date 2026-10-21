import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type DatabaseClient, getDatabaseClient } from "../db/client.js";
import {
  getRequiredDatabaseMigrationHead,
  readPostgresDatabaseMigrationStatus,
  type DatabaseMigrationStatus
} from "../db/migration-readiness.js";
import {
  createApiRuntimeIdentity,
  type ApiRuntimeIdentity
} from "../runtime/runtime-identity.js";

export type HealthRouteOptions = {
  readonly getDatabaseClient?: () => DatabaseClient;
  readonly getMigrationStatus?: () => Promise<DatabaseMigrationStatus>;
  readonly runtimeIdentity?: ApiRuntimeIdentity;
};

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions = {}
): Promise<void> {
  const getHealthDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const runtimeIdentity = options.runtimeIdentity ?? createDefaultRuntimeIdentity();
  const getMigrationStatus =
    options.getMigrationStatus ??
    (() => readPostgresDatabaseMigrationStatus(getHealthDatabaseClient().pool));

  const getRuntimeHealth = async (_request: FastifyRequest, reply: FastifyReply) => {
    setRuntimeIdentityHeaders(reply, runtimeIdentity);

    return {
      status: "ok",
      runtime: runtimeIdentity
    };
  };

  const getDatabaseHealth = async (_request: FastifyRequest, reply: FastifyReply) => {
    setRuntimeIdentityHeaders(reply, runtimeIdentity);

    try {
      const { pool } = getHealthDatabaseClient();
      await pool.query("select 1");
      const migrationStatus = await getMigrationStatus();

      if (migrationStatus.state !== "current") {
        reply.code(503);
        return {
          status: "not_ready",
          runtime: runtimeIdentity,
          databaseMigration: migrationStatus
        };
      }

      return {
        status: "ok",
        runtime: runtimeIdentity,
        databaseMigration: migrationStatus
      };
    } catch {
      reply.code(503);
      return {
        status: "not_ready",
        runtime: runtimeIdentity,
        databaseMigration: {
          state: "unavailable"
        }
      };
    }
  };

  // 웹 프록시는 /api/:path*만 API로 전달하므로, 진단 계약도 같은 경로로 제공합니다.
  app.get("/health", getRuntimeHealth);
  app.get("/api/health", getRuntimeHealth);
  app.get("/health/db", getDatabaseHealth);
  app.get("/api/health/db", getDatabaseHealth);
}

function createDefaultRuntimeIdentity(): ApiRuntimeIdentity {
  try {
    return createApiRuntimeIdentity({
      databaseMigrationHead: getRequiredDatabaseMigrationHead()
    });
  } catch {
    return createApiRuntimeIdentity({ databaseMigrationHead: null });
  }
}

function setRuntimeIdentityHeaders(reply: FastifyReply, runtimeIdentity: ApiRuntimeIdentity): void {
  reply.header("x-sketchcatch-runtime-contract", runtimeIdentity.contractVersion);
  reply.header("x-sketchcatch-api-revision", runtimeIdentity.apiRevision);
  reply.header("x-sketchcatch-database-migration-head", runtimeIdentity.databaseMigrationHead ?? "none");
}
