import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";
import type {
  ArchitectureJson,
  DeploymentLiveObservationManifestV2,
  DeploymentLiveProfile,
  DeploymentPlanSummary,
  DiagramJson,
  GitCicdAwsRoleDiff,
  GitCicdDeploymentMode,
  GitCicdHandoffKind,
  GitCicdPipelineDetailStatus,
  GitCicdRepositorySettingsPreview,
  RepositoryAnalysisAiHandoff,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

export const assetTypeEnum = pgEnum("asset_type", [
  "diagram_png",
  "diagram_svg",
  "terraform_file",
  "project_export_zip",
  "thumbnail"
]);

export const projectAssetUploadStatusEnum = pgEnum("project_asset_upload_status", [
  "pending",
  "uploaded"
]);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "DESTROYED"
]);

export const deploymentLiveProfileEnum = pgEnum("deployment_live_profile", [
  "practice",
  "demo_web_service",
  "demo_web_service_with_rds"
]);

export const deploymentLiveObservationManifestStatusEnum = pgEnum(
  "deployment_live_observation_manifest_status",
  ["valid", "manifest_invalid"]
);

export const gitCicdRepositoryProviderEnum = pgEnum("git_cicd_repository_provider", [
  "internal",
  "github"
]);

export const sourceRepositoryStatusEnum = pgEnum("source_repository_status", [
  "active",
  "inactive"
]);

export const gitCicdHandoffStatusEnum = pgEnum("git_cicd_handoff_status", [
  "draft",
  "pr_created",
  "pipeline_running",
  "pipeline_success",
  "pipeline_failed",
  "cancelled"
]);

export const gitCicdHandoffKindEnum = pgEnum("git_cicd_handoff_kind", [
  "terraform_iac",
  "static_site"
]);

export const deploymentBlockedEnum = pgEnum("deployment_blocked_by", [
  "risk_analysis",
  "cost_analysis",
  "missing_approval"
]);

export const deploymentFailureStageEnum = pgEnum("deployment_failure_stage", [
  "init",
  "validate",
  "plan",
  "approval",
  "aws_connection",
  "mock_run",
  "apply",
  "destroy"
]);

export const deploymentStageEnum = pgEnum("deployment_stage", [
  "init",
  "validate",
  "plan",
  "apply",
  "destroy"
]);

export const deploymentPlanOperationEnum = pgEnum("deployment_plan_operation", [
  "apply",
  "destroy"
]);

export const deploymentJobOperationEnum = pgEnum("deployment_job_operation", [
  "init",
  "plan",
  "apply",
  "destroy_plan",
  "destroy"
]);

export const deploymentJobStatusEnum = pgEnum("deployment_job_status", [
  "QUEUED",
  "DISPATCHING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED"
]);

export const deploymentLogLevelEnum = pgEnum("deployment_log_level", ["INFO", "WARN", "ERROR"]);

export const reverseEngineeringScanStatusEnum = pgEnum("reverse_engineering_scan_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled"
]);

export const reverseEngineeringScanStageEnum = pgEnum("reverse_engineering_scan_stage", [
  "credential",
  "region",
  "provider_api",
  "normalize",
  "draft",
  "analysis",
  "import_suggestion"
]);

export const reverseEngineeringScanLogLevelEnum = pgEnum("reverse_engineering_scan_log_level", [
  "INFO",
  "WARN",
  "ERROR"
]);

export const awsConnectionStatusEnum = pgEnum("aws_connection_status", [
  "pending",
  "verified",
  "failed"
]);

export const oauthProviderEnum = pgEnum("oauth_provider", ["naver", "kakao", "github"]);

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    username: varchar("username", { length: 30 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    nickname: varchar("nickname", { length: 40 }).notNull(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_email_unique").on(table.email),
    index("users_deleted_at_idx").on(table.deletedAt)
  ]
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_hash_unique").on(table.tokenHash),
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_expires_at_idx").on(table.expiresAt),
    index("refresh_tokens_revoked_at_idx").on(table.revokedAt)
  ]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
    index("password_reset_tokens_used_at_idx").on(table.usedAt)
  ]
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null"
    }),
    username: varchar("username", { length: 30 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    success: boolean("success").notNull().default(false),
    failureReason: varchar("failure_reason", { length: 80 }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("login_attempts_user_id_idx").on(table.userId),
    index("login_attempts_username_idx").on(table.username),
    index("login_attempts_ip_address_idx").on(table.ipAddress),
    index("login_attempts_locked_until_idx").on(table.lockedUntil)
  ]
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: oauthProviderEnum("provider").notNull(),
    providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    displayName: varchar("display_name", { length: 120 }),
    profileImageUrl: text("profile_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("oauth_accounts_provider_user_unique").on(table.provider, table.providerUserId),
    index("oauth_accounts_user_id_idx").on(table.userId)
  ]
);

export const projects = pgTable(
  "projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_updated_at_idx").on(table.updatedAt)
  ]
);

