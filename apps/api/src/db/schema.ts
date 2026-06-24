import { relations, sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import type { ArchitectureJson, DeploymentPlanSummary } from "@sketchcatch/types";

export const assetTypeEnum = pgEnum("asset_type", [
  "diagram_png",
  "diagram_svg",
  "terraform_file",
  "project_export_zip",
  "thumbnail"
]);

export const deploymentStatusEnum = pgEnum("status", [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "CANCELLED"
]);

export const deploymentBlockedEnum = pgEnum("deployment_blocked_by", [
  "risk_analysis",
  "cost_analysis",
  "missing_approval"
]);

export const deploymentFailureStageEnum = pgEnum("deployment_failure_stage", [
  "validation",
  "plan",
  "approval",
  "mock_run"
]);

export const deploymentStageEnum = pgEnum("deployment_stage", [
  "validate",
  "plan",
  "apply"
]);

export const deploymentLogLevelEnum = pgEnum("deployment_log_level", [
  "INFO",
  "WARN",
  "ERROR"
]);

export const anonymousWorkspaces = pgTable("anonymous_workspaces", {
  id: varchar("id", { length: 128 }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const projects = pgTable("projects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 128 })
    .notNull()
    .references(() => anonymousWorkspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

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

export const deployments = pgTable("deployments", {
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
  status: deploymentStatusEnum("status").notNull().default("PENDING"),
  planSummary: jsonb("plan_summary").$type<DeploymentPlanSummary>(),
  isBlocked: boolean("is_blocked").notNull().default(false),
  blockedBy: deploymentBlockedEnum("blocked_by"),
  blockedReason: text("blocked_reason"),
  failureStage: deploymentFailureStageEnum("failure_stage"),
  errorSummary: text("error_summary"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: varchar("approved_by", { length: 128 }), 
    approvedTerraformArtifactId: varchar("approved_terraform_artifact_id", { length: 36 })
    .references(() => projectAssets.id,{ onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const deploymentLogs = pgTable("deployment_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  deploymentId: varchar("deployment_id", { length: 36 })
  .notNull()
  .references(() => deployments.id, { onDelete: "cascade"}),
  sequence: integer("sequence").notNull(),
  stage: deploymentStageEnum("stage").notNull(),
  level: deploymentLogLevelEnum("level").notNull(),
  message: text("message").notNull(),
  relatedResourceId: varchar("related_resource_id", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
})

export const anonymousWorkspacesRelations = relations(anonymousWorkspaces, ({ many }) => ({
  projects: many(projects)
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  workspace: one(anonymousWorkspaces, {
    fields: [projects.workspaceId],
    references: [anonymousWorkspaces.id]
  }),
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
  logs: many(deploymentLogs)
}));

export const deploymentLogsRelations = relations(deploymentLogs, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentLogs.deploymentId],
    references: [deployments.id]
  })
}));

export const touchUpdatedAt = {
  updatedAt: sql`now()`
};
