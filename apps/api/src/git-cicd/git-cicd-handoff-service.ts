import { randomUUID } from "node:crypto";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import {
  APPLICATION_ARTIFACT_CONTRACT_VERSION
} from "@sketchcatch/types";
import type {
  ConfirmedBuildConfig,
  DeploymentPlanSummary,
  GitCicdAwsRoleDiff,
  GitCicdDeploymentMode,
  GitCicdHandoffKind,
  GitCicdPipelineDetailStatus,
  GitCicdRepositorySettingsPreview,
  GitCicdHandoffStatus,
  GitCicdMonitoredPath,
  ProjectDeploymentRuntimeConfig,
  RuntimeTargetKind,
  SourceRepositoryProvider
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { createApplicationArtifactIdentity } from "../artifacts/application-artifact-identity.js";
import {
  applicationArtifactKindForRuntime,
  applicationArtifactPlatformForRuntime
} from "../artifacts/application-artifact-runtime.js";
import {
  architectures,
  awsConnections,
  deploymentPlanArtifacts,
  deployments,
  gitCicdHandoffs,
  gitCicdMonitoringConfigs,
  projectAssets,
  projectDeploymentTargets,
  projects,
  sourceRepositories,
  touchUpdatedAt
} from "../db/schema.js";
import {
  createAwsRoleDiffPreview,
  createGitCicdAutomationFiles,
  createRepositorySettingsPreview,
  defaultGitCicdEnvironmentName
} from "./git-cicd-workflows.js";
import {
  DeploymentTargetFingerprintMismatchError,
  resolveAwsDeploymentTargetIdentity
} from "../runtime-convergence/deployment-target-identity.js";

export type GitCicdHandoffRecord = typeof gitCicdHandoffs.$inferSelect;
export type ProjectAccessContext = {
  kind: "user";
  userId: string;
};

export type GitCicdHandoffProjectRecord = typeof projects.$inferSelect;
export type GitCicdHandoffArchitectureRecord = typeof architectures.$inferSelect;
export type GitCicdHandoffProjectAssetRecord = typeof projectAssets.$inferSelect;
export type GitCicdHandoffTerraformArtifactRecord = Pick<
  GitCicdHandoffProjectAssetRecord,
  "id" | "projectId" | "architectureId" | "assetType" | "objectKey" | "fileName" | "contentType"
> & {
  architectureId: string;
  assetType: "terraform_file";
  uploadStatus: "uploaded";
};
export type GitCicdHandoffSourceRepositoryRecord = Pick<
  typeof sourceRepositories.$inferSelect,
  | "id"
  | "projectId"
  | "provider"
  | "status"
  | "githubInstallationId"
  | "githubRepositoryId"
  | "owner"
  | "name"
  | "defaultBranch"
  | "repositoryUrl"
  | "analysisResult"
  | "analysisRevision"
  | "analyzedAt"
>;
export type GitCicdHandoffDeploymentTargetRecord =
  typeof projectDeploymentTargets.$inferSelect & {
    awsRoleArn: string | null;
    awsAccountId: string | null;
  };
export type GitCicdHandoffApprovedDeploymentRecord = Pick<
  typeof deployments.$inferSelect,
  | "id"
  | "projectId"
  | "architectureId"
  | "terraformArtifactId"
  | "planSummary"
  | "approvedAt"
  | "approvedByUserId"
  | "approvedTerraformArtifactId"
  | "approvedPlanArtifactId"
>;
export type GitCicdHandoffApprovedPlanArtifactRecord = Pick<
  typeof deploymentPlanArtifacts.$inferSelect,
  "id" | "deploymentId" | "terraformArtifactId" | "terraformArtifactSha256" | "operation"
>;

export type CreateGitCicdHandoffInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  architectureId: string;
  terraformArtifactId: string;
  sourceRepositoryId: string;
  handoffKind?: GitCicdHandoffKind | undefined;
  sourceDeploymentId?: string | null | undefined;
  deploymentMode?: GitCicdDeploymentMode | undefined;
  targetBranch?: string | undefined;
  sourceBranch?: string | undefined;
  commitMessage?: string | undefined;
  pullRequestTitle?: string | undefined;
  environmentName?: string | undefined;
  rdsEnabled?: boolean | undefined;
  awsRegion?: string | undefined;
  awsRoleArn?: string | null | undefined;
  tfStateBucket?: string | undefined;
  releaseBucket?: string | undefined;
  staticSiteUrl?: string | null | undefined;
  apiBaseUrl?: string | null | undefined;
  userAcceptedChangeId: string;
};

export type CreateGitCicdHandoffRecordInput = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  handoffKind: GitCicdHandoffKind;
  sourceDeploymentId: string | null;
  deploymentMode: GitCicdDeploymentMode;
  requiresEnvironmentApproval: boolean;
  sourceRepositoryId: string;
  repositoryProvider: SourceRepositoryProvider;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitMessage: string | null;
  pullRequestTitle: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestHeadSha: string | null;
  mergeCommitSha: string | null;
  environmentName: string;
  pipelineRunUrl: string | null;
  infraPipelineRunUrl: string | null;
  infraPipelineStatus: GitCicdPipelineDetailStatus;
  appPipelineRunUrl: string | null;
  appPipelineStatus: GitCicdPipelineDetailStatus;
  destroyPipelineRunUrl: string | null;
  destroyPipelineStatus: GitCicdPipelineDetailStatus;
  staticSiteUrl: string | null;
  apiBaseUrl: string | null;
  repositorySettingsPreview: GitCicdRepositorySettingsPreview | null;
  awsRoleDiff: GitCicdAwsRoleDiff | null;
  githubOAuthRequired: boolean;
  status: GitCicdHandoffStatus;
  statusMessage: string | null;
  userAcceptedChangeId: string;
  createdByUserId: string;
};

export type UpdateGitCicdHandoffStatusInput = {
  handoffId: string;
  accessContext: ProjectAccessContext;
  status: GitCicdHandoffStatus;
  pullRequestUrl?: string | null | undefined;
  pipelineRunUrl?: string | null | undefined;
  pullRequestNumber?: number | null | undefined;
  pullRequestHeadSha?: string | null | undefined;
  mergeCommitSha?: string | null | undefined;
  infraPipelineRunUrl?: string | null | undefined;
  infraPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  appPipelineRunUrl?: string | null | undefined;
  appPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  destroyPipelineRunUrl?: string | null | undefined;
  destroyPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  statusMessage?: string | null | undefined;
};