export const architectures = pgTable("architectures", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 })
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  source: varchar("source", { length: 64 }).notNull().default("manual"),
  architectureJson: jsonb("architecture_json").$type<ArchitectureJson>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const projectDrafts = pgTable(
  "project_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    diagramJson: jsonb("diagram_json").$type<DiagramJson>().notNull(),
    revision: integer("revision").notNull().default(1),
    serverSavedAt: timestamp("server_saved_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("project_drafts_project_id_unique").on(table.projectId)]
);

export const projectAssets = pgTable("project_assets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 })
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  architectureId: varchar("architecture_id", { length: 36 }).references(() => architectures.id, {
    onDelete: "set null"
  }),
  assetType: assetTypeEnum("asset_type").notNull(),
  objectKey: text("object_key").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 120 }).notNull(),
  byteSize: integer("byte_size"),
  uploadStatus: projectAssetUploadStatusEnum("upload_status").notNull().default("uploaded"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const sourceRepositories = pgTable(
  "source_repositories",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdByUserId: varchar("created_by_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: gitCicdRepositoryProviderEnum("provider").notNull(),
    status: sourceRepositoryStatusEnum("status").notNull().default("active"),
    githubInstallationId: varchar("github_installation_id", { length: 128 }),
    githubRepositoryId: varchar("github_repository_id", { length: 128 }),
    owner: varchar("owner", { length: 120 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    defaultBranch: varchar("default_branch", { length: 255 }).notNull(),
    repositoryUrl: text("repository_url"),
    visibility: varchar("visibility", { length: 20 }),
    archived: boolean("archived").notNull().default(false),
    analysisResult: jsonb("analysis_result").$type<RepositoryAnalysisAiHandoff>(),
    analysisRevision: varchar("analysis_revision", { length: 128 }),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("source_repositories_project_id_idx").on(table.projectId),
    index("source_repositories_created_by_user_id_idx").on(table.createdByUserId),
    index("source_repositories_provider_status_idx").on(table.provider, table.status),
    uniqueIndex("source_repositories_active_project_provider_unique")
      .on(table.projectId, table.provider)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("source_repositories_github_repository_unique")
      .on(table.projectId, table.provider, table.githubRepositoryId)
      .where(sql`${table.status} = 'active' AND ${table.githubRepositoryId} IS NOT NULL`)
  ]
);

export const awsConnections = pgTable(
  "aws_connections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    accountId: varchar("account_id", { length: 12 }),
    roleArn: text("role_arn"),
    externalId: varchar("external_id", { length: 256 }).notNull(),
    region: varchar("region", { length: 32 }).notNull(),
    status: awsConnectionStatusEnum("status").notNull().default("pending"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("aws_connections_user_id_idx").on(table.userId),
    uniqueIndex("aws_connections_user_verified_account_unique")
      .on(table.userId, table.accountId)
      .where(sql`${table.status} = 'verified' AND ${table.accountId} IS NOT NULL`),
    uniqueIndex("aws_connections_external_id_unique").on(table.externalId)
  ]
);

export const reverseEngineeringScans = pgTable(
  "reverse_engineering_scans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    awsConnectionId: varchar("aws_connection_id", { length: 36 })
      .notNull()
      .references(() => awsConnections.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 32 }).notNull().default("aws"),
    region: varchar("region", { length: 32 }).notNull(),
    resourceTypes: jsonb("resource_types").$type<ReverseEngineeringResourceSelection[]>().notNull(),
    status: reverseEngineeringScanStatusEnum("status").notNull().default("queued"),
    result: jsonb("result").$type<ReverseEngineeringScanResult>(),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("reverse_engineering_scans_project_id_idx").on(table.projectId),
    index("reverse_engineering_scans_status_idx").on(table.status),
    index("reverse_engineering_scans_aws_connection_id_idx").on(table.awsConnectionId)
  ]
);

export const reverseEngineeringScanLogs = pgTable(
  "reverse_engineering_scan_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    scanId: varchar("scan_id", { length: 36 })
      .notNull()
      .references(() => reverseEngineeringScans.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    stage: reverseEngineeringScanStageEnum("stage").notNull(),
    level: reverseEngineeringScanLogLevelEnum("level").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("reverse_engineering_scan_logs_scan_id_idx").on(table.scanId),
    uniqueIndex("reverse_engineering_scan_logs_scan_sequence_unique").on(
      table.scanId,
      table.sequence
    )
  ]
);

export const deployments = pgTable(
  "deployments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    architectureId: varchar("architecture_id", { length: 36 })
      .notNull()
      .references(() => architectures.id, { onDelete: "restrict" }),
    terraformArtifactId: varchar("terraform_artifact_id", { length: 36 })
      .notNull()
      .references(() => projectAssets.id, { onDelete: "restrict" }),
    awsConnectionId: varchar("aws_connection_id", { length: 36 }).references(
      () => awsConnections.id,
      { onDelete: "restrict" }
    ),
    liveProfile: deploymentLiveProfileEnum("live_profile")
      .$type<DeploymentLiveProfile>()
      .notNull()
      .default("practice"),
    currentPlanArtifactId: varchar("current_plan_artifact_id", { length: 36 }),
    stateObjectKey: text("state_object_key"),
    resultWarningSummary: text("result_warning_summary"),
    status: deploymentStatusEnum("status").notNull().default("PENDING"),
    activeStage: deploymentStageEnum("active_stage"),
    planSummary: jsonb("plan_summary").$type<DeploymentPlanSummary>(),
    isBlocked: boolean("is_blocked").notNull().default(false),
    blockedBy: deploymentBlockedEnum("blocked_by"),
    blockedReason: text("blocked_reason"),
    failureStage: deploymentFailureStageEnum("failure_stage"),
    errorSummary: text("error_summary"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: varchar("approved_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "restrict"
    }),
    approvedTerraformArtifactId: varchar("approved_terraform_artifact_id", {
      length: 36
    }).references(() => projectAssets.id, { onDelete: "set null" }),
    approvedPlanArtifactId: varchar("approved_plan_artifact_id", { length: 36 }),
    approvedTerraformArtifactHash: varchar("approved_terraform_artifact_hash", { length: 64 }),
    approvedTfplanHash: varchar("approved_tfplan_hash", { length: 64 }),
    approvedAwsAccountId: varchar("approved_aws_account_id", { length: 12 }),
    approvedAwsRegion: varchar("approved_aws_region", { length: 32 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("deployments_aws_connection_id_idx").on(table.awsConnectionId),
    index("deployments_current_plan_artifact_id_idx").on(table.currentPlanArtifactId),
    index("deployments_approved_plan_artifact_id_idx").on(table.approvedPlanArtifactId),
    uniqueIndex("deployments_project_running_unique")
      .on(table.projectId)
      .where(sql`${table.status} = 'RUNNING'`)
  ]
);

export const deploymentLiveObservationManifests = pgTable(
  "deployment_live_observation_manifests",
  {
    deploymentId: varchar("deployment_id", { length: 36 })
      .primaryKey()
      .references(() => deployments.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull(),
    status: deploymentLiveObservationManifestStatusEnum("status").notNull(),
    manifest: jsonb("manifest").$type<DeploymentLiveObservationManifestV2>(),
    invalidReason: text("invalid_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "deployment_live_observation_manifests_schema_version_check",
      sql`${table.schemaVersion} = 2`
    )
  ]
);

export const deploymentJobs = pgTable(
  "deployment_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    deploymentId: varchar("deployment_id", { length: 36 })
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    operation: deploymentJobOperationEnum("operation").notNull(),
    status: deploymentJobStatusEnum("status").notNull().default("QUEUED"),
    requestedByUserId: varchar("requested_by_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    accessContext: jsonb("access_context")
      .$type<{
        kind: "user";
        userId: string;
      }>()
      .notNull(),
    startedFromStatus: deploymentStatusEnum("started_from_status").notNull(),
    startedFromFailureStage: deploymentFailureStageEnum("started_from_failure_stage"),
    ecsTaskArn: text("ecs_task_arn"),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("deployment_jobs_deployment_id_idx").on(table.deploymentId),
    index("deployment_jobs_requested_by_user_id_idx").on(table.requestedByUserId),
    index("deployment_jobs_status_idx").on(table.status),
    index("deployment_jobs_ecs_task_arn_idx").on(table.ecsTaskArn),
    uniqueIndex("deployment_jobs_deployment_active_unique")
      .on(table.deploymentId)
      .where(sql`${table.status} in ('QUEUED', 'DISPATCHING', 'RUNNING')`)
  ]
);

export const gitCicdHandoffs = pgTable(
  "git_cicd_handoffs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    architectureId: varchar("architecture_id", { length: 36 })
      .notNull()
      .references(() => architectures.id, { onDelete: "restrict" }),
    terraformArtifactId: varchar("terraform_artifact_id", { length: 36 })
      .notNull()
      .references(() => projectAssets.id, { onDelete: "restrict" }),
    handoffKind: gitCicdHandoffKindEnum("handoff_kind")
      .$type<GitCicdHandoffKind>()
      .notNull()
      .default("terraform_iac"),
    sourceDeploymentId: varchar("source_deployment_id", { length: 36 }),
    deploymentMode: varchar("deployment_mode", { length: 32 })
      .$type<GitCicdDeploymentMode>()
      .notNull()
      .default("infra_and_app"),
    requiresEnvironmentApproval: boolean("requires_environment_approval").notNull().default(true),
    sourceRepositoryId: varchar("source_repository_id", { length: 128 }).notNull(),
    repositoryProvider: gitCicdRepositoryProviderEnum("repository_provider")
      .notNull()
      .default("internal"),
    repositoryOwner: varchar("repository_owner", { length: 120 }).notNull(),
    repositoryName: varchar("repository_name", { length: 120 }).notNull(),
    targetBranch: varchar("target_branch", { length: 255 }).notNull(),
    sourceBranch: varchar("source_branch", { length: 255 }),
    commitMessage: text("commit_message"),
    pullRequestTitle: text("pull_request_title"),
    pullRequestUrl: text("pull_request_url"),
    pullRequestNumber: integer("pull_request_number"),
    pullRequestHeadSha: varchar("pull_request_head_sha", { length: 64 }),
    mergeCommitSha: varchar("merge_commit_sha", { length: 64 }),
    environmentName: varchar("environment_name", { length: 128 })
      .notNull()
      .default("sketchcatch-production"),
    pipelineRunUrl: text("pipeline_run_url"),
    infraPipelineRunUrl: text("infra_pipeline_run_url"),
    infraPipelineStatus: varchar("infra_pipeline_status", { length: 32 })
      .$type<GitCicdPipelineDetailStatus>()
      .notNull()
      .default("waiting_for_merge"),
    appPipelineRunUrl: text("app_pipeline_run_url"),
    appPipelineStatus: varchar("app_pipeline_status", { length: 32 })
      .$type<GitCicdPipelineDetailStatus>()
      .notNull()
      .default("not_started"),
    destroyPipelineRunUrl: text("destroy_pipeline_run_url"),
    destroyPipelineStatus: varchar("destroy_pipeline_status", { length: 32 })
      .$type<GitCicdPipelineDetailStatus>()
      .notNull()
      .default("not_started"),
    staticSiteUrl: text("static_site_url"),
    apiBaseUrl: text("api_base_url"),
    repositorySettingsPreview:
      jsonb("repository_settings_preview").$type<GitCicdRepositorySettingsPreview>(),
    awsRoleDiff: jsonb("aws_role_diff").$type<GitCicdAwsRoleDiff>(),
    githubOAuthRequired: boolean("github_oauth_required").notNull().default(true),
    status: gitCicdHandoffStatusEnum("status").notNull().default("draft"),
    statusMessage: text("status_message"),
    userAcceptedChangeId: varchar("user_accepted_change_id", { length: 128 }).notNull(),
    createdByUserId: varchar("created_by_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("git_cicd_handoffs_project_id_idx").on(table.projectId),
    index("git_cicd_handoffs_architecture_id_idx").on(table.architectureId),
    index("git_cicd_handoffs_terraform_artifact_id_idx").on(table.terraformArtifactId),
    index("git_cicd_handoffs_created_by_user_id_idx").on(table.createdByUserId),
    index("git_cicd_handoffs_status_idx").on(table.status)
  ]
);

export const deploymentPlanArtifacts = pgTable(
  "deployment_plan_artifacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    deploymentId: varchar("deployment_id", { length: 36 })
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    terraformArtifactId: varchar("terraform_artifact_id", { length: 36 })
      .notNull()
      .references(() => projectAssets.id, { onDelete: "restrict" }),
    terraformArtifactSha256: varchar("terraform_artifact_sha256", { length: 64 }),
    operation: deploymentPlanOperationEnum("operation").notNull().default("apply"),
    objectKey: text("object_key").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    accountId: varchar("account_id", { length: 12 }).notNull(),
    region: varchar("region", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("deployment_plan_artifacts_deployment_id_idx").on(table.deploymentId),
    uniqueIndex("deployment_plan_artifacts_object_key_unique").on(table.objectKey)
  ]
);

export const deployedResources = pgTable(
  "deployed_resources",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    deploymentId: varchar("deployment_id", { length: 36 })
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    terraformAddress: text("terraform_address").notNull(),
    terraformType: varchar("terraform_type", { length: 128 }).notNull(),
    providerName: text("provider_name"),
    resourceId: text("resource_id"),
    region: varchar("region", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("deployed_resources_deployment_id_idx").on(table.deploymentId),
    uniqueIndex("deployed_resources_deployment_address_unique").on(
      table.deploymentId,
      table.terraformAddress
    )
  ]
);

export const terraformOutputs = pgTable(
  "terraform_outputs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    deploymentId: varchar("deployment_id", { length: 36 })
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    value: jsonb("value").$type<unknown>(),
    sensitive: boolean("sensitive").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("terraform_outputs_deployment_id_idx").on(table.deploymentId),
    uniqueIndex("terraform_outputs_deployment_name_unique").on(table.deploymentId, table.name)
  ]
);

export const deploymentLogs = pgTable(
  "deployment_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    deploymentId: varchar("deployment_id", { length: 36 })
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    stage: deploymentStageEnum("stage").notNull(),
    level: deploymentLogLevelEnum("level").notNull(),
    message: text("message").notNull(),
    relatedResourceId: varchar("related_resource_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("deployment_logs_deployment_sequence_unique").on(table.deploymentId, table.sequence)
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  refreshTokens: many(refreshTokens),
  passwordResetTokens: many(passwordResetTokens),
  loginAttempts: many(loginAttempts),
  oauthAccounts: many(oauthAccounts),
  awsConnections: many(awsConnections),
  sourceRepositories: many(sourceRepositories),
  reverseEngineeringScans: many(reverseEngineeringScans),
  deploymentJobs: many(deploymentJobs),
  gitCicdHandoffs: many(gitCicdHandoffs)
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id]
  })
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id]
  })
}));

