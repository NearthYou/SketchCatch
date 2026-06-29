import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
import type { ArchitectureJson, DeploymentPlanSummary, DiagramJson } from "@sketchcatch/types";

export const assetTypeEnum = pgEnum("asset_type", [
  "diagram_png",
  "diagram_svg",
  "terraform_file",
  "project_export_zip",
  "thumbnail"
]);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "DESTROYED"
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

export const deploymentLogLevelEnum = pgEnum("deployment_log_level", ["INFO", "WARN", "ERROR"]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

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
  loginAttempts: many(loginAttempts),
  oauthAccounts: many(oauthAccounts),
  awsConnections: many(awsConnections)
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
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
  deployments: many(deployments)
}));

export const architecturesRelations = relations(architectures, ({ many, one }) => ({
  project: one(projects, {
    fields: [architectures.projectId],
    references: [projects.id]
  }),
  assets: many(projectAssets)
}));

export const projectDraftsRelations = relations(projectDrafts, ({ one }) => ({
  project: one(projects, {
    fields: [projectDrafts.projectId],
    references: [projects.id]
  })
}));

export const projectAssetsRelations = relations(projectAssets, ({ one }) => ({
  project: one(projects, {
    fields: [projectAssets.projectId],
    references: [projects.id]
  }),
  architecture: one(architectures, {
    fields: [projectAssets.architectureId],
    references: [architectures.id]
  })
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
  logs: many(deploymentLogs),
  planArtifacts: many(deploymentPlanArtifacts),
  resources: many(deployedResources),
  outputs: many(terraformOutputs)
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

export const awsConnectionsRelations = relations(awsConnections, ({ one }) => ({
  user: one(users, {
    fields: [awsConnections.userId],
    references: [users.id]
  })
}));

export const touchUpdatedAt = {
  updatedAt: sql`now()`
};
