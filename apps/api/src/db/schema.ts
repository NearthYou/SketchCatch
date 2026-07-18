import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  foreignKey,
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
  ApplicationReleaseFailureStage,
  ApplicationArtifactKind,
  ApplicationArtifactStatus,
  ApplicationReleaseProviderRevision,
  ApplicationReleaseStatus,
  ArchitectureJson,
  ConfirmedBuildConfig,
  CompositeReleaseDigest,
  CloudProvider,
  DeploymentScope,
  DeploymentNotificationSource,
  DeploymentNotificationStatus,
  DeploymentSource,
  DeploymentLiveObservationManifestV2,
  DeploymentLiveProfile,
  DeploymentPlanSummary,
  DiagramJson,
  GitCicdAwsRoleDiff,
  GitCicdDeploymentMode,
  GitCicdHandoffKind,
  GitCicdMonitoredPath,
  GitCicdMonitoringValidationStatus,
  GitCicdPipelineChangeScope,
  GitCicdPipelineExecutionKind,
  GitCicdPipelineDetailStatus,
  GitCicdPipelineRunStatus,
  GitCicdPipelineStageKind,
  GitCicdPipelineStageStatus,
  GitCicdRepositorySettingsPreview,
  GitHubInstallationConnectionStatus,
  GitHubRepositorySelection,
  JsonValue,
  FrontendReleaseEvidence,
  ProjectDeploymentRuntimeConfig,
  RepositoryAnalysisAiHandoff,
  RepositoryAnalysisTemplateId,
  SourceRepositoryAnalysisResult,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScanResult,
  RuntimeAdapterKind,
  RuntimeConvergenceOutcome,
  RuntimeDeploymentTarget,
  RuntimeTargetKind,
  TerraformSyncFileInput
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
  "PARTIALLY_FAILED",
  "PARTIALLY_CANCELED",
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
  "build_environment",
  "preflight",
  "validate",
  "plan",
  "approval",
  "aws_connection",
  "mock_run",
  "apply",
  "application_release",
  "rollback",
  "destroy"
]);