export const loginAttemptsRelations = relations(loginAttempts, ({ one }) => ({
  user: one(users, {
    fields: [loginAttempts.userId],
    references: [users.id]
  })
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id]
  })
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  owner: one(users, {
    fields: [projects.userId],
    references: [users.id]
  }),
  draft: one(projectDrafts),
  architectures: many(architectures),
  assets: many(projectAssets),
  sourceRepositories: many(sourceRepositories),
  deployments: many(deployments),
  reverseEngineeringScans: many(reverseEngineeringScans),
  gitCicdHandoffs: many(gitCicdHandoffs)
}));

export const architecturesRelations = relations(architectures, ({ many, one }) => ({
  project: one(projects, {
    fields: [architectures.projectId],
    references: [projects.id]
  }),
  assets: many(projectAssets),
  gitCicdHandoffs: many(gitCicdHandoffs)
}));

export const projectDraftsRelations = relations(projectDrafts, ({ one }) => ({
  project: one(projects, {
    fields: [projectDrafts.projectId],
    references: [projects.id]
  })
}));

export const projectAssetsRelations = relations(projectAssets, ({ many, one }) => ({
  project: one(projects, {
    fields: [projectAssets.projectId],
    references: [projects.id]
  }),
  architecture: one(architectures, {
    fields: [projectAssets.architectureId],
    references: [architectures.id]
  }),
  gitCicdHandoffs: many(gitCicdHandoffs)
}));

