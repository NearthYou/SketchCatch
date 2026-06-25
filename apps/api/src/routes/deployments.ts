import { z } from "zod";
import { getDatabaseClient } from "../db/client.js";
import type { Deployment, DeploymentLog } from "@sketchcatch/types";
import type { FastifyReply, FastifyInstance } from "fastify";
import type { DatabaseClient } from "../db/client.js";
import {
  createDeployment,
  createPostgresDeploymentRepository,
  DeploymentNotFoundError,
  getDeployment,
  listProjectDeployments,
  listDeploymentLogs,
  type DeploymentRecord,
  type DeploymentRepository,
  type DeploymentLogRecord
} from "../deployments/deployment-service.js";

type DeploymentRow = DeploymentRecord;
const workspaceIdSchema = z.string().min(1).max(128);

const createDeploymentParamsSchema = z.object({
    projectId: z.uuid()
});

const createDeploymentBodySchema = z.object({
    clientGeneratedWorkspaceId: workspaceIdSchema,
    architectureId: z.uuid(),
    terraformArtifactId: z.uuid()
});

const deploymentParamsSchema = z.object({
    deploymentId: z.uuid()
});

const listDeploymentsParamsSchema = z.object({
  projectId: z.uuid()
});

const listDeploymentsQuerySchema = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema
});

type DeploymentRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createDeploymentRepository?: (db: DatabaseClient["db"]) => DeploymentRepository;
};

function getRepository(options: DeploymentRouteOptions | undefined): DeploymentRepository {
  const client = (options?.getDatabaseClient ?? getDatabaseClient)();

  return options?.createDeploymentRepository?.(client.db) ?? createPostgresDeploymentRepository(client.db);
}

function handleDeploymentError(error: unknown, reply: FastifyReply) {
  if (error instanceof DeploymentNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error instanceof Error ? error.message : "Deployment not found"
    });
  }

  throw error;
}

function toDeployment(row: DeploymentRow): Deployment {
    return {
        id: row.id,
        projectId: row.projectId,
        architectureId: row.architectureId,
        terraformArtifactId: row.terraformArtifactId,
        status: row.status as Deployment["status"],
        planSummary: row.planSummary,
        isBlocked: row.isBlocked,
        blockedBy: row.blockedBy,
        blockedReason: row.blockedReason,
        failureStage: row.failureStage,
        errorSummary: row.errorSummary,
        approvedAt: row.approvedAt?.toISOString() ?? null,
        approvedBy: row.approvedBy,
        approvedTerraformArtifactId: row.approvedTerraformArtifactId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
    };
}

function toDeploymentLog(row: DeploymentLogRecord): DeploymentLog {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    sequence: row.sequence,
    stage: row.stage,
    level: row.level,
    message: row.message,
    relatedResourceId: row.relatedResourceId,
    createdAt: row.createdAt.toISOString()
  };
}

export async function registerDeploymentRoutes(
    app: FastifyInstance,
    options?: DeploymentRouteOptions
    ): Promise<void> {
    app.post("/projects/:projectId/deployments", async(request, reply) => {
        const params = createDeploymentParamsSchema.parse(request.params);
        const body = createDeploymentBodySchema.parse(request.body);
        const repository = getRepository(options);

        try {
            const deployment = await createDeployment(
                {
                    projectId: params.projectId,
                    clientGeneratedWorkspaceId: body.clientGeneratedWorkspaceId,
                    architectureId: body.architectureId,
                    terraformArtifactId: body.terraformArtifactId
                }, repository
            );

            return reply.status(201).send({
                deployment: toDeployment(deployment)
            });
        }
        catch (error) {
            return handleDeploymentError(error, reply);
        }
    });

    app.get("/projects/:projectId/deployments", async(request, reply) => {
        const params = listDeploymentsParamsSchema.parse(request.params);
        const query = listDeploymentsQuerySchema.parse(request.query);
        const repository = getRepository(options);

        try {
            const deployments = await listProjectDeployments(
                {
                    projectId: params.projectId,
                    clientGeneratedWorkspaceId: query.clientGeneratedWorkspaceId
                }, repository
            );

            return reply.status(200).send({
                deployments: deployments.map(toDeployment)
            });
        }
        catch (error) {
            return handleDeploymentError(error, reply);
        }
    });

    app.get("/deployments/:deploymentId", async(request, reply) => {
        const params = deploymentParamsSchema.parse(request.params);
        const repository = getRepository(options);

        try {
            const deployment = await getDeployment(params.deploymentId, repository);

            return reply.status(200).send({
                deployment: toDeployment(deployment)
            });
        }
        catch (error) {
            return handleDeploymentError(error, reply);
        }
    });

    app.get("/deployments/:deploymentId/logs", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const repository = getRepository(options);

    try {
        const logs = await listDeploymentLogs(params.deploymentId, repository);

        return reply.status(200).send({
        logs: logs.map(toDeploymentLog)
        });
    } catch (error) {
        return handleDeploymentError(error, reply);
    }
    });
}