export const deploymentStageEnum = pgEnum("deployment_stage", [
  "init",
  "preflight",
  "validate",
  "plan",
  "apply",
  "application_release",
  "rollback",
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
  "recover_application_release",
  "retry_application_frontend",
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

export const githubInstallationConnections = pgTable(
  "github_installation_connections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    githubInstallationId: varchar("github_installation_id", { length: 128 }).notNull(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    accountLogin: varchar("account_login", { length: 255 }).notNull(),
    accountType: varchar("account_type", { length: 64 }),
    repositorySelection: varchar("repository_selection", { length: 32 }).$type<GitHubRepositorySelection>(),
    htmlUrl: text("html_url"),
    status: varchar("status", { length: 32 })
      .$type<GitHubInstallationConnectionStatus>()
      .notNull()
      .default("active"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull().defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("github_installation_connections_installation_unique").on(
      table.githubInstallationId
    ),
    index("github_installation_connections_user_status_idx").on(table.userId, table.status),
    check(
      "github_installation_connections_status_check",
      sql`${table.status} IN ('active', 'disconnected')`
    ),
    check(
      "github_installation_connections_repository_selection_check",
      sql`${table.repositorySelection} IS NULL OR ${table.repositorySelection} IN ('all', 'selected')`
    )
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
    deletionStartedAt: timestamp("deletion_started_at", { withTimezone: true }),
    deletionErrorSummary: text("deletion_error_summary"),
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
    terraformFiles: jsonb("terraform_files").$type<TerraformSyncFileInput[]>(),
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

export const repositoryAnalysisRecords = pgTable(
  "repository_analysis_records",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).$type<"github">().notNull(),
    repositoryUrl: text("repository_url").notNull(),
    owner: varchar("owner", { length: 120 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    branch: varchar("branch", { length: 255 }).notNull(),
    repositoryRevision: varchar("repository_revision", { length: 128 }).notNull(),
    analysisResult: jsonb("analysis_result").$type<SourceRepositoryAnalysisResult>().notNull(),
    selectedTemplateId: varchar("selected_template_id", { length: 128 })
      .$type<RepositoryAnalysisTemplateId>(),
    sourceRepositoryId: varchar("source_repository_id", { length: 36 }).references(
      () => sourceRepositories.id,
      { onDelete: "set null" }
    ),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("repository_analysis_records_project_unique").on(table.projectId),
    index("repository_analysis_records_source_repository_idx").on(table.sourceRepositoryId),
    check("repository_analysis_records_provider_check", sql`${table.provider} = 'github'`)
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
    deletionStartedAt: timestamp("deletion_started_at", { withTimezone: true }),
    deletionErrorSummary: text("deletion_error_summary"),
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

export const awsCodeConnections = pgTable(
  "aws_code_connections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    awsConnectionId: varchar("aws_connection_id", { length: 36 })
      .notNull()
      .references(() => awsConnections.id, { onDelete: "cascade" }),
    connectionArn: text("connection_arn"),
    providerType: varchar("provider_type", { length: 32 })
      .$type<"GitHub">()
      .notNull()
      .default("GitHub"),
    status: varchar("status", { length: 24 })
      .$type<"CREATING" | "PENDING" | "AVAILABLE" | "ERROR" | "DELETING">()
      .notNull()
      .default("CREATING"),
    statusReason: text("status_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("aws_code_connections_aws_connection_unique").on(table.awsConnectionId),
    uniqueIndex("aws_code_connections_connection_arn_unique").on(table.connectionArn),
    check("aws_code_connections_provider_check", sql`${table.providerType} = 'GitHub'`),
    check(
      "aws_code_connections_status_check",
      sql`${table.status} in ('CREATING', 'PENDING', 'AVAILABLE', 'ERROR', 'DELETING')`
    )
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

export const projectDeploymentTargets = pgTable(
  "project_deployment_targets",
  {
    projectId: varchar("project_id", { length: 36 })
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).$type<"aws">().notNull().default("aws"),
    connectionId: varchar("connection_id", { length: 36 })
      .references(() => awsConnections.id, { onDelete: "set null" }),
    region: varchar("region", { length: 32 }).notNull(),
    runtimeTargetKind: varchar("runtime_target_kind", { length: 32 })
      .$type<RuntimeTargetKind>()
      .notNull(),
    confirmedBuildConfig: jsonb("confirmed_build_config").$type<ConfirmedBuildConfig>(),
    runtimeConfig: jsonb("runtime_config").$type<ProjectDeploymentRuntimeConfig>(),
    runtimeTarget: jsonb("runtime_target").$type<RuntimeDeploymentTarget>(),
    deploymentTargetFingerprint: varchar("deployment_target_fingerprint", { length: 64 }),
    rolloutStrategy: varchar("rollout_strategy", { length: 32 })
      .$type<"all_at_once">()
      .notNull()
      .default("all_at_once"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("project_deployment_targets_connection_id_idx").on(table.connectionId),
    check("project_deployment_targets_provider_check", sql`${table.provider} = 'aws'`),
    check(
      "project_deployment_targets_runtime_kind_check",
      sql`${table.runtimeTargetKind} in ('ecs_fargate', 'lambda', 'ec2_asg', 'static_site')`
    ),
    check(
      "project_deployment_targets_rollout_check",
      sql`${table.rolloutStrategy} = 'all_at_once'`
    ),
    check(
      "project_deployment_targets_runtime_config_check",
      sql`${table.runtimeConfig} is null or (
        jsonb_typeof(${table.runtimeConfig}) = 'object'
        and (
          (${table.runtimeTargetKind} = 'ecs_fargate' and ${table.runtimeConfig}->>'runtimeTargetKind' = 'ecs_fargate')
          or (${table.runtimeTargetKind} = 'lambda' and ${table.runtimeConfig}->>'runtimeTargetKind' = 'lambda')
          or (${table.runtimeTargetKind} = 'ec2_asg' and ${table.runtimeConfig}->>'runtimeTargetKind' = 'ec2_asg')
          or (${table.runtimeTargetKind} = 'static_site' and ${table.runtimeConfig}->>'runtimeTargetKind' = 'static_site')
        )
      )`
    ),
    check(
      "project_deployment_targets_runtime_convergence_check",
      sql`(
        ${table.runtimeTarget} is null
        and ${table.deploymentTargetFingerprint} is null
      ) or (
        jsonb_typeof(${table.runtimeTarget}) = 'object'
        and ${table.runtimeTarget}->>'adapterKind' in ('ecs_service_fargate', 'ecs_service_ec2_capacity_provider', 'ec2_instance', 'ec2_auto_scaling_group', 'eks_managed_node_group', 'eks_self_managed_node', 'eks_fargate_profile', 'kubernetes_deployment', 'lambda_alias', 'static_s3_cloudfront')
        and ${table.deploymentTargetFingerprint} ~ '^[0-9a-f]{64}$'
      )`
    )
  ]
);

export const projectBuildEnvironments = pgTable(
  "project_build_environments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    awsConnectionId: varchar("aws_connection_id", { length: 36 }).references(
      () => awsConnections.id,
      { onDelete: "set null" }
    ),
    awsCodeConnectionId: varchar("aws_code_connection_id", { length: 36 }).references(
      () => awsCodeConnections.id,
      { onDelete: "set null" }
    ),
    codeBuildProjectName: varchar("codebuild_project_name", { length: 255 }).notNull(),
    codeBuildServiceRoleArn: text("codebuild_service_role_arn").notNull(),
    permissionsBoundaryArn: text("permissions_boundary_arn").notNull(),
    sourceRepositoryUrl: text("source_repository_url").notNull(),
    runtimeFingerprint: varchar("runtime_fingerprint", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 })
      .$type<"preparing" | "ready" | "verification_failed" | "disconnected">()
      .notNull()
      .default("preparing"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    repositoryVerificationStatus: varchar("repository_verification_status", { length: 32 })
      .$type<"not_checked" | "verified" | "failed">()
      .notNull()
      .default("not_checked"),
    repositoryVerificationRequestedCommitSha: varchar(
      "repository_verification_requested_commit_sha",
      { length: 64 }
    ),
    repositoryVerificationResolvedCommitSha: varchar(
      "repository_verification_resolved_commit_sha",
      { length: 64 }
    ),
    repositoryVerificationBuildArn: text("repository_verification_build_arn"),
    repositoryVerificationStatusReason: text("repository_verification_status_reason"),
    repositoryVerifiedAt: timestamp("repository_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("project_build_environments_project_unique").on(table.projectId),
    index("project_build_environments_aws_connection_idx").on(table.awsConnectionId),
    index("project_build_environments_code_connection_idx").on(table.awsCodeConnectionId),
    check(
      "project_build_environments_fingerprint_check",
      sql`${table.runtimeFingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "project_build_environments_status_check",
      sql`${table.status} in ('preparing', 'ready', 'verification_failed', 'disconnected')`
    ),
    check(
      "project_build_environments_repository_verification_status_check",
      sql`${table.repositoryVerificationStatus} in ('not_checked', 'verified', 'failed')`
    ),
    check(
      "project_build_environments_repository_verification_requested_sha_check",
      sql`${table.repositoryVerificationRequestedCommitSha} is null or ${table.repositoryVerificationRequestedCommitSha} ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'`
    ),
    check(
      "project_build_environments_repository_verification_resolved_sha_check",
      sql`${table.repositoryVerificationResolvedCommitSha} is null or ${table.repositoryVerificationResolvedCommitSha} ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'`
    ),
    check(
      "project_build_environments_repository_verification_evidence_check",
      sql`(
        ${table.repositoryVerificationStatus} <> 'verified'
        or (
          ${table.repositoryVerificationRequestedCommitSha} is not null
          and ${table.repositoryVerificationResolvedCommitSha} = ${table.repositoryVerificationRequestedCommitSha}
          and ${table.repositoryVerificationBuildArn} is not null
          and ${table.repositoryVerificationStatusReason} is null
          and ${table.repositoryVerifiedAt} is not null
        )
      )`
    )
  ]
);

export const projectExecutionLeases = pgTable(
  "project_execution_leases",
  {
    projectId: varchar("project_id", { length: 36 })
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    holderId: varchar("holder_id", { length: 128 }).notNull(),
    source: varchar("source", { length: 16 })
      .$type<"direct" | "gitops">()
      .notNull(),
    fencingVersion: integer("fencing_version").notNull(),
    status: varchar("status", { length: 16 })
      .$type<"active" | "releasing" | "released">()
      .notNull()
      .default("active"),
    activeCodeBuildId: text("active_codebuild_id"),
    activeWorkerTaskArn: text("active_worker_task_arn"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("project_execution_leases_expires_at_idx").on(table.expiresAt),
    check("project_execution_leases_fencing_check", sql`${table.fencingVersion} > 0`),
    check("project_execution_leases_source_check", sql`${table.source} in ('direct', 'gitops')`),
    check(
      "project_execution_leases_status_check",
      sql`${table.status} in ('active', 'releasing', 'released')`
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
      { onDelete: "set null" }
    ),
    awsAccountIdSnapshot: varchar("aws_account_id_snapshot", { length: 12 }),
    awsRegionSnapshot: varchar("aws_region_snapshot", { length: 32 }),
    awsConnectionNameSnapshot: text("aws_connection_name_snapshot"),
    liveProfile: deploymentLiveProfileEnum("live_profile")
      .$type<DeploymentLiveProfile>()
      .notNull()
      .default("practice"),
    scope: varchar("scope", { length: 32 })
      .$type<DeploymentScope>()
      .notNull()
      .default("infrastructure"),
    targetKind: varchar("target_kind", { length: 32 }).$type<RuntimeTargetKind>(),
    source: varchar("source", { length: 16 })
      .$type<DeploymentSource>()
      .notNull()
      .default("direct"),
    releaseId: varchar("release_id", { length: 36 }).references(
      (): AnyPgColumn => applicationReleases.id,
      { onDelete: "set null" }
    ),
    releaseCandidateId: varchar("release_candidate_id", { length: 36 }).references(
      (): AnyPgColumn => releaseCandidates.id,
      { onDelete: "set null" }
    ),
    rollbackOfDeploymentId: varchar("rollback_of_deployment_id", { length: 36 }).references(
      (): AnyPgColumn => deployments.id,
      { onDelete: "set null" }
    ),
    rollbackTargetDeploymentId: varchar("rollback_target_deployment_id", {
      length: 36
    }).references((): AnyPgColumn => deployments.id, { onDelete: "set null" }),
    preparedDraftRevision: integer("prepared_draft_revision"),
    preparedSnapshotHash: varchar("prepared_snapshot_hash", { length: 64 }),
    approvedPreparedSnapshotHash: varchar("approved_prepared_snapshot_hash", { length: 64 }),
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
    index("deployments_release_candidate_id_idx").on(table.releaseCandidateId),
    index("deployments_rollback_of_id_idx").on(table.rollbackOfDeploymentId),
    index("deployments_rollback_target_id_idx").on(table.rollbackTargetDeploymentId),
    index("deployments_current_plan_artifact_id_idx").on(table.currentPlanArtifactId),
    index("deployments_approved_plan_artifact_id_idx").on(table.approvedPlanArtifactId),
    index("deployments_project_prepared_revision_idx").on(
      table.projectId,
      table.preparedDraftRevision
    ),
    uniqueIndex("deployments_release_id_unique")
      .on(table.releaseId)
      .where(sql`${table.releaseId} is not null`),
    check(
      "deployments_scope_check",
      sql`${table.scope} in ('infrastructure', 'application', 'full_stack')`
    ),
    check(
      "deployments_target_kind_check",
      sql`${table.targetKind} is null or ${table.targetKind} in ('ecs_fargate', 'lambda', 'ec2_asg', 'static_site')`
    ),
    check("deployments_source_check", sql`${table.source} in ('direct', 'gitops')`),
    check(
      "deployments_prepared_snapshot_pair_check",
      sql`(
        (${table.preparedDraftRevision} is null and ${table.preparedSnapshotHash} is null)
        or
        (${table.preparedDraftRevision} > 0 and ${table.preparedSnapshotHash} ~ '^[0-9a-f]{64}$')
      )`
    ),
    check(
      "deployments_approved_prepared_snapshot_hash_check",
      sql`${table.approvedPreparedSnapshotHash} is null or ${table.approvedPreparedSnapshotHash} ~ '^[0-9a-f]{64}$'`
    ),
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
    ),
    check(
      "deployment_live_observation_manifests_status_payload_check",
      sql`(
        (${table.status} = 'valid'
          AND ${table.manifest} IS NOT NULL
          AND jsonb_typeof(${table.manifest}) = 'object'
          AND ${table.manifest}->>'schemaVersion' = '2'
          AND ${table.invalidReason} IS NULL)
        OR
        (${table.status} = 'manifest_invalid'
          AND ${table.manifest} IS NULL
          AND ${table.invalidReason} IS NOT NULL
          AND length(btrim(${table.invalidReason})) > 0)
      )`
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
    githubAppPermissionRequired: boolean("github_oauth_required").notNull().default(true),
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

export const gitCicdMonitoringConfigs = pgTable("git_cicd_monitoring_configs", {
  sourceRepositoryId: varchar("source_repository_id", { length: 36 })
    .primaryKey()
    .references(() => sourceRepositories.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  monitorBranch: varchar("monitor_branch", { length: 255 }).notNull(),
  appPath: jsonb("app_path").$type<GitCicdMonitoredPath>().notNull(),
  infraPath: jsonb("infra_path").$type<GitCicdMonitoredPath>().notNull(),
  validationStatus: varchar("validation_status", { length: 16 })
    .$type<GitCicdMonitoringValidationStatus>()
    .notNull()
    .default("required"),
  validationMessage: text("validation_message"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const gitCicdPipelineRuns = pgTable(
  "git_cicd_pipeline_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceRepositoryId: varchar("source_repository_id", { length: 36 })
      .notNull()
      .references(() => sourceRepositories.id, { onDelete: "cascade" }),
    infrastructureDeploymentId: varchar("infrastructure_deployment_id", { length: 36 }).references(
      () => deployments.id,
      { onDelete: "set null" }
    ),
    handoffId: varchar("handoff_id", { length: 36 }).references(() => gitCicdHandoffs.id, {
      onDelete: "set null"
    }),
    executionKind: varchar("execution_kind", { length: 16 })
      .$type<GitCicdPipelineExecutionKind>()
      .notNull()
      .default("app"),
    commitSha: varchar("commit_sha", { length: 64 }).notNull(),
    commitMessage: text("commit_message").notNull(),
    branch: varchar("branch", { length: 255 }).notNull(),
    releaseRequestKey: varchar("release_request_key", { length: 160 }),
    githubRepositoryId: varchar("github_repository_id", { length: 32 }),
    githubWorkflowRef: text("github_workflow_ref"),
    githubWorkflowRunId: varchar("github_workflow_run_id", { length: 32 }),
    githubWorkflowRunAttempt: integer("github_workflow_run_attempt"),
    githubOidcSubject: text("github_oidc_subject"),
    githubEnvironment: text("github_environment"),
    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
    changeScope: varchar("change_scope", { length: 32 })
      .$type<GitCicdPipelineChangeScope>()
      .notNull(),
    status: varchar("status", { length: 16 }).$type<GitCicdPipelineRunStatus>().notNull(),
    statusMessage: text("status_message"),
    pipelineRunUrl: text("pipeline_run_url"),
    appUrl: text("app_url"),
    apiUrl: text("api_url"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    upstreamOrderingToken: text("upstream_ordering_token").notNull().default(""),
    logRevision: text("log_revision").notNull().default(""),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "git_cicd_pipeline_runs_execution_kind_check",
      sql`${table.executionKind} in ('app', 'infra')`
    ),
    uniqueIndex("git_cicd_pipeline_runs_github_run_unique")
      .on(
        table.sourceRepositoryId,
        table.githubWorkflowRunId,
        table.githubWorkflowRunAttempt
      )
      .where(
        sql`${table.githubWorkflowRunId} is not null and ${table.githubWorkflowRunAttempt} is not null`
      ),
    uniqueIndex("git_cicd_pipeline_runs_release_request_key_unique")
      .on(table.releaseRequestKey)
      .where(sql`${table.releaseRequestKey} is not null`),
    index("git_cicd_pipeline_runs_project_id_idx").on(table.projectId),
    index("git_cicd_pipeline_runs_project_created_id_idx").on(
      table.projectId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("git_cicd_pipeline_runs_status_idx").on(table.status),
    index("git_cicd_pipeline_runs_created_at_idx").on(table.createdAt)
  ]
);

export const releaseCandidates = pgTable(
  "release_candidates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    deploymentId: varchar("deployment_id", { length: 36 }).references(() => deployments.id, {
      onDelete: "cascade"
    }),
    pipelineRunId: varchar("pipeline_run_id", { length: 36 }).references(
      () => gitCicdPipelineRuns.id,
      { onDelete: "cascade" }
    ),
    buildEnvironmentId: varchar("build_environment_id", { length: 36 }).references(
      () => projectBuildEnvironments.id,
      { onDelete: "set null" }
    ),
    commitSha: varchar("commit_sha", { length: 64 }).notNull(),
    configFingerprint: varchar("config_fingerprint", { length: 64 }).notNull(),
    compositeDigest: varchar("composite_digest", { length: 64 }).notNull(),
    apiOciDigest: varchar("api_oci_digest", { length: 64 }).notNull(),
    apiArchiveDigest: varchar("api_archive_digest", { length: 64 }).notNull(),
    frontendArchiveDigest: varchar("frontend_archive_digest", { length: 64 }).notNull(),
    frontendManifestDigest: varchar("frontend_manifest_digest", { length: 64 }).notNull(),
    frontendIndexDigest: varchar("frontend_index_digest", { length: 64 }).notNull(),
    apiArchiveObjectKey: text("api_archive_object_key").notNull(),
    apiArchiveObjectVersionId: text("api_archive_object_version_id").notNull(),
    apiArchiveByteSize: bigint("api_archive_byte_size", { mode: "number" }).notNull(),
    frontendArchiveObjectKey: text("frontend_archive_object_key").notNull(),
    frontendArchiveObjectVersionId: text("frontend_archive_object_version_id").notNull(),
    frontendArchiveByteSize: bigint("frontend_archive_byte_size", { mode: "number" }).notNull(),
    frontendManifestObjectKey: text("frontend_manifest_object_key").notNull(),
    frontendManifestObjectVersionId: text("frontend_manifest_object_version_id").notNull(),
    manifestObjectKey: text("manifest_object_key").notNull(),
    manifestObjectVersionId: text("manifest_object_version_id").notNull(),
    status: varchar("status", { length: 16 })
      .$type<
        | "building"
        | "pending"
        | "activating"
        | "partially_failed"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "expired"
      >()
      .notNull()
      .default("building"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    frontendRetryExpiresAt: timestamp("frontend_retry_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("release_candidates_project_created_idx").on(table.projectId, table.createdAt.desc()),
    index("release_candidates_expires_at_idx").on(table.expiresAt),
    index("release_candidates_deployment_id_idx").on(table.deploymentId),
    index("release_candidates_pipeline_run_id_idx").on(table.pipelineRunId),
    check(
      "release_candidates_reference_check",
      sql`num_nonnulls(${table.deploymentId}, ${table.pipelineRunId}) = 1`
    ),
    check(
      "release_candidates_digest_check",
      sql`${table.configFingerprint} ~ '^[0-9a-f]{64}$'
        and ${table.compositeDigest} ~ '^[0-9a-f]{64}$'
        and ${table.apiOciDigest} ~ '^[0-9a-f]{64}$'
        and ${table.apiArchiveDigest} ~ '^[0-9a-f]{64}$'
        and ${table.frontendArchiveDigest} ~ '^[0-9a-f]{64}$'
        and ${table.frontendManifestDigest} ~ '^[0-9a-f]{64}$'
        and ${table.frontendIndexDigest} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "release_candidates_commit_sha_check",
      sql`${table.commitSha} ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'`
    ),
    check(
      "release_candidates_size_check",
      sql`${table.apiArchiveByteSize} > 0 and ${table.frontendArchiveByteSize} > 0`
    ),
    check(
      "release_candidates_status_check",
      sql`${table.status} in ('building', 'pending', 'activating', 'partially_failed', 'succeeded', 'failed', 'cancelled', 'expired')`
    )
  ]
);

export const gitCicdPipelineStages = pgTable(
  "git_cicd_pipeline_stages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    pipelineRunId: varchar("pipeline_run_id", { length: 36 })
      .notNull()
      .references(() => gitCicdPipelineRuns.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).$type<GitCicdPipelineStageKind>().notNull(),
    status: varchar("status", { length: 16 }).$type<GitCicdPipelineStageStatus>().notNull(),
    runUrl: text("run_url"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("git_cicd_pipeline_stages_run_kind_unique").on(
      table.pipelineRunId,
      table.kind
    )
  ]
);

export const gitCicdPipelineLogs = pgTable(
  "git_cicd_pipeline_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    pipelineRunId: varchar("pipeline_run_id", { length: 36 })
      .notNull()
      .references(() => gitCicdPipelineRuns.id, { onDelete: "cascade" }),
    stageId: varchar("stage_id", { length: 36 }).references(() => gitCicdPipelineStages.id, {
      onDelete: "set null"
    }),
    sequence: integer("sequence").notNull(),
    level: varchar("level", { length: 16 }).$type<"info" | "warning" | "error">().notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("git_cicd_pipeline_logs_run_sequence_unique").on(
      table.pipelineRunId,
      table.sequence
    )
  ]
);

export const applicationArtifacts = pgTable(
  "application_artifacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceRepositoryId: varchar("source_repository_id", { length: 36 }).references(
      () => sourceRepositories.id,
      { onDelete: "set null" }
    ),
    kind: varchar("kind", { length: 32 }).$type<ApplicationArtifactKind>().notNull(),
    artifactFingerprint: varchar("artifact_fingerprint", { length: 64 }).notNull(),
    repositoryIdentity: text("repository_identity").notNull(),
    commitSha: varchar("commit_sha", { length: 64 }).notNull(),
    buildConfigSha256: varchar("build_config_sha256", { length: 64 }).notNull(),
    buildContractVersion: varchar("build_contract_version", { length: 128 }).notNull(),
    targetOs: varchar("target_os", { length: 64 }).notNull(),
    targetArchitecture: varchar("target_architecture", { length: 64 }).notNull(),
    buildInputIdentitySha256: varchar("build_input_identity_sha256", { length: 64 }).notNull(),
    digestAlgorithm: varchar("digest_algorithm", { length: 16 }).$type<"sha256">(),
    digest: varchar("digest", { length: 64 }),
    provider: varchar("provider", { length: 32 }).$type<CloudProvider>(),
    providerAccountId: varchar("provider_account_id", { length: 128 }),
    providerRegion: varchar("provider_region", { length: 64 }),
    storageNamespace: text("storage_namespace"),
    artifactReference: text("artifact_reference"),
    ownershipScope: varchar("ownership_scope", { length: 128 }),
    status: varchar("status", { length: 16 })
      .$type<ApplicationArtifactStatus>()
      .notNull()
      .default("building"),
    claimTokenSha256: varchar("claim_token_sha256", { length: 64 }),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("application_artifacts_id_project_unique").on(table.id, table.projectId),
    uniqueIndex("application_artifacts_project_fingerprint_active_unique")
      .on(table.projectId, table.artifactFingerprint)
      .where(sql`${table.status} in ('building', 'available')`),
    index("application_artifacts_project_created_id_idx").on(
      table.projectId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("application_artifacts_source_repository_id_idx").on(table.sourceRepositoryId),
    check(
      "application_artifacts_kind_check",
      sql`${table.kind} in ('container_image', 'lambda_zip', 'codedeploy_bundle', 'static_bundle', 'kubernetes_manifest', 'helm_chart', 'machine_image')`
    ),
    check(
      "application_artifacts_status_check",
      sql`${table.status} in ('building', 'available', 'invalid', 'failed')`
    ),
    check(
      "application_artifacts_identity_hashes_check",
      sql`${table.artifactFingerprint} ~ '^[0-9a-f]{64}$' and ${table.buildConfigSha256} ~ '^[0-9a-f]{64}$' and ${table.buildInputIdentitySha256} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "application_artifacts_commit_sha_check",
      sql`${table.commitSha} ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'`
    ),
    check(
      "application_artifacts_payload_check",
      sql`(
        ${table.status} = 'building'
        and ${table.claimTokenSha256} ~ '^[0-9a-f]{64}$'
        and ${table.claimExpiresAt} is not null
        and ${table.digest} is null
      ) or (
        ${table.status} in ('available', 'invalid')
        and ${table.claimTokenSha256} is null
        and ${table.claimExpiresAt} is null
        and ${table.digestAlgorithm} = 'sha256'
        and ${table.digest} ~ '^[0-9a-f]{64}$'
        and ${table.provider} in ('aws', 'kubernetes')
        and ${table.providerAccountId} is not null
        and ${table.providerRegion} is not null
        and ${table.storageNamespace} is not null
        and ${table.artifactReference} is not null
        and ${table.ownershipScope} is not null
      ) or (
        ${table.status} = 'failed'
        and ${table.claimTokenSha256} is null
        and ${table.claimExpiresAt} is null
      )`
    )
  ]
);

export const applicationReleases = pgTable(
  "application_releases",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    artifactId: varchar("artifact_id", { length: 36 }),
    deploymentId: varchar("deployment_id", { length: 36 }).references(() => deployments.id, {
      onDelete: "set null"
    }),
    pipelineRunId: varchar("pipeline_run_id", { length: 36 }).references(
      () => gitCicdPipelineRuns.id,
      { onDelete: "set null" }
    ),
    source: varchar("source", { length: 16 }).$type<DeploymentSource>().notNull(),
    runtimeTargetKind: varchar("runtime_target_kind", { length: 32 })
      .$type<RuntimeTargetKind>()
      .notNull(),
    runtimeAdapterKind: varchar("runtime_adapter_kind", { length: 64 })
      .$type<RuntimeAdapterKind>(),
    deploymentTargetFingerprint: varchar("deployment_target_fingerprint", { length: 64 }),
    convergenceOutcome: varchar("convergence_outcome", { length: 32 })
      .$type<RuntimeConvergenceOutcome>(),
    version: varchar("version", { length: 128 }).notNull(),
    commitSha: varchar("commit_sha", { length: 64 }).notNull(),
    artifactDigestAlgorithm: varchar("artifact_digest_algorithm", { length: 16 })
      .$type<"sha256">()
      .notNull()
      .default("sha256"),
    artifactDigest: varchar("artifact_digest", { length: 64 }).notNull(),
    releaseCandidateId: varchar("release_candidate_id", { length: 36 }).references(
      () => releaseCandidates.id,
      { onDelete: "set null" }
    ),
    compositeDigest: jsonb("composite_digest").$type<CompositeReleaseDigest>(),
    providerRevision: jsonb("provider_revision").$type<ApplicationReleaseProviderRevision>(),
    frontendEvidence: jsonb("frontend_evidence").$type<FrontendReleaseEvidence>(),
    failureStage: varchar("failure_stage", { length: 40 }).$type<ApplicationReleaseFailureStage>(),
    baselineReleaseId: varchar("baseline_release_id", { length: 36 }).references(
      (): AnyPgColumn => applicationReleases.id,
      { onDelete: "set null" }
    ),
    outputUrl: text("output_url"),
    status: varchar("status", { length: 24 })
      .$type<ApplicationReleaseStatus>()
      .notNull()
      .default("pending"),
    healthEvidence: jsonb("health_evidence").$type<JsonValue>(),
    rollbackEvidence: jsonb("rollback_evidence").$type<JsonValue>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("application_releases_project_created_id_idx").on(
      table.projectId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("application_releases_candidate_id_idx").on(table.releaseCandidateId),
    index("application_releases_baseline_id_idx").on(table.baselineReleaseId),
    uniqueIndex("application_releases_deployment_unique")
      .on(table.deploymentId)
      .where(sql`${table.deploymentId} is not null`),
    uniqueIndex("application_releases_pipeline_run_unique")
      .on(table.pipelineRunId)
      .where(sql`${table.pipelineRunId} is not null`),
    foreignKey({
      columns: [table.artifactId, table.projectId],
      foreignColumns: [applicationArtifacts.id, applicationArtifacts.projectId],
      name: "application_releases_artifact_project_fk"
    }),
    check("application_releases_source_check", sql`${table.source} in ('direct', 'gitops')`),
    check(
      "application_releases_runtime_kind_check",
      sql`${table.runtimeTargetKind} in ('ecs_fargate', 'lambda', 'ec2_asg', 'static_site')`
    ),
    check(
      "application_releases_status_check",
      sql`${table.status} in ('pending', 'building', 'deploying', 'retrying', 'partially_failed', 'partially_cancelled', 'succeeded', 'failed', 'rolled_back', 'cancelled')`
    ),
    check(
      "application_releases_digest_check",
      sql`${table.artifactDigestAlgorithm} = 'sha256' and ${table.artifactDigest} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "application_releases_commit_sha_check",
      sql`${table.commitSha} ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'`
    ),
    check(
      "application_releases_runtime_convergence_check",
      sql`(
        ${table.runtimeAdapterKind} is null
        and ${table.deploymentTargetFingerprint} is null
        and ${table.convergenceOutcome} is null
      ) or (
        ${table.runtimeAdapterKind} in ('ecs_service_fargate', 'ecs_service_ec2_capacity_provider', 'ec2_instance', 'ec2_auto_scaling_group', 'eks_managed_node_group', 'eks_self_managed_node', 'eks_fargate_profile', 'kubernetes_deployment', 'lambda_alias', 'static_s3_cloudfront')
        and ${table.deploymentTargetFingerprint} ~ '^[0-9a-f]{64}$'
        and (${table.convergenceOutcome} is null or ${table.convergenceOutcome} in ('already_active', 'rolled_out'))
      )`
    )
  ]
);

export const applicationReleaseSteps = pgTable(
  "application_release_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    releaseId: varchar("release_id", { length: 36 })
      .notNull()
      .references(() => applicationReleases.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    step: varchar("step", { length: 40 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<"pending" | "running" | "succeeded" | "failed" | "skipped">()
      .notNull()
      .default("pending"),
    fencingVersion: integer("fencing_version").notNull(),
    attempt: integer("attempt").notNull().default(1),
    evidence: jsonb("evidence").$type<JsonValue>(),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("application_release_steps_release_sequence_unique").on(
      table.releaseId,
      table.sequence
    ),
    index("application_release_steps_release_status_idx").on(table.releaseId, table.status),
    check("application_release_steps_sequence_check", sql`${table.sequence} > 0`),
    check("application_release_steps_fencing_check", sql`${table.fencingVersion} > 0`),
    check("application_release_steps_attempt_check", sql`${table.attempt} > 0`),
    check(
      "application_release_steps_status_check",
      sql`${table.status} in ('pending', 'running', 'succeeded', 'failed', 'skipped')`
    )
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 32 })
      .$type<DeploymentNotificationSource>()
      .notNull(),
    sourceId: varchar("source_id", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<DeploymentNotificationStatus>()
      .notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: text("body").notNull(),
    actionUrl: text("action_url").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("notifications_idempotency_key_unique").on(table.idempotencyKey),
    index("notifications_user_created_id_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("notifications_expires_at_idx").on(table.expiresAt),
    check(
      "notifications_source_check",
      sql`${table.source} in ('direct_deployment', 'gitops_pipeline')`
    ),
    check(
      "notifications_status_check",
      sql`${table.status} in ('succeeded', 'failed', 'cancelled')`
    ),
    check("notifications_action_url_check", sql`${table.actionUrl} ~ '^/dashboard/projects/[0-9a-f-]{36}$'`)
  ]
);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    notificationId: varchar("notification_id", { length: 36 })
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 })
      .$type<"pending" | "processing" | "retry" | "delivered" | "dead">()
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    providerStatusCode: integer("provider_status_code"),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("notification_outbox_notification_unique").on(table.notificationId),
    index("notification_outbox_dispatch_idx").on(table.status, table.nextAttemptAt),
    check(
      "notification_outbox_status_check",
      sql`${table.status} in ('pending', 'processing', 'retry', 'delivered', 'dead')`
    ),
    check("notification_outbox_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "notification_outbox_provider_status_code_check",
      sql`${table.providerStatusCode} is null or ${table.providerStatusCode} between 100 and 599`
    )
  ]
);

export const webPushSubscriptions = pgTable(
  "web_push_subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpointHash: varchar("endpoint_hash", { length: 64 }).notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    keyVersion: varchar("key_version", { length: 32 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("web_push_subscriptions_endpoint_hash_unique").on(table.endpointHash),
    index("web_push_subscriptions_user_id_idx").on(table.userId),
    index("web_push_subscriptions_expires_at_idx").on(table.expiresAt),
    check("web_push_subscriptions_failure_count_check", sql`${table.failureCount} >= 0`)
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
  githubInstallationConnections: many(githubInstallationConnections),
  awsConnections: many(awsConnections),
  sourceRepositories: many(sourceRepositories),
  reverseEngineeringScans: many(reverseEngineeringScans),
  deploymentJobs: many(deploymentJobs),
  gitCicdHandoffs: many(gitCicdHandoffs),
  notifications: many(notifications),
  webPushSubscriptions: many(webPushSubscriptions)
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

export const githubInstallationConnectionsRelations = relations(
  githubInstallationConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [githubInstallationConnections.userId],
      references: [users.id]
    })
  })
);

export const projectsRelations = relations(projects, ({ many, one }) => ({
  owner: one(users, {
    fields: [projects.userId],
    references: [users.id]
  }),
  draft: one(projectDrafts),
  deploymentTarget: one(projectDeploymentTargets),
  buildEnvironment: one(projectBuildEnvironments),
  executionLease: one(projectExecutionLeases),
  architectures: many(architectures),
  assets: many(projectAssets),
  sourceRepositories: many(sourceRepositories),
  deployments: many(deployments),
  releaseCandidates: many(releaseCandidates),
  applicationArtifacts: many(applicationArtifacts),
  applicationReleases: many(applicationReleases),
  notifications: many(notifications),
  reverseEngineeringScans: many(reverseEngineeringScans),
  gitCicdHandoffs: many(gitCicdHandoffs),
  gitCicdPipelineRuns: many(gitCicdPipelineRuns)
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
  release: one(applicationReleases, {
    fields: [deployments.releaseId],
    references: [applicationReleases.id],
    relationName: "deployment_release_pointer"
  }),
  releaseCandidate: one(releaseCandidates, {
    fields: [deployments.releaseCandidateId],
    references: [releaseCandidates.id]
  }),
  liveObservationManifest: one(deploymentLiveObservationManifests),
  logs: many(deploymentLogs),
  jobs: many(deploymentJobs),
  planArtifacts: many(deploymentPlanArtifacts),
  resources: many(deployedResources),
  outputs: many(terraformOutputs)
}));

export const projectDeploymentTargetsRelations = relations(
  projectDeploymentTargets,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectDeploymentTargets.projectId],
      references: [projects.id]
    }),
    connection: one(awsConnections, {
      fields: [projectDeploymentTargets.connectionId],
      references: [awsConnections.id]
    })
  })
);

export const projectBuildEnvironmentsRelations = relations(
  projectBuildEnvironments,
  ({ many, one }) => ({
    project: one(projects, {
      fields: [projectBuildEnvironments.projectId],
      references: [projects.id]
    }),
    awsConnection: one(awsConnections, {
      fields: [projectBuildEnvironments.awsConnectionId],
      references: [awsConnections.id]
    }),
    awsCodeConnection: one(awsCodeConnections, {
      fields: [projectBuildEnvironments.awsCodeConnectionId],
      references: [awsCodeConnections.id]
    }),
    releaseCandidates: many(releaseCandidates)
  })
);

export const projectExecutionLeasesRelations = relations(
  projectExecutionLeases,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectExecutionLeases.projectId],
      references: [projects.id]
    })
  })
);

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
  gitCicdHandoffs: many(gitCicdHandoffs),
  monitoringConfig: one(gitCicdMonitoringConfigs),
  pipelineRuns: many(gitCicdPipelineRuns),
  applicationArtifacts: many(applicationArtifacts)
}));