export type UpdateGitCicdHandoffStatusRecordInput = {
  status: GitCicdHandoffStatus;
  pullRequestUrl?: string | null | undefined;
  pipelineRunUrl?: string | null | undefined;
  pullRequestNumber?: number | null | undefined;
  pullRequestHeadSha?: string | null | undefined;
  mergeCommitSha?: string | null | undefined;
  infraPipelineRunUrl?: string | null | undefined;
  infraPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  appPipelineRunUrl?: string | null | undefined;
  appPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  destroyPipelineRunUrl?: string | null | undefined;
  destroyPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  statusMessage?: string | null | undefined;
};

export type GitCicdProviderCreateInput = {
  handoffId: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  handoffKind: GitCicdHandoffKind;
  targetBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  projectSlug: string;
  environmentName: string;
  rdsEnabled: boolean;
  awsRegion: string;
  awsAccountId: string;
  awsRoleArn: string | null;
  tfStateBucket: string | null;
  releaseBucket: string | null;
  staticSiteUrl: string | null;
  apiBaseUrl: string | null;
  runtimeTargetKind: RuntimeTargetKind;
  confirmedBuildConfig: ConfirmedBuildConfig;
  runtimeConfig: ProjectDeploymentRuntimeConfig;
  applicationArtifactFingerprint: string;
  deploymentTargetFingerprint: string;
  terraformArtifact: {
    id: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    approvedSha256: string;
  };
  sourceRepository: {
    id: string;
    provider: SourceRepositoryProvider;
    owner: string;
    name: string;
    defaultBranch: string;
    githubInstallationId: string | null;
    githubRepositoryId: string | null;
  };
  sourceBranch: string | null;
  commitMessage: string | null;
  pullRequestTitle: string | null;
  pullRequestDraft: GitCicdPullRequestDraft;
  userAcceptedChangeId: string;
};

export type GitCicdProviderCreateResult = {
  repositoryProvider: SourceRepositoryProvider;
  sourceBranch?: string | null | undefined;
  pullRequestUrl: string | null;
  pipelineRunUrl: string | null;
  pullRequestNumber?: number | null | undefined;
  pullRequestHeadSha?: string | null | undefined;
  status: GitCicdHandoffStatus;
  statusMessage: string | null;
};

export type GitCicdHandoffProvider = {
  createHandoff(input: GitCicdProviderCreateInput): Promise<GitCicdProviderCreateResult>;
};

export type GitCicdReviewChecklistItem = {
  id: string;
  label: string;
  required: boolean;
};

export type GitCicdPullRequestDraft = {
  title: string;
  body: string;
  planSummary: DeploymentPlanSummary | null;
  reviewChecklist: GitCicdReviewChecklistItem[];
};

export type GitProviderPullRequestFile = {
  path: string;
  artifactObjectKey?: string | undefined;
  content?: string | undefined;
  contentType: string;
  expectedSha256?: string | undefined;
};

export type GitProviderCreatePullRequestInput = {
  repository: {
    provider: "github";
    installationId: string;
    owner: string;
    name: string;
  };
  targetBranch: string;
  sourceBranch: string;
  commitMessage: string;
  files: GitProviderPullRequestFile[];
  pullRequest: GitCicdPullRequestDraft;
  userAcceptedChangeId: string;
};

export type GitProviderCreatePullRequestResult = {
  pullRequestUrl: string;
  sourceBranch: string;
  commitSha: string;
  pullRequestHeadSha: string;
  pullRequestNumber: number;
};

export type GitProvider = {
  createPullRequest(
    input: GitProviderCreatePullRequestInput
  ): Promise<GitProviderCreatePullRequestResult>;
};

export type GitCicdHandoffRepository = {
  findAccessibleProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<GitCicdHandoffProjectRecord | undefined>;
  findArchitectureInProject(
    architectureId: string,
    projectId: string
  ): Promise<GitCicdHandoffArchitectureRecord | undefined>;
  findTerraformArtifactForArchitecture(
    terraformArtifactId: string,
    projectId: string,
    architectureId: string
  ): Promise<GitCicdHandoffTerraformArtifactRecord | undefined>;
  findActiveSourceRepository(
    sourceRepositoryId: string,
    projectId: string
  ): Promise<GitCicdHandoffSourceRepositoryRecord | undefined>;
  findMonitoringConfig(
    sourceRepositoryId: string
  ): Promise<typeof gitCicdMonitoringConfigs.$inferSelect | undefined>;
  findProjectDeploymentTarget(
    projectId: string
  ): Promise<GitCicdHandoffDeploymentTargetRecord | undefined>;
  findApprovedDeploymentForHandoff(
    deploymentId: string,
    projectId: string
  ): Promise<GitCicdHandoffApprovedDeploymentRecord | undefined>;
  findApprovedPlanArtifactForHandoff(
    planArtifactId: string,
    deploymentId: string
  ): Promise<GitCicdHandoffApprovedPlanArtifactRecord | undefined>;
  findSourceRepositoryById(
    sourceRepositoryId: string,
    projectId: string
  ): Promise<GitCicdHandoffSourceRepositoryRecord | undefined>;
  createHandoff(input: CreateGitCicdHandoffRecordInput): Promise<GitCicdHandoffRecord>;
  findHandoffById(handoffId: string): Promise<GitCicdHandoffRecord | undefined>;
  listHandoffsByProject(projectId: string): Promise<GitCicdHandoffRecord[]>;
  updateHandoffStatus(
    handoffId: string,
    input: UpdateGitCicdHandoffStatusRecordInput
  ): Promise<GitCicdHandoffRecord | undefined>;
  updateHandoffAutomationMetadata?(
    handoffId: string,
    input: {
      repositorySettingsPreview?: GitCicdRepositorySettingsPreview | null | undefined;
      awsRoleDiff?: GitCicdAwsRoleDiff | null | undefined;
      githubOAuthRequired?: boolean | undefined;
    }
  ): Promise<GitCicdHandoffRecord | undefined>;
};

export class GitCicdHandoffNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitCicdHandoffNotFoundError";
  }
}

export class GitCicdHandoffInvalidStatusTransitionError extends Error {
  constructor(
    readonly currentStatus: GitCicdHandoffStatus,
    readonly nextStatus: GitCicdHandoffStatus
  ) {
    super(`Invalid Git/CI/CD handoff status transition from ${currentStatus} to ${nextStatus}`);
    this.name = "GitCicdHandoffInvalidStatusTransitionError";
  }
}

export class GitCicdHandoffProviderMismatchError extends Error {
  constructor(
    readonly requestedProvider: SourceRepositoryProvider,
    readonly resultProvider: SourceRepositoryProvider
  ) {
    super(
      `Git/CI/CD handoff provider mismatch: requested ${requestedProvider}, received ${resultProvider}`
    );
    this.name = "GitCicdHandoffProviderMismatchError";
  }
}

export class GitCicdHandoffProviderPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitCicdHandoffProviderPermissionError";
  }
}

export class GitCicdHandoffProviderConflictError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = "GitCicdHandoffProviderConflictError";
  }
}

const allowedGitCicdHandoffStatusTransitions: Record<
  GitCicdHandoffStatus,
  readonly GitCicdHandoffStatus[]
> = {
  cancelled: [],
  draft: ["pr_created", "cancelled"],
  pipeline_failed: ["pipeline_running", "cancelled"],
  pipeline_running: ["pipeline_success", "pipeline_failed", "cancelled"],
  pipeline_success: [],
  pr_created: ["pipeline_running", "pipeline_success", "pipeline_failed", "cancelled"]
};

export function createInternalGitCicdHandoffProvider(): GitCicdHandoffProvider {
  return {
    async createHandoff() {
      return {
        repositoryProvider: "internal",
        pullRequestUrl: null,
        pipelineRunUrl: null,
        status: "draft",
        statusMessage: null
      };
    }
  };
}

export function createDelegatingGitCicdHandoffProvider(input: {
  internalProvider?: GitCicdHandoffProvider | undefined;
  githubProvider: GitCicdHandoffProvider;
}): GitCicdHandoffProvider {
  const internalProvider = input.internalProvider ?? createInternalGitCicdHandoffProvider();

  return {
    createHandoff(handoffInput) {
      if (handoffInput.sourceRepository.provider === "github") {
        return input.githubProvider.createHandoff(handoffInput);
      }

      return internalProvider.createHandoff(handoffInput);
    }
  };
}

export function createGitHubGitCicdHandoffProvider(
  gitProvider: GitProvider
): GitCicdHandoffProvider {
  return {
    async createHandoff(input) {
      const sourceBranch =
        input.sourceBranch ?? createDefaultSourceBranch(input.projectSlug, input.handoffId);
      const commitMessage =
        input.commitMessage ?? `Add SketchCatch Terraform artifact ${input.terraformArtifact.fileName}`;
      const githubInstallationId = input.sourceRepository.githubInstallationId;

      if (!githubInstallationId) {
        throw new Error("GitHub source repository installation id is required");
      }

      let result: GitProviderCreatePullRequestResult;

      try {
        result = await gitProvider.createPullRequest({
          repository: {
            provider: "github",
            installationId: githubInstallationId,
            owner: input.sourceRepository.owner,
            name: input.sourceRepository.name
          },
          targetBranch: input.targetBranch,
          sourceBranch,
          commitMessage,
          files: [
            {
              path: createHandoffFilePath({
                projectSlug: input.projectSlug,
                handoffKind: input.handoffKind,
                fileName: input.terraformArtifact.fileName
              }),
              artifactObjectKey: input.terraformArtifact.objectKey,
              contentType: input.terraformArtifact.contentType,
              expectedSha256: input.terraformArtifact.approvedSha256
            },
            ...createGitCicdAutomationFiles({
              handoffId: input.handoffId,
              projectId: input.projectId,
              projectSlug: input.projectSlug,
              repositoryOwner: input.sourceRepository.owner,
              repositoryName: input.sourceRepository.name,
              targetBranch: input.targetBranch,
              appPath: input.appPath.path,
              infraPath: input.infraPath.path,
              userAcceptedChangeId: input.userAcceptedChangeId,
              environmentName: input.environmentName,
              awsRegion: input.awsRegion,
              awsAccountId: input.awsAccountId,
              awsRoleArn: input.awsRoleArn,
              tfStateBucket: input.tfStateBucket ?? undefined,
              releaseBucket: input.releaseBucket ?? undefined,
              rdsEnabled: input.rdsEnabled,
              staticSiteUrl: input.staticSiteUrl,
              apiBaseUrl: input.apiBaseUrl,
              sketchCatchPublicBaseUrl: process.env.SKETCHCATCH_PUBLIC_BASE_URL ?? null,
              runtimeTargetKind: input.runtimeTargetKind,
              confirmedBuildConfig: input.confirmedBuildConfig,
              runtimeConfig: input.runtimeConfig,
              applicationArtifactFingerprint: input.applicationArtifactFingerprint,
              deploymentTargetFingerprint: input.deploymentTargetFingerprint
            })
          ],
          pullRequest: input.pullRequestDraft,
          userAcceptedChangeId: input.userAcceptedChangeId
        });
      } catch (error) {
        if (isGitProviderPermissionError(error)) {
          throw new GitCicdHandoffProviderPermissionError(
            "GitHub App repository permissions must allow Contents, Pull requests, and Workflows write access before Git/CI/CD handoff can be created"
          );
        }

        if (isGitProviderNoChangesError(error)) {
          throw new GitCicdHandoffProviderConflictError(
            "GitHub PR could not be created because the handoff files did not change"
          );
        }

        if (isGitProviderConflictError(error)) {
          throw new GitCicdHandoffProviderConflictError(
            "GitHub PR could not be created because the repository rejected the generated files"
          );
        }

        throw error;
      }

      return {
        repositoryProvider: "github",
        sourceBranch: result.sourceBranch,
        pullRequestUrl: result.pullRequestUrl,
        pipelineRunUrl: null,
        pullRequestNumber: result.pullRequestNumber,
        pullRequestHeadSha: result.pullRequestHeadSha,
        status: "pr_created",
        statusMessage: `GitHub PR created from ${result.sourceBranch} at ${result.commitSha}`
      };
    }
  };
}

export function createGitCicdPullRequestDraft(input: {
  repositoryOwner: string;
  repositoryName: string;
  terraformArtifact: GitCicdHandoffTerraformArtifactRecord;
  handoffKind?: GitCicdHandoffKind | undefined;
  planSummary: DeploymentPlanSummary | null;
  title: string | null;
}): GitCicdPullRequestDraft {
  const handoffKind = input.handoffKind ?? "terraform_iac";
  const title =
    input.title ??
    (handoffKind === "static_site"
      ? `SketchCatch static site update for ${input.repositoryOwner}/${input.repositoryName}`
      : `SketchCatch IaC preview for ${input.repositoryOwner}/${input.repositoryName}`);
  const reviewChecklist = createDefaultReviewChecklist(handoffKind);
  const planSummaryText = input.planSummary
    ? `Create ${input.planSummary.createCount}, update ${input.planSummary.updateCount}, delete ${input.planSummary.deleteCount}, replace ${input.planSummary.replaceCount}. Blocked: ${input.planSummary.blocked ? "yes" : "no"}.`
    : "Plan summary was not attached to this handoff request.";
  const warningLines =
    input.planSummary?.warnings?.map((warning) => `- ${warning.level}: ${warning.message}`) ?? [];
  const body = [
    handoffKind === "static_site" ? "## Static Site CI/CD" : "## IaC Preview",
    "",
    `- Artifact: ${input.terraformArtifact.fileName}`,
    `- Handoff kind: ${handoffKind}`,
    `- Artifact object key: ${input.terraformArtifact.objectKey}`,
    "",
    "## Plan summary",
    "",
    planSummaryText,
    ...(warningLines.length > 0 ? ["", "### Plan warnings", "", ...warningLines] : []),
    "",
    "## Pre-Deployment Check",
    "",
    "- Confirm Terraform artifact matches the approved SketchCatch preview.",
    "- Confirm target account, region, and variables in the destination repository pipeline.",
    "- Do not merge until team review and pipeline policy checks pass.",
    "",
    "## Review checklist",
    "",
    ...reviewChecklist.map((item) => `- [ ] ${item.required ? "(required) " : ""}${item.label}`)
  ].join("\n");

  return {
    title,
    body,
    planSummary: input.planSummary,
    reviewChecklist
  };
}

