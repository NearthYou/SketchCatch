import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDatabaseClient } from "../db/client.js";
import { architectures, deployments, projectAssets, projects } from "../db/schema.js";

const workspaceIdSchema = z.string().min(1).max(128)

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

export async function registerDeploymentRoutes(app: FastifyInstance): Promise<void> {
    app.post("/projects/:projectId/deployments", async(request, reply) => {
        const params = createDeploymentParamsSchema.parse(request.params);
        const body = createDeploymentBodySchema.parse(request.body);
        const { db } = getDatabaseClient();

        const [project] = await db.select().from(projects).where(
            and(
                eq(projects.id, params.projectId),
                eq(projects.workspaceId, body.clientGeneratedWorkspaceId)
            )
        );

        if (!project) {
            return reply.status(404).send({
                error: "not_found",
                message: "Project not found for workspace"
            });
        }

        const [architecture] = await db.select().from(architectures).where(
            and(
                eq(architectures.id, body.architectureId),
                eq(architectures.projectId, params.projectId)
            )
        );

        if (!architecture) {
            return reply.status(404).send({
                error: "not_found",
                message: "Architecture not found for workspace"
            });
        }

        const [terraformArtifact] = await db.select().from(projectAssets).where(
            and(
                eq(projectAssets.id, body.terraformArtifactId),
                eq(projectAssets.projectId, params.projectId),
                eq(projectAssets.architectureId, body.architectureId),
                eq(projectAssets.assetType, "terraform_file")
            )
        );

        if (!terraformArtifact) {
            return reply.status(404).send({
                error:"not_found",
                message: "Terraform Artifact not found for workspace"
            });
        }

        const [deployment] = await db.insert(deployments).values({
            id: randomUUID(),
            projectId: params.projectId,
            architectureId: body.architectureId,
            terraformArtifactId: body.terraformArtifactId,
            status: "PENDING"
        }).returning();

        return { deployment };
    })

    app.get("/deployments/:deploymentId", async(request, reply) => {
        const params = deploymentParamsSchema.parse(request.params);
        const { db } = getDatabaseClient();

        const [deployment] = await db.select().from(deployments).where(
            eq(deployments.id, params.deploymentId)
        );

        if (!deployment) {
            return reply.status(404).send({
                error: "not_found",
                message: "Deployment not found"
            });
        }

        return reply.status(201).send({ deployment });
    });
}