export const deploymentsRelations = relations(deployments, ({ one, many }) => ({
  project: one(projects, {
    fields: [deployments.projectId],
    references: [projects.id]
  }),
  architecture: one(architectures, {
    fields: [deployments.architectureId],
    references: [architectures.id]
  }),
  terraformArtifact: one(projectAssets, {
    fields: [deployments.terraformArtifactId],
    references: [projectAssets.id]
  }),
  awsConnection: one(awsConnections, {
    fields: [deployments.awsConnectionId],
    references: [awsConnections.id]
  }),
  liveObservationManifest: one(deploymentLiveObservationManifests),
  logs: many(deploymentLogs),
  jobs: many(deploymentJobs),
  planArtifacts: many(deploymentPlanArtifacts),
  resources: many(deployedResources),
  outputs: many(terraformOutputs)
}));

export const deploymentLiveObservationManifestsRelations = relations(
  deploymentLiveObservationManifests,
  ({ one }) => ({
    deployment: one(deployments, {
      fields: [deploymentLiveObservationManifests.deploymentId],
      references: [deployments.id]
    })
  })
);

export const deploymentJobsRelations = relations(deploymentJobs, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentJobs.deploymentId],
    references: [deployments.id]
  }),
  requestedBy: one(users, {
    fields: [deploymentJobs.requestedByUserId],
    references: [users.id]
  })
}));