function createDefaultReviewChecklist(
  handoffKind: GitCicdHandoffKind = "terraform_iac"
): GitCicdReviewChecklistItem[] {
  if (handoffKind === "static_site") {
    return [
      {
        id: "static-site-artifact",
        label: "Static site artifact path and browser-visible content change are reviewed.",
        required: true
      },
      {
        id: "pipeline-policy",
        label: "Destination repository pipeline uploads the static site artifact to the approved S3 bucket.",
        required: true
      },
      {
        id: "manual-deploy-avoidance",
        label: "No manual S3 console upload is required after the pipeline succeeds.",
        required: true
      }
    ];
  }

  return [
    {
      id: "terraform-artifact",
      label: "Terraform artifact path and generated resources match the approved IaC Preview.",
      required: true
    },
    {
      id: "plan-summary",
      label: "Plan summary create/update/delete/replace counts are reviewed by the team.",
      required: true
    },
    {
      id: "pre-deployment-check",
      label: "Pre-Deployment Check findings are accepted or resolved before merge.",
      required: true
    },
    {
      id: "pipeline-policy",
      label: "Destination repository pipeline policy and reviewers are configured.",
      required: true
    }
  ];
}

function createDefaultSourceBranch(projectSlug: string, handoffId: string): string {
  return `sketchcatch/${projectSlug}/iac-${handoffId.slice(0, 8)}`;
}

function createHandoffFilePath(input: {
  projectSlug: string;
  handoffKind: GitCicdHandoffKind;
  fileName: string;
}): string {
  if (input.handoffKind === "static_site") {
    return `sketchcatch/${input.projectSlug}/static-site/${input.fileName}`;
  }

  return `sketchcatch/${input.projectSlug}/terraform/${input.fileName}`;
}

function createProjectSlug(projectName: string): string {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "project";
}

