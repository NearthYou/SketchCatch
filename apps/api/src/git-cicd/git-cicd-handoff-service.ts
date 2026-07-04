import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type {
  DeploymentPlanSummary,
  GitCicdHandoffStatus,
  SourceRepositoryProvider
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  architectures,
  gitCicdHandoffs,
  projectAssets,
  projects,
  touchUpdatedAt
} from "../db/schema.js";

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

export type CreateGitCicdHandoffInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  architectureId: string;
  terraformArtifactId: string;
  sourceRepositoryId: string;
  repositoryProvider?: SourceRepositoryProvider | undefined;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
  sourceBranch?: string | undefined;
  commitMessage?: string | undefined;
  pullRequestTitle?: string | undefined;
  planSummary?: DeploymentPlanSummary | undefined;
  userAcceptedChangeId: string;
};

export type CreateGitCicdHandoffRecordInput = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  sourceRepositoryId: string;
  repositoryProvider: SourceRepositoryProvider;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitMessage: string | null;
  pullRequestTitle: string | null;
  pullRequestUrl: string | null;
  pipelineRunUrl: string | null;
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
  statusMessage?: string | null | undefined;
};

export type UpdateGitCicdHandoffStatusRecordInput = {
  status: GitCicdHandoffStatus;
  pullRequestUrl?: string | null | undefined;
  pipelineRunUrl?: string | null | undefined;
  statusMessage?: string | null | undefined;
};

export type GitCicdProviderCreateInput = {
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  terraformArtifact: {
    id: string;
    objectKey: string;
    fileName: string;
    contentType: string;
  };
  sourceRepository: {
    id: string;
    provider: SourceRepositoryProvider;
    owner: string;
    name: string;
    defaultBranch: string;
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
  artifactObjectKey: string;
  contentType: string;
};

export type GitProviderCreatePullRequestInput = {
  repository: {
    provider: "github";
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
  createHandoff(input: CreateGitCicdHandoffRecordInput): Promise<GitCicdHandoffRecord>;
  findHandoffById(handoffId: string): Promise<GitCicdHandoffRecord | undefined>;
  listHandoffsByProject(projectId: string): Promise<GitCicdHandoffRecord[]>;
  updateHandoffStatus(
    handoffId: string,
    input: UpdateGitCicdHandoffStatusRecordInput
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

const allowedGitCicdHandoffStatusTransitions: Record<
  GitCicdHandoffStatus,
  readonly GitCicdHandoffStatus[]
> = {
  cancelled: [],
  draft: ["pr_created", "cancelled"],
  pipeline_failed: ["pipeline_running", "cancelled"],
  pipeline_running: ["pipeline_success", "pipeline_failed", "cancelled"],
  pipeline_success: [],
  pr_created: ["pipeline_running", "cancelled"]
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

export function createGitHubGitCicdHandoffProvider(
  gitProvider: GitProvider
): GitCicdHandoffProvider {
  return {
    async createHandoff(input) {
      const sourceBranch =
        input.sourceBranch ?? createDefaultSourceBranch(input.terraformArtifactId);
      const commitMessage =
        input.commitMessage ?? `Add SketchCatch Terraform artifact ${input.terraformArtifact.fileName}`;
      const result = await gitProvider.createPullRequest({
        repository: {
          provider: "github",
          owner: input.sourceRepository.owner,
          name: input.sourceRepository.name
        },
        targetBranch: input.sourceRepository.defaultBranch,
        sourceBranch,
        commitMessage,
        files: [
          {
            path: `terraform/${input.terraformArtifact.fileName}`,
            artifactObjectKey: input.terraformArtifact.objectKey,
            contentType: input.terraformArtifact.contentType
          }
        ],
        pullRequest: input.pullRequestDraft,
        userAcceptedChangeId: input.userAcceptedChangeId
      });

      return {
        repositoryProvider: "github",
        sourceBranch: result.sourceBranch,
        pullRequestUrl: result.pullRequestUrl,
        pipelineRunUrl: null,
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
  planSummary: DeploymentPlanSummary | null;
  title: string | null;
}): GitCicdPullRequestDraft {
  const title =
    input.title ??
    `SketchCatch IaC preview for ${input.repositoryOwner}/${input.repositoryName}`;
  const reviewChecklist = createDefaultReviewChecklist();
  const planSummaryText = input.planSummary
    ? `Create ${input.planSummary.createCount}, update ${input.planSummary.updateCount}, delete ${input.planSummary.deleteCount}, replace ${input.planSummary.replaceCount}. Blocked: ${input.planSummary.blocked ? "yes" : "no"}.`
    : "Plan summary was not attached to this handoff request.";
  const warningLines =
    input.planSummary?.warnings.map((warning) => `- ${warning.level}: ${warning.message}`) ?? [];
  const body = [
    "## IaC Preview",
    "",
    `- Terraform artifact: ${input.terraformArtifact.fileName}`,
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

function createDefaultReviewChecklist(): GitCicdReviewChecklistItem[] {
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

function createDefaultSourceBranch(terraformArtifactId: string): string {
  return `sketchcatch/iac-${terraformArtifactId.slice(0, 8)}`;
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

      if (input.statusMessage !== undefined) {
        Object.assign(values, { statusMessage: input.statusMessage });
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

export async function createGitCicdHandoff(
  input: CreateGitCicdHandoffInput,
  repository: GitCicdHandoffRepository,
  provider: GitCicdHandoffProvider = createInternalGitCicdHandoffProvider(),
  generateId: () => string = randomUUID
): Promise<GitCicdHandoffRecord> {
  await requireAccessibleProject(
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

  const sourceBranch = input.sourceBranch ?? null;
  const commitMessage = input.commitMessage ?? null;
  const pullRequestDraft = createGitCicdPullRequestDraft({
    repositoryOwner: input.repositoryOwner,
    repositoryName: input.repositoryName,
    terraformArtifact,
    planSummary: input.planSummary ?? null,
    title: input.pullRequestTitle ?? null
  });
  const pullRequestTitle = input.pullRequestTitle ?? pullRequestDraft.title;
  const repositoryProvider = input.repositoryProvider ?? "internal";
  const providerResult = await provider.createHandoff({
    projectId: input.projectId,
    architectureId: input.architectureId,
    terraformArtifactId: input.terraformArtifactId,
    terraformArtifact: {
      id: terraformArtifact.id,
      objectKey: terraformArtifact.objectKey,
      fileName: terraformArtifact.fileName,
      contentType: terraformArtifact.contentType
    },
    sourceRepository: {
      id: input.sourceRepositoryId,
      provider: repositoryProvider,
      owner: input.repositoryOwner,
      name: input.repositoryName,
      defaultBranch: input.targetBranch
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
    id: generateId(),
    projectId: input.projectId,
    architectureId: input.architectureId,
    terraformArtifactId: input.terraformArtifactId,
    sourceRepositoryId: input.sourceRepositoryId,
    repositoryProvider: providerResult.repositoryProvider,
    repositoryOwner: input.repositoryOwner,
    repositoryName: input.repositoryName,
    targetBranch: input.targetBranch,
    sourceBranch: providerResult.sourceBranch ?? sourceBranch,
    commitMessage,
    pullRequestTitle,
    pullRequestUrl: providerResult.pullRequestUrl,
    pipelineRunUrl: providerResult.pipelineRunUrl,
    status: providerResult.status,
    statusMessage: providerResult.statusMessage,
    userAcceptedChangeId: input.userAcceptedChangeId,
    createdByUserId: input.accessContext.userId
  });
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