export const sourceRepositoriesRelations = relations(sourceRepositories, ({ one, many }) => ({
  project: one(projects, {
    fields: [sourceRepositories.projectId],
    references: [projects.id]
  }),
  createdBy: one(users, {
    fields: [sourceRepositories.createdByUserId],
    references: [users.id]
  }),
  gitCicdHandoffs: many(gitCicdHandoffs)
}));

export const gitCicdHandoffsRelations = relations(gitCicdHandoffs, ({ one }) => ({
  project: one(projects, {
    fields: [gitCicdHandoffs.projectId],
    references: [projects.id]
  }),
  architecture: one(architectures, {
    fields: [gitCicdHandoffs.architectureId],
    references: [architectures.id]
  }),
  terraformArtifact: one(projectAssets, {
    fields: [gitCicdHandoffs.terraformArtifactId],
    references: [projectAssets.id]
  }),
  sourceRepository: one(sourceRepositories, {
    fields: [gitCicdHandoffs.sourceRepositoryId],
    references: [sourceRepositories.id]
  }),
  createdBy: one(users, {
    fields: [gitCicdHandoffs.createdByUserId],
    references: [users.id]
  })
}));

export const deploymentLogsRelations = relations(deploymentLogs, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentLogs.deploymentId],
    references: [deployments.id]
  })
}));