export const gitCicdHandoffsRelations = relations(gitCicdHandoffs, ({ one, many }) => ({
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
  }),
  pipelineRuns: many(gitCicdPipelineRuns)
}));

export const gitCicdMonitoringConfigsRelations = relations(
  gitCicdMonitoringConfigs,
  ({ one }) => ({
    sourceRepository: one(sourceRepositories, {
      fields: [gitCicdMonitoringConfigs.sourceRepositoryId],
      references: [sourceRepositories.id]
    })
  })
);

export const gitCicdPipelineRunsRelations = relations(
  gitCicdPipelineRuns,
  ({ many, one }) => ({
    project: one(projects, {
      fields: [gitCicdPipelineRuns.projectId],
      references: [projects.id]
    }),
    sourceRepository: one(sourceRepositories, {
      fields: [gitCicdPipelineRuns.sourceRepositoryId],
      references: [sourceRepositories.id]
    }),
    handoff: one(gitCicdHandoffs, {
      fields: [gitCicdPipelineRuns.handoffId],
      references: [gitCicdHandoffs.id]
    }),
    stages: many(gitCicdPipelineStages),
    logs: many(gitCicdPipelineLogs),
    releaseCandidates: many(releaseCandidates),
    release: one(applicationReleases)
  })
);

export const releaseCandidatesRelations = relations(releaseCandidates, ({ one }) => ({
  project: one(projects, {
    fields: [releaseCandidates.projectId],
    references: [projects.id]
  }),
  deployment: one(deployments, {
    fields: [releaseCandidates.deploymentId],
    references: [deployments.id]
  }),
  pipelineRun: one(gitCicdPipelineRuns, {
    fields: [releaseCandidates.pipelineRunId],
    references: [gitCicdPipelineRuns.id]
  }),
  buildEnvironment: one(projectBuildEnvironments, {
    fields: [releaseCandidates.buildEnvironmentId],
    references: [projectBuildEnvironments.id]
  })
}));