export function createPostgresGitCicdHandoffRepository(
  db: Database
): GitCicdHandoffRepository {
  return {
    async findAccessibleProject(projectId, accessContext) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, accessContext.userId)));

      return project;
    },

    async findArchitectureInProject(architectureId, projectId) {
      const [architecture] = await db
        .select()
        .from(architectures)
        .where(and(eq(architectures.id, architectureId), eq(architectures.projectId, projectId)));

      return architecture;
    },

    async findTerraformArtifactForArchitecture(terraformArtifactId, projectId, architectureId) {
      const [terraformArtifact] = await db
        .select()
        .from(projectAssets)
        .where(
          and(
            eq(projectAssets.id, terraformArtifactId),
            eq(projectAssets.projectId, projectId),
            eq(projectAssets.architectureId, architectureId),
            eq(projectAssets.assetType, "terraform_file"),
            eq(projectAssets.uploadStatus, "uploaded")
          )
        );

      if (!terraformArtifact) {
        return undefined;
      }

      return {
        ...terraformArtifact,
        architectureId,
        assetType: "terraform_file",
        uploadStatus: "uploaded"
      };
    },

    async findActiveSourceRepository(sourceRepositoryId, projectId) {
      const [sourceRepository] = await db
        .select({
          id: sourceRepositories.id,
          projectId: sourceRepositories.projectId,
          provider: sourceRepositories.provider,
          status: sourceRepositories.status,
          githubInstallationId: sourceRepositories.githubInstallationId,
          githubRepositoryId: sourceRepositories.githubRepositoryId,
          owner: sourceRepositories.owner,
          name: sourceRepositories.name,
          defaultBranch: sourceRepositories.defaultBranch,
          repositoryUrl: sourceRepositories.repositoryUrl,
          analysisResult: sourceRepositories.analysisResult,
          analysisRevision: sourceRepositories.analysisRevision,
          analyzedAt: sourceRepositories.analyzedAt
        })
        .from(sourceRepositories)
        .where(
          and(
            eq(sourceRepositories.id, sourceRepositoryId),
            eq(sourceRepositories.projectId, projectId),
            eq(sourceRepositories.status, "active")
          )
        );

      return sourceRepository;
    },

    async findMonitoringConfig(sourceRepositoryId) {
      const [config] = await db
        .select()
        .from(gitCicdMonitoringConfigs)
        .where(eq(gitCicdMonitoringConfigs.sourceRepositoryId, sourceRepositoryId));
      return config;
    },

    async findProjectDeploymentTarget(projectId) {
      const [target] = await db
        .select({
          ...getTableColumns(projectDeploymentTargets),
          awsRoleArn: awsConnections.roleArn,
          awsAccountId: awsConnections.accountId
        })
        .from(projectDeploymentTargets)
        .innerJoin(awsConnections, eq(awsConnections.id, projectDeploymentTargets.connectionId))
        .where(
          and(
            eq(projectDeploymentTargets.projectId, projectId),
            eq(awsConnections.status, "verified")
          )
        );
      return target;
    },

    // Git handoff가 실제 승인된 Plan을 기반으로 하는지 서버 DB에서 확인합니다.
    async findApprovedDeploymentForHandoff(deploymentId, projectId) {
      const [deployment] = await db
        .select({
          id: deployments.id,
          projectId: deployments.projectId,
          architectureId: deployments.architectureId,
          terraformArtifactId: deployments.terraformArtifactId,
          planSummary: deployments.planSummary,
          approvedAt: deployments.approvedAt,
          approvedByUserId: deployments.approvedByUserId,
          approvedTerraformArtifactId: deployments.approvedTerraformArtifactId,
          approvedPlanArtifactId: deployments.approvedPlanArtifactId
        })
        .from(deployments)
        .where(and(eq(deployments.id, deploymentId), eq(deployments.projectId, projectId)));

      return deployment;
    },

    // 승인 ID가 가리키는 실제 Plan 종류와 artifact 연결을 조회합니다.
    async findApprovedPlanArtifactForHandoff(planArtifactId, deploymentId) {
      const [planArtifact] = await db
        .select({
          id: deploymentPlanArtifacts.id,
          deploymentId: deploymentPlanArtifacts.deploymentId,
          terraformArtifactId: deploymentPlanArtifacts.terraformArtifactId,
          terraformArtifactSha256: deploymentPlanArtifacts.terraformArtifactSha256,
          operation: deploymentPlanArtifacts.operation
        })
        .from(deploymentPlanArtifacts)
        .where(
          and(
            eq(deploymentPlanArtifacts.id, planArtifactId),
            eq(deploymentPlanArtifacts.deploymentId, deploymentId)
          )
        );

      return planArtifact;
    },

    async findSourceRepositoryById(sourceRepositoryId, projectId) {
      const [sourceRepository] = await db
        .select({
          id: sourceRepositories.id,
          projectId: sourceRepositories.projectId,
          provider: sourceRepositories.provider,
          status: sourceRepositories.status,
          githubInstallationId: sourceRepositories.githubInstallationId,
          githubRepositoryId: sourceRepositories.githubRepositoryId,
          owner: sourceRepositories.owner,
          name: sourceRepositories.name,
          defaultBranch: sourceRepositories.defaultBranch,
          repositoryUrl: sourceRepositories.repositoryUrl,
          analysisResult: sourceRepositories.analysisResult,
          analysisRevision: sourceRepositories.analysisRevision,
          analyzedAt: sourceRepositories.analyzedAt
        })
        .from(sourceRepositories)
        .where(
          and(
            eq(sourceRepositories.id, sourceRepositoryId),
            eq(sourceRepositories.projectId, projectId)
          )
        );

      return sourceRepository;
    },

    async createHandoff(input) {
      const [handoff] = await db.insert(gitCicdHandoffs).values(input).returning();

      if (!handoff) {
        throw new Error("Git/CI/CD handoff creation failed");
      }

      return handoff;
    },

    async findHandoffById(handoffId) {
      const [handoff] = await db
        .select()
        .from(gitCicdHandoffs)
        .where(eq(gitCicdHandoffs.id, handoffId));

      return handoff;
    },

    async listHandoffsByProject(projectId) {
      return db
        .select()
        .from(gitCicdHandoffs)
        .where(eq(gitCicdHandoffs.projectId, projectId))
        .orderBy(desc(gitCicdHandoffs.createdAt));
    },

    async updateHandoffStatus(handoffId, input) {
      const values = {
        status: input.status,
        ...touchUpdatedAt
      };

      if (input.pullRequestUrl !== undefined) {
        Object.assign(values, { pullRequestUrl: input.pullRequestUrl });
      }

      if (input.pipelineRunUrl !== undefined) {
        Object.assign(values, { pipelineRunUrl: input.pipelineRunUrl });
      }

      if (input.pullRequestNumber !== undefined) {
        Object.assign(values, { pullRequestNumber: input.pullRequestNumber });
      }

      if (input.pullRequestHeadSha !== undefined) {
        Object.assign(values, { pullRequestHeadSha: input.pullRequestHeadSha });
      }

      if (input.mergeCommitSha !== undefined) {
        Object.assign(values, { mergeCommitSha: input.mergeCommitSha });
      }

      if (input.infraPipelineRunUrl !== undefined) {
        Object.assign(values, { infraPipelineRunUrl: input.infraPipelineRunUrl });
      }

      if (input.infraPipelineStatus !== undefined) {
        Object.assign(values, { infraPipelineStatus: input.infraPipelineStatus });
      }

      if (input.appPipelineRunUrl !== undefined) {
        Object.assign(values, { appPipelineRunUrl: input.appPipelineRunUrl });
      }

      if (input.appPipelineStatus !== undefined) {
        Object.assign(values, { appPipelineStatus: input.appPipelineStatus });
      }

      if (input.destroyPipelineRunUrl !== undefined) {
        Object.assign(values, { destroyPipelineRunUrl: input.destroyPipelineRunUrl });
      }

      if (input.destroyPipelineStatus !== undefined) {
        Object.assign(values, { destroyPipelineStatus: input.destroyPipelineStatus });
      }

      if (input.statusMessage !== undefined) {
        Object.assign(values, { statusMessage: input.statusMessage });
      }

      const [handoff] = await db
        .update(gitCicdHandoffs)
        .set(values)
        .where(eq(gitCicdHandoffs.id, handoffId))
        .returning();

      return handoff;
    },

    async updateHandoffAutomationMetadata(handoffId, input) {
      const values = {
        ...touchUpdatedAt
      };

      if (input.repositorySettingsPreview !== undefined) {
        Object.assign(values, { repositorySettingsPreview: input.repositorySettingsPreview });
      }

      if (input.awsRoleDiff !== undefined) {
        Object.assign(values, { awsRoleDiff: input.awsRoleDiff });
      }

      if (input.githubOAuthRequired !== undefined) {
        Object.assign(values, { githubOAuthRequired: input.githubOAuthRequired });
      }

      const [handoff] = await db
        .update(gitCicdHandoffs)
        .set(values)
        .where(eq(gitCicdHandoffs.id, handoffId))
        .returning();

      return handoff;
    }
  };
}

function isGitProviderPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    ((error as { readonly statusCode?: unknown }).statusCode === 401 ||
      (error as { readonly statusCode?: unknown }).statusCode === 403)
  );
}

function isGitProviderNoChangesError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "No Git/CI/CD handoff file changes were needed"
  );
}

function isGitProviderConflictError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    ((error as { readonly statusCode?: unknown }).statusCode === 409 ||
      (error as { readonly statusCode?: unknown }).statusCode === 422)
  );
}

