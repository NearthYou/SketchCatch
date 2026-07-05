import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ResourceType } from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  createPostgresReverseEngineeringRepository,
  createReverseEngineeringScanJob,
  ReverseEngineeringNotFoundError,
  toReverseEngineeringScan,
  toReverseEngineeringScanLogLine,
  type ReverseEngineeringRepository,
  type ReverseEngineeringServiceOptions
} from "../reverse-engineering/reverse-engineering-service.js";

const routeParamsSchema = z.object({
  projectId: z.uuid()
});

const scanRouteParamsSchema = routeParamsSchema.extend({
  scanId: z.uuid()
});

const resourceTypeSchema = z.enum([
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "EC2",
  "RDS",
  "S3",
  "SECURITY_GROUP",
  "CLOUDFRONT",
  "LAMBDA",
  "AMI",
  "IAM_ROLE",
  "IAM_POLICY",
  "IAM_INSTANCE_PROFILE",
  "KMS_KEY",
  "CLOUDWATCH_LOG_GROUP",
  "CLOUDWATCH_METRIC_ALARM",
  "API_GATEWAY_REST_API",
  "LAMBDA_PERMISSION",
  "UNKNOWN"
]);

const createScanBodySchema = z.object({
  awsConnectionId: z.uuid(),
  region: z.literal("ap-northeast-2"),
  resourceTypes: z.array(resourceTypeSchema).min(1)
});

export type ReverseEngineeringRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createReverseEngineeringRepository?: (
    db: DatabaseClient["db"]
  ) => ReverseEngineeringRepository;
  serviceOptions?: ReverseEngineeringServiceOptions;
};

export async function registerReverseEngineeringRoutes(
  app: FastifyInstance,
  options: ReverseEngineeringRouteOptions = {}
): Promise<void> {
  const getReverseEngineeringDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;

  app.post("/projects/:projectId/reverse-engineering/scans", async (request, reply) => {
    const currentUserId = await requireActiveUserId(
      request,
      getReverseEngineeringDatabaseClient
    );
    const params = routeParamsSchema.parse(request.params);
    const body = createScanBodySchema.parse(request.body);
    const repository = createRepository(options, getReverseEngineeringDatabaseClient);

    try {
      const job = await createReverseEngineeringScanJob(
        {
          projectId: params.projectId,
          accessContext: { kind: "user", userId: currentUserId },
          awsConnectionId: body.awsConnectionId,
          region: body.region,
          resourceTypes: body.resourceTypes as ResourceType[]
        },
        repository,
        options.serviceOptions
      );

      void job.run().catch((error: unknown) => {
        request.log.error({ error, scanId: job.scan.id }, "Reverse Engineering background scan failed");
      });

      return reply.status(202).send({
        scan: job.scan
      });
    } catch (error) {
      return handleReverseEngineeringError(error, reply);
    }
  });

  app.get("/projects/:projectId/reverse-engineering/scans", async (request, reply) => {
    const currentUserId = await requireActiveUserId(
      request,
      getReverseEngineeringDatabaseClient
    );
    const params = routeParamsSchema.parse(request.params);
    const repository = createRepository(options, getReverseEngineeringDatabaseClient);
    const scans = await repository.listScansByProject(params.projectId, {
      kind: "user",
      userId: currentUserId
    });

    return reply.status(200).send({
      scans: scans.map(toReverseEngineeringScan)
    });
  });

  app.get("/projects/:projectId/reverse-engineering/scans/:scanId", async (request, reply) => {
    const currentUserId = await requireActiveUserId(
      request,
      getReverseEngineeringDatabaseClient
    );
    const params = scanRouteParamsSchema.parse(request.params);
    const repository = createRepository(options, getReverseEngineeringDatabaseClient);
    const scan = await repository.findAccessibleScan(params.projectId, params.scanId, {
      kind: "user",
      userId: currentUserId
    });

    if (!scan) {
      return sendNotFound(reply, "Reverse Engineering 스캔을 찾을 수 없습니다.");
    }

    return reply.status(200).send({
      scan: toReverseEngineeringScan(scan),
      result: scan.result ?? undefined
    });
  });

  app.get(
    "/projects/:projectId/reverse-engineering/scans/:scanId/logs",
    async (request, reply) => {
      const currentUserId = await requireActiveUserId(
        request,
        getReverseEngineeringDatabaseClient
      );
      const params = scanRouteParamsSchema.parse(request.params);
      const repository = createRepository(options, getReverseEngineeringDatabaseClient);
      const logs = await repository.listScanLogs(params.projectId, params.scanId, {
        kind: "user",
        userId: currentUserId
      });

      return reply.status(200).send({
        logs: logs.map(toReverseEngineeringScanLogLine)
      });
    }
  );

  app.post(
    "/projects/:projectId/reverse-engineering/scans/:scanId/cancel",
    async (request, reply) => {
      const currentUserId = await requireActiveUserId(
        request,
        getReverseEngineeringDatabaseClient
      );
      const params = scanRouteParamsSchema.parse(request.params);
      const repository = createRepository(options, getReverseEngineeringDatabaseClient);
      const scan = await repository.requestScanCancellation(
        params.projectId,
        params.scanId,
        { kind: "user", userId: currentUserId },
        new Date()
      );

      if (!scan) {
        return sendNotFound(reply, "Reverse Engineering 스캔을 찾을 수 없습니다.");
      }

      return reply.status(200).send({
        scan: toReverseEngineeringScan(scan)
      });
    }
  );

  app.delete("/projects/:projectId/reverse-engineering/scans/:scanId", async (request, reply) => {
    const currentUserId = await requireActiveUserId(
      request,
      getReverseEngineeringDatabaseClient
    );
    const params = scanRouteParamsSchema.parse(request.params);
    const repository = createRepository(options, getReverseEngineeringDatabaseClient);
    const scan = await repository.softDeleteScan(
      params.projectId,
      params.scanId,
      { kind: "user", userId: currentUserId },
      new Date()
    );

    if (!scan) {
      return sendNotFound(reply, "Reverse Engineering 스캔을 찾을 수 없습니다.");
    }

    return reply.status(204).send();
  });
}

function createRepository(
  options: ReverseEngineeringRouteOptions,
  getReverseEngineeringDatabaseClient: () => DatabaseClient
): ReverseEngineeringRepository {
  const { db } = getReverseEngineeringDatabaseClient();

  return (
    options.createReverseEngineeringRepository?.(db) ??
    createPostgresReverseEngineeringRepository(db)
  );
}

function handleReverseEngineeringError(error: unknown, reply: FastifyReply) {
  if (error instanceof ReverseEngineeringNotFoundError) {
    return sendNotFound(reply, error.message);
  }

  throw error;
}

function sendNotFound(reply: FastifyReply, message: string) {
  return reply.status(404).send({
    error: "not_found",
    message
  });
}