export const applicationReleasesRelations = relations(applicationReleases, ({ many, one }) => ({
  project: one(projects, {
    fields: [applicationReleases.projectId],
    references: [projects.id]
  }),
  deployment: one(deployments, {
    fields: [applicationReleases.deploymentId],
    references: [deployments.id],
    relationName: "application_release_deployment"
  }),
  pipelineRun: one(gitCicdPipelineRuns, {
    fields: [applicationReleases.pipelineRunId],
    references: [gitCicdPipelineRuns.id]
  }),
  releaseCandidate: one(releaseCandidates, {
    fields: [applicationReleases.releaseCandidateId],
    references: [releaseCandidates.id]
  }),
  artifact: one(applicationArtifacts, {
    fields: [applicationReleases.artifactId, applicationReleases.projectId],
    references: [applicationArtifacts.id, applicationArtifacts.projectId]
  }),
  baselineRelease: one(applicationReleases, {
    fields: [applicationReleases.baselineReleaseId],
    references: [applicationReleases.id],
    relationName: "application_release_baseline"
  }),
  steps: many(applicationReleaseSteps)
}));

export const applicationReleaseStepsRelations = relations(
  applicationReleaseSteps,
  ({ one }) => ({
    release: one(applicationReleases, {
      fields: [applicationReleaseSteps.releaseId],
      references: [applicationReleases.id]
    })
  })
);

