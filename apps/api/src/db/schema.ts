import { relations, sql } from "drizzle-orm";
import { integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import type { ArchitectureJson } from "@sketchcatch/types";

export const assetTypeEnum = pgEnum("asset_type", [
  "diagram_png",
  "diagram_svg",
  "terraform_file",
  "project_export_zip",
  "thumbnail"
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

export const anonymousWorkspacesRelations = relations(anonymousWorkspaces, ({ many }) => ({
  projects: many(projects)
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  workspace: one(anonymousWorkspaces, {
    fields: [projects.workspaceId],
    references: [anonymousWorkspaces.id]
  }),
  architectures: many(architectures),
  assets: many(projectAssets)
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

export const touchUpdatedAt = {
  updatedAt: sql`now()`
};