export async function createGitCicdHandoff(
  input: CreateGitCicdHandoffInput,
  repository: GitCicdHandoffRepository,
  provider: GitCicdHandoffProvider = createInternalGitCicdHandoffProvider(),
  generateId: () => string = randomUUID
): Promise<GitCicdHandoffRecord> {
  const project = await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  const architecture = await repository.findArchitectureInProject(
    input.architectureId,
    input.projectId
  );

  if (!architecture) {
    throw new GitCicdHandoffNotFoundError("Architecture not found for project");
  }

  const terraformArtifact = await repository.findTerraformArtifactForArchitecture(
    input.terraformArtifactId,
    input.projectId,
    input.architectureId
  );

  if (!terraformArtifact) {
    throw new GitCicdHandoffNotFoundError(
      "Terraform artifact not found for project architecture"
    );
  }

  const approvedDeployment = input.sourceDeploymentId
    ? await repository.findApprovedDeploymentForHandoff(input.sourceDeploymentId, input.projectId)
    : undefined;
  const approvedPlanArtifact = approvedDeployment?.approvedPlanArtifactId
    ? await repository.findApprovedPlanArtifactForHandoff(
        approvedDeployment.approvedPlanArtifactId,
        approvedDeployment.id
      )
    : undefined;

  // 브라우저가 보낸 승인 문자열 대신 서버에 기록된 Plan 승인과 artifact를 모두 대조합니다.
  if (
    !approvedDeployment ||
    approvedDeployment.architectureId !== input.architectureId ||
    approvedDeployment.terraformArtifactId !== input.terraformArtifactId ||
    approvedDeployment.approvedTerraformArtifactId !== input.terraformArtifactId ||
    approvedDeployment.approvedPlanArtifactId !== input.userAcceptedChangeId ||
    !approvedPlanArtifact ||
    approvedPlanArtifact.id !== input.userAcceptedChangeId ||
    approvedPlanArtifact.deploymentId !== approvedDeployment.id ||
    approvedPlanArtifact.terraformArtifactId !== input.terraformArtifactId ||
    !approvedPlanArtifact.terraformArtifactSha256 ||
    approvedPlanArtifact.operation !== "apply" ||
    approvedDeployment.approvedAt === null ||
    approvedDeployment.approvedByUserId !== input.accessContext.userId
  ) {
    throw new GitCicdHandoffProviderConflictError(
      "Git/CI/CD handoff requires the current user's approved deployment plan"
    );
  }

  const sourceRepository = await repository.findActiveSourceRepository(
    input.sourceRepositoryId,
    input.projectId
  );

  if (!sourceRepository) {
    throw new GitCicdHandoffNotFoundError("Active source repository not found for project");
  }

  const monitoringConfig = await repository.findMonitoringConfig(input.sourceRepositoryId);
  if (
    !monitoringConfig ||
    monitoringConfig.enabled !== true ||
    monitoringConfig.validationStatus !== "valid"
  ) {
    throw new GitCicdHandoffProviderConflictError(
      "Git/CI/CD handoff requires enabled and valid repository monitoring settings"
    );
  }
  const deploymentTarget = await repository.findProjectDeploymentTarget(input.projectId);
  assertGitOpsTarget(deploymentTarget, sourceRepository, monitoringConfig.appPath);
  if (!deploymentTarget.awsAccountId) {
    throw new GitCicdHandoffProviderConflictError(
      "Git/CI/CD handoff requires a verified AWS account identity"
    );
  }
  const runtimeTargetIdentity = resolveGitOpsHandoffRuntimeTargetIdentity(
    input.projectId,
    deploymentTarget
  );
  const applicationArtifactIdentity = createApplicationArtifactIdentity({
    repository: {
      provider: sourceRepository.provider,
      owner: sourceRepository.owner,
      name: sourceRepository.name
    },
    commitSha: deploymentTarget.confirmedBuildConfig.confirmedCommitSha,
    kind: applicationArtifactKindForRuntime(deploymentTarget.runtimeTargetKind),
    confirmedBuildConfig: deploymentTarget.confirmedBuildConfig,
    buildContractVersion: APPLICATION_ARTIFACT_CONTRACT_VERSION,
    ...applicationArtifactPlatformForRuntime(deploymentTarget.runtimeTargetKind),
    buildInputs: {}
  });

  const handoffId = generateId();
  const projectSlug = createProjectSlug(project.name);
  const targetBranch = input.targetBranch ?? monitoringConfig.monitorBranch;
  if (targetBranch !== monitoringConfig.monitorBranch) {
    throw new GitCicdHandoffProviderConflictError(
      "Git/CI/CD handoff target branch must match the validated monitoring branch"
    );
  }
  const sourceBranch = input.sourceBranch ?? null;
  const commitMessage = input.commitMessage ?? null;
  const handoffKind = input.handoffKind ?? "terraform_iac";
  const deploymentMode = input.deploymentMode ?? "infra_and_app";
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const rdsEnabled = input.rdsEnabled === true;
  if (input.awsRegion && input.awsRegion !== deploymentTarget.region) {
    throw new GitCicdHandoffProviderConflictError(
      "GitOps AWS region must match the confirmed project deployment target"
    );
  }
  if (input.awsRoleArn && input.awsRoleArn !== deploymentTarget.awsRoleArn) {
    throw new GitCicdHandoffProviderConflictError(
      "GitOps AWS role must match the confirmed project deployment target connection"
    );
  }
  const awsRegion = deploymentTarget.region;
  const awsRoleArn = deploymentTarget.awsRoleArn;
  const tfStateBucket = input.tfStateBucket ?? null;
  const releaseBucket = input.releaseBucket ?? null;
  const staticSiteUrl = input.staticSiteUrl ?? null;
  const apiBaseUrl = input.apiBaseUrl ?? null;
  const repositorySettingsPreview = createRepositorySettingsPreview({
    projectSlug,
    repositoryOwner: sourceRepository.owner,
    repositoryName: sourceRepository.name,
    targetBranch,
    appPath: monitoringConfig.appPath.path,
    infraPath: monitoringConfig.infraPath.path,
    environmentName,
    awsRegion,
    awsAccountId: deploymentTarget.awsAccountId,
    awsRoleArn,
    tfStateBucket: tfStateBucket ?? undefined,
    releaseBucket: releaseBucket ?? undefined,
    rdsEnabled,
    staticSiteUrl,
    apiBaseUrl,
    runtimeTargetKind: deploymentTarget.runtimeTargetKind,
    confirmedBuildConfig: deploymentTarget.confirmedBuildConfig,
    runtimeConfig: deploymentTarget.runtimeConfig
  });
  const awsRoleDiff = createAwsRoleDiffPreview({
    projectSlug,
    repositoryOwner: sourceRepository.owner,
    repositoryName: sourceRepository.name,
    targetBranch,
    environmentName,
    awsRegion,
    awsRoleArn,
    tfStateBucket: tfStateBucket ?? undefined,
    releaseBucket: releaseBucket ?? undefined,
    rdsEnabled,
    staticSiteUrl,
    apiBaseUrl,
    runtimeTargetKind: deploymentTarget.runtimeTargetKind,
    confirmedBuildConfig: deploymentTarget.confirmedBuildConfig,
    runtimeConfig: deploymentTarget.runtimeConfig,
    applicationArtifactFingerprint: applicationArtifactIdentity.artifactFingerprint,
    deploymentTargetFingerprint: runtimeTargetIdentity.deploymentTargetFingerprint,
    approvedByUserId: null,
    approvedAt: null
  });
  const pullRequestDraft = createGitCicdPullRequestDraft({
    repositoryOwner: sourceRepository.owner,
    repositoryName: sourceRepository.name,
    terraformArtifact,
    handoffKind,
    planSummary: approvedDeployment.planSummary ?? null,
    title: input.pullRequestTitle ?? null
  });
  const pullRequestTitle = input.pullRequestTitle ?? pullRequestDraft.title;
  const repositoryProvider = sourceRepository.provider;
  const providerResult = await provider.createHandoff({
    handoffId,
    projectId: input.projectId,
    architectureId: input.architectureId,
    terraformArtifactId: input.terraformArtifactId,
    handoffKind,
    targetBranch,
    appPath: monitoringConfig.appPath,
    infraPath: monitoringConfig.infraPath,
    projectSlug,
    environmentName,
    rdsEnabled,
    awsRegion,
    awsAccountId: deploymentTarget.awsAccountId,
    awsRoleArn,
    tfStateBucket,
    releaseBucket,
    staticSiteUrl,
    apiBaseUrl,
    runtimeTargetKind: deploymentTarget.runtimeTargetKind,
    confirmedBuildConfig: deploymentTarget.confirmedBuildConfig,
    runtimeConfig: deploymentTarget.runtimeConfig,
    applicationArtifactFingerprint: applicationArtifactIdentity.artifactFingerprint,
    deploymentTargetFingerprint: runtimeTargetIdentity.deploymentTargetFingerprint,
    terraformArtifact: {
      id: terraformArtifact.id,
      objectKey: terraformArtifact.objectKey,
      fileName: terraformArtifact.fileName,
      contentType: terraformArtifact.contentType,
      approvedSha256: approvedPlanArtifact.terraformArtifactSha256
    },
    sourceRepository: {
      id: input.sourceRepositoryId,
      provider: repositoryProvider,
      owner: sourceRepository.owner,
      name: sourceRepository.name,
      defaultBranch: sourceRepository.defaultBranch,
      githubInstallationId: sourceRepository.githubInstallationId,
      githubRepositoryId: sourceRepository.githubRepositoryId
    },
    sourceBranch,
    commitMessage,
    pullRequestTitle,
    pullRequestDraft,
    userAcceptedChangeId: input.userAcceptedChangeId
  });

  if (providerResult.repositoryProvider !== repositoryProvider) {
    throw new GitCicdHandoffProviderMismatchError(
      repositoryProvider,
      providerResult.repositoryProvider
    );
  }

  return repository.createHandoff({
    id: handoffId,
    projectId: input.projectId,
    architectureId: input.architectureId,
    terraformArtifactId: input.terraformArtifactId,
    handoffKind,
    sourceDeploymentId: approvedDeployment.id,
    deploymentMode,
    requiresEnvironmentApproval: true,
    sourceRepositoryId: input.sourceRepositoryId,
    repositoryProvider: providerResult.repositoryProvider,
    repositoryOwner: sourceRepository.owner,
    repositoryName: sourceRepository.name,
    targetBranch,
    sourceBranch: providerResult.sourceBranch ?? sourceBranch,
    commitMessage,
    pullRequestTitle,
    pullRequestUrl: providerResult.pullRequestUrl,
    pullRequestNumber: providerResult.pullRequestNumber ?? null,
    pullRequestHeadSha: providerResult.pullRequestHeadSha ?? null,
    mergeCommitSha: null,
    environmentName,
    pipelineRunUrl: providerResult.pipelineRunUrl,
    infraPipelineRunUrl: null,
    infraPipelineStatus: providerResult.status === "pr_created" ? "waiting_for_merge" : "not_started",
    appPipelineRunUrl: null,
    appPipelineStatus: "not_started",
    destroyPipelineRunUrl: null,
    destroyPipelineStatus: "not_started",
    staticSiteUrl,
    apiBaseUrl,
    repositorySettingsPreview,
    awsRoleDiff,
    githubOAuthRequired: sourceRepository.provider === "github",
    status: providerResult.status,
    statusMessage: providerResult.statusMessage,
    userAcceptedChangeId: input.userAcceptedChangeId,
    createdByUserId: input.accessContext.userId
  });
}

