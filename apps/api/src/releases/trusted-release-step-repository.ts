import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, max, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  applicationReleaseSteps,
  deployments,
  gitCicdPipelineRuns,
  projectExecutionLeases,
  releaseCandidates
} from "../db/schema.js";
import type { TrustedReleaseRepository } from "./trusted-release-worker-service.js";

const frontendRetryRetentionMs = 24 * 60 * 60 * 1000;

export function createPostgresTrustedReleaseRepository(
  db: Database
): TrustedReleaseRepository {
  return {
    async recordStep(input) {
      await db.transaction(async (transaction) => {
        await requireCurrentFence(transaction as unknown as Database, input);
        await transaction
          .insert(applicationReleaseSteps)
          .values({
            id: randomUUID(),
            releaseId: input.releaseId,
            sequence: input.sequence,
            step: input.step,
            status: input.status,
            fencingVersion: input.fencingVersion,
            attempt: 1,
            evidence: input.evidence,
            errorSummary: input.errorSummary,
            startedAt: input.status === "running" ? input.now : null,
            completedAt: input.status === "running" ? null : input.now,
            createdAt: input.now,
            updatedAt: input.now
          })
          .onConflictDoUpdate({
            target: [applicationReleaseSteps.releaseId, applicationReleaseSteps.sequence],
            set: {
              step: input.step,
              status: input.status,
              fencingVersion: input.fencingVersion,
              attempt:
                input.status === "running"
                  ? sql`${applicationReleaseSteps.attempt} + 1`
                  : applicationReleaseSteps.attempt,
              evidence: input.evidence,
              errorSummary: input.errorSummary,
              ...(input.status === "running"
                ? { startedAt: input.now, completedAt: null }
                : { completedAt: input.now }),
              updatedAt: input.now
            }
          });
      });
    },

    async markCandidateStatus(input) {
      await db.transaction(async (transaction) => {
        await requireCurrentFence(transaction as unknown as Database, input);
        const allowedCurrentStatuses = resolveAllowedCandidateStatuses(input.status);
        const updated = await transaction
          .update(releaseCandidates)
          .set({ status: input.status, updatedAt: input.now })
          .where(
            and(
              eq(releaseCandidates.id, input.candidateId),
              eq(releaseCandidates.projectId, input.projectId),
              inArray(releaseCandidates.status, allowedCurrentStatuses)
            )
          )
          .returning({ id: releaseCandidates.id });
        if (updated.length !== 1) {
          throw new Error("ReleaseCandidate status transition was rejected");
        }
      });
    },

    async markPartialFailure(input) {
      await db.transaction(async (transaction) => {
        await requireCurrentFence(transaction as unknown as Database, input);
        const [release] = await transaction
          .update(applicationReleases)
          .set({
            status: "partially_failed",
            failureStage: input.failureStage,
            completedAt: input.now,
            updatedAt: input.now
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.projectId, input.projectId),
              eq(applicationReleases.status, "pending")
            )
          )
          .returning({
            deploymentId: applicationReleases.deploymentId,
            candidateId: applicationReleases.releaseCandidateId
          });
        if (!release?.candidateId) {
          throw new Error("Partial application release transition was rejected");
        }
        const candidate = await transaction
          .update(releaseCandidates)
          .set({
            status: "partially_failed",
            frontendRetryExpiresAt: new Date(input.now.getTime() + frontendRetryRetentionMs),
            updatedAt: input.now
          })
          .where(
            and(
              eq(releaseCandidates.id, release.candidateId),
              eq(releaseCandidates.projectId, input.projectId),
              eq(releaseCandidates.status, "activating")
            )
          )
          .returning({ id: releaseCandidates.id });
        if (candidate.length !== 1) {
          throw new Error("Partial ReleaseCandidate transition was rejected");
        }
        if (release.deploymentId) {
          await transaction
            .update(deployments)
            .set({
              status: "PARTIALLY_FAILED",
              failureStage: "application_release",
              errorSummary: `Application release partially failed at ${input.failureStage}`,
              completedAt: input.now,
              updatedAt: input.now
            })
            .where(
              and(
                eq(deployments.id, release.deploymentId),
                eq(deployments.projectId, input.projectId)
              )
            );
        }
      });
    },

    async markPartialCancellation(input) {
      await db.transaction(async (transaction) => {
        await requireCurrentFence(transaction as unknown as Database, input);
        const [release] = await transaction
          .update(applicationReleases)
          .set({
            status: "partially_cancelled",
            failureStage: input.failureStage,
            completedAt: input.now,
            updatedAt: input.now
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.projectId, input.projectId),
              eq(applicationReleases.status, "pending")
            )
          )
          .returning({
            deploymentId: applicationReleases.deploymentId,
            candidateId: applicationReleases.releaseCandidateId
          });
        if (!release?.candidateId) {
          throw new Error("Partial cancellation transition was rejected");
        }
        const candidate = await transaction
          .update(releaseCandidates)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(
            and(
              eq(releaseCandidates.id, release.candidateId),
              eq(releaseCandidates.projectId, input.projectId),
              eq(releaseCandidates.status, "activating")
            )
          )
          .returning({ id: releaseCandidates.id });
        if (candidate.length !== 1) {
          throw new Error("Partial cancellation candidate transition was rejected");
        }
        if (release.deploymentId) {
          await transaction
            .update(deployments)
            .set({
              status: "PARTIALLY_CANCELED",
              failureStage: "application_release",
              errorSummary: `Application release was cancelled after ${input.failureStage}`,
              completedAt: input.now,
              updatedAt: input.now
            })
            .where(
              and(
                eq(deployments.id, release.deploymentId),
                eq(deployments.projectId, input.projectId)
              )
            );
        }
      });
    },

    async beginFrontendRetry(input) {
      await db.transaction(async (transaction) => {
        await requireCurrentFence(transaction as unknown as Database, input);
        const [release] = await transaction
          .update(applicationReleases)
          .set({
            status: "retrying",
            completedAt: null,
            updatedAt: input.now
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.projectId, input.projectId),
              eq(applicationReleases.releaseCandidateId, input.candidateId),
              eq(applicationReleases.status, "partially_failed")
            )
          )
          .returning({
            deploymentId: applicationReleases.deploymentId,
            pipelineRunId: applicationReleases.pipelineRunId
          });
        if (
          !release ||
          Boolean(release.deploymentId) === Boolean(release.pipelineRunId)
        ) {
          throw new Error("Frontend retry requires one partially failed release owner");
        }
        const candidate = await transaction
          .update(releaseCandidates)
          .set({ status: "activating", updatedAt: input.now })
          .where(
            and(
              eq(releaseCandidates.id, input.candidateId),
              eq(releaseCandidates.projectId, input.projectId),
              eq(releaseCandidates.status, "partially_failed"),
              gt(releaseCandidates.frontendRetryExpiresAt, input.now)
            )
          )
          .returning({ id: releaseCandidates.id });
        if (candidate.length !== 1) {
          throw new Error("Frontend retry Artifact expired or changed");
        }
        if (release.pipelineRunId) {
          await transaction
            .update(gitCicdPipelineRuns)
            .set({
              status: "running",
              statusMessage: "기존 API를 유지하고 웹 배포 단계만 재시도하고 있습니다.",
              finishedAt: null,
              lastRefreshedAt: input.now
            })
            .where(eq(gitCicdPipelineRuns.id, release.pipelineRunId));
        }
      });
    },

    async completeFrontendRetry(input) {
      await db.transaction(async (transaction) => {
        await requireCurrentFence(transaction as unknown as Database, input);
        const [release] = await transaction
          .update(applicationReleases)
          .set({
            status: "succeeded",
            frontendEvidence: input.frontendEvidence,
            failureStage: null,
            healthEvidence: {
              state: "healthy",
              ecs: input.healthEvidence,
              public: input.publicEvidence
            },
            completedAt: input.now,
            updatedAt: input.now
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.projectId, input.projectId),
              eq(applicationReleases.releaseCandidateId, input.candidateId),
              eq(applicationReleases.status, "retrying")
            )
          )
          .returning({
            deploymentId: applicationReleases.deploymentId,
            pipelineRunId: applicationReleases.pipelineRunId,
            outputUrl: applicationReleases.outputUrl
          });
        if (!release || Boolean(release.deploymentId) === Boolean(release.pipelineRunId)) {
          throw new Error("Frontend retry success transition was rejected");
        }
        const candidate = await transaction
          .update(releaseCandidates)
          .set({ status: "succeeded", updatedAt: input.now })
          .where(
            and(
              eq(releaseCandidates.id, input.candidateId),
              eq(releaseCandidates.projectId, input.projectId),
              eq(releaseCandidates.status, "activating")
            )
          )
          .returning({ id: releaseCandidates.id });
        if (candidate.length !== 1) {
          throw new Error("Frontend retry candidate success transition was rejected");
        }
        if (release.deploymentId) {
          const deploymentsUpdated = await transaction
            .update(deployments)
            .set({
              status: "SUCCESS",
              activeStage: null,
              failureStage: null,
              errorSummary: null,
              completedAt: input.now,
              updatedAt: input.now
            })
            .where(
              and(
                eq(deployments.id, release.deploymentId),
                eq(deployments.projectId, input.projectId),
                eq(deployments.status, "PARTIALLY_FAILED")
              )
            )
            .returning({ id: deployments.id });
          if (deploymentsUpdated.length !== 1) {
            throw new Error("Frontend retry Deployment success transition was rejected");
          }
        } else if (release.pipelineRunId) {
          await transaction
            .update(gitCicdPipelineRuns)
            .set({
              status: "succeeded",
              statusMessage: "웹 배포 재시도와 최종 HTTPS 검증이 완료됐습니다.",
              appUrl: release.outputUrl,
              apiUrl: release.outputUrl,
              finishedAt: input.now,
              lastRefreshedAt: input.now
            })
            .where(eq(gitCicdPipelineRuns.id, release.pipelineRunId));
        }
      });
    },

    async markFrontendRetryFailure(input) {
      await db.transaction(async (transaction) => {
        await requireCurrentFence(transaction as unknown as Database, input);
        const [release] = await transaction
          .update(applicationReleases)
          .set({
            status: "partially_failed",
            failureStage: input.failureStage,
            ...(input.frontendEvidence ? { frontendEvidence: input.frontendEvidence } : {}),
            completedAt: input.now,
            updatedAt: input.now
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.projectId, input.projectId),
              eq(applicationReleases.releaseCandidateId, input.candidateId),
              eq(applicationReleases.status, "retrying")
            )
          )
          .returning({
            deploymentId: applicationReleases.deploymentId,
            pipelineRunId: applicationReleases.pipelineRunId
          });
        if (!release || Boolean(release.deploymentId) === Boolean(release.pipelineRunId)) {
          throw new Error("Frontend retry failure transition was rejected");
        }
        const candidate = await transaction
          .update(releaseCandidates)
          .set({
            status: "partially_failed",
            updatedAt: input.now
          })
          .where(
            and(
              eq(releaseCandidates.id, input.candidateId),
              eq(releaseCandidates.projectId, input.projectId),
              eq(releaseCandidates.status, "activating")
            )
          )
          .returning({ id: releaseCandidates.id });
        if (candidate.length !== 1) {
          throw new Error("Frontend retry candidate failure transition was rejected");
        }
        if (release.deploymentId) {
          await transaction
            .update(deployments)
            .set({
              status: "PARTIALLY_FAILED",
              activeStage: null,
              failureStage: "application_release",
              errorSummary: `Frontend retry failed at ${input.failureStage}: ${input.errorSummary}`,
              completedAt: input.now,
              updatedAt: input.now
            })
            .where(
              and(
                eq(deployments.id, release.deploymentId),
                eq(deployments.projectId, input.projectId)
              )
            );
        } else if (release.pipelineRunId) {
          await transaction
            .update(gitCicdPipelineRuns)
            .set({
              status: "failed",
              statusMessage: `웹 배포 재시도가 ${input.failureStage} 단계에서 실패했습니다: ${input.errorSummary}`,
              finishedAt: input.now,
              lastRefreshedAt: input.now
            })
            .where(eq(gitCicdPipelineRuns.id, release.pipelineRunId));
        }
      });
    },

    async nextStepSequence(releaseId) {
      const [latest] = await db
        .select({ sequence: max(applicationReleaseSteps.sequence) })
        .from(applicationReleaseSteps)
        .where(eq(applicationReleaseSteps.releaseId, releaseId));
      return (latest?.sequence ?? 0) + 1;
    }
  };
}

export function resolveAllowedCandidateStatuses(
  status: Parameters<TrustedReleaseRepository["markCandidateStatus"]>[0]["status"]
) {
  switch (status) {
    case "activating":
      return ["pending"] as const;
    case "succeeded":
      return ["activating"] as const;
    case "failed":
      return ["pending", "activating", "partially_failed", "failed"] as const;
    case "cancelled":
      return ["pending", "activating", "partially_failed", "cancelled"] as const;
  }
}

async function requireCurrentFence(
  db: Database,
  input: {
    projectId: string;
    holderId: string;
    fencingVersion: number;
    now: Date;
  }
): Promise<void> {
  const [lease] = await db
    .select({ projectId: projectExecutionLeases.projectId })
    .from(projectExecutionLeases)
    .where(
      and(
        eq(projectExecutionLeases.projectId, input.projectId),
        eq(projectExecutionLeases.holderId, input.holderId),
        eq(projectExecutionLeases.fencingVersion, input.fencingVersion),
        eq(projectExecutionLeases.status, "active"),
        gt(projectExecutionLeases.expiresAt, input.now)
      )
    )
    .for("update");
  if (!lease) throw new Error("Trusted release fencing token is stale");
}