export const applicationArtifactsRelations = relations(applicationArtifacts, ({ many, one }) => ({
  project: one(projects, {
    fields: [applicationArtifacts.projectId],
    references: [projects.id]
  }),
  sourceRepository: one(sourceRepositories, {
    fields: [applicationArtifacts.sourceRepositoryId],
    references: [sourceRepositories.id]
  }),
  releases: many(applicationReleases)
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id]
  }),
  project: one(projects, {
    fields: [notifications.projectId],
    references: [projects.id]
  }),
  outbox: one(notificationOutbox)
}));

export const notificationOutboxRelations = relations(notificationOutbox, ({ one }) => ({
  notification: one(notifications, {
    fields: [notificationOutbox.notificationId],
    references: [notifications.id]
  })
}));

export const webPushSubscriptionsRelations = relations(webPushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [webPushSubscriptions.userId],
    references: [users.id]
  })
}));

export const gitCicdPipelineStagesRelations = relations(
  gitCicdPipelineStages,
  ({ many, one }) => ({
    pipelineRun: one(gitCicdPipelineRuns, {
      fields: [gitCicdPipelineStages.pipelineRunId],
      references: [gitCicdPipelineRuns.id]
    }),
    logs: many(gitCicdPipelineLogs)
  })
);

export const gitCicdPipelineLogsRelations = relations(gitCicdPipelineLogs, ({ one }) => ({
  pipelineRun: one(gitCicdPipelineRuns, {
    fields: [gitCicdPipelineLogs.pipelineRunId],
    references: [gitCicdPipelineRuns.id]
  }),
  stage: one(gitCicdPipelineStages, {
    fields: [gitCicdPipelineLogs.stageId],
    references: [gitCicdPipelineStages.id]
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
  reverseEngineeringScans: many(reverseEngineeringScans),
  projectDeploymentTargets: many(projectDeploymentTargets),
  projectBuildEnvironments: many(projectBuildEnvironments),
  codeConnection: one(awsCodeConnections)
}));

export const awsCodeConnectionsRelations = relations(
  awsCodeConnections,
  ({ many, one }) => ({
    awsConnection: one(awsConnections, {
      fields: [awsCodeConnections.awsConnectionId],
      references: [awsConnections.id]
    }),
    projectBuildEnvironments: many(projectBuildEnvironments)
  })
);

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