export function assertGitOpsTarget(
  target: GitCicdHandoffDeploymentTargetRecord | undefined,
  sourceRepository: GitCicdHandoffSourceRepositoryRecord,
  appPath: GitCicdMonitoredPath
): asserts target is GitCicdHandoffDeploymentTargetRecord & {
  confirmedBuildConfig: ConfirmedBuildConfig;
  runtimeConfig: ProjectDeploymentRuntimeConfig;
  awsRoleArn: string;
} {
  if (
    !target ||
    !target.confirmedBuildConfig ||
    !target.awsRoleArn
  ) {
    throw new GitCicdHandoffProviderConflictError(
      "PROJECT_DEPLOYMENT_TARGET_REQUIRED",
      "PROJECT_DEPLOYMENT_TARGET_REQUIRED"
    );
  }

  if (
    target.runtimeTargetKind === "ecs_fargate" &&
    !target.runtimeConfig?.outputUrl
  ) {
    throw new GitCicdHandoffProviderConflictError(
      "DEPLOYMENT_OUTPUT_URL_REQUIRED",
      "DEPLOYMENT_OUTPUT_URL_REQUIRED"
    );
  }

  if (target.runtimeConfig?.runtimeTargetKind !== target.runtimeTargetKind) {
    throw new GitCicdHandoffProviderConflictError(
      "PROJECT_DEPLOYMENT_TARGET_REQUIRED",
      "PROJECT_DEPLOYMENT_TARGET_REQUIRED"
    );
  }

  const build = target.confirmedBuildConfig;
  const revision = sourceRepository.analysisRevision;
  const hasCurrentRevision =
    Boolean(revision) &&
    /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(revision ?? "") &&
    build.confirmedCommitSha.toLowerCase() === revision?.toLowerCase() &&
    appPath.path === build.sourceRoot;
  if (target.runtimeTargetKind === "ecs_fargate") {
    const dockerfiles = sourceRepository.analysisResult?.evidence.filter(
      (item) => item.kind === "dockerfile"
    ) ?? [];
    if (
      target.runtimeConfig?.runtimeTargetKind !== "ecs_fargate" ||
      build.buildPreset !== "docker_build" ||
      !build.dockerfilePath ||
      !hasCurrentRevision ||
      dockerfiles.length !== 1 ||
      dockerfiles[0]?.path !== build.dockerfilePath
    ) {
      throw new GitCicdHandoffProviderConflictError(
        "GitOps application handoff requires current, unambiguous Docker build evidence"
      );
    }
    return;
  }
  if (target.runtimeTargetKind === "lambda") {
    const samTemplates = sourceRepository.analysisResult?.evidence.filter(
      (item) =>
        item.kind === "framework_config" &&
        /(?:^|\/)template\.ya?ml$/i.test(item.path)
    ) ?? [];
    if (
      target.runtimeConfig.runtimeTargetKind !== "lambda" ||
      build.buildPreset !== "sam_build" ||
      !build.samTemplatePath ||
      !hasCurrentRevision ||
      samTemplates.length !== 1 ||
      samTemplates[0]?.path !== build.samTemplatePath
    ) {
      throw new GitCicdHandoffProviderConflictError(
        "GitOps application handoff requires current, unambiguous SAM build evidence"
      );
    }
    return;
  }
  if (target.runtimeTargetKind === "ec2_asg") {
    const appSpecs = sourceRepository.analysisResult?.evidence.filter(
      (item) =>
        item.kind === "framework_config" &&
        /(?:^|\/)appspec\.ya?ml$/i.test(item.path)
    ) ?? [];
    if (
      target.runtimeConfig.runtimeTargetKind !== "ec2_asg" ||
      build.buildPreset !== "codedeploy_bundle" ||
      !build.appSpecPath ||
      !hasCurrentRevision ||
      appSpecs.length !== 1 ||
      appSpecs[0]?.path !== build.appSpecPath
    ) {
      throw new GitCicdHandoffProviderConflictError(
        "GitOps application handoff requires current, unambiguous AppSpec build evidence"
      );
    }
    return;
  }
  if (target.runtimeTargetKind === "static_site") {
    const staticOutputs = sourceRepository.analysisResult?.evidence.filter(
      (item) => item.kind === "static_output"
    ) ?? [];
    if (
      target.runtimeConfig?.runtimeTargetKind !== "static_site" ||
      build.buildPreset !== "static_export" ||
      build.installPreset === "none" ||
      !build.staticOutputPath ||
      build.artifactOutputPath !== build.staticOutputPath ||
      !hasCurrentRevision ||
      staticOutputs.length !== 1 ||
      staticOutputs[0]?.path !== build.staticOutputPath
    ) {
      throw new GitCicdHandoffProviderConflictError(
        "GitOps application handoff requires current, unambiguous static output evidence"
      );
    }
    return;
  }
  throw new GitCicdHandoffProviderConflictError(
    "GitOps application handoff does not yet support the selected runtime"
  );
}

