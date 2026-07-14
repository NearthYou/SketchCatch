import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  notificationOutbox,
  notifications,
  webPushSubscriptions
} from "./schema.js";

test("durable notifications keep one inbox row and one outbox row per terminal event", () => {
  const inbox = getTableConfig(notifications);
  const outbox = getTableConfig(notificationOutbox);

  assert(inbox.columns.some((column) => column.name === "idempotency_key"));
  assert(inbox.columns.some((column) => column.name === "read_at"));
  assert(inbox.columns.some((column) => column.name === "expires_at"));
  assert(inbox.indexes.some((index) => index.config.name === "notifications_idempotency_key_unique"));
  assert(outbox.indexes.some((index) => index.config.name === "notification_outbox_notification_unique"));
  assert(outbox.columns.some((column) => column.name === "next_attempt_at"));
  assert(outbox.columns.some((column) => column.name === "last_error_code"));
});

test("web push subscriptions store only a hash and encrypted payload", () => {
  const config = getTableConfig(webPushSubscriptions);
  const names = config.columns.map((column) => column.name);

  assert(names.includes("endpoint_hash"));
  assert(names.includes("encrypted_payload"));
  assert(names.includes("key_version"));
  assert.equal(names.includes("endpoint"), false);
  assert.equal(names.includes("p256dh"), false);
  assert.equal(names.includes("auth"), false);
});

test("notification migration atomically enqueues Direct and GitOps terminal events", () => {
  const migrationUrl = new URL(
    "../../drizzle/0041_durable_deployment_notifications.sql",
    import.meta.url
  );
  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /notifications_idempotency_key_unique/);
  assert.match(migration, /notification_outbox_notification_unique/);
  assert.match(migration, /deployments_terminal_notification/);
  assert.match(migration, /NEW\."source" <> 'direct'/);
  assert.match(migration, /WHEN 'SUCCESS' THEN 'succeeded'/);
  assert.match(migration, /lower\(NEW\."status"::text\)/);
  assert.match(migration, /git_cicd_pipeline_runs_terminal_notification/);
  assert.match(migration, /ON CONFLICT \("idempotency_key"\) DO NOTHING/);
  assert.match(migration, /interval '90 days'/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});