export const deploymentPlanArtifactsRelations = relations(deploymentPlanArtifacts, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentPlanArtifacts.deploymentId],
    references: [deployments.id]
  }),
  terraformArtifact: one(projectAssets, {
    fields: [deploymentPlanArtifacts.terraformArtifactId],
    references: [projectAssets.id]
  })
}));

export const deployedResourcesRelations = relations(deployedResources, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deployedResources.deploymentId],
    references: [deployments.id]
  })
}));

export const terraformOutputsRelations = relations(terraformOutputs, ({ one }) => ({
  deployment: one(deployments, {
    fields: [terraformOutputs.deploymentId],
    references: [deployments.id]
  })
}));

export const awsConnectionsRelations = relations(awsConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [awsConnections.userId],
    references: [users.id]
  }),
  reverseEngineeringScans: many(reverseEngineeringScans)
}));

export const reverseEngineeringScansRelations = relations(
  reverseEngineeringScans,
  ({ many, one }) => ({
    project: one(projects, {
      fields: [reverseEngineeringScans.projectId],
      references: [projects.id]
    }),
    awsConnection: one(awsConnections, {
      fields: [reverseEngineeringScans.awsConnectionId],
      references: [awsConnections.id]
    }),
    logs: many(reverseEngineeringScanLogs)
  })
);

export const reverseEngineeringScanLogsRelations = relations(
  reverseEngineeringScanLogs,
  ({ one }) => ({
    scan: one(reverseEngineeringScans, {
      fields: [reverseEngineeringScanLogs.scanId],
      references: [reverseEngineeringScans.id]
    })
  })
);

export const touchUpdatedAt = {
  updatedAt: sql`now()`
};