export function resolveGitOpsHandoffRuntimeTargetIdentity(
  projectId: string,
  target: GitCicdHandoffDeploymentTargetRecord & {
    confirmedBuildConfig: ConfirmedBuildConfig;
    runtimeConfig: ProjectDeploymentRuntimeConfig;
  }
) {
  if (!target.awsAccountId) {
    throw new GitCicdHandoffProviderConflictError(
      "Git/CI/CD handoff requires a verified AWS account identity"
    );
  }
  try {
    return resolveAwsDeploymentTargetIdentity({
      projectId,
      accountId: target.awsAccountId,
      region: target.region,
      runtimeTarget: target.runtimeTarget,
      runtimeConfig: target.runtimeConfig,
      healthCheckPath: target.confirmedBuildConfig.healthCheckPath,
      persistedDeploymentTargetFingerprint: target.deploymentTargetFingerprint
    });
  } catch (error) {
    if (error instanceof DeploymentTargetFingerprintMismatchError) {
      throw new GitCicdHandoffProviderConflictError(
        "Confirmed deployment target fingerprint does not match its runtime configuration"
      );
    }
    throw error;
  }
}

export async function listProjectGitCicdHandoffs(
  input: { projectId: string; accessContext: ProjectAccessContext },
  repository: GitCicdHandoffRepository
): Promise<GitCicdHandoffRecord[]> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  return repository.listHandoffsByProject(input.projectId);
}

export async function getGitCicdHandoff(
  input: { handoffId: string; accessContext: ProjectAccessContext },
  repository: GitCicdHandoffRepository
): Promise<GitCicdHandoffRecord> {
  const handoff = await repository.findHandoffById(input.handoffId);

  if (!handoff) {
    throw new GitCicdHandoffNotFoundError("Git/CI/CD handoff not found");
  }

  await requireAccessibleProject(
    handoff.projectId,
    input.accessContext,
    repository,
    "Git/CI/CD handoff not found"
  );

  return handoff;
}

export async function updateGitCicdHandoffStatus(
  input: UpdateGitCicdHandoffStatusInput,
  repository: GitCicdHandoffRepository
): Promise<GitCicdHandoffRecord> {
  const currentHandoff = await getGitCicdHandoff(
    {
      handoffId: input.handoffId,
      accessContext: input.accessContext
    },
    repository
  );

  assertGitCicdHandoffStatusTransition(currentHandoff.status, input.status);

  const handoff = await repository.updateHandoffStatus(input.handoffId, {
    status: input.status,
    pullRequestUrl: input.pullRequestUrl,
    pipelineRunUrl: input.pipelineRunUrl,
    pullRequestNumber: input.pullRequestNumber,
    pullRequestHeadSha: input.pullRequestHeadSha,
    mergeCommitSha: input.mergeCommitSha,
    infraPipelineRunUrl: input.infraPipelineRunUrl,
    infraPipelineStatus: input.infraPipelineStatus,
    appPipelineRunUrl: input.appPipelineRunUrl,
    appPipelineStatus: input.appPipelineStatus,
    destroyPipelineRunUrl: input.destroyPipelineRunUrl,
    destroyPipelineStatus: input.destroyPipelineStatus,
    statusMessage: input.statusMessage
  });

  if (!handoff) {
    throw new GitCicdHandoffNotFoundError("Git/CI/CD handoff not found");
  }

  return handoff;
}

function assertGitCicdHandoffStatusTransition(
  currentStatus: GitCicdHandoffStatus,
  nextStatus: GitCicdHandoffStatus
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!allowedGitCicdHandoffStatusTransitions[currentStatus].includes(nextStatus)) {
    throw new GitCicdHandoffInvalidStatusTransitionError(currentStatus, nextStatus);
  }
}

async function requireAccessibleProject(
  projectId: string,
  accessContext: ProjectAccessContext,
  repository: GitCicdHandoffRepository,
  message: string
): Promise<GitCicdHandoffProjectRecord> {
  const project = await repository.findAccessibleProject(projectId, accessContext);

  if (!project) {
    throw new GitCicdHandoffNotFoundError(message);
  }

  return project;
}